import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { emailConfig } from '../order-emails/email-config';
import { exampleEmailOrder } from '../order-emails/order-email-model';
import { assertTrackingOrigin, trackingBody, trackingCookie, trackingDigest, trackingEmail, trackingToken } from './tracking-security';
import { trackingOrder, type TrackingRow } from './tracking-orders';
import { TrackingService, trackingAcknowledgement } from './tracking-service';
import { TrackingController } from './tracking.controller';
import { trackingMail } from './tracking-mail';

const config = emailConfig({ ORDER_EMAIL_MODE: 'live', ENVIALOSIMPLE_API_KEY: 'synthetic', ORDER_EMAIL_FROM: 'orders@store.dev', ORDER_EMAIL_SITE_URL: 'https://store.dev', ORDER_EMAIL_TEST_TO: 'owner@store.dev' });
const token = 'a'.repeat(64), origin = config.siteUrl;
const req = { headers: { host: 'store.dev', origin, 'content-type': 'application/json', cookie: trackingCookie + '=' + token } };
export const trackingFixture: TrackingRow = { id: '5d4470f6-1867-490d-addb-9272cf40c9d3', createdAt: '2026-11-13T00:35:00Z', updatedAt: '2026-11-13T12:00:00Z', currency: 'ARS', totalMinor: '11124200',
  paymentMode: 'production', paymentStatus: 'approved', orderStatus: 'confirmed', fulfillmentStatus: 'preparing', shippingStatus: 'not_started',
  trackingNumber: '', trackingUrl: '', paymentId: '1234567890123456', snapshot: JSON.stringify({ result: { ...exampleEmailOrder, contact: { name: 'Cliente', email: 'buyer@store.dev', document: 'PRIVATE_DOCUMENT', phone: 'PRIVATE_PHONE' }, internalNote: 'PRIVATE_NOTE' }, quote: { credential: 'PRIVATE_CREDENTIAL', lines: exampleEmailOrder.lines.map(line => ({ variantId: 'variant', variantName: line.variantName })) } }) };

