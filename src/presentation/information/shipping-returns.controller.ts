import { Controller, Get, Header, Inject, Res } from '@nestjs/common';
import { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { canonicalRoutes } from '../routing/storefront-routes';
import { MVC_CART_MODE } from '../cart/cart-mode';
import { defaultContentConfig, type ContentConfig } from '../../modules/settings/content-config';
import { contentPage } from './content-model';

export const INFORMATION_CHECKOUT_ENABLED = Symbol('INFORMATION_CHECKOUT_ENABLED');

/** Informational content stays readable even when the catalog database is unavailable. */
@Controller('envios-y-reembolsos')
export class ShippingReturnsController {
  constructor(
    @Inject(PublicCatalog) private readonly catalog: Pick<PublicCatalog, 'settings'>,
    @Inject(MVC_CART_MODE) private readonly mode: 'api' | 'demo',
    @Inject(INFORMATION_CHECKOUT_ENABLED) private readonly checkoutEnabled: boolean,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  async show(@Res() response: { render(view: string, model: object): void; locals?: { content?: ContentConfig } }) {
    const brand = await this.catalog.settings().then(settings => settings.name).catch(() => 'Tienda');
    response.render('information-page', { layout: false, page: contentPage(response.locals?.content ?? defaultContentConfig(), 'envios-y-reembolsos'), brand, routes: canonicalRoutes, mode: this.mode, checkoutEnabled: this.checkoutEnabled });
  }
}
