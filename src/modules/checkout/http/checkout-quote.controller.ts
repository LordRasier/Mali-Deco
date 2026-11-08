import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { SessionService, type CheckoutRequest } from '../sessions/session';
import { CheckoutQuoteService } from '../services/quote';

@Controller('checkout')
export class CheckoutQuoteController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService, @Inject(CheckoutQuoteService) private readonly quotes: CheckoutQuoteService) {}
  @Post('quotes') @HttpCode(200)
  async quote(@Req() req: CheckoutRequest, @Body() body: unknown) {
    return this.quotes.quote(await this.sessions.requireMutation(req), body);
  }
}
