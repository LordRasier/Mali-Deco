import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { createConnection } from 'mysql2/promise';
import { Test } from '@nestjs/testing';
import { StrictDataSource } from '../../src/infrastructure/database/strict-data-source';
import { PaymentRegistry } from '../../src/modules/payments/payment-registry';
import { PaymentSettings, PaymentSettingsController } from '../../src/modules/payments/payment-settings';
import { CheckoutAccess } from '../../src/modules/payments/checkout-access';
import { PaymentService } from '../../src/modules/payments/payment-service';
import { PaymentController } from '../../src/modules/payments/payment-controller';
import { PaymentWebhook, PaymentWebhookController } from '../../src/modules/payments/payment-webhook';
import { SessionService, SessionController } from '../../src/modules/checkout/sessions/session';
import { CheckoutQuoteService } from '../../src/modules/checkout/services/quote';
import { CheckoutQuoteController } from '../../src/modules/checkout/http/checkout-quote.controller';
import { CheckoutOrderController } from '../../src/modules/checkout/http/checkout-order.controller';
import { OrdersService } from '../../src/modules/orders/services/orders.service';
import { OrderManagement } from '../../src/modules/orders/services/order-management';
import { OrderReservationWorker } from '../../src/modules/checkout/services/order-reservations';
import { IdentityService } from '../../src/modules/identity/services/identity-service';
import type { IdentityStore, StoredSession } from '../../src/modules/identity/persistence/identity-store';
import { OwnerGuard } from '../../src/modules/identity/http/owner.guard';
import { issueSecret } from '../../src/modules/identity/security/security';

