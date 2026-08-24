import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from './config/app-config.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ProvidersModule } from './modules/providers/providers.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsCoreModule } from './modules/notifications/notification.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { UsersModule } from './modules/users/users.module';
import { IdentityModule } from './modules/identity/identity.module';
import { FilesModule } from './modules/files/files.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { CartModule } from './modules/cart/cart.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { OrdersModule } from './modules/orders/orders.module';
import { RefundsModule } from './modules/refunds/refunds.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SystemModule } from './modules/system/system.module';
import { ReportsModule } from './modules/reports/reports.module';
import { JobsModule } from './modules/jobs/jobs.module';

/**
 * Root module — modular monolith (spec §2). Global guards run for every
 * route: JWT authentication, then permission authorization.
 */
@Module({
  imports: [
    JwtModule.register({ global: true }),
    AppConfigModule,
    PrismaModule,
    RedisModule,
    ProvidersModule,
    AuditModule,
    NotificationsCoreModule,
    HealthModule,
    AuthModule,
    RbacModule,
    UsersModule,
    IdentityModule,
    FilesModule,
    PricingModule,
    CampaignsModule,
    InventoryModule,
    CatalogModule,
    CouponsModule,
    CartModule,
    WishlistModule,
    ShippingModule,
    OrdersModule,
    RefundsModule,
    PaymentsModule,
    CheckoutModule,
    ReturnsModule,
    ReviewsModule,
    NotificationsModule,
    SystemModule,
    ReportsModule,
    JobsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
