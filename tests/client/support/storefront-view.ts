import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createViewEngine } from '../../../src/presentation/view-engine';
import { catalogCards } from '../../../src/presentation/catalog/catalog-view';
import { canonicalRoutes } from '../../../src/presentation/routing/storefront-routes';
import type { Product } from '../../../src/presentation/shared/catalog/storefront-types';

/** Render the real feature template; shared shell behavior has separate HTTP and DOM coverage. */
export function renderStorefront(view: 'home' | 'catalog' | 'product', model: Record<string, unknown>) {
  const feature = view === 'product' ? 'products' : view;
  const file = resolve(__dirname, '../../../src/presentation', feature, 'views', `${view}.hbs`);
  const partial = (name: string) => readFileSync(resolve(__dirname, '../../../src/presentation/catalog/views/partials', name + '.hbs'), 'utf8');
  const engine = createViewEngine({ seo_head: readFileSync(resolve(__dirname, '../../../src/presentation/seo/views/head.hbs'), 'utf8'), site_header: '', site_footer: '', cart_panel: '', catalog_filters: '', catalog_card: partial('card'), catalog_info: partial('info') });
  return new Promise<string>((accept, reject) => engine.__express(file, { ...model, layout: false }, (error, html) => {
    if (error) reject(error); else if (typeof html === 'string') accept(html); else reject(Error('Missing rendered HTML'));
  }));
}
export function renderCards(products: Product[], demo: boolean, fixtureId?: string) {
  return renderStorefront('catalog', { routes: canonicalRoutes, brand: 'Synthetic', mode: demo ? 'demo' : 'api', demo,
    cards: catalogCards(products, demo, '/productos', fixtureId), page: 1, pages: 1, total: products.length, invalid: false, failed: false });
}
