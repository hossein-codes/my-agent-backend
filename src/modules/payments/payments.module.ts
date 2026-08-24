import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentsController, PaymentsCustomerController } from './payments.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { PAYMENT_PROVIDER } from '../providers/payment/payment-provider.port';
import { MockPaymentProvider } from '../providers/payment/mock-payment.provider';
import { ZarinpalProvider } from '../providers/payment/zarinpal.provider';
import { AppConfigService } from '../../config/app-config.service';
import { HttpService } from '../providers/http.service';

@Module({
  imports: [InventoryModule],
  providers: [
    PaymentService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [AppConfigService, HttpService],
      useFactory: (config: AppConfigService, http: HttpService) =>
        (config.paymentProvider as string) === 'zarinpal'
          ? new ZarinpalProvider(config, http)
          : new MockPaymentProvider(config),
    },
  ],
  controllers: [PaymentsController, PaymentsCustomerController],
  exports: [PaymentService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
