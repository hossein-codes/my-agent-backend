import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ReviewsService } from './reviews.service';
import { CurrentUser, AuthenticatedUser, Permissions, Public } from '../../common/decorators/auth.decorators';
import { RateLimit } from '../../common/rate-limit/rate-limits';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';

class CreateReviewDto {
  @IsUUID() productId!: string;
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) body?: string;
  @IsOptional() @IsUUID() orderItemId?: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) mediaAssetIds?: string[];
}
class UpdateReviewDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) body?: string;
}
class ModerateDto {
  @IsIn(['APPROVED', 'REJECTED', 'HIDDEN']) decision!: 'APPROVED' | 'REJECTED' | 'HIDDEN';
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

@ApiBearerAuth('access-token')
@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  @UseGuards(RateLimitGuard) @RateLimit('review.create')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user.userId, dto);
  }

  @Post(':id')
  async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateReviewDto) {
    return this.reviews.updateOwn(user.userId, id, dto);
  }
}

@ApiTags('reviews')
@Controller('catalog/products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @Public()
  async list(@Param('productId') productId: string, @Query() pagination: PaginationDto) {
    const { items, total } = await this.reviews.listApproved(productId, pagination.page, pagination.pageSize);
    return paginated(items, pagination, total);
  }
}

@ApiBearerAuth('access-token')
@ApiTags('admin.reviews')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @Permissions('review.moderate')
  async queue(@Query() pagination: PaginationDto, @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN') {
    const { items, total } = await this.reviews.adminQueue(pagination.page, pagination.pageSize, status);
    return paginated(items, pagination, total);
  }

  @Post(':id/moderate')
  @Permissions('review.moderate')
  async moderate(@Param('id') id: string, @Body() dto: ModerateDto, @CurrentUser() actor: AuthenticatedUser) {
    await this.reviews.moderate(id, dto.decision, { actorType: 'ADMIN', actorId: actor.userId }, dto.note);
    return { status: dto.decision };
  }
}
