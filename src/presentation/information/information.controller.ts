import { Controller, Get, Header, Inject, NotFoundException, Res } from '@nestjs/common';
import { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { MVC_CART_MODE } from '../cart/cart-mode';
import { canonicalRoutes } from '../routing/storefront-routes';
import { INFORMATION_CHECKOUT_ENABLED } from './shipping-returns.controller';
import { informationPages, type InformationPage, type InformationPageKey } from './information-content';
import { STORE_INFORMATION, type StoreInformation, type StoreInformationReader } from './store-information';

type Response = { render(view: string, model: object): void; locals?: { storeInfo?: StoreInformation } };

@Controller()
export class InformationController {
  constructor(
    @Inject(PublicCatalog) private readonly catalog: Pick<PublicCatalog, 'settings'>,
    @Inject(MVC_CART_MODE) private readonly mode: 'api' | 'demo',
    @Inject(INFORMATION_CHECKOUT_ENABLED) private readonly checkoutEnabled: boolean,
    @Inject(STORE_INFORMATION) private readonly information: Pick<StoreInformationReader, 'get'>,
  ) {}

  @Get(['contacto', 'politica-de-privacidad', 'terminos-y-condiciones', 'preguntas-frecuentes', 'sobre-mali'])
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  async show(@Res() response: Response & { req: { path: string } }) {
    // Only the five exact routes above reach this handler; no query or request value becomes a view path.
    const key = response.req.path.replace(/^\//, '').replace(/\/$/, '').toLowerCase() as InformationPageKey;
    if (!Object.hasOwn(informationPages, key)) throw new NotFoundException();
    return this.render(key, response);
  }

  async render(key: InformationPageKey, response: Response) {
    const page: InformationPage = informationPages[key];
    const storeInfo = response.locals?.storeInfo ?? await this.information.get();
    const brand = await this.catalog.settings().then(settings => settings.name).catch(() => 'Tienda');
    const noindex = (page.contact && !storeInfo.hasContact) ||
      (page.legal && (!storeInfo.legalName || !storeInfo.legalAddress || !storeInfo.hasContact));
    response.render('information-page', { layout: false, page, brand, noindex, storeInfo,
      routes: canonicalRoutes, mode: this.mode, checkoutEnabled: this.checkoutEnabled });
  }
}
