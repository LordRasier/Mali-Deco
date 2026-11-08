import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { PaymentWebhook, verifyWebhook } from './payment-webhook';
import { MercadoPagoTestProvider } from './mercadopago';

const secret = 'synthetic-webhook-secret', requestId = 'request-1', ts = '1794048000';
const sign = (id = '456') => `ts=${ts},v1=${createHmac('sha256', secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex')}`;
const id = 'ca665af8-41b6-4ba4-bb75-54cf9c0f142e';
test('webhook authenticates the query ID and rejects altered, missing or duplicated signatures', () => {
  assert.equal(verifyWebhook(secret, '456', requestId, sign()), '456');
  for (const args of [['457', requestId, sign()], ['456', 'other', sign()], ['456', requestId, undefined], [['456'], requestId, sign()], ['456', requestId, sign() + ',ts=' + ts]]) {
    assert.throws(() => verifyWebhook(secret, ...args as [unknown, unknown, unknown]), { status: 401 });
  }
});
function fixture() {
  let status = 'pending', next: 'pending' | 'approved' | 'refunded' | 'charged_back' = 'approved', events = 0, reads = 0, owned = true, fail = false;
  const query = async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM checkout_orders')) return [{ id, currency: 'ARS', totalMinor: '12345', paymentStatus: status }];
    if (sql.includes('FROM checkout_payment_starts')) return owned ? [{ sellerId: '123' }] : [];
    if (sql.startsWith('UPDATE checkout_orders')) { status = String(params[0]); return { affectedRows: 1 }; }
    if (sql.startsWith('INSERT INTO order_events')) { events++; return []; }
    throw Error(sql);
  };
  let queue = Promise.resolve();
  const db = { isInitialized: true, transaction: <T>(fn: (tx: {query: typeof query}) => Promise<T>) => { const result = queue.then(() => fn({ query })); queue = result.then(() => {}, () => {}); return result; } } as unknown as DataSource;
  const service = new PaymentWebhook(db, { sellerId: '123', verifySeller: async () => { reads++; }, notificationOrder: async () => id, reconcile: async () => { if (fail) throw Error('upstream'); return next; } }, secret);
  return { service, status: () => status, events: () => events, reads: () => reads, set: (s: typeof next) => { next = s; }, unown: () => { owned = false; }, fail: () => { fail = true; } };
}
test('signed S2S confirms without a customer session, deduplicates retries and preserves terminal outcomes', async () => {
  const f = fixture(); const receive = () => f.service.receive('456', requestId, sign());
  await Promise.all([receive(), receive()]); assert.equal(f.status(), 'approved'); assert.equal(f.events(), 1);
  f.set('pending'); await receive(); assert.equal(f.status(), 'approved'); assert.equal(f.events(), 1);
  f.set('refunded'); await receive(); assert.equal(f.status(), 'refunded'); assert.equal(f.events(), 2);
  f.set('approved'); await receive(); assert.equal(f.status(), 'refunded');
  f.set('charged_back'); await receive(); assert.equal(f.status(), 'charged_back');
});
test('untrusted webhook does no external work; unrelated payments do not update orders; provider failures request retry', async () => {
  const f = fixture(); await assert.rejects(f.service.receive('456', requestId, 'invalid'), { status: 401 }); assert.equal(f.reads(), 0);
  f.unown(); await f.service.receive('456', requestId, sign()); assert.equal(f.events(), 0);
  const g = fixture(); g.fail(); await assert.rejects(g.service.receive('456', requestId, sign()), { status: 503 }); assert.equal(g.status(), 'pending');
  await assert.rejects(new PaymentWebhook().receive('456', requestId, sign()), { status: 503 });
});
test('notification resource requires the verified seller, valid mode flag and order', async () => {
  const good = { id: 456, collector_id: 123, live_mode: false, external_reference: id };
  for (const change of [{}, { collector_id: 999 }, { live_mode: 'true' }, { live_mode: undefined }, { id: 457 }, { external_reference: '../other' }]) {
    const provider = new MercadoPagoTestProvider({ token: 'fixture', sellerId: '123', returnUrl: 'https://example.test/return' }, async url => Response.json(String(url).endsWith('/users/me') ? { id: 123, site_id: 'MLA', tags: ['test_user'] } : { ...good, ...change }));
    await provider.verifySeller();
    if (Object.keys(change).length) await assert.rejects(provider.notificationOrder('456')); else assert.equal(await provider.notificationOrder('456'), id);
  }
});
