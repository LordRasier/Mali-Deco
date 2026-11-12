import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IdentityModule } from '../identity/identity.module';
import { IdentityService } from '../identity/services/identity-service';
import { PaymentRegistry } from './payment-registry';
import { PaymentSettings, PaymentSettingsController } from './payment-settings';
import { CheckoutAccess } from './checkout-access';

@Module({ imports: [IdentityModule], controllers: [PaymentSettingsController], providers: [
  { provide: PaymentRegistry, useFactory: () => new PaymentRegistry(Object.freeze({ ...process.env })) },
  { provide: PaymentSettings, useFactory: (registry: PaymentRegistry, db?: DataSource) => new PaymentSettings(db, registry), inject: [PaymentRegistry, { token: DataSource, optional: true }] },
  { provide: CheckoutAccess, useFactory: (settings: PaymentSettings, registry: PaymentRegistry, identity: IdentityService) => new CheckoutAccess(settings, registry, identity), inject: [PaymentSettings, PaymentRegistry, IdentityService] },
], exports: [PaymentSettings, PaymentRegistry, CheckoutAccess] })
export class PaymentsModule {}
