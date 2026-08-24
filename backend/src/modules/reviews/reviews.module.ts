import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController, ProductReviewsController, AdminReviewsController } from './reviews.controller';
import { SystemModule } from '../system/system.module';

@Module({
  imports: [SystemModule], // FeatureFlag runtime source of truth (M-7)
  providers: [ReviewsService], controllers: [ReviewsController, ProductReviewsController, AdminReviewsController], exports: [ReviewsService],
})
export class ReviewsModule {}
