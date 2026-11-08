import { BadRequestException, Controller, Get, Header, Inject, Query, Render } from '@nestjs/common';
import { CartPage } from './cart-page';

@Controller('carrito')
export class MvcCartController {
  constructor(@Inject(CartPage) private readonly cart: CartPage) {}

  @Get()
  @Render('cart')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  page(@Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException('MVC cart accepts no query parameters');
    return this.cart.read();
  }
}
