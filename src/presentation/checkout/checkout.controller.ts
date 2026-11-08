import { BadRequestException, Controller, Get, Header, Inject, Query, Res } from '@nestjs/common';
import { CheckoutPage } from './checkout-page';

@Controller('checkout')
export class MvcCheckoutController {
  constructor(@Inject(CheckoutPage) private readonly checkout: CheckoutPage) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  async page(@Query() query: Record<string, unknown>, @Res() response: { status(code: number): { render(view: string, model: object): void } }) {
    this.checkout.assertEnabled();
    if (Object.keys(query).length) throw new BadRequestException('MVC checkout accepts no query parameters');
    const result = await this.checkout.read(); response.status(result.status).render('checkout', result.model);
  }
}
