import { Body, Controller, HttpCode, Inject, Optional, Post, Req } from '@nestjs/common';
import { CheckoutAccess } from '../../payments/checkout-access';
import { SessionService, type CheckoutRequest } from '../sessions/session';
import { CheckoutQuoteService } from '../services/quote';

@Controller('checkout')
export class CheckoutQuoteController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService, @Inject(CheckoutQuoteService) private readonly quotes: CheckoutQuoteService, @Optional() @Inject(CheckoutAccess) private readonly access?: CheckoutAccess) {}
  @Post('quotes') @HttpCode(200)
  async quote(@Req() req: CheckoutRequest, @Body() body: unknown) {
    const session = await this.sessions.requireMutation(req);
    const payment = await this.access?.current(req);
    return this.quotes.quote(session, body, payment);
  }
}
