import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { CheckoutOrderController } from './checkout-order.controller';
import type { CheckoutRequest, SessionService } from './session';
import type { OrdersService } from '../orders/orders.service';

test('checkout order endpoints require the session and never return contact details', async () => {
  let calls = 0;
  const sessions = { requireMutation: async (req: CheckoutRequest) => {
    if (req.headers['x-csrf-token'] !== 'valid') throw new ForbiddenException();
    return { id: 'session', expiresAt: Date.now() + 10000 };
  } } as unknown as SessionService;
  const orders = {
    create: async () => { calls++; return { id: 'o', orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started', testLocal: true, currency: 'ARS', totalMinor: '100', contact: { email: 'private@example.test' } }; },
    findAttempt: async () => ({ status: 'unknown' }),
  } as unknown as OrdersService;
  const controller = new CheckoutOrderController(sessions, orders);
  const request = { method: 'POST', headers: { 'x-csrf-token': 'valid', 'idempotency-key': 'a' }, socket: {} };
  const result = await controller.create(request, {});
  assert.equal(result.id, 'o');
  assert.equal(Object.hasOwn(result, 'contact'), false);
  assert.deepEqual(await controller.attempt(request, {}), { status: 'unknown' });
  await assert.rejects(controller.create({ ...request, headers: { 'x-csrf-token': 'invalid' } }, {}), { status: 403 });
  await assert.rejects(controller.attempt(request, { unexpected: true }), { status: 400 });
  assert.equal(calls, 1);
});
