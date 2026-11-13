import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { PaymentRegistry } from './payment-registry';
import { PaymentSettings } from './payment-settings';
import { CheckoutAccess } from './checkout-access';
import { PaymentService } from './payment-service';
import { PaymentWebhook, verifyWebhook } from './payment-webhook';
import { SessionService, type CheckoutRequest } from '../checkout/sessions/session';
import { isShippingQuoteRequest } from '../shipping/quotes/local-quote-guard';

const env = { NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://store.example.test', MERCADOPAGO_SELLER_ID: '123', MERCADOPAGO_ACCESS_TOKEN: 'live-token', MERCADOPAGO_WEBHOOK_SECRET: 'live-secret-synthetic', MERCADOPAGO_TEST_SELLER_ID: '456', MERCADOPAGO_TEST_ACCESS_TOKEN: 'test-token', MERCADOPAGO_TEST_WEBHOOK_SECRET: 'test-secret-synthetic' };
const id = 'ca665af8-41b6-4ba4-bb75-54cf9c0f142e';
function registryFixture() {
  let calls = 0, posts = 0, wrongSeller = false, testTagInLive = false;
  const remote: typeof fetch = async (url, init) => {
    calls++; const live = new Headers(init?.headers).get('authorization') === 'Bearer live-token', sellerId = live ? 123 : 456;
    if (String(url).endsWith('/users/me')) return Response.json({ id: wrongSeller ? 999 : sellerId, site_id: 'MLA', tags: live && !testTagInLive ? [] : ['test_user'] });
    if (init?.method === 'POST') {
      posts++; const body = JSON.parse(String(init.body));
      assert.equal(body.notification_url, `${env.PUBLIC_SITE_URL}/api/v1/payments/mercadopago/webhook/${live ? 'production' : 'test'}`);
      return Response.json({ id: `${sellerId}-pref`, collector_id: sellerId, external_reference: body.external_reference, init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${sellerId}-pref` });
    }
    const payment = { id: 987, live_mode: live, collector_id: sellerId, currency_id: 'ARS', transaction_amount: 1, external_reference: id, status: 'approved' };
    return Response.json(String(url).includes('/search?') ? { results: [payment], paging: { total: 1 } } : payment);
  };
  return { registry: new PaymentRegistry(env, remote), remote, calls: () => calls, posts: () => posts, wrongSeller: () => { wrongSeller = true; }, wrongLive: () => { testTagInLive = true; } };
}
test('registry keeps credentials private, never falls back between environments, and verifies seller identity and kind', async () => {
  const f = registryFixture();
  await f.registry.verify('test'); await f.registry.verify('production'); assert.equal(f.posts(), 0);
  const view = JSON.stringify([f.registry.describe('test'), f.registry.describe('production')]);
  for (const secret of ['test-token', 'live-token', 'live-secret-synthetic', 'test-secret-synthetic']) assert.equal(view.includes(secret), false);
  assert.throws(() => new PaymentRegistry({ ...env, MERCADOPAGO_TEST_ACCESS_TOKEN: undefined }).get('test'), { status: 503 });
  assert.throws(() => new PaymentRegistry({ ...env, MERCADOPAGO_TEST_WEBHOOK_SECRET: undefined }).get('test'), { status: 503 });
  assert.throws(() => new PaymentRegistry({ ...env, NODE_ENV: 'development' }).get('production'), { status: 503 });
  assert.throws(() => f.registry.get('production', '456'), { status: 503 });
  const wrong = registryFixture(); wrong.wrongSeller(); await assert.rejects(wrong.registry.verify('test'), { status: 503 });
  const kind = registryFixture(); kind.wrongLive(); await assert.rejects(kind.registry.verify('production'), { status: 503 });
  assert.equal(kind.posts(), 0);
});

test('verification reports a safe seller mismatch and never starts a settings transaction', async () => {
  const f = registryFixture(); f.wrongSeller();
  let transactions = 0;
  const db = { isInitialized: true, transaction: async () => { transactions++; } } as unknown as DataSource;
  const settings = new PaymentSettings(db, f.registry);
  await assert.rejects(settings.set({ enabled: true, mode: 'production', revision: 0 }, 'owner-1'), error => {
    assert.ok(error instanceof ServiceUnavailableException);
    const body = error.getResponse();
    assert.equal(error.getStatus(), 503);
    assert.deepEqual(body, { code: 'PAYMENT_VERIFICATION_FAILED', reason: 'seller_id_mismatch',
      message: 'El ID de vendedor configurado no coincide con la cuenta autenticada. Usá el ID de usuario, no el de la aplicación.',
      mode: 'production', writeOccurred: false, missing: [], expectedSellerId: '123', actualSellerId: '999' });
    assert.equal(JSON.stringify(body).includes(env.MERCADOPAGO_ACCESS_TOKEN), false);
    return true;
  });
  assert.equal(transactions, 0); assert.equal(f.calls(), 1); assert.equal(f.posts(), 0);
});

test('verification separates environment, country and incomplete configuration failures', async () => {
  const kind = registryFixture(); kind.wrongLive();
  const country = new PaymentRegistry(env, async () => Response.json({ id: 123, site_id: 'MLB', tags: [] }));
  let calls = 0;
  const incomplete = new PaymentRegistry({ ...env, MERCADOPAGO_ACCESS_TOKEN: undefined }, async () => { calls++; throw Error('unexpected'); });
  for (const [registry, reason] of [[kind.registry, 'seller_environment_mismatch'], [country, 'seller_country_mismatch'], [incomplete, 'configuration_incomplete']] as const) {
    await assert.rejects(registry.verify('production'), error => {
      assert.ok(error instanceof ServiceUnavailableException);
      const body = error.getResponse() as { reason: string; writeOccurred: boolean; missing: string[] };
      assert.equal(body.reason, reason); assert.equal(body.writeOccurred, false);
      if (reason === 'configuration_incomplete') assert.deepEqual(body.missing, ['MERCADOPAGO_ACCESS_TOKEN']);
      return true;
    });
  }
  assert.equal(calls, 0); assert.equal(kind.posts(), 0);
});

test('verification returns safe provider codes without leaking remote bodies or network errors', async () => {
  const secret = 'synthetic-private-detail';
  const cases: [typeof fetch, string][] = [
    [async () => Response.json({ message: secret }, { status: 401 }), 'provider_http_401'],
    [async () => { throw Error(secret); }, 'provider_connection_failed'],
    [async () => new Response(secret), 'provider_invalid_response'],
  ];
  for (const [remote, reason] of cases) {
    const registry = new PaymentRegistry(env, remote);
    await assert.rejects(registry.verify('production'), error => {
      assert.ok(error instanceof ServiceUnavailableException);
      const body = error.getResponse() as { reason: string; writeOccurred: boolean };
      assert.equal(body.reason, reason); assert.equal(body.writeOccurred, false);
      for (const value of [secret, env.MERCADOPAGO_ACCESS_TOKEN, env.MERCADOPAGO_WEBHOOK_SECRET]) assert.equal(JSON.stringify(body).includes(value), false);
      return true;
    });
  }
});

test('settings require complete verified credentials, audit changes and reject a stale revision', async () => {
  let row = { enabled: 0, mode: 'test', revision: 0 }, audits = 0;
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith('SELECT')) return [row];
    if (sql.startsWith('UPDATE')) { row = { enabled: Number(args[0]), mode: String(args[1]), revision: row.revision + 1 }; return; }
    if (sql.startsWith('INSERT')) { audits++; assert.equal(args[1], 'owner-1'); return; } throw Error(sql);
  };
  const db = { isInitialized: true, query, transaction: async (fn: (tx: { query: typeof query }) => unknown) => fn({ query }) } as unknown as DataSource;
  const settings = new PaymentSettings(db, registryFixture().registry);
  assert.equal((await settings.get()).enabled, false);
  await settings.set({ enabled: true, mode: 'production', revision: 0 }, 'owner-1');
  await assert.rejects(settings.set({ enabled: false, mode: 'test', revision: 0 }, 'owner-1'), { status: 409 });
  assert.equal(audits, 1); assert.equal(row.mode, 'production');
  await assert.rejects(settings.set({ enabled: true, mode: 'production', revision: 1, token: 'client-token' }, 'owner-1'), { status: 400 });
  const missing = new PaymentSettings(db, new PaymentRegistry({ ...env, MERCADOPAGO_TEST_ACCESS_TOKEN: undefined }));
  await assert.rejects(missing.set({ enabled: true, mode: 'test', revision: 1 }, 'owner-1'), { status: 503 });
  assert.equal(audits, 1);
  await missing.set({ enabled: false, mode: 'test', revision: 1 }, 'owner-1'); assert.equal(audits, 2);
});

test('test checkout needs an owner on every operation, while existing real payments survive disabling new purchases', async () => {
  let mode: 'test' | 'production' = 'test', enabled = true, owner = false;
  const access = new CheckoutAccess({ get: async () => ({ enabled, mode, revision: 1, available: true }) }, registryFixture().registry,
    { authorize: async () => { if (!owner) throw Error('No owner session'); return {} as never; } });
  await assert.rejects(access.current({ headers: {} }), { status: 403 });
  owner = true; assert.equal((await access.current({ headers: {} })).mode, 'test');
  owner = false; await assert.rejects(access.existing('test', { headers: {} }), { status: 403 });
  mode = 'production'; assert.equal((await access.current({ headers: {} })).mode, 'production');
  enabled = false; await assert.rejects(access.current({ headers: {} }), { status: 503 });
  await access.existing('production', { headers: {} });
});

function orderFixture(mode: 'test' | 'production') {
  let status = 'not_started', start: { sellerId: string; state: string; paymentMode: string; preferenceId?: string } | undefined;
  const sellerId = mode === 'test' ? '456' : '123', f = registryFixture();
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.includes('FROM checkout_orders')) return [{ id, currency: 'ARS', totalMinor: '100', paymentStatus: status, orderStatus: 'received', paymentMode: mode, sellerId }];
    if (sql.includes('FROM checkout_payment_starts')) return start ? [start] : [];
    if (sql.startsWith('INSERT INTO checkout_payment_starts')) { start = { state: 'uncertain', sellerId: String(args[1]), paymentMode: String(args[2]) }; return; }
    if (sql.startsWith('UPDATE checkout_payment_starts')) { start!.state = 'ready'; start!.preferenceId = String(args[0]); return; }
    if (sql.startsWith('UPDATE checkout_orders')) { status = String(args[0]); return; }
    if (sql.startsWith('INSERT INTO order_events')) return; throw Error(sql);
  };
  let queue = Promise.resolve();
  const db = { isInitialized: true, query, transaction: (fn: (tx: { query: typeof query }) => Promise<unknown>) => { const p = queue.then(() => fn({ query })); queue = p.then(() => {}, () => {}); return p; } } as unknown as DataSource;
  return { ...f, service: new PaymentService(db, f.registry), webhook: new PaymentWebhook(db, f.registry), status: () => status, start: () => start };
}
test('persisted environment routes payments, concurrent starts create once, test reauthorization precedes all outward calls', async () => {
  const testOrder = orderFixture('test');
  await assert.rejects(testOrder.service.start('session', id)); assert.equal(testOrder.calls(), 0);
  await assert.rejects(testOrder.service.start('session', id, async () => { throw Error('revoked'); })); assert.equal(testOrder.calls(), 0);
  const authorize = async (mode: string) => { assert.equal(mode, 'test'); };
  await Promise.all([testOrder.service.start('session', id, authorize), testOrder.service.start('session', id, authorize)]);
  assert.equal(testOrder.posts(), 1); assert.equal(testOrder.start()?.sellerId, '456');
  assert.equal((await testOrder.service.refresh('session', id, authorize)).status, 'approved');
  const live = orderFixture('production'); await live.service.start('session', id);
  assert.equal(live.start()?.sellerId, '123'); assert.equal((await live.service.refresh('session', id)).status, 'approved');
});

test('webhooks reject stale/future signatures and the wrong environment before external calls', async () => {
  const f = orderFixture('production'), requestId = 'synthetic-request';
  const sign = (secret: string, timestamp: number) => `ts=${timestamp},v1=${createHmac('sha256', secret).update(`id:987;request-id:${requestId};ts:${timestamp};`).digest('hex')}`;
  const now = Date.now(), secret = env.MERCADOPAGO_WEBHOOK_SECRET;
  for (const timestamp of [now - 300001, now + 300001, 1000000000000]) assert.throws(() => verifyWebhook(secret, '987', requestId, sign(secret, timestamp), now), { status: 401 });
  assert.equal(verifyWebhook(secret, '987', requestId, sign(secret, now), now), '987');
  await assert.rejects(f.webhook.receive('987', requestId, sign(env.MERCADOPAGO_TEST_WEBHOOK_SECRET, now), 'production'), { status: 401 }); assert.equal(f.calls(), 0);
  await f.service.start('session', id);
  await f.webhook.receive('987', requestId, sign(secret, now), 'production'); assert.equal(f.status(), 'approved');
});

test('public checkout sessions require canonical origin and CSRF; proxy headers cannot replace the host', async () => {
  let inserts = 0, saved: unknown[] = [];
  const db = { isInitialized: true, query: async (sql: string, args: unknown[]) => { if (sql.startsWith('INSERT')) { inserts++; saved = args; return; } return [{ id: saved[0], expiresAt: saved[2] }]; } } as unknown as DataSource;
  const sessions = new SessionService(db, env, Date.now, true);
  const req: CheckoutRequest = { method: 'POST', headers: { host: 'store.example.test', origin: env.PUBLIC_SITE_URL, 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' } };
  for (const headers of [{ ...req.headers, origin: 'https://evil.example' }, { ...req.headers, host: 'evil.example', 'x-forwarded-host': 'store.example.test' }, { ...req.headers, 'content-type': 'text/plain' }]) await assert.rejects(sessions.start({ ...req, headers }), { status: 403 });
  assert.equal(inserts, 0); const first = await sessions.start(req); assert.equal(sessions.secureCookie, true);
  const authenticated = { ...req, headers: { ...req.headers, cookie: `store_checkout=${first.token}`, 'x-csrf-token': first.csrf } };
  assert.equal((await sessions.requireMutation(authenticated)).id, first.id);
  await assert.rejects(sessions.requireMutation({ ...authenticated, headers: { ...authenticated.headers, 'x-csrf-token': '0'.repeat(64) } }), { status: 403 });
  assert.equal(isShippingQuoteRequest(req, env), true); assert.equal(isShippingQuoteRequest({ ...req, headers: { ...req.headers, origin: 'https://evil.example' } }, env), false);
});
