import { Module } from '@nestjs/common';
import { WishlistController } from './wishlist.controller';
import { PricingModule } from '../pricing/pricing.module';

@Module({ imports: [PricingModule], controllers: [WishlistController] })
export class WishlistModule {}
