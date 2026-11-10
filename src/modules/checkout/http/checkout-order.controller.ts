import { BadRequestException, Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { OrdersService } from '../../orders/services/orders.service';
import { SessionService, type CheckoutRequest } from '../sessions/session';
import { PaymentService } from '../../payments/payment-service';

function key(req: CheckoutRequest): string {
  const value = req.headers['idempotency-key'];
  if (typeof value !== 'string') throw new BadRequestException('Invalid idempotency key');
  return value;
}

@Controller('checkout')
export class CheckoutOrderController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService, @Inject(OrdersService) private readonly orders: OrdersService, @Inject(PaymentService) private readonly payments?: PaymentService) {}

  @Post('orders') @HttpCode(200)
  async create(@Req() req: CheckoutRequest, @Body() body: unknown) {
    const session = await this.sessions.requireMutation(req);
    const order = await this.orders.create(session.id, key(req), body);
    return { id: order.id, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, shippingStatus: order.shippingStatus, testLocal: order.testLocal, currency: order.currency, totalMinor: order.totalMinor, ...(this.payments?.available ? { paymentAvailable: true } : {}) };
  }

  @Post('order-attempt') @HttpCode(200)
  async attempt(@Req() req: CheckoutRequest, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new BadRequestException('Invalid request');
    const session = await this.sessions.requireMutation(req);
    const result = await this.orders.findAttempt(session.id, key(req));
    return result.status === 'completed' && this.payments?.available ? { ...result, order: { ...result.order, paymentAvailable: true } } : result;
  }
}
