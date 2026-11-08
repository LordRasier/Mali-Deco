import { Controller, Get, Header, Inject, Param, Res } from '@nestjs/common';
import { ProductPage } from './product-page';
import { publicPageNoindex } from '../presentation-policy';

@Controller('productos')
export class MvcProductController {
  constructor(@Inject(ProductPage) private readonly page: ProductPage) {}

  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  async show(@Param('slug') slug: string, @Res() response: { setHeader(name: string, value: string): unknown; status(code: number): { render(view: string, model: object): void } }) {
    const result = await this.page.read(slug), noindex = publicPageNoindex(result.status, result.model.demo);
    if (noindex) response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.status(result.status).render('product', { ...result.model, noindex });
  }
}
