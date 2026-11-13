import { Controller, Get, Header, Inject, NotFoundException, Res } from '@nestjs/common';
import { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { MVC_CART_MODE } from '../cart/cart-mode';
import { canonicalRoutes } from '../routing/storefront-routes';
import { INFORMATION_CHECKOUT_ENABLED } from './shipping-returns.controller';
import { STORE_INFORMATION, type StoreInformation, type StoreInformationReader } from './store-information';
import { defaultContentConfig, pagePaths, type ContentConfig, type PageKey } from '../../modules/settings/content-config';
import { contentPage, contentModel } from './content-model';

type Response = { render(view: string, model: object): void; locals?: { storeInfo?: StoreInformation; content?: ContentConfig } };

@Controller()
export class InformationController {
  constructor(
    @Inject(PublicCatalog) private readonly catalog: Pick<PublicCatalog, 'settings'>,
    @Inject(MVC_CART_MODE) private readonly mode: 'api' | 'demo',
    @Inject(INFORMATION_CHECKOUT_ENABLED) private readonly checkoutEnabled: boolean,
    @Inject(STORE_INFORMATION) private readonly information: Pick<StoreInformationReader, 'get'>,
  ) {}

  @Get(Object.values(pagePaths).filter(path => !['/envios-y-reembolsos', '/seguimiento'].includes(path)).map(path => path.slice(1)))
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  async show(@Res() response: Response & { req: { path: string } }) {
    // Only registered exact routes reach this handler; no request value becomes a template path.
    const path = response.req.path.replace(/\/$/, '').toLowerCase();
    const key = Object.keys(pagePaths).find(key => pagePaths[key as PageKey] === path) as PageKey | undefined;
    if (!key) throw new NotFoundException();
    return this.render(key, response);
  }

  async render(key: PageKey, response: Response) {
    const config = response.locals?.content ?? defaultContentConfig();
    if (!config.pages[key].enabled) throw new NotFoundException();
    const page = contentPage(config, key);
    const storeInfo = response.locals?.storeInfo ?? await this.information.get();
    const brand = await this.catalog.settings().then(settings => settings.name).catch(() => 'Tienda');
    const noindex = (page.contact && !storeInfo.hasContact) ||
      (page.legal && (!storeInfo.legalName || !storeInfo.legalAddress || !storeInfo.hasContact));
    response.render('information-page', { ...contentModel(config, storeInfo), layout: false, page, brand, noindex, storeInfo,
      routes: canonicalRoutes, mode: this.mode, checkoutEnabled: this.checkoutEnabled });
  }
}
