import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { analyticsConfig, measurementBody, orderCommerce, parseAnalyticsIdentity } from './analytics-model';
import { CheckoutAnalytics } from './analytics-context';
import { AnalyticsWorker } from './analytics-worker';

const now = Date.now(), orderId = '10000000-0000-4000-8000-000000000000';
const config = { enabled: true, measurementId: 'G-TEST12345', apiSecret: 'test-secret-only' };
const identity = { measurementId: config.measurementId, clientId: '123.456', sessionId: String(Math.floor(now / 1000) - 60) };
const snapshot = { result: { id: orderId, testLocal: false, paymentMode: 'production', currency: 'ARS', totalMinor: '12899', shipping: { amountMinor: '3000' }, contact: { email: 'private@example.com', document: '12345678' } },
  quote: { lines: [{ productId: 'product-1', variantId: 'gold', name: 'Florero', quantity: 2, currency: 'ARS', priceMinor: '4949' }, { productId: 'product-2', variantId: 'red', name: 'Adorno', quantity: 1, currency: 'ARS', priceMinor: '1' }] } };

test('server revenue uses the paid snapshot in pesos, excludes shipping from value and strips private data', () => {
  const commerce = orderCommerce(snapshot, orderId);
  assert.equal(commerce.value, 98.99); assert.equal(commerce.shipping, 30); assert.equal(commerce.items[0].price, 49.49);
  const payload = measurementBody(identity, 'purchase', commerce, new Date(now), now);
  assert.equal(payload.events[0].params.transaction_id, orderId);
  assert.equal(payload.events[0].params.session_id, Number(identity.sessionId));
  assert.doesNotMatch(JSON.stringify(payload), /private|email|document|apiSecret|test-secret/);
  for (const result of [{ ...snapshot.result, testLocal: true }, { ...snapshot.result, totalMinor: '1' }, { ...snapshot.result, currency: 'USD' }]) assert.throws(() => orderCommerce({ ...snapshot, result }, orderId));
  assert.throws(() => orderCommerce({ ...snapshot, quote: { lines: [...snapshot.quote.lines, snapshot.quote.lines[0]] } }, orderId));
  const delayed = measurementBody(identity, 'refund', commerce, new Date(now + 2 * 86400000), now + 2 * 86400000);
  assert.equal(delayed.events[0].params.session_id, undefined);
  assert.throws(() => measurementBody(identity, 'purchase', commerce, new Date(now - 73 * 3600000), now));
});
test('server collection fails closed for test environment, missing consent, spoofed property and stale session', () => {
  assert.equal(analyticsConfig({ NODE_ENV: 'development', GA4_SERVER_ENABLED: 'true', GA4_MEASUREMENT_ID: config.measurementId, GA4_API_SECRET: config.apiSecret }).enabled, false);
  assert.equal(analyticsConfig({ NODE_ENV: 'production', GA4_SERVER_ENABLED: 'true' }).enabled, false);
  assert.deepEqual(parseAnalyticsIdentity({ consent: true, ...identity }, config.measurementId, now), identity);
  for (const value of [{ ...identity, consent: false }, { ...identity, consent: true, measurementId: 'G-OTHER123' }, { ...identity, consent: true, sessionId: '123' }]) assert.equal(parseAnalyticsIdentity(value, config.measurementId, now), null);
});
test('context attaches only to an owned eligible order; retries do not overwrite consent or identity', async () => {
  const writes: unknown[][] = []; let owned = false, revoked = false;
  const tx = { async query(sql: string, params: unknown[]) {
    if (sql.startsWith('SELECT id')) return owned ? [{ id: orderId }] : [];
    if (sql.startsWith('SELECT revoked_at')) return [{ revoked_at: revoked ? new Date() : null }];
    if (sql.startsWith('INSERT INTO checkout_analytics_grants')) revoked = true;
    if (sql.startsWith('INSERT INTO checkout_analytics_context')) { writes.push(params); assert.match(sql, /ON DUPLICATE KEY UPDATE order_id = order_id/); }
    return { affectedRows: 1 };
  } };
  const db = { isInitialized: true, transaction: async (action: (t: typeof tx) => Promise<unknown>) => action(tx), query: async (_s: string, p: unknown[]) => { writes.push(p); } } as unknown as DataSource;
  const service = new CheckoutAnalytics(db, config), input = { orderId, consent: true, ...identity, revocationToken: 'a'.repeat(64) };
  assert.deepEqual(await service.save('owner-session', input), { saved: false }); assert.equal(writes.length, 0);
  owned = true; assert.deepEqual(await service.save('owner-session', input), { saved: true });
  assert.equal(writes[0][1], 'owner-session'); assert.notEqual(writes[0][5], input.revocationToken);
  await assert.rejects(() => service.save('owner-session', { ...input, email: 'private@example.com' }));
  await service.revoke({ token: input.revocationToken });
  assert.deepEqual(await service.save('owner-session', input), { saved: false }); assert.equal(writes.length, 1);
});
test('durable claim prevents duplicate POSTs and uncertain dispatch never automatically retries', async () => {
  for (const fail of [false, true]) {
    let status = 'queued', calls = 0, consent = true;
    const db = { isInitialized: true, async query(sql: string, params: unknown[] = []) {
      if (sql.startsWith('SELECT config')) return [{ config: JSON.stringify({ analyticsMode: 'gtm', ga4Id: config.measurementId }) }];
      if (sql.startsWith('SELECT order_id')) return status === 'queued' ? [{ orderId, eventName: 'purchase', eventAt: new Date(now) }] : [];
      if (sql.startsWith('SELECT o.snapshot')) return consent ? [{ snapshot: JSON.stringify(snapshot), ...identity }] : [];
      if (sql.includes("SET status = 'sending'")) { const n = status === 'queued' ? 1 : 0; if (n) status = 'sending'; return { affectedRows: n }; }
      if (sql.includes('SET status = ?')) status = String(params[0]);
      return { affectedRows: 1 };
    } } as unknown as DataSource;
    const sender: typeof fetch = async (url, init) => { calls++; assert.equal(new URL(String(url)).hostname, 'www.google-analytics.com'); assert.equal(init?.redirect, 'error'); const body = JSON.parse(String(init?.body)); assert.equal(body.events[0].name, 'purchase'); if (fail) throw Error('network'); return new Response(null, { status: 204 }); };
    const worker = new AnalyticsWorker(db, config, sender);
    await Promise.all([worker.tick(), worker.tick()]); await worker.tick(); assert.equal(calls, 1); assert.equal(status, fail ? 'uncertain' : 'accepted');
    status = 'queued'; consent = false; await worker.tick(); assert.equal(calls, 1); assert.equal(status, 'skipped');
  }
});
