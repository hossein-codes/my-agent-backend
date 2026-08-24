import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Permissions, CurrentUser, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { FilesService } from './files.service';

const ALLOWED_PURPOSES = ['PRODUCT_IMAGE', 'REVIEW_MEDIA', 'BRAND_LOGO', 'COLLECTION_IMAGE'] as const;
type Purpose = (typeof ALLOWED_PURPOSES)[number];

/**
 * Single shared upload endpoint. The `purpose` in the path decides where the
 * asset may later be attached, so a review image can never be reused as a
 * product image.
 */
@ApiBearerAuth('access-token')
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload/:purpose')
  @Permissions('media.write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      // Multer enforces the cap in memory before the handler runs.
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image uploads are accepted'), false);
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @Param('purpose') purpose: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('A file field named "file" is required');
    // The purpose decides where this asset may later be attached, so it is
    // validated against a closed list rather than passed through.
    if (!ALLOWED_PURPOSES.includes(purpose as Purpose)) {
      throw new BadRequestException(`purpose must be one of: ${ALLOWED_PURPOSES.join(', ')}`);
    }
    return this.files.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      declaredMimeType: file.mimetype,
      purpose: purpose as Purpose,
      uploadedById: actor.userId,
    });
  }
}
