import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createViewEngine } from './view-engine';
import { configureStaticAssets } from './static-assets';
import { informationPaths } from './information/information-content';
import { STORE_INFORMATION, type StoreInformationReader } from './information/store-information';
import { configureSeo } from './seo/middleware';
import { ContentSettings } from '../modules/settings/content-settings';
import { pagePaths, targetEnabled, type PageKey } from '../modules/settings/content-config';
import { configuredInformation, contentModel } from './information/content-model';

/** Permanent HTML and fixed assets coexist with the unchanged prefixed JSON API. */
export function configureHttp(app: NestExpressApplication): void {
  // Exact GET exclusions only: excluding admin/* would steal existing API controllers.
  const managedPaths = Object.values(pagePaths);
  const paths = ['/', 'catalogo', 'categorias/:slug', 'productos/:slug', 'robots.txt', 'sitemap.xml', 'sitemaps/:name', 'carrito', ...new Set([...managedPaths.map(p => p.slice(1)), ...informationPaths]), 'admin', 'admin/sections/:section', 'checkout'];
  app.setGlobalPrefix('api/v1', { exclude: paths.map(path => ({ path, method: RequestMethod.GET })) });
  const information = app.get<StoreInformationReader>(STORE_INFORMATION);
  const content = app.get(ContentSettings);
  const publicPages = new Set(['/', '/catalogo', '/carrito', '/checkout', '/sobre-mali', ...managedPaths]);
  app.use(async (request: { method: string; path: string }, response: { locals: Record<string, unknown>; status(code: number): { send(body: string): void }; setHeader(name: string, value: string): void; redirect(code: number, path: string): void }, next: (error?: unknown) => void) => {
    try {
      const path = decodeURIComponent(request.path).toLowerCase().replace(/\/$/, '') || '/';
      const publicPage = ['GET', 'HEAD'].includes(request.method) && (publicPages.has(path) || /^\/(productos|categorias)\/[^/]+$/.test(path));
      const commerce = /^\/api\/v1\/(catalog\/(products|categories|facets|cart)(\/|$)|checkout(\/|$)|shipping(\/|$))/.test(path);
      if (publicPage || commerce) {
        const config = (await content.get()).settings;
        const key = path === '/sobre-mali' ? 'sobre-mali' : Object.keys(pagePaths).find(key => pagePaths[key as PageKey] === path);
        const catalogPath = /^\/(catalogo|categorias|productos)(\/|$)/.test(path) || /^\/api\/v1\/catalog\/(products|categories|facets)/.test(path);
        const cartPath = /^\/(carrito|checkout)(\/|$)/.test(path) || commerce && !catalogPath;
        if ((key && !targetEnabled(config, key)) || (catalogPath && !config.features.catalog) || (cartPath && !targetEnabled(config, 'cart'))) {
          response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Robots-Tag', 'noindex, nofollow');
          response.status(404).send('<!doctype html><html lang="es"><meta charset="utf-8"><title>Página no disponible</title><h1>Página no disponible</h1><a href="/">Volver al inicio</a></html>'); return;
        }
        if (path === '/sobre-mali') { response.setHeader('Cache-Control', 'no-store'); response.redirect(301, pagePaths['sobre-mali']); return; }
        if (publicPage) {
          const info = configuredInformation(await information.get(), config);
          Object.assign(response.locals, contentModel(config, info), { storeInfo: info });
        }
      }
      response.locals.storeYear = new Date().getFullYear(); next();
    } catch (error) { next(error); }
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
    information_body: partial('information/views/partials/body.hbs'),
    admin_product_images: partial('admin/views/admin-product-images.hbs'),
  });
  app.engine('hbs', engine.__express);
  app.setBaseViewsDir(['cart', 'catalog', 'products', 'home', 'information', 'admin', 'checkout'].map(feature => join(__dirname, feature, 'views')));
  app.setViewEngine('hbs'); app.set('view options', { layout: false });
  configureStaticAssets(app);
}