test('payment environments with real isolated MariaDB and HTTP, synthetic providers only', { skip: process.env.PAYMENTS_LOCAL_INTEGRATION !== '1' }, async t => {
  if (process.env.NODE_ENV !== 'development' || process.env.DB_HOST !== '127.0.0.1') throw Error('Local development database only');
  const database = 'mali_modes_test_' + randomBytes(8).toString('hex');
  const connection = { host: '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD };
  const owner = await createConnection(connection);
  const db = new StrictDataSource({ type: 'mariadb', host: connection.host, port: connection.port, username: connection.user, password: connection.password, database, timezone: 'Z', synchronize: false, migrations: [resolve(__dirname, '../../src/infrastructure/database/migrations/*.ts')], extra: { connectionLimit: 8 } });
  const origin = 'https://store.example.test', env = { NODE_ENV: 'production', PUBLIC_SITE_URL: origin, MERCADOPAGO_ACCESS_TOKEN: 'live-fixture', MERCADOPAGO_SELLER_ID: '123', MERCADOPAGO_WEBHOOK_SECRET: 'live-secret-fixture', MERCADOPAGO_TEST_ACCESS_TOKEN: 'test-fixture', MERCADOPAGO_TEST_SELLER_ID: '456', MERCADOPAGO_TEST_WEBHOOK_SECRET: 'test-secret-fixture' };
  const paymentPosts: { id: string; live: boolean }[] = [], approved = new Set<string>(), uncertain = new Set<string>();
  const paymentStates = new Map<string, string | null>(), expiredPreferences = new Set<string>(), providerFailures = new Set<string>();
  const registry = new PaymentRegistry(env, async (url, init) => {
    const u = new URL(String(url)), live = new Headers(init?.headers).get('authorization') === 'Bearer live-fixture', seller = live ? 123 : 456;
    if (u.pathname === '/users/me') return Response.json({ id: seller, site_id: 'MLA', tags: live ? [] : ['test_user'] });
    if (u.pathname === '/checkout/preferences') { const body = JSON.parse(String(init?.body)), id = body.external_reference; paymentPosts.push({ id, live }); if (uncertain.has(id)) throw Error('Synthetic lost response'); return Response.json({ id: seller + '-' + id, collector_id: seller, external_reference: id, init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${seller}-${id}` }); }
    if (u.pathname.startsWith('/checkout/preferences/')) {
      const pref = u.pathname.split('/').pop()!, id = pref.slice(String(seller).length + 1);
      if (providerFailures.has(id)) throw Error('Synthetic provider outage');
      return Response.json({ id: pref, collector_id: seller, external_reference: id, preference_expired: expiredPreferences.has(id), expiration_date_to: new Date(0).toISOString() });
    }
    const id = u.searchParams.get('external_reference') ?? paymentPosts.find(p => p.live === live)?.id;
    if (providerFailures.has(id!)) throw Error('Synthetic provider outage');
    if (paymentStates.has(id!) && paymentStates.get(id!) === null) return Response.json({ results: [], paging: { total: 0 } });
    const payment = { id: live ? 987 : 654, collector_id: seller, live_mode: live, external_reference: id, currency_id: 'ARS', transaction_amount: 2.5, status: approved.has(id!) ? 'approved' : paymentStates.get(id!) ?? 'pending' };
    return Response.json(u.pathname.endsWith('/search') ? { results: [payment], paging: { total: 1 } } : payment);
  });
  const token = issueSecret(), adminCsrf = issueSecret();
  const admin: StoredSession = { userId: randomUUID(), email: 'owner@example.test', role: 'owner', expiresAt: new Date(Date.now() + 600000), revokedAt: null, disabledAt: null, csrfHash: adminCsrf.hash };
  const identity = new IdentityService({ session: async (hash: string) => hash === token.hash ? admin : null } as IdentityStore, origin);
  const settings = new PaymentSettings(db, registry), access = new CheckoutAccess(settings, registry, identity), orders = new OrdersService(db);
  const quoteService = new CheckoutQuoteService(db, { resolve: () => ({ country: 'AR', postalCode: '7600', city: 'Mar del Plata', state: 'Buenos Aires' }) }, async () => ({ status: 'quoted', quotedAt: Date.now(), validUntil: Date.now() + 300000, packageCount: 1, options: [{ carrierId: 1, carrierName: 'Fixture', serviceCode: 'home', serviceName: 'Fixture', logisticType: 'delivery', amountMinor: '50', currency: 'ARS' }] }), env);
  const module = await Test.createTestingModule({ controllers: [SessionController, CheckoutQuoteController, CheckoutOrderController, PaymentController, PaymentWebhookController, PaymentSettingsController], providers: [
    { provide: SessionService, useValue: new SessionService(db, env, Date.now, true) }, { provide: CheckoutQuoteService, useValue: quoteService }, { provide: OrdersService, useValue: orders },
    { provide: PaymentRegistry, useValue: registry }, { provide: PaymentSettings, useValue: settings }, { provide: CheckoutAccess, useValue: access }, { provide: IdentityService, useValue: identity }, OwnerGuard,
    { provide: PaymentService, useValue: new PaymentService(db, registry) }, { provide: PaymentWebhook, useValue: new PaymentWebhook(db, registry) },
  ] }).compile();
  const app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api/v1');
  let created = false;
  try {
    await owner.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created = true;
    await db.initialize(); await db.runMigrations(); await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
    const product = randomUUID(), variant = randomUUID();
    await db.query("INSERT INTO products (id,name,description,slug,status,product_weight_g,product_width_mm,product_height_mm,product_length_mm) VALUES (?, 'Mode fixture', '', ?, 'active',100,10,20,30)", [product, product]);
    await db.query("INSERT INTO product_variants (id,product_id,sku,name,price_minor,currency,supply_mode,stock_quantity) VALUES (?,?,?,'Fixture',100,'ARS','stock',20)", [variant, product, variant]);
    let checkoutCookie = '', csrf = '';
    const request = (path: string, body: unknown, asOwner = false, extra: Record<string, string> = {}, method = 'POST') => new Promise<Response>((resolve, reject) => {
      // Native HTTP preserves the canonical Host, unlike undici's fetch Host normalization.
      const req = httpRequest(base + '/api/v1' + path, { method, headers: { host: 'store.example.test', origin, 'content-type': 'application/json', cookie: [checkoutCookie, asOwner ? `store_admin=${token.token}` : ''].filter(Boolean).join('; '), 'x-csrf-token': path.startsWith('/admin') ? adminCsrf.token : csrf, ...extra } }, res => {
        const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => { const headers = new Headers(); for (const [key, value] of Object.entries(res.headers)) for (const item of Array.isArray(value) ? value : value ? [value] : []) headers.append(key, item); resolve(new Response(Buffer.concat(chunks), { status: res.statusCode!, headers })); });
      }); req.on('error', reject); req.end(method === 'GET' ? undefined : JSON.stringify(body));
    });
    const start = await request('/checkout/session', {}); assert.equal(start.status, 200); csrf = (await start.json()).csrf; checkoutCookie = start.headers.get('set-cookie')!.split(';')[0]; assert.match(start.headers.get('set-cookie')!, /Secure/);
    const set = async (mode: string, enabled = true) => { const state = await settings.get(); const r = await request('/admin/settings/payments', { enabled, mode, revision: state.revision }, true, {}, 'PUT'); assert.equal(r.status, 200, await r.text()); };
    const quote = async (asOwner = false) => { const r = await request('/checkout/quotes', { lines: [{ productId: product, variantId: variant, quantity: 2 }], destination: { postalCode: '7600', candidateId: 'fixture' } }, asOwner); assert.equal(r.status, 200, r.statusText); return r.json(); };
    const body = (q: { quoteId: string; options: { id: string }[] }) => ({ quoteId: q.quoteId, optionId: q.options[0].id, pickupPointId: null, contact: { name: 'Fixture', email: 'buyer@example.test', phone: '000' }, address: { street: 'Fixture', number: '1', unit: '' } });
    const create = (q: Parameters<typeof body>[0], asOwner = false, key = randomUUID()) => request('/checkout/orders', body(q), asOwner, { 'idempotency-key': key });
    const stock = async () => Number((await db.query('SELECT stock_quantity n FROM product_variants WHERE id=?', [variant]))[0].n);
    let testOrder: { id: string }, liveOrder: { id: string };
    await t.test('owner/CSRF and disabled-by-default protections hold over HTTP', async () => {
      assert.equal((await request('/admin/settings/payments', {}, false, {}, 'GET')).status, 401);
      admin.role = 'operations'; assert.equal((await request('/admin/settings/payments', {}, true, {}, 'GET')).status, 403); admin.role = 'owner';
      for (const extra of [{ 'x-csrf-token': '' }, { origin: 'https://evil.example' }] as Record<string, string>[]) assert.equal((await request('/admin/settings/payments', { enabled: true, mode: 'test', revision: 0 }, true, extra, 'PUT')).status, 403);
      assert.equal((await request('/checkout/quotes', {}, true)).status, 503);
      const view = await request('/admin/settings/payments', {}, true, {}, 'GET'); assert.match(view.headers.get('cache-control')!, /no-store/); assert.doesNotMatch(await view.text(), /live-fixture|test-fixture|secret-fixture/);
    });
    await t.test('test orders are owner-only, do not decrement stock and do not enter sales', async () => {
      await set('test'); assert.equal((await request('/checkout/quotes', {})).status, 403);
      const q = await quote(true), key = randomUUID(), first = await create(q, true, key); assert.equal(first.status, 200); testOrder = await first.json(); assert.equal(await stock(), 20);
      assert.equal((await create(q, false, key)).status, 403);
      assert.equal((await orders.list({})).total, 0); assert.equal((await orders.list({ paymentMode: 'test' })).total, 1);
      const testPay = await request('/checkout/payments/start', { orderId: testOrder.id }, true); assert.equal(testPay.status, 200); assert.equal(paymentPosts[0].live, false);
      assert.equal((await request('/checkout/payments/refresh', { orderId: testOrder.id })).status, 403);
      const detail = await orders.detail(testOrder.id);
      await assert.rejects(new OrderManagement(db).update(testOrder.id, { revision: detail.revision, orderStatus: 'received', paymentStatus: detail.paymentStatus, fulfillmentStatus: 'not_started', shippingStatus: 'ready_to_ship', trackingNumber: '', trackingUrl: '', internalNote: '', reason: 'Fixture' }, 'owner'), { status: 400 });
    });
    await t.test('changing environment invalidates open quotes, production orders decrement stock exactly once', async () => {
      const oldQuote = await quote(true); await set('production'); assert.equal((await create(oldQuote, true)).status, 409); assert.equal(await stock(), 20);
      const q = await quote(), key = randomUUID(); const replies = await Promise.all([create(q, false, key), create(q, false, key)]);
      assert.ok(replies.every(r => r.status === 200)); const results = await Promise.all(replies.map(r => r.json())); assert.equal(results[0].id, results[1].id); liveOrder = results[0];
      assert.equal(results[0].testLocal, false); assert.equal(await stock(), 18); assert.equal((await orders.list({})).total, 1);
      const pay = await request('/checkout/payments/start', { orderId: liveOrder.id }); assert.equal(pay.status, 200); assert.equal(paymentPosts.find(p => p.id === liveOrder.id)!.live, true);
    });
    await t.test('disabled new payments and changed mode preserve old reconciliation and webhook routing', async () => {
      await set('test', false); approved.add(liveOrder.id);
      const result = await request('/checkout/payments/refresh', { orderId: liveOrder.id }); assert.equal(result.status, 200); assert.equal((await result.json()).status, 'approved');
      assert.equal((await request('/checkout/quotes', {})).status, 503);
      const ts = Date.now(), rid = randomUUID(), signature = createHmac('sha256', env.MERCADOPAGO_WEBHOOK_SECRET).update(`id:987;request-id:${rid};ts:${ts};`).digest('hex');
      const notify = (mode: string) => request(`/payments/mercadopago/webhook/${mode}?data.id=987`, {}, false, { 'x-request-id': rid, 'x-signature': `ts=${ts},v1=${signature}` });
      assert.equal((await notify('test')).status, 401); assert.equal((await notify('production')).status, 200);
      assert.equal((await orders.detail(liveOrder.id)).paymentStatus, 'approved');
      const [events] = await db.query("SELECT COUNT(*) n FROM order_events WHERE order_id=? AND JSON_EXTRACT(detail,'$.changes.paymentStatus.to')='approved'", [liveOrder.id]); assert.equal(Number(events.n), 1);
    });
    await t.test('uncertain preference creation is not retried', async () => {
      await set('production'); const r = await create(await quote()); const order = await r.json(); uncertain.add(order.id);
      for (let i = 0; i < 2; i++) { const p = await request('/checkout/payments/start', { orderId: order.id }); assert.equal((await p.json()).status, 'uncertain'); }
      assert.equal(paymentPosts.filter(p => p.id === order.id).length, 1);
    });
    await t.test('all settings changes keep an audit record without credentials', async () => {
      const events = await db.query('SELECT detail FROM payment_settings_events ORDER BY created_at'); assert.equal(events.length, 4); assert.doesNotMatch(JSON.stringify(events), /fixture|token|secret/);
    });
    const reservations = new OrderReservationWorker(db, registry);
    const reserve = async () => { const r = await create(await quote()); assert.equal(r.status, 200); return (await r.json()).id as string; };
    const age = (id: string, minutes = 46) => db.query('UPDATE checkout_order_reservations SET expires_at = DATE_SUB(UTC_TIMESTAMP(6), INTERVAL ? MINUTE) WHERE order_id = ?', [minutes - 30, id]);
    const reservation = async (id: string) => (await db.query('SELECT state FROM checkout_order_reservations WHERE order_id = ?', [id]))[0].state;
    await t.test('unstarted reservations expire, concurrent reviewers return stock exactly once and payment cannot restart', async () => {
      const before = await stock(), id = await reserve(); assert.equal(await stock(), before - 2);
      await reservations.review(id); assert.equal(await reservation(id), 'held');
      await age(id, 31); await Promise.all([reservations.review(id), reservations.review(id)]);
      assert.equal(await stock(), before); assert.equal(await reservation(id), 'released');
      const pay = await request('/checkout/payments/start', { orderId: id }); assert.equal((await pay.json()).status, 'expired');
      assert.equal(paymentPosts.some(p => p.id === id), false);
    });
    await t.test('expired preferences require grace, provider expiry proof and no active payment before release', async () => {
      for (const status of [null, 'rejected', 'cancelled']) {
        const before = await stock(), id = await reserve(); paymentStates.set(id, status);
        assert.equal((await request('/checkout/payments/start', { orderId: id })).status, 200);
        await age(id, 31); expiredPreferences.add(id); await reservations.review(id); assert.equal(await reservation(id), 'held');
        await age(id); expiredPreferences.delete(id); await reservations.review(id); assert.equal(await reservation(id), 'held');
        expiredPreferences.add(id); await reservations.review(id); await reservations.review(id);
        assert.equal(await reservation(id), 'released'); assert.equal(await stock(), before);
      }
    });
    await t.test('pending, approved, uncertain and unavailable provider results retain stock', async () => {
      for (const outcome of ['pending', 'approved', 'uncertain', 'unavailable']) {
        const before = await stock(), id = await reserve();
        if (outcome === 'uncertain') uncertain.add(id);
        await request('/checkout/payments/start', { orderId: id }); await age(id); expiredPreferences.add(id);
        if (outcome === 'approved') approved.add(id);
        if (outcome === 'unavailable') providerFailures.add(id);
        if (outcome === 'unavailable') await assert.rejects(reservations.review(id)); else await reservations.review(id);
        assert.equal(await stock(), before - 2); assert.equal(await reservation(id), 'held');
        if (outcome === 'approved') { await reservations.review(id); assert.equal(await reservation(id), 'consumed'); }
      }
    });
    await t.test('rejected payment retries reuse preference; pending and approved payments never expose another pay link', async () => {
      const id = await reserve(); paymentStates.set(id, 'rejected');
      await request('/checkout/payments/start', { orderId: id });
      assert.equal((await (await request('/checkout/payments/start', { orderId: id })).json()).status, 'ready');
      paymentStates.set(id, 'pending'); assert.equal((await (await request('/checkout/payments/start', { orderId: id })).json()).status, 'pending');
      approved.add(id); assert.equal((await (await request('/checkout/payments/start', { orderId: id })).json()).status, 'approved');
      assert.equal(paymentPosts.filter(p => p.id === id).length, 1);
    });
    await t.test('late approval after release remains cancelled for manual review and cannot reopen without reserving again', async () => {
      const before = await stock(), id = await reserve(); paymentStates.set(id, null);
      await request('/checkout/payments/start', { orderId: id }); await age(id); expiredPreferences.add(id); await reservations.review(id);
      assert.equal(await stock(), before); paymentStates.delete(id); approved.add(id);
      assert.equal((await (await request('/checkout/payments/refresh', { orderId: id })).json()).status, 'review');
      const detail = await orders.detail(id); assert.equal(detail.orderStatus, 'cancelled');
      await assert.rejects(new OrderManagement(db).update(id, { revision: detail.revision, orderStatus: 'received', paymentStatus: 'approved', fulfillmentStatus: 'not_started', shippingStatus: 'not_started', trackingNumber: '', trackingUrl: '', internalNote: '', reason: 'Fixture' }, 'owner'), { status: 409 });
      await reservations.review(id); assert.equal(await stock(), before); assert.equal(await reservation(id), 'released');
    });
  } finally {
    await app.close(); if (db.isInitialized) await db.destroy();
    if (created && /^mali_modes_test_[a-f0-9]{16}$/.test(database)) await owner.query(`DROP DATABASE ${database}`);
    await owner.end();
  }
});
