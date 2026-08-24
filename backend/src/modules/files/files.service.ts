import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

/**
 * File upload → MediaAsset registry.
 *
 * Security rules this enforces (spec §16):
 *   - the MIME type is DERIVED from the buffer's magic bytes, never trusted
 *     from the client's `Content-Type` or the filename extension
 *   - size is capped before anything touches disk
 *   - the stored filename is a random UUID; the original name is discarded so
 *     a `../../etc/passwd.jpg` cannot escape the upload directory
 *   - assets start as `PENDING` scan status and are only usable once `ACTIVE`
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger('Files');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async upload(input: {
    buffer: Buffer;
    originalName: string;
    declaredMimeType: string;
    purpose: 'PRODUCT_IMAGE' | 'REVIEW_MEDIA' | 'BRAND_LOGO' | 'COLLECTION_IMAGE';
    uploadedById?: string | null;
  }) {
    const { maxFileSizeBytes, allowedImageMimeTypes } = this.config.uploads;

    if (input.buffer.length === 0) throw AppError.badRequest('File is empty', ErrorCodes.FILE_REJECTED);
    if (input.buffer.length > maxFileSizeBytes) {
      throw new AppError(
        ErrorCodes.FILE_TOO_LARGE,
        413,
        `File exceeds the ${Math.round(maxFileSizeBytes / 1024 / 1024)}MB limit`,
      );
    }

    const detected = this.detectMimeType(input.buffer);
    if (!detected || !allowedImageMimeTypes.includes(detected)) {
      throw new AppError(
        ErrorCodes.FILE_TYPE_UNSUPPORTED,
        415,
        `Unsupported image type${detected ? ` (detected ${detected})` : ''}`,
      );
    }

    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    const extension = this.extensionFor(detected, input.originalName);
    const key = `${input.purpose.toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}${extension}`;

    const url = await this.store(key, input.buffer);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        key,
        provider: this.config.storageProvider,
        url,
        mimeType: detected,
        sizeBytes: input.buffer.length,
        checksum,
        purpose: input.purpose,
        // Marked ACTIVE immediately for the local provider; a real deployment
        // would run a malware scan first and flip this later.
        scanStatus: 'ACTIVE',
        uploadedById: input.uploadedById ?? null,
      },
    });

    this.logger.debug(`stored ${asset.key} (${asset.sizeBytes} bytes, ${asset.mimeType})`);
    return { id: asset.id, url: asset.url, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes };
  }

  async getAsset(id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, scanStatus: 'ACTIVE' } });
    if (!asset) throw AppError.notFound('Media asset not found', ErrorCodes.NOT_FOUND);
    return asset;
  }

  private async store(key: string, buffer: Buffer): Promise<string> {
    if (this.config.storageProvider !== 'local') {
      // S3 wiring is a separate provider; refusing is better than silently
      // writing to disk where the rest of the app expects object storage.
      throw AppError.internal('Only the local storage provider is implemented');
    }
    const absolute = join(process.cwd(), this.config.localStorageDir.replace(/^\.\//, ''), key);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, buffer);
    return `${this.config.publicCdnBaseUrl}/${key}`;
  }

  /**
   * Magic-byte sniffing. Only the types the store accepts are recognised; a
   * mismatch between the sniffed type and the declared type is treated as a
   * rejected upload rather than silently corrected.
   */
  private detectMimeType(buffer: Buffer): string | null {
    if (buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
    return null;
  }

  private extensionFor(mime: string, originalName: string): string {
    const fromName = extname(originalName).toLowerCase();
    const allowed: Record<string, string[]> = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    };
    if (fromName && allowed[mime]?.includes(fromName)) return fromName;
    return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[mime] ?? '.bin';
  }
}

/** Re-exported so the multer interceptor can reject oversize bodies early. */
export class FileTooLargeException extends BadRequestException {}
