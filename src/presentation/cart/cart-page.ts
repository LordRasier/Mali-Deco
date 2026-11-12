import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { demoCatalog } from '../catalog/shared/demo-catalog';
import { canonicalRoutes, type StorefrontRoutes } from '../routing/storefront-routes';
import { localCheckoutPageEnabled } from '../presentation-policy';
import type { PaymentSettings } from '../../modules/payments/payment-settings';

/** The browser owns cart recovery; a branding outage must not hide persisted lines. */
export class CartPage {
  constructor(private readonly catalog: Pick<PublicCatalog, 'settings'>, private readonly mode: 'api' | 'demo',
    private readonly routes: StorefrontRoutes = canonicalRoutes, private readonly env: NodeJS.ProcessEnv = {}, private readonly payments?: Pick<PaymentSettings, 'get'>) {}

  async read() {
    const brand = this.mode === 'demo' ? demoCatalog.brand : await this.catalog.settings().then(settings => settings.name).catch(() => 'Tienda');
    const payment = await this.payments?.get().catch(() => undefined);
    const checkoutEnabled = this.payments ? this.mode === 'api' && !!payment?.enabled && payment.mode === 'production' : localCheckoutPageEnabled(this.env, this.mode);
    return { layout: false, routes: this.routes, brand, mode: this.mode, demo: this.mode === 'demo', checkoutEnabled };
  }
}
