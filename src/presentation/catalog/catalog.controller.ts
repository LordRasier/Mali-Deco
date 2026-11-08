import { Controller, Get, Header, Inject, Req, Res } from '@nestjs/common';
import { CatalogPage } from './catalog-page';
import { publicPageNoindex } from '../presentation-policy';

type HtmlResponse = {
  setHeader(name: string, value: string): unknown;
  status(code: number): HtmlResponse;
  render(view: string, model: object): void;
  redirect(status: number, destination: string): void;
};

@Controller('catalogo')
export class MvcCatalogController {
  constructor(@Inject(CatalogPage) private readonly page: CatalogPage) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  async show(@Req() request: { originalUrl: string }, @Res() response: HtmlResponse) {
    // Keep duplicate parameters until validation; Express query objects can erase distinctions.
    const search = request.originalUrl.slice(request.originalUrl.indexOf('?') + 1);
    const params = new URLSearchParams(request.originalUrl.includes('?') ? search : '');
    const result = await this.page.read(params);
    const noindex = publicPageNoindex(result.status, result.model.demo);
    if (noindex) response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (result.redirect) return response.redirect(result.status, result.redirect);
    response.status(result.status).render('catalog', { ...result.model, noindex });
  }
}
