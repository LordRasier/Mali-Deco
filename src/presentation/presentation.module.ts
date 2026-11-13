import { Module, type DynamicModule } from '@nestjs/common';
import { CatalogModule } from '../modules/catalog/catalog.module';
import { PublicCatalog } from '../modules/catalog/services/public-catalog';
import { PublicFacets } from '../modules/catalog/services/public-facets';
import { AdminPresentationModule } from './admin/admin.module';
import { STOREFRONT_DATA_MODE, MVC_CART_MODE } from './cart/cart-mode';
import { CartPage } from './cart/cart-page';
import { MvcCartController } from './cart/cart.controller';
import { CatalogPage } from './catalog/catalog-page';
import { MvcCatalogController } from './catalog/catalog.controller';
import { HomePage } from './home/home-page';
import { MvcHomeController } from './home/home.controller';
import { ProductPage } from './products/product-page';
import { CheckoutPage } from './checkout/checkout-page';
import { MvcCheckoutController } from './checkout/checkout.controller';
import { localCheckoutPageEnabled } from './presentation-policy';
import { MvcProductController } from './products/product.controller';
import { canonicalRoutes, STOREFRONT_ROUTES, type StorefrontRoutes } from './routing/storefront-routes';
import { paymentConfig } from '../modules/payments/mercadopago';
import { INFORMATION_CHECKOUT_ENABLED, ShippingReturnsController } from './information/shipping-returns.controller';
import { InformationController } from './information/information.controller';
import { STORE_INFORMATION, storeInformation, StoreInformationReader } from './information/store-information';
import { SettingsModule } from '../modules/settings/settings.module';
import { StoreSettings } from '../modules/settings/store-settings';
import { DiscoveryController } from './seo/discovery.controller';
import { CategoryController } from './catalog/category.controller';
import { SEO_ENV } from './seo/metadata';
import { PublicCartResolver } from '../modules/catalog/cart/cart-resolver';
import { IdentityModule } from '../modules/identity/identity.module';
import { ContentPreviewController } from './admin/content/content-preview.controller';
import { ContentSettings } from '../modules/settings/content-settings';
import { ContentChoicesController } from './admin/content/content-choices.controller';
import { PaymentsModule } from '../modules/payments/payments.module';
import { CheckoutAccess } from '../modules/payments/checkout-access';
import { PaymentSettings } from '../modules/payments/payment-settings';
import { TrackingPageController } from './tracking/tracking-page.controller';

@Module({
  imports: [IdentityModule, CatalogModule, AdminPresentationModule, SettingsModule, PaymentsModule],
  controllers: [MvcHomeController, MvcCatalogController, MvcProductController, MvcCartController, ShippingReturnsController, InformationController, TrackingPageController, DiscoveryController, CategoryController, ContentPreviewController, ContentChoicesController],
})
export class PresentationModule {
  /** One immutable rendering configuration per application; request/Host data never selects routes or mode. */
  static configure(env: NodeJS.ProcessEnv): DynamicModule {
    const mode = STOREFRONT_DATA_MODE;
    const config = Object.freeze({ NODE_ENV: env.NODE_ENV, LOCAL_TEST_CHECKOUT_ENABLED: env.LOCAL_TEST_CHECKOUT_ENABLED,
      DEV_FIXTURE_PRODUCT_ID: env.DEV_FIXTURE_PRODUCT_ID, PUBLIC_SITE_URL: env.PUBLIC_SITE_URL });
    const checkout = localCheckoutPageEnabled(config, mode);
    const paymentAvailable = !!paymentConfig(env);
    const initialInformation = storeInformation(env);
    return { module: PresentationModule, controllers: mode === 'api' ? [MvcCheckoutController] : [], providers: [
      { provide: SEO_ENV, useValue: Object.freeze({ NODE_ENV: env.NODE_ENV, PUBLIC_SITE_URL: env.PUBLIC_SITE_URL }) },
      ...(mode === 'api' ? [{ provide: CheckoutPage, useFactory: (catalog: PublicCatalog, access: CheckoutAccess) => new CheckoutPage(catalog, mode, config, canonicalRoutes, paymentAvailable, access), inject: [PublicCatalog, CheckoutAccess] }] : []),
      { provide: MVC_CART_MODE, useValue: mode }, { provide: STOREFRONT_ROUTES, useValue: canonicalRoutes },
      { provide: INFORMATION_CHECKOUT_ENABLED, useValue: checkout },
      { provide: STORE_INFORMATION, useFactory: (settings: StoreSettings) => new StoreInformationReader(initialInformation, settings), inject: [StoreSettings] },
      { provide: CartPage, useFactory: (catalog: PublicCatalog, routes: StorefrontRoutes, payments: PaymentSettings) => new CartPage(catalog, mode, routes, config, payments), inject: [PublicCatalog, STOREFRONT_ROUTES, PaymentSettings] },
      { provide: HomePage, useFactory: (catalog: PublicCatalog, routes: StorefrontRoutes, content: ContentSettings, facets: PublicFacets) => new HomePage(catalog, mode, routes, config, content, facets), inject: [PublicCatalog, STOREFRONT_ROUTES, ContentSettings, PublicFacets] },
      { provide: CatalogPage, useFactory: (catalog: PublicCatalog, facets: PublicFacets, routes: StorefrontRoutes, content: ContentSettings) => new CatalogPage(catalog, facets, mode, routes, config, content), inject: [PublicCatalog, PublicFacets, STOREFRONT_ROUTES, ContentSettings] },
      { provide: ProductPage, useFactory: (catalog: PublicCatalog, routes: StorefrontRoutes, resolver: PublicCartResolver) => new ProductPage(catalog, mode, config, routes, resolver), inject: [PublicCatalog, STOREFRONT_ROUTES, PublicCartResolver] },
    ] };
  }
}
