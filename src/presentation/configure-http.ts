import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createViewEngine } from './view-engine';
import { configureStaticAssets } from './static-assets';
import { informationPaths } from './information/information-content';
import { STORE_INFORMATION, type StoreInformationReader } from './information/store-information';
import { configureSeo } from './seo/middleware';

/** Permanent HTML and fixed assets coexist with the unchanged prefixed JSON API. */
export function configureHttp(app: NestExpressApplication): void {
  // Exact GET exclusions only: excluding admin/* would steal existing API controllers.
  const paths = ['/', 'catalogo', 'categorias/:slug', 'productos/:slug', 'robots.txt', 'sitemap.xml', 'sitemaps/:name', 'carrito', 'envios-y-reembolsos', ...informationPaths, 'admin', 'admin/sections/:section', 'checkout'];
  app.setGlobalPrefix('api/v1', { exclude: paths.map(path => ({ path, method: RequestMethod.GET })) });
  const information = app.get<StoreInformationReader>(STORE_INFORMATION);
  const publicPages = new Set(['/', '/catalogo', '/carrito', '/envios-y-reembolsos', '/checkout', ...informationPaths.map(path => `/${path}`)]);
  app.use(async (request: { method: string; path: string }, response: { locals: Record<string, unknown> }, next: () => void) => {
    const path = request.path.toLowerCase().replace(/\/$/, '') || '/';
    if (['GET', 'HEAD'].includes(request.method) && (publicPages.has(path) || /^\/(productos|categorias)\/[^/]+$/.test(path))) response.locals.storeInfo = await information.get();
    response.locals.storeYear = new Date().getFullYear();
    next();
  });
  configureSeo(app);
  const partial = (path: string) => readFileSync(join(__dirname, path), 'utf8');
  const engine = createViewEngine({
    seo_head: partial('seo/views/head.hbs'),
    cart_panel: partial('cart/views/partials/cart-panel.hbs'),
    catalog_filters: partial('catalog/views/partials/filters.hbs'),
    catalog_card: partial('catalog/views/partials/card.hbs'),
    catalog_info: partial('catalog/views/partials/info.hbs'),
    site_header: partial('shell/views/header.hbs'), site_footer: partial('shell/views/footer.hbs'),
    admin_product_images: partial('admin/views/admin-product-images.hbs'),
  });
  app.engine('hbs', engine.__express);
  app.setBaseViewsDir(['cart', 'catalog', 'products', 'home', 'information', 'admin', 'checkout'].map(feature => join(__dirname, feature, 'views')));
  app.setViewEngine('hbs'); app.set('view options', { layout: false });
  configureStaticAssets(app);
}
