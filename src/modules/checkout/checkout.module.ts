import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrdersModule } from '../orders/orders.module';
import { ShippingModule } from '../shipping/shipping.module';
import { PostalCodeResolver } from '../shipping/postal/postal-code-resolver';
import { CheckoutOrderController } from './http/checkout-order.controller';
import { CheckoutQuoteController } from './http/checkout-quote.controller';
import { CheckoutQuoteService, pendingCheckoutQuoteService } from './services/quote';
import { SessionController, SessionService } from './sessions/session';
import { PaymentService } from '../payments/payment-service';
import { PaymentController } from '../payments/payment-controller';
import { MercadoPagoTestProvider, paymentConfig } from '../payments/mercadopago';
import { PaymentWebhook, PaymentWebhookController } from '../payments/payment-webhook';

@Module({
  imports: [ShippingModule, OrdersModule],
  controllers: [SessionController, CheckoutQuoteController, CheckoutOrderController, PaymentController, PaymentWebhookController],
  providers: [
    { provide: PaymentWebhook, useFactory: (db?: DataSource) => { const config = paymentConfig(process.env); return new PaymentWebhook(db, config ? new MercadoPagoTestProvider(config) : undefined, process.env.MERCADOPAGO_WEBHOOK_SECRET); }, inject: [{ token: DataSource, optional: true }] },
    { provide: PaymentService, useFactory: (db?: DataSource) => { const config = paymentConfig(process.env); return new PaymentService(db, config ? new MercadoPagoTestProvider(config) : undefined); }, inject: [{ token: DataSource, optional: true }] },
    { provide: SessionService, useFactory: (db?: DataSource) => new SessionService(db), inject: [{ token: DataSource, optional: true }] },
    { provide: CheckoutQuoteService, useFactory: (db: DataSource | undefined, postal: PostalCodeResolver) => pendingCheckoutQuoteService(db, postal, process.env), inject: [{ token: DataSource, optional: true }, PostalCodeResolver] },
  ],
})
export class CheckoutModule {}
