import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService, AuditContext } from '../audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { FeaturesService } from '../system/features.service';
import { ErrorCodes } from '../../common/errors/error-codes';

/**
 * Reviews (spec §22): authenticated; one per user/product (DB); verified
 * purchase derived ONLY from the reviewer's own PAID order item (server +
 * DB trigger). Moderation PENDING→APPROVED/REJECTED, APPROVED→HIDDEN.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    private readonly features: FeaturesService,
  ) {}

  async create(userId: string, input: { productId: string; rating: number; title?: string; body?: string; orderItemId?: string; mediaAssetIds?: string[] }) {
    // M-7 FIX: FeatureFlag `reviews` is the runtime source of truth (spec §22)
    if (!(await this.features.isEnabled('reviews'))) {
      throw new AppError(ErrorCodes.SYSTEM_FEATURE_DISABLED, 409, 'Reviews are currently disabled');
    }
    if (input.rating < 1 || input.rating > 5) throw AppError.badRequest('rating must be 1..5');
    if ((input.body ?? '').length > 2000) throw AppError.badRequest('body exceeds 2000 chars');
    const product = await this.prisma.product.findFirst({ where: { id: input.productId, status: 'ACTIVE', deletedAt: null } });
    if (!product) throw AppError.notFound('Product not found');

    let verified = false;
    if (input.orderItemId) {
      // server-side verified-purchase proof: reviewer's own PAID order item
      const item = await this.prisma.orderItem.findFirst({
        where: { id: input.orderItemId, order: { userId, paidAmount: { gt: 0 } } },
      });
      if (!item || item.productId !== input.productId) {
        throw new AppError(ErrorCodes.REVIEW_PURCHASE_REQUIRED, 422, 'Order item does not verify a purchase of this product by you');
      }
      verified = true; // DB trigger re-verifies — cannot be faked
    }
    if ((input.mediaAssetIds ?? []).length > this.config.uploads.maxImagesPerReview) {
      throw new AppError(ErrorCodes.FILE_REJECTED, 422, `At most ${this.config.uploads.maxImagesPerReview} images per review`);
    }

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          productId: input.productId, userId, rating: input.rating,
          title: input.title ?? null, body: input.body ?? null,
          orderItemId: verified ? input.orderItemId : null,
          isVerifiedPurchase: verified,
        },
      });
      for (const assetId of input.mediaAssetIds ?? []) {
        const asset = await tx.mediaAsset.findFirst({ where: { id: assetId, scanStatus: 'ACTIVE', purpose: 'REVIEW_MEDIA' } });
        if (!asset) throw new AppError(ErrorCodes.FILE_REJECTED, 422, 'Media asset not acceptable');
        await tx.reviewMedia.create({ data: { reviewId: created.id, mediaAssetId: asset.id, url: asset.url } });
      }
      return created;
    }).catch((e: unknown) => {
      if ((e as { code?: string }).code === 'P2002') {
        throw new AppError(ErrorCodes.REVIEW_DUPLICATE, 409, 'You already reviewed this product');
      }
      throw e;
    });
    return review;
  }

  async updateOwn(userId: string, reviewId: string, patch: { rating?: number; title?: string; body?: string }) {
    const review = await this.prisma.review.findFirst({ where: { id: reviewId, userId } }); // ownership
    if (!review) throw AppError.notFound('Review not found');
    if (review.status === 'HIDDEN') throw new AppError(ErrorCodes.CONFLICT, 409, 'Hidden reviews cannot be edited');
    return this.prisma.review.update({
      where: { id: reviewId },
      data: { ...patch, status: 'PENDING' }, // edits re-enter moderation
    });
  }

  async moderate(reviewId: string, decision: 'APPROVED' | 'REJECTED' | 'HIDDEN', ctx: AuditContext, note?: string) {
    const review = await this.prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
    if (decision === 'HIDDEN' && review.status !== 'APPROVED') {
      throw new AppError(ErrorCodes.CONFLICT, 409, 'Only approved reviews can be hidden');
    }
    await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: decision, moderationNote: note ?? null, moderatedById: ctx.actorId ?? null, moderatedAt: new Date() },
    });
    await this.audit.record(ctx, {
      action: `REVIEW_${decision}`, entityType: 'Review', entityId: reviewId,
      oldValues: { status: review.status }, newValues: { status: decision },
    });
  }

  async listApproved(productId: string, page: number, pageSize: number) {
    const where: Prisma.ReviewWhereInput = { productId, status: 'APPROVED' };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        include: { media: true, user: { include: { profile: true } } },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      items: items.map((r) => ({
        id: r.id, rating: r.rating, title: r.title, body: r.body,
        isVerifiedPurchase: r.isVerifiedPurchase, createdAt: r.createdAt,
        author: r.user.profile ? `${r.user.profile.firstName ?? ''} ${r.user.profile.lastName ?? ''}`.trim() || 'Customer' : 'Customer',
        media: r.media.map((m) => m.url),
      })),
      total,
    };
  }

  async adminQueue(page: number, pageSize: number, status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN') {
    const where: Prisma.ReviewWhereInput = status ? { status } : { status: 'PENDING' };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize, include: { product: { select: { name: true } }, user: { include: { profile: true } }, media: true } }),
      this.prisma.review.count({ where }),
    ]);
    return { items, total };
  }
}
