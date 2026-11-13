import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { CheckoutOrderController } from './checkout-order.controller';
import type { CheckoutRequest, SessionService } from '../sessions/session';
import type { OrdersService } from '../../orders/services/orders.service';

test('checkout order endpoints require session/CSRF before returning the private recovery draft', async () => {
  let calls = 0;
  const sessions = { requireMutation: async (req: CheckoutRequest) => {
    if (req.headers['x-csrf-token'] !== 'valid') throw new ForbiddenException();
    return { id: 'session', expiresAt: Date.now() + 10000 };
  } } as unknown as SessionService;
  const orders = {
    create: async () => { calls++; return { id: 'o', orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started', testLocal: true, currency: 'ARS', totalMinor: '100', contact: { email: 'private@example.test' }, destination: { postalCode: '7600', street: 'Private', number: '1', unit: '' }, shipping: { carrierName: 'Carrier', serviceName: 'Home' }, lines: [] }; },
    findAttempt: async () => ({ status: 'unknown' }),
  } as unknown as OrdersService;
  const controller = new CheckoutOrderController(sessions, orders);
  const request = { method: 'POST', headers: { 'x-csrf-token': 'valid', 'idempotency-key': 'a' }, socket: {} };
  const result = await controller.create(request, {});
  assert.equal(result.id, 'o');
  assert.equal(result.checkout.contact.email, 'private@example.test');
  assert.deepEqual(await controller.attempt(request, {}), { status: 'unknown' });
  await assert.rejects(controller.create({ ...request, headers: { 'x-csrf-token': 'invalid' } }, {}), { status: 403 });
  await assert.rejects(controller.attempt(request, { unexpected: true }), { status: 400 });
  assert.equal(calls, 1);
});