test('tracking email canonicalization preserves dots and plus-address ownership', () => {
  assert.equal(trackingEmail(' Buyer+one@Store.Dev '), 'buyer+one@store.dev');
  assert.notEqual(trackingEmail('a.b@store.dev'), trackingEmail('ab@store.dev'));
  for (const bad of [null, {}, 'buyer', 'a@b.dev\r\nBcc:other@b.dev']) assert.throws(() => trackingEmail(bad));
});
test('tracking request guards reject foreign origins, duplicate cookies and unknown body fields', () => {
  assertTrackingOrigin(req, origin); assert.equal(trackingToken(req), token);
  for (const headers of [{ ...req.headers, origin: 'https://evil.dev' }, { ...req.headers, host: 'evil.dev' }, { ...req.headers, 'content-type': 'text/plain' }, { ...req.headers, 'sec-fetch-site': 'cross-site' }]) assert.throws(() => assertTrackingOrigin({ headers }, origin), ForbiddenException);
  for (const cookie of ['', trackingCookie + '=bad', req.headers.cookie + '; ' + req.headers.cookie]) assert.throws(() => trackingToken({ headers: { cookie } }), ForbiddenException);
  assert.throws(() => trackingBody({ email: 'a@b.dev', admin: true }, ['email']));
});
test('public request acknowledgement and database work do not reveal email existence; durable quotas serialize before insert', async () => {
  let quota = { total: 0, account: 0, recent: 0 };
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => { queries.push({ sql, params }); return sql.includes('AS total') ? [quota] : []; };
  const db = { isInitialized: true, transaction: async (fn: (tx: { query: typeof query }) => unknown) => fn({ query }) } as unknown as DataSource;
  const service = new TrackingService(db, config);
  for (const email of ['buyer@store.dev', 'unknown@store.dev']) assert.deepEqual(await service.requestLink(email), trackingAcknowledgement);
  assert.match(queries[0].sql, /FOR UPDATE/); assert.ok(queries.every(q => !q.sql.includes('checkout_orders')));
  for (const limit of [{ total: 60, account: 0, recent: 0 }, { total: 1, account: 3, recent: 0 }, { total: 1, account: 1, recent: 1 }]) {
    quota = limit; queries.length = 0; assert.deepEqual(await service.requestLink('buyer@store.dev'), trackingAcknowledgement);
    assert.ok(queries.every(q => !q.sql.startsWith('INSERT')));
  }
});
test('reusable access is checked by digest and expiry on every page, and filters every order query by exact owner', async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const db = { isInitialized: true, query: async (sql: string, params: unknown[]) => {
    queries.push({ sql, params });
    if (sql.startsWith('SELECT v.id AS variantId, m.name')) return [{ variantId: 'variant', name: 'PLA' }];
    if (sql.includes('order_tracking_access')) return params[0] === trackingDigest(token) ? [{ email: 'buyer@store.dev', allowTest: 0, expiresAt: new Date(Date.now() + 86400000) }] : [];
    if (sql.includes('COUNT(*)')) return [{ total: 11 }]; return [trackingFixture];
  } } as unknown as DataSource;
  const service = new TrackingService(db, config);
  assert.deepEqual((await service.orders(token, 1)).items[0].lines.map((line: { variant: string }) => line.variant), ['Natural', 'Terracota']);
  assert.equal((await service.orders(token, 1)).items[0].paymentId, '1234567890123456'); assert.equal((await service.orders(token, 2)).page, 2);
  assert.ok(queries.filter(q => q.sql.includes('checkout_orders')).every(q => q.sql.includes('tracking_email = ?') && q.params[0] === 'buyer@store.dev' && q.params[1] === 0));
  assert.ok(queries.filter(q => q.sql.includes('order_tracking_access')).every(q => q.sql.includes('expires_at > UTC_TIMESTAMP')));
  assert.ok(!JSON.stringify(queries).includes(token));
  await assert.rejects(service.orders('b'.repeat(64), 1), ForbiddenException);
  await assert.rejects(service.orders(token, -1)); await assert.rejects(service.orders(token, '1'));
});
test('customer projection omits private operations data and handles exceptional timelines honestly', () => {
  const order = trackingOrder(trackingFixture);
  assert.equal(order.paymentId, '1234567890123456');
  for (const paymentId of [null, undefined, '', '<script>', '0', '12345678901234567']) assert.equal(trackingOrder({ ...trackingFixture, paymentId }).paymentId, '');
  assert.doesNotMatch(JSON.stringify(order), /PRIVATE_|internalNote|credential|document|phone/);
  assert.equal(order.steps[2].state, 'current'); assert.equal(order.steps[4].state, 'pending');
  const returned = trackingOrder({ ...trackingFixture, shippingStatus: 'returned', trackingUrl: 'javascript:alert(1)' });
  assert.equal(returned.status, 'Envío devuelto'); assert.equal(returned.steps[3].state, 'stopped'); assert.equal(returned.steps[4].state, 'pending'); assert.equal(returned.trackingUrl, '');
  assert.equal(trackingOrder({ ...trackingFixture, orderStatus: 'cancelled' }).status, 'Pedido cancelado');
  assert.equal(trackingOrder({ ...trackingFixture, paymentStatus: 'refunded' }).status, 'Reembolsado');
  assert.equal(trackingOrder({ ...trackingFixture, shippingStatus: 'delivered' }).steps[4].state, 'current');
});
test('access uses an HttpOnly scoped cookie and logout only clears this browser session', async () => {
  const events: unknown[][] = [];
  const service = { access: async () => ({ expiresAt: new Date(Date.now() + 90 * 86400000) }) } as unknown as TrackingService;
  const controller = new TrackingController(service, origin), res = { cookie: (...args: unknown[]) => { events.push(args); }, clearCookie: (...args: unknown[]) => { events.push(args); } };
  await controller.access(req, { token }, res);
  assert.equal(events[0][0], trackingCookie); assert.deepEqual({ ...(events[0][2] as object), expires: undefined }, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/order-tracking', expires: undefined });
  controller.logout(req, {}, res); assert.equal(events[1][0], trackingCookie);
});
test('access email sends its capability only in a fragment and never places it in provider metadata', () => {
  const mail = trackingMail(config, '<Tienda>', 'buyer@store.dev', token, 'request-id');
  assert.equal(mail.to, 'buyer@store.dev'); assert.match(mail.html, /&lt;Tienda&gt;/); assert.match(mail.html, new RegExp('/seguimiento#' + token));
  assert.match(mail.text, /90 días/); assert.ok(!JSON.stringify(mail.user_variables).includes(token)); assert.doesNotMatch(mail.html, /seguimiento\?/);
});
