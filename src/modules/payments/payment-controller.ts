import { BadRequestException, Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { SessionService, type CheckoutRequest } from '../checkout/sessions/session';
import { PaymentService } from './payment-service';

function orderId(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('orderId' in body) || typeof body.orderId !== 'string') throw new BadRequestException('Invalid payment request');
  return body.orderId;
}
@Controller('checkout/payments')
export class PaymentController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService, @Inject(PaymentService) private readonly payments: PaymentService) {}
  @Post('start') @HttpCode(200)
  async start(@Req() req: CheckoutRequest, @Body() body: unknown) {
    const session = await this.sessions.requireMutation(req);
    return this.payments.start(session.id, orderId(body));
  }
  @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: CheckoutRequest, @Body() body: unknown) {
    const session = await this.sessions.requireMutation(req);
    return this.payments.refresh(session.id, orderId(body));
  }
}
