import { NotFoundException } from '@nestjs/common';
import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { localCheckoutPageEnabled } from '../presentation-policy';
import { canonicalRoutes, type StorefrontRoutes } from '../routing/storefront-routes';
import { paymentConfig } from '../../modules/payments/mercadopago';
import type { CheckoutAccess } from '../../modules/payments/checkout-access';

/** Public branding only. Checkout cookies, sessions and attempts belong to the JSON API. */
export class CheckoutPage {
  constructor(private readonly catalog: Pick<PublicCatalog, 'settings'>, private readonly mode: 'api' | 'demo',
    private readonly env: NodeJS.ProcessEnv, private readonly routes: StorefrontRoutes = canonicalRoutes,
    private readonly paymentAvailable = !!paymentConfig(env), private readonly access?: CheckoutAccess) {}

  assertEnabled(): void {
    if (this.mode !== 'api' || (!this.access && !localCheckoutPageEnabled(this.env, this.mode))) throw new NotFoundException();
  }

  async read(headers: Record<string, string | string[] | undefined> = {}) {
    this.assertEnabled();
    const context = this.access ? await this.access.current({ headers }).catch(() => undefined) : undefined;
    const base = { layout: false, routes: this.routes, mode: 'api', demo: false, checkoutEnabled: false, paymentAvailable: this.access ? !!context : this.paymentAvailable,
      testMode: this.access ? context?.mode === 'test' : true, newOrdersEnabled: this.access ? !!context : true };
    try {
      const settings = await this.catalog.settings();
      return { status: 200, model: { ...base, ready: true, brand: settings.name } };
    } catch {
      return { status: 503, model: { ...base, ready: false, brand: 'Tienda' } };
    }
  }
}
