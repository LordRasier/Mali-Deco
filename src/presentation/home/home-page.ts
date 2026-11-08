import { localCheckoutPageEnabled } from '../presentation-policy';
import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { catalogCards, publicProducts } from '../catalog/catalog-view';
import { demoCatalog } from '../catalog/shared/demo-catalog';
import { canonicalRoutes, type StorefrontRoutes } from '../routing/storefront-routes';
import { fixtureImageId } from '../catalog/shared/editorial-art';

/** Homepage reads public projections only; a failed API never falls back to demo. */
export class HomePage {
  constructor(private readonly catalog: Pick<PublicCatalog, 'settings' | 'list'>, private readonly mode: 'api' | 'demo', private readonly routes: StorefrontRoutes = canonicalRoutes,
    private readonly env: { NODE_ENV?: string; LOCAL_TEST_CHECKOUT_ENABLED?: string; DEV_FIXTURE_PRODUCT_ID?: string } = {}) {}

  async read() {
    const model = { layout: false as const, routes: this.routes, checkoutEnabled: localCheckoutPageEnabled(this.env, this.mode), mode: this.mode, demo: this.mode === 'demo', brand: 'Tienda', failed: false, cards: [] as ReturnType<typeof catalogCards> };
    try {
      if (model.demo) {
        model.brand = demoCatalog.brand; model.cards = catalogCards(demoCatalog.products.slice(0, 3), true, this.routes.product);
      } else {
        model.brand = (await this.catalog.settings()).name;
        const result = await this.catalog.list({ sort: 'name_asc', page: '1', limit: '24' });
        model.cards = catalogCards(publicProducts(result).slice(0, 3), false, this.routes.product, fixtureImageId(this.env));
      }
      return { status: 200, model };
    } catch { model.failed = true; return { status: 503, model }; }
  }
}
