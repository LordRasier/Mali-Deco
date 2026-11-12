import { BadRequestException, Controller, Get, Header, Inject, Query, Req, Res } from '@nestjs/common';
import { CheckoutPage } from './checkout-page';

@Controller('checkout')
export class MvcCheckoutController {
  constructor(@Inject(CheckoutPage) private readonly checkout: CheckoutPage) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  async page(@Query() query: Record<string, unknown>, @Res() response: { status(code: number): { render(view: string, model: object): void } }, @Req() req?: { headers: Record<string, string | string[] | undefined> }) {
    this.checkout.assertEnabled();
    if (Object.keys(query).length) throw new BadRequestException('MVC checkout accepts no query parameters');
    const result = await this.checkout.read(req?.headers); response.status(result.status).render('checkout', result.model);
  }
  @Get('return')
  @Header('Cache-Control', 'private, no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
  returned(@Res() response: { type(value: string): { send(body: string): void } }) {
    // Provider query parameters never confirm a payment. A same-site navigation restores Strict cookies.
    response.type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Volver a la tienda</title><h1>Consultá el estado de tu pedido</h1><p>Volvé a la pestaña de tu compra y seleccioná Consultar pago. El servidor verificará el resultado con Mercado Pago.</p><a href="/checkout">Volver al checkout</a></html>');
  }
}
