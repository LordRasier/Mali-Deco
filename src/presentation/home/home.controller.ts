import { Controller, Get, Header, Inject, Res } from '@nestjs/common';
import { HomePage } from './home-page';
import { publicPageNoindex } from '../presentation-policy';

@Controller('')
export class MvcHomeController {
  constructor(@Inject(HomePage) private readonly page: HomePage) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  async show(@Res() response: { setHeader(name: string, value: string): unknown; status(code: number): { render(view: string, model: object): void } }) {
    const result = await this.page.read(), noindex = publicPageNoindex(result.status, result.model.demo);
    if (noindex) response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.status(result.status).render('home', { ...result.model, noindex });
  }
}
