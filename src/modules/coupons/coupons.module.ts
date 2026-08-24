import { Module } from '@nestjs/common';
import { CouponService } from './coupon.service';
import { CouponsAdminController } from './coupons-admin.controller';

@Module({ providers: [CouponService], controllers: [CouponsAdminController], exports: [CouponService] })
export class CouponsModule {}
