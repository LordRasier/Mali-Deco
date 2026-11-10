import { Controller, Get, Header, Inject, Optional, Param, Req, Res } from '@nestjs/common';
import { ProductPage } from './product-page';
import { publicPageNoindex } from '../presentation-policy';
import { SeoCatalog } from '../../modules/catalog/services/seo-catalog';

@Controller('productos')
export class MvcProductController {
  constructor(@Inject(ProductPage) private readonly page: ProductPage, @Optional() @Inject(SeoCatalog) private readonly catalog?: SeoCatalog) {}

  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  async show(@Param('slug') slug: string, @Res() response: { setHeader(name: string, value: string): unknown; redirect?(code: number, path: string): void; status(code: number): { render(view: string, model: object): void } }, @Req() request?: { originalUrl: string }) {
    const params = new URL(request?.originalUrl ?? '/', 'https://local.invalid').searchParams;
    const result = await this.page.read(slug, params), noindex = publicPageNoindex(result.status, result.model.demo) || result.model.noindex;
    if (result.status === 404 && this.catalog && response.redirect) { const target = await this.catalog.redirect(slug); if (target) { const variant = params.get('variant'); return response.redirect(301, `/productos/${encodeURIComponent(target)}${variant ? `?variant=${encodeURIComponent(variant)}` : ''}`); } }
    if (noindex) response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.status(result.status).render('product', { ...result.model, noindex });
  }
}
