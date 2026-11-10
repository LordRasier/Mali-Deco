import { Module } from '@nestjs/common';
import { IdentityModule } from '../../modules/identity/identity.module';
import { IdentityService } from '../../modules/identity/services/identity-service';
import { AdminPage } from './admin-page';
import { MvcAdminController } from './admin.controller';
import { CatalogModule } from '../../modules/catalog/catalog.module';
import { CatalogAdmin } from '../../modules/catalog/services/catalog-admin';
import { AdminProductsPage } from './products/admin-products-page';
import { SettingsModule } from '../../modules/settings/settings.module';
import { StoreSettings } from '../../modules/settings/store-settings';
import { SiteSettings } from '../../modules/settings/site-settings';
import { SettingsPage } from './settings/settings-page';
import { OrdersModule } from '../../modules/orders/orders.module';
import { OrdersService } from '../../modules/orders/services/orders.service';
import { OrdersPage } from './orders/orders-page';
import { CatalogTaxonomy } from '../../modules/catalog/services/catalog-taxonomy';
import { ClassificationsPage } from './classifications/classifications-page';
import { ContentPage } from './content/content-page';

@Module({
  imports: [IdentityModule, CatalogModule, SettingsModule, OrdersModule],
  controllers: [MvcAdminController],
  providers: [
    ContentPage,
    { provide: AdminProductsPage, useFactory: (catalog: CatalogAdmin) => new AdminProductsPage(catalog), inject: [CatalogAdmin] },
    { provide: SettingsPage, useFactory: (settings: StoreSettings, site: SiteSettings) => new SettingsPage(settings, site), inject: [StoreSettings, SiteSettings] },
    { provide: OrdersPage, useFactory: (orders: OrdersService) => new OrdersPage(orders), inject: [OrdersService] },
    { provide: ClassificationsPage, useFactory: (taxonomy: CatalogTaxonomy) => new ClassificationsPage(taxonomy), inject: [CatalogTaxonomy] },
    { provide: AdminPage, useFactory: (identity: IdentityService, products: AdminProductsPage, settings: SettingsPage, orders: OrdersPage, classifications: ClassificationsPage, editor: ContentPage) => new AdminPage(identity, { products, settings, orders, classifications, editor }), inject: [IdentityService, AdminProductsPage, SettingsPage, OrdersPage, ClassificationsPage, ContentPage] },
  ],
})
export class AdminPresentationModule {}
