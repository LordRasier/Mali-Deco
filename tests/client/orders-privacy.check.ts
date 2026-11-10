import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { OrdersPage } from '../../src/presentation/admin/orders/orders-page';
import { createViewEngine } from '../../src/presentation/view-engine';

test('the authorized orders list shows customer identity but omits phone, document and street details', async () => {
  const row = { id: 'synthetic-order', createdAt: '2026-01-01T12:00:00Z', currency: 'ARS', totalMinor: '1200', testLocal: true,
    orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started',
    contact: { name: 'Private synthetic person', email: 'private@example.test', phone: 'private-phone', document: 'private-document' }, destination: { city: 'MDP', street: 'Private synthetic street' } };
  const result = await new OrdersPage({ list: async () => ({ items: [row], page: 1, limit: 20, total: 1 }), detail: async () => { throw Error('Unexpected detail lookup'); } }).read({});
  assert.doesNotMatch(JSON.stringify(result.model), /private-phone|private-document|Private synthetic street/);
  const html = await new Promise<string>((accept, reject) => createViewEngine({}).__express(resolve(__dirname, '../../src/presentation/admin/views/admin-orders-list.hbs'), result.model,
    (error, value) => { if (error) reject(error); else accept(value ?? ''); }));
  assert.match(html, /synthetic-order/); assert.match(html, /12,00/); assert.match(html, /Private synthetic person/); assert.match(html, /private@example.test/); assert.doesNotMatch(html, /private-phone|private-document|Private synthetic street/);
});
