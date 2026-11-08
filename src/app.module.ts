import { Module, type DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { databaseOptions } from './infrastructure/database/database-options';
import type { DataSourceOptions } from 'typeorm';
import { StrictDataSource } from './infrastructure/database/strict-data-source';
import { IdentityModule } from './modules/identity/identity.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { OrdersModule } from './modules/orders/orders.module';
import { OrderEmailsModule } from './modules/order-emails/order-emails.module';
import { MediaModule } from './modules/media/media.module';
import { PresentationModule } from './presentation/presentation.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { localCheckoutEnabled } from './presentation/shared/checkout/checkout-config';

if (!process.env.DB_HOST && process.env.NODE_ENV === 'production') {
  throw new Error('DB_HOST is required in production');
}

@Module({
  imports: [
    IdentityModule, CatalogModule, SettingsModule, ShippingModule, OrdersModule, OrderEmailsModule, MediaModule,
    ...(process.env.DB_HOST ? [TypeOrmModule.forRootAsync({
      useFactory: databaseOptions,
      dataSourceFactory: async options => new StrictDataSource(options as DataSourceOptions),
    })] : []),
  ],
  controllers: [AppController],
})
export class AppModule {}

/** Test checkout is an explicit development capability, never a production payment flow. */
export function applicationModule(env: NodeJS.ProcessEnv): DynamicModule {
  return { module: AppModule, imports: [PresentationModule.configure(env), ...(localCheckoutEnabled(env) ? [CheckoutModule] : [])] };
}
