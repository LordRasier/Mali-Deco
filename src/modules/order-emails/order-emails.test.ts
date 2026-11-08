import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { GUARDS_METADATA, HEADERS_METADATA } from '@nestjs/common/constants';
import { emailKinds, emailStages, exampleEmailOrder } from './order-email-model';
import { renderOrderEmail, safeEmailUrl } from './order-email-template';
import { EmailPreviews } from './email-previews';
import { EmailPreviewsController } from './email-previews.controller';
import { OrdersGuard } from '../orders/http/orders.guard';

const brand = { name: 'Mali Deco', primaryColor: '#ca0707', siteUrl: 'https://mali-store.com.ar', bannerUrl: 'https://mali-store.com.ar/api/v1/catalog/branding/hero' };
const settings = { get: async () => ({ name: 'Mali Deco', primaryColor: '#ca0707' }) };
test('three transactional designs include totals, plain text, correct stage and tracking fallback', () => {
  for (const kind of emailKinds) {
    const email = renderOrderEmail(kind, exampleEmailOrder, brand);
    assert.match(email.html, /<table role="presentation"/); assert.match(email.html, /<img /);
    assert.match(email.html, /Florero Ondas/); assert.match(email.text, /28\.800,00/);
    assert.doesNotMatch(email.html, /<script|<form|<iframe|VISTA PREVIA LOCAL/);
    assert.ok(email.subject.includes('#D3C00001'));
  }
  assert.match(renderOrderEmail('confirmed', exampleEmailOrder, brand).html, /entre 1 y 3 días/);
  assert.match(renderOrderEmail('shipped', exampleEmailOrder, brand).html, /href="https:\/\/example.test\/seguimiento"/);
  const withoutTracking = renderOrderEmail('shipped', { ...exampleEmailOrder, trackingUrl: '', trackingNumber: '' }, brand);
  assert.match(withoutTracking.html, /Consultar por mi envío/); assert.doesNotMatch(withoutTracking.html, /EJEMPLO-123456/);
  assert.match(renderOrderEmail('delivered', exampleEmailOrder, brand).text, /Esperamos que disfrutes tus piezas/);
});

test('customer values are escaped, unsafe links excluded and internal data never enters the template', () => {
  const order = { ...exampleEmailOrder, contact: { name: '<img src=x onerror=alert(1)>', email: 'cliente@example.test' }, trackingUrl: 'javascript:alert(1)', internalNote: 'PRIVATE_OPERATOR_NOTE', document: 'PRIVATE_DOCUMENT', lines: [{ ...exampleEmailOrder.lines[0], name: '<script>alert(1)</script>' }] };
  const email = renderOrderEmail('shipped', order, { ...brand, name: '<Mali>' });
  assert.match(email.html, /&lt;img/); assert.match(email.html, /&lt;script&gt;/); assert.match(email.html, /&lt;Mali&gt;/);
  assert.doesNotMatch(email.html, /<script|javascript:|PRIVATE_OPERATOR_NOTE|PRIVATE_DOCUMENT/);
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'https://user:pass@example.test', 'http://example.test']) assert.equal(safeEmailUrl(url, true), '');
  assert.equal(safeEmailUrl('http://127.0.0.1:3000', true), 'http://127.0.0.1:3000/');
});

test('local event projection deduplicates stage replays and never treats pending payment as a purchase', () => {
  const event = (date: string, changes: object) => ({ createdAt: date, detail: JSON.stringify({ changes }) });
  const rows = emailStages([
    event('2026-11-08T10:00:00Z', { paymentStatus: { from: 'not_started', to: 'pending' } }),
    event('2026-11-08T11:00:00Z', { paymentStatus: { from: 'pending', to: 'approved' } }),
    event('2026-11-08T12:00:00Z', { paymentStatus: { from: 'approved', to: 'approved' } }),
    event('2026-11-08T13:00:00Z', { paymentStatus: { from: 'in_mediation', to: 'approved' }, shippingStatus: { from: 'ready_to_ship', to: 'shipped' } }),
    event('2026-11-08T14:00:00Z', { shippingStatus: { from: 'shipped', to: 'delivered' } }),
    { createdAt: '2026-11-08', detail: 'broken' },
  ]);
  assert.deepEqual(rows.map(row => row.occurredAt), ['2026-11-08T11:00:00.000Z', '2026-11-08T13:00:00.000Z', '2026-11-08T14:00:00.000Z']);
  assert.equal(emailStages([event('2026-11-08', { paymentStatus: { from: 'pending', to: 'rejected' } })])[0].occurredAt, null);
});

test('previews are read-only, bounded to explicit routes and visibly marked as unsent', async () => {
  const queries: string[] = [];
  const db = { isInitialized: true, query: async (sql: string) => { queries.push(sql); return sql.includes('FROM checkout_orders WHERE') ? [{ snapshot: JSON.stringify({ result: exampleEmailOrder }), trackingNumber: 'TEST', trackingUrl: '' }] : []; } } as unknown as DataSource;
  const service = new EmailPreviews(settings, db);
  assert.match((await service.preview('confirmed', {})).html, /datos ficticios/); assert.equal(queries.length, 0);
  const email = await service.preview('delivered', { orderId: exampleEmailOrder.id });
  assert.match(email.html, /VISTA PREVIA LOCAL · NO ENVIADO/); assert.match(email.html, /etapa todavía no registrada/);
  assert.ok(queries.every(query => query.startsWith('SELECT')));
  const before = queries.length;
  await assert.rejects(service.preview('anything', {}), { status: 400 });
  await assert.rejects(service.preview('confirmed', { recipient: 'someone@example.test' }), { status: 400 });
  await assert.rejects(service.preview('confirmed', { orderId: '../secret' }), { status: 400 });
  assert.equal(queries.length, before);
  await assert.rejects(new EmailPreviews(settings).preview('confirmed', { orderId: exampleEmailOrder.id }), { status: 503 });
});

test('local inbox lists one message per stage and reads only existing order events', async () => {
  let sql = '';
  const db = { isInitialized: true, query: async (query: string) => { sql = query; return [{ id: exampleEmailOrder.id, snapshot: JSON.stringify({ result: exampleEmailOrder }), confirmedAt: '2026-11-08T12:00:00Z', shippedAt: '2026-11-08T13:00:00Z', deliveredAt: null }]; } } as unknown as DataSource;
  const messages = await new EmailPreviews(settings, db).inbox();
  assert.deepEqual(messages.map((message: { kind: string }) => message.kind), ['shipped', 'confirmed']);
  assert.match(sql, /MIN\(CASE/); assert.match(sql, /LIMIT 50/); assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE/);
});

test('email HTML is authenticated, private, unindexable and cannot execute scripts', () => {
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, EmailPreviewsController), [OrdersGuard]);
  for (const action of ['show', 'inbox'] as const) {
    const headers = Reflect.getMetadata(HEADERS_METADATA, EmailPreviewsController.prototype[action]) as { name: string; value: string }[];
    const values = Object.fromEntries(headers.map(header => [header.name, header.value]));
    assert.equal(values['Cache-Control'], 'private, no-store');
    assert.equal(values['X-Robots-Tag'], 'noindex, nofollow');
    assert.match(values['Content-Security-Policy'], /default-src 'none'/);
    assert.match(values['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.doesNotMatch(values['Content-Security-Policy'], /script-src.*unsafe/);
  }
});
