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
import { PaymentsModule } from '../payments/payments.module';
import { PaymentRegistry } from '../payments/payment-registry';
import { PaymentWebhook, PaymentWebhookController } from '../payments/payment-webhook';
import { OrderReservationWorker } from './services/order-reservations';

@Module({
  imports: [ShippingModule, OrdersModule, PaymentsModule],
  controllers: [SessionController, CheckoutQuoteController, CheckoutOrderController, PaymentController, PaymentWebhookController],
  providers: [
    { provide: OrderReservationWorker, useFactory: (registry: PaymentRegistry, db?: DataSource) => new OrderReservationWorker(db, registry), inject: [PaymentRegistry, { token: DataSource, optional: true }] },
    { provide: PaymentWebhook, useFactory: (registry: PaymentRegistry, db?: DataSource) => new PaymentWebhook(db, registry), inject: [PaymentRegistry, { token: DataSource, optional: true }] },
    { provide: PaymentService, useFactory: (registry: PaymentRegistry, db?: DataSource) => new PaymentService(db, registry), inject: [PaymentRegistry, { token: DataSource, optional: true }] },
    { provide: SessionService, useFactory: (db?: DataSource) => new SessionService(db, process.env, Date.now, true), inject: [{ token: DataSource, optional: true }] },
    { provide: CheckoutQuoteService, useFactory: (db: DataSource | undefined, postal: PostalCodeResolver) => pendingCheckoutQuoteService(db, postal, process.env), inject: [{ token: DataSource, optional: true }, PostalCodeResolver] },
  ],
})
export class CheckoutModule {}
