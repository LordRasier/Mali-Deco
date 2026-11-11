import { BadRequestException, Body, Controller, Header, Inject, Post, Res, UseGuards } from '@nestjs/common';
import { OwnerGuard } from '../../../modules/identity/http/owner.guard';
import { PublicCatalog } from '../../../modules/catalog/services/public-catalog';
import { parseContentConfig } from '../../../modules/settings/content-validation';
import { pagePaths, type PageKey } from '../../../modules/settings/content-config';
import { configuredInformation, contentModel, contentPage } from '../../information/content-model';
import { STORE_INFORMATION, type StoreInformationReader } from '../../information/store-information';
import { canonicalRoutes } from '../../routing/storefront-routes';
import { HomePage } from '../../home/home-page';
import { CatalogPage } from '../../catalog/catalog-page';
import { INFORMATION_CHECKOUT_ENABLED } from '../../information/shipping-returns.controller';

type PreviewResponse = {
  render(view: string, model: object, callback: (error: Error | null, html: string) => void): void;
  json(body: { html: string }): void;
};

@Controller('admin/settings/content/editor/preview')
@UseGuards(OwnerGuard)
export class ContentPreviewController {
  constructor(
    @Inject(PublicCatalog) private readonly catalog: Pick<PublicCatalog, 'settings'>,
    @Inject(STORE_INFORMATION) private readonly information: Pick<StoreInformationReader, 'get'>,
    @Inject(HomePage) private readonly home: HomePage,
    @Inject(CatalogPage) private readonly listing: CatalogPage,
    @Inject(INFORMATION_CHECKOUT_ENABLED) private readonly checkoutEnabled: boolean,
  ) {}
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async preview(@Body() body: unknown, @Res() response: PreviewResponse) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid preview');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).length !== 2 || !Object.hasOwn(input, 'settings') || typeof input.target !== 'string' ||
        !['home', 'catalog', 'footer'].includes(input.target) && !Object.hasOwn(pagePaths, input.target)) throw new BadRequestException('Invalid preview target');
    let config;
    try { config = parseContentConfig(input.settings); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid content'); }
    const [base, store] = await Promise.all([this.information.get(), this.catalog.settings()]);
    const info = configuredInformation(base, config), target = input.target === 'footer' ? 'home' : input.target;
    // The authenticated preview intentionally renders disabled pages, without changing public route state.
    const page = target === 'home' || target === 'catalog' ? undefined : contentPage(config, target as PageKey);
    const model = target === 'home' ? (await this.home.read(config)).model : target === 'catalog' ? (await this.listing.read(new URLSearchParams(), config.listing)).model : {};
    const view = target === 'home' ? 'home' : target === 'catalog' ? 'catalog' : 'information-page';
    const html = await new Promise<string>((resolve, reject) => response.render(view, {
      ...model, ...contentModel(config, info, true), ...(page ? { page } : {}), visualPreview: true, layout: false,
      pageEditorPath: page ? `pages.${target}` : '', brand: store.name, mode: 'api', checkoutEnabled: this.checkoutEnabled,
      routes: canonicalRoutes, storeInfo: { ...info, channels: info.channels.map(channel => ({ ...channel, editorPath: channel === info.email ? 'contact.email' : 'source.social' })) }, storeYear: new Date().getFullYear(),
      seo: { title: `${page?.title ?? (target === 'home' ? 'Inicio' : 'Catálogo')} · Vista previa`, robots: 'noindex, nofollow' },
    }, (error, output) => error ? reject(error) : resolve(output)));
    // JSON only: the returned HTML goes exclusively into the editor's scriptless sandbox.
    response.json({ html });
  }
}
