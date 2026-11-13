import { BadRequestException, Body, Controller, Header, HttpCode, Inject, Optional, Post, Req } from '@nestjs/common';
import { CheckoutAccess } from '../../payments/checkout-access';
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
  constructor(@Inject(SessionService) private readonly sessions: SessionService, @Inject(OrdersService) private readonly orders: OrdersService, @Inject(PaymentService) private readonly payments?: PaymentService, @Optional() @Inject(CheckoutAccess) private readonly access?: CheckoutAccess) {}

  @Post('orders') @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async create(@Req() req: CheckoutRequest, @Body() body: unknown) {
    const session = await this.sessions.requireMutation(req);
    const previous = this.access ? await this.orders.findAttempt(session.id, key(req)) : undefined;
    if (previous?.status === 'completed') await this.access!.existing(previous.order.testLocal ? 'test' : 'production', req);
    const payment = previous?.status === 'completed' ? undefined : await this.access?.current(req);
    const order = await this.orders.create(session.id, key(req), body, payment);
    await this.access?.existing(order.testLocal ? 'test' : 'production', req);
    return { id: order.id, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, shippingStatus: order.shippingStatus, testLocal: order.testLocal, currency: order.currency, totalMinor: order.totalMinor,
      checkout: { contact: order.contact, address: { street: order.destination.street, number: order.destination.number, unit: order.destination.unit }, postalCode: order.destination.postalCode, delivery: order.shipping.carrierName + ' · ' + order.shipping.serviceName, lines: order.lines }, ...(this.payments?.available ? { paymentAvailable: true } : {}) };
  }

  @Post('order-attempt') @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async attempt(@Req() req: CheckoutRequest, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new BadRequestException('Invalid request');
    const session = await this.sessions.requireMutation(req);
    const result = await this.orders.findAttempt(session.id, key(req));
    if (result.status === 'completed') await this.access?.existing(result.order.testLocal ? 'test' : 'production', req);
    return result.status === 'completed' && this.payments?.available ? { ...result, order: { ...result.order, paymentAvailable: true } } : result;
  }
}
