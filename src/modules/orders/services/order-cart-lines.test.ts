import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { OrdersService } from './orders.service';
import { CheckoutOrderController } from '../../checkout/http/checkout-order.controller';
import type { SessionService } from '../../checkout/sessions/session';

test('historical orders recover purchased identifiers only through their owning checkout session', async () => {
  const key = 'b957d5e1-17af-4cb6-8f3f-0af2b8ee5891';
  const body = { quoteId: 'quote', optionId: 'ship', pickupPointId: null, contact: { name: 'Buyer', email: 'buyer@example.com', phone: '123' }, address: { street: 'Street', number: '1', unit: '' } };
  const purchased = [{ productId: 'product', variantId: 'variant', quantity: 2 }];
  const result = { id: 'order', currency: 'ARS', totalMinor: '200', testLocal: false, contact: body.contact, destination: { ...body.address, postalCode: '7600' }, shipping: { carrierName: 'Carrier', serviceName: 'Home' }, lines: [{ name: 'Product', variantName: 'Variant', quantity: 2, unitPriceMinor: '100', lineTotalMinor: '200', currency: 'ARS' }] };
  const tx = { async query(sql: string, args: unknown[]) {
    if (sql.includes('FROM checkout_sessions')) return [{ id: args[0] }];
    if (sql.includes('FROM checkout_orders')) return args[0] === 'owner' ? [{ snapshot: JSON.stringify({ result, quote: { lines: purchased } }), bodyHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'), paymentStatus: 'approved', orderStatus: 'confirmed', fulfillmentStatus: 'preparing', shippingStatus: 'not_started' }] : [];
    throw Error('Unexpected query');
  } };
  const orders = new OrdersService({ isInitialized: true, transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } as unknown as DataSource);
  const recovered = await orders.findAttempt('owner', key); assert.equal(recovered.status, 'completed');
  assert.deepEqual(recovered.status === 'completed' && recovered.order.cartLines, purchased);
  assert.deepEqual(await orders.findAttempt('other', key), { status: 'unknown' });
  const sessions = { requireMutation: async () => ({ id: 'owner' }) } as unknown as SessionService;
  const controller = new CheckoutOrderController(sessions, orders);
  const response = await controller.create({ method: 'POST', headers: { 'idempotency-key': key }, socket: {} }, body);
  assert.deepEqual(response.cartLines, purchased); assert.equal(response.paymentStatus, 'approved');
});
