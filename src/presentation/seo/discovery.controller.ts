import { Controller, Get, Header, Inject, NotFoundException, Param, ServiceUnavailableException } from '@nestjs/common';
import { SiteSettings } from '../../modules/settings/site-settings';
import { SeoCatalog } from '../../modules/catalog/services/seo-catalog';
import { STORE_INFORMATION, type StoreInformationReader } from '../information/store-information';
import { SEO_ENV, type SeoEnvironment } from './metadata';
import { publicOrigin, xmlText } from './urls';

const xml = '<?xml version="1.0" encoding="UTF-8"?>';
const urlset = (urls: string[]) => `${xml}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<url><loc>${xmlText(url)}</loc></url>`).join('')}</urlset>`;

@Controller()
export class DiscoveryController {
  constructor(@Inject(SiteSettings) private readonly settings: SiteSettings, @Inject(SeoCatalog) private readonly catalog: SeoCatalog,
    @Inject(SEO_ENV) private readonly env: SeoEnvironment, @Inject(STORE_INFORMATION) private readonly information: StoreInformationReader) {}
  private async origin() { return publicOrigin((await this.settings.publicSettings()).publicSiteUrl || this.env.PUBLIC_SITE_URL); }
  @Get('robots.txt') @Header('Content-Type', 'text/plain; charset=utf-8') @Header('Cache-Control', 'public, max-age=300')
  async robots() {
    if (this.env.NODE_ENV !== 'production') return 'User-agent: *\nDisallow: /\n';
    const origin = await this.origin();
    return `User-agent: *\nAllow: /\nDisallow: /api/v1/admin/\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`;
  }
  @Get('sitemap.xml') @Header('Content-Type', 'application/xml; charset=utf-8') @Header('Cache-Control', 'no-cache')
  async index() {
    const origin = await this.origin(); if (!origin) throw new ServiceUnavailableException('Public site URL is not configured');
    const total = await this.catalog.count();
    const urls = [`${origin}/sitemaps/pages.xml`, ...Array.from({ length: Math.ceil(total / 1000) }, (_, i) => `${origin}/sitemaps/products-${i + 1}.xml`)];
    return `${xml}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<sitemap><loc>${xmlText(url)}</loc></sitemap>`).join('')}</sitemapindex>`;
  }
  @Get('sitemaps/:name') @Header('Content-Type', 'application/xml; charset=utf-8') @Header('Cache-Control', 'no-cache')
  async sitemap(@Param('name') name: string) {
    const origin = await this.origin(); if (!origin) throw new ServiceUnavailableException('Public site URL is not configured');
    if (name === 'pages.xml') {
      const [categories, info, total] = await Promise.all([this.catalog.categories(), this.information.get(), this.catalog.count()]);
      const paths = ['/', '/sobre-mali', '/preguntas-frecuentes', '/envios-y-reembolsos', ...(total ? ['/catalogo'] : [])];
      if (info.hasContact) paths.push('/contacto');
      if (info.hasContact && info.legalName && info.legalAddress) paths.push('/politica-de-privacidad', '/terminos-y-condiciones');
      return urlset([...paths.map(path => origin + path), ...categories.map(c => `${origin}/categorias/${encodeURIComponent(c.slug)}`)]);
    }
    const match = /^products-([1-9]\d{0,3})\.xml$/.exec(name), page = Number(match?.[1]);
    if (!match || page > 1000) throw new NotFoundException();
    const products = await this.catalog.products(page); if (!products.length) throw new NotFoundException();
    return urlset(products.map(p => `${origin}/productos/${encodeURIComponent(p.slug)}`));
  }
}
