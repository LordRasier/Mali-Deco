import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { databaseOptions } from './database/database-options';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { StrictDataSource } from './database/strict-data-source';
import { CatalogController } from './catalog/catalog.controller';
import { PublicCatalog } from './catalog/public-catalog';
import { PublicFacets } from './catalog/public-facets';
import { PublicCartController, PublicCartResolver } from './catalog/cart-resolver';
import { CatalogAdmin } from './catalog/catalog-admin';
import { AdminCatalogController } from './catalog/admin.controller';
import { AdminCategoriesController, AdminMaterialsController, AdminColorsController } from './catalog/admin-taxonomy.controller';
import { CatalogTaxonomy } from './catalog/catalog-taxonomy';
import { AuthController } from './identity/auth.controller';
import { CatalogGuard } from './identity/catalog.guard';
import { MysqlIdentityStore } from './identity/identity-store';
import { IdentityService } from './identity/identity-service';
import { allowedAdminOrigin } from './identity/origin-config';
import { pendingShippingService, ShippingQuoteController, ShippingQuoteService } from './shipping/catalog-quote';
import { PostalCodeResolver } from './shipping/postal-code-resolver';
import { OwnerGuard } from './identity/owner.guard';
import { StoreSettings, StoreSettingsController } from './catalog/store-settings';
import { SessionController, SessionService } from './checkout/session';
import { CheckoutQuoteController } from './checkout/checkout-quote.controller';
import { CheckoutQuoteService, pendingCheckoutQuoteService } from './checkout/quote';
import { CheckoutOrderController } from './checkout/checkout-order.controller';
import { AdminOrdersController } from './orders/admin-orders.controller';
import { OrdersService } from './orders/orders.service';
import { OrdersGuard } from './orders/orders.guard';

if (!process.env.DB_HOST && process.env.NODE_ENV === 'production') {
  throw new Error('DB_HOST is required in production');
}

@Module({
  imports: process.env.DB_HOST ? [TypeOrmModule.forRootAsync({
    useFactory: databaseOptions,
    dataSourceFactory: async options => new StrictDataSource(options as DataSourceOptions),
  })] : [],
  controllers: [AppController, CatalogController, PublicCartController, ShippingQuoteController, AuthController, AdminCatalogController, AdminCategoriesController, AdminMaterialsController, AdminColorsController, StoreSettingsController, SessionController, CheckoutQuoteController, CheckoutOrderController, AdminOrdersController],
  providers: [
    { provide: PostalCodeResolver, useFactory: () => new PostalCodeResolver() },
    { provide: PublicFacets, useFactory: (db?: DataSource) => new PublicFacets(db), inject: [{ token: DataSource, optional: true }] },
    { provide: PublicCartResolver, useFactory: (db?: DataSource) => new PublicCartResolver(db), inject: [{ token: DataSource, optional: true }] },
    { provide: ShippingQuoteService, useFactory: (db?: DataSource) => pendingShippingService(db, process.env), inject: [{ token: DataSource, optional: true }] },
    { provide: PublicCatalog, useFactory: (db?: DataSource) => new PublicCatalog(db), inject: [{ token: DataSource, optional: true }] },
    { provide: CatalogTaxonomy, useFactory: (db?: DataSource) => new CatalogTaxonomy(db), inject: [{ token: DataSource, optional: true }] },
    { provide: CatalogAdmin, useFactory: (db?: DataSource) => new CatalogAdmin(db), inject: [{ token: DataSource, optional: true }] },
    { provide: IdentityService, useFactory: (db?: DataSource) => new IdentityService(new MysqlIdentityStore(db), allowedAdminOrigin(process.env)), inject: [{ token: DataSource, optional: true }] },
    { provide: StoreSettings, useFactory: (db?: DataSource) => new StoreSettings(db), inject: [{ token: DataSource, optional: true }] },
    { provide: SessionService, useFactory: (db?: DataSource) => new SessionService(db), inject: [{ token: DataSource, optional: true }] },
    { provide: CheckoutQuoteService, useFactory: (db: DataSource | undefined, postal: PostalCodeResolver) => pendingCheckoutQuoteService(db, postal, process.env), inject: [{ token: DataSource, optional: true }, PostalCodeResolver] },
    { provide: OrdersService, useFactory: (db?: DataSource) => new OrdersService(db), inject: [{ token: DataSource, optional: true }] },
    CatalogGuard,
    OwnerGuard,
    OrdersGuard,
  ],
})
export class AppModule {}
