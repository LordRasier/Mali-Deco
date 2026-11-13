import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource, EntityManager } from 'typeorm';
import { emailConfig, emailReadiness, publicEmailConfig } from './email-config';
import { enqueueOrderEmails } from './email-outbox';
import { EmailSendError, EnvialoSimple, type EmailMessage } from './envialosimple';
import { EmailWorker } from './email-worker';
import { exampleEmailOrder } from './order-email-model';
import { buildEmailMessage } from './email-message';
import { orderEmailsView } from '../../presentation/admin/orders/order-emails-view';
import { OrderEmailOutbox1793361600000 } from '../../infrastructure/database/migrations/1793361600000-order-email-outbox';

const config = emailConfig({ ORDER_EMAIL_MODE: 'test', ENVIALOSIMPLE_API_KEY: 'secret-unit-test', ORDER_EMAIL_TEST_TO: 'owner@malideco.dev', ORDER_EMAIL_FROM: 'pedidos@mali-store.com.ar', ORDER_EMAIL_SITE_URL: 'https://mali-store.com.ar' });
const message: EmailMessage = { from: { email: config.from, name: 'Mali' }, to: config.testTo, subject: 'Test', html: '<p>Test</p>', text: 'Test', user_variables: { notification_id: 'n', order_id: 'o', stage: 'confirmed' } };
const change = { changes: { paymentStatus: { from: 'pending', to: 'approved' }, shippingStatus: { from: 'ready_to_ship', to: 'shipped' } } };

test('email configuration is off by default, keeps secrets server-side and gates tests on a recipient', () => {
  assert.equal(emailConfig({}).mode, 'disabled');
  assert.equal(emailConfig({}).from, ''); assert.equal(emailConfig({}).siteUrl, '');
  assert.match(emailReadiness(emailConfig({ ORDER_EMAIL_MODE: 'live', ENVIALOSIMPLE_API_KEY: 'secret' })), /remitente y dominio/);
  assert.equal(emailReadiness(emailConfig({ ORDER_EMAIL_MODE: 'test', ENVIALOSIMPLE_API_KEY: 'secret' })), 'Falta indicar el email de prueba');
  assert.doesNotMatch(JSON.stringify(publicEmailConfig(config)), /secret-unit-test|apiKey/);
  for (const env of [{ ORDER_EMAIL_MODE: 'yes' }, { ORDER_EMAIL_FROM: 'a@b.com\r\nBcc:evil@evil.com' }, { ORDER_EMAIL_SITE_URL: 'http://mali-store.com.ar' }]) assert.throws(() => emailConfig(env));
});

test('only relevant transitions enqueue immutable safe order data, with a unique stage guard', async () => {
  const writes: unknown[][] = [], queries: string[] = [];
  const saved = { ...exampleEmailOrder, testLocal: true, internalNote: 'PRIVATE-NOTE', contact: { ...exampleEmailOrder.contact, document: 'PRIVATE-DNI', phone: 'PRIVATE-PHONE' } };
  const tx = { query: async (sql: string, args: unknown[] = []) => { queries.push(sql); if (sql.startsWith('SELECT')) return [{ snapshot: JSON.stringify({ result: saved }), trackingNumber: 'NEW', trackingUrl: 'https://mali-store.com.ar/track' }]; writes.push(args); return { affectedRows: 1 }; } } as unknown as Pick<EntityManager, 'query'>;
  await enqueueOrderEmails(tx, saved.id, change, { ...config, mode: 'disabled' });
  await enqueueOrderEmails(tx, saved.id, { changes: { paymentStatus: { from: 'not_started', to: 'pending' } } }, config);
  assert.equal(queries.length, 0);
  await enqueueOrderEmails(tx, saved.id, change, config);
  assert.deepEqual(writes.map(p => p[2]), ['confirmed', 'shipped']);
  assert.equal(JSON.parse(String(writes[0][5])).trackingNumber, 'NEW');
  assert.doesNotMatch(String(writes[0][5]), /PRIVATE|document|phone|testLocal/);
  assert.ok(queries.filter(q => q.startsWith('INSERT')).every(q => /ON DUPLICATE KEY UPDATE id = id/.test(q)));
  await enqueueOrderEmails(tx, saved.id, change, { ...config, mode: 'live' });
  assert.equal(writes[2][4], 'skipped'); assert.equal(writes[2][6], 'test_order_in_live');
});

test('outbox migration enforces database deduplication and retains delivery evidence on rollback', async () => {
  const sql: string[] = [];
  const runner = { query: async (query: string) => { sql.push(query); return [{ total: 1 }]; } };
  const migration = new OrderEmailOutbox1793361600000();
  await migration.up(runner as never);
  assert.match(sql[0], /UNIQUE KEY uq_order_email_stage \(order_id, stage\)/);
  await assert.rejects(migration.down(runner as never), /evidence must be retained/);
  assert.ok(!sql.some(q => q.startsWith('DROP')));
});

test('late approval on a cancelled order does not queue a purchase or dispatch promise', async () => {
  const writes: string[] = [];
  const tx = { query: async (sql: string) => { if (sql.startsWith('SELECT')) return [{ orderStatus: 'cancelled' }]; writes.push(sql); return []; } } as unknown as Pick<EntityManager, 'query'>;
  await enqueueOrderEmails(tx, exampleEmailOrder.id, change, config);
  assert.deepEqual(writes, []);
});

test('provider uses the official authenticated endpoint, refuses redirects and records a receipt', async () => {
  let call: { url: string; init?: RequestInit } | undefined;
  const provider = new EnvialoSimple(config, async (url, init) => { call = { url: String(url), init }; return Response.json({ id: 'mail_123' }); });
  assert.equal(await provider.send(message), 'mail_123');
  assert.equal(call!.url, 'https://api.envialosimple.email/api/v1/mail/send');
  assert.equal(call!.init?.redirect, 'error');
  assert.equal(new Headers(call!.init?.headers).get('Authorization'), 'Bearer secret-unit-test');
  assert.deepEqual(JSON.parse(String(call!.init?.body)), message);
});

test('HTTP rejection differs from an ambiguous outcome and no POST is retried automatically', async () => {
  for (const [response, uncertain] of [[Response.json({}, { status: 400 }), false], [Response.json({}, { status: 429 }), false], [Response.json({}, { status: 503 }), true], [Response.json({ accepted: true }), true]] as const) {
    let requests = 0;
    const provider = new EnvialoSimple(config, async () => { requests++; return response; });
    await assert.rejects(provider.send(message), error => error instanceof EmailSendError && error.uncertain === uncertain);
    assert.equal(requests, 1);
  }
  await assert.rejects(new EnvialoSimple(config, async () => { throw Error('network contains secret'); }).send(message), error => error instanceof EmailSendError && error.uncertain && !error.message.includes('secret'));
});

test('delivery status requires matching provider evidence and parses the sent timestamp', async () => {
  const provider = new EnvialoSimple(config, async () => Response.json({ id: 'mail_123', status: 'sent', events: [{ type: 'sent', date: '2026-11-08T12:00:00+00:00' }] }));
  assert.deepEqual(await provider.delivery('mail_123'), { status: 'sent', sentAt: new Date('2026-11-08T12:00:00Z') });
  await assert.rejects(provider.delivery('another_mail'), /provider_invalid_delivery/);
  await assert.rejects(provider.delivery('../domains'), /provider_invalid_id/);
});

function workerHarness(sendError?: EmailSendError, acceptedWriteFails = false, mode: 'test' | 'live' = 'test') {
  let status = 'queued', sends = 0, providerStatus = 'processed', recipient = '', sentAt: unknown = null;
  const events: unknown[][] = [];
  const row = { id: 'notification', orderId: exampleEmailOrder.id, stage: 'confirmed', mode, payload: JSON.stringify(exampleEmailOrder), providerId: 'provider123' };
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SET status = 'uncertain'")) return { affectedRows: 0 };
    if (sql.includes("SET status = 'unconfirmed'")) return { affectedRows: 0 };
    if (sql.startsWith('SELECT') && sql.includes("status = 'accepted'")) return status === 'accepted' ? [row] : [];
    if (sql.startsWith('SELECT') && sql.includes("status = 'queued'")) return status === 'queued' && params[0] === mode ? [row] : [];
    if (sql.startsWith('SELECT') && sql.includes('FROM checkout_orders')) return [{ paymentStatus: 'approved', orderStatus: 'received' }];
    if (sql.includes("SET status = 'sending'")) { if (status !== 'queued') return { affectedRows: 0 }; status = 'sending'; return { affectedRows: 1 }; }
    if (sql.includes('SET recipient =')) { recipient = String(params[0]); return { affectedRows: 1 }; }
    if (sql.includes('SET status = ?, provider_status')) { status = String(params[0]); sentAt = params[2]; return { affectedRows: 1 }; }
    if (sql.includes('SET status = ?, error_code')) { status = String(params[0]); return { affectedRows: 1 }; }
    if (sql.includes("SET status = 'accepted'")) { if (acceptedWriteFails) throw Error('DB disconnected after send'); status = 'accepted'; return { affectedRows: 1 }; }
    if (sql.includes('SET next_check_at =')) return { affectedRows: 1 };
    if (sql.startsWith('INSERT INTO order_events')) { events.push(params); return { affectedRows: 1 }; }
    throw Error('Unexpected test query: ' + sql);
  };
  const db = { isInitialized: true, query, transaction: async (fn: (tx: { query: typeof query }) => Promise<void>) => fn({ query }) } as unknown as DataSource;
  const provider = { domains: async () => [{ name: 'mali-store.com.ar', status: 'verified' }], send: async () => { sends++; if (sendError) throw sendError; return 'provider123'; }, delivery: async () => ({ status: providerStatus, sentAt: new Date('2026-11-08T12:00:00Z') }) } as unknown as EnvialoSimple;
  const build = async (_db: unknown, _config: unknown, _id: unknown, _stage: unknown, _order: unknown, to: string) => ({ ...message, to });
  return { worker: new EmailWorker(db, { ...config, mode }, provider, build), another: () => new EmailWorker(db, { ...config, mode }, provider, build),
    state: () => ({ status, sends, recipient, sentAt, events }), deliver: (s: string) => { providerStatus = s; } };
}

test('worker sends once across concurrent workers and only marks sent after provider confirmation', async () => {
  const h = workerHarness();
  await Promise.all([h.worker.tick(), h.another().tick()]);
  assert.equal(h.state().sends, 1); assert.equal(h.state().status, 'accepted'); assert.equal(h.state().recipient, config.testTo);
  await h.worker.tick(); assert.equal(h.state().status, 'accepted');
  h.deliver('sent'); await h.worker.tick();
  assert.equal(h.state().status, 'sent'); assert.equal(h.state().sends, 1);
  assert.equal(h.state().events.length, 2);
  assert.deepEqual(h.state().sentAt, new Date('2026-11-08T12:00:00Z'));
});

test('worker never repeats a timeout, rejection or a send whose receipt could not be saved', async () => {
  for (const [error, status] of [[new EmailSendError('provider_response_unknown', true), 'uncertain'], [new EmailSendError('provider_http_401'), 'failed']] as const) {
    const h = workerHarness(error); await h.worker.tick(); await h.worker.tick();
    assert.equal(h.state().status, status); assert.equal(h.state().sends, 1);
  }
  const h = workerHarness(undefined, true); await h.worker.tick(); await h.worker.tick();
  assert.equal(h.state().status, 'sending'); assert.equal(h.state().sends, 1);
});

test('live sending refuses synthetic addresses; provider rejection is visible as failed', async () => {
  const h = workerHarness(undefined, false, 'live'); await h.worker.tick();
  assert.equal(h.state().sends, 0); assert.equal(h.state().status, 'failed');
  const rejected = workerHarness(); await rejected.worker.tick(); rejected.deliver('rejected'); await rejected.worker.tick();
  assert.equal(rejected.state().status, 'failed'); assert.equal(rejected.state().sends, 1);
});

test('real messages embed a JPEG banner and use production links, while previews never send', async () => {
  const db = { isInitialized: true, query: async (sql: string) => sql.includes('FROM store_settings') ? [{ name: 'Mali', primaryColor: '#ca0707', whatsappNumber: '', instagramUsername: '' }] : [] } as unknown as DataSource;
  const email = await buildEmailMessage(db, config, 'notification', 'confirmed', exampleEmailOrder, config.testTo);
  assert.match(email.subject, /^\[PRUEBA\]/); assert.match(email.html, /cid:mali-order-banner/); assert.match(email.html, /https:\/\/mali-store.com.ar/);
  assert.doesNotMatch(email.html, /127\.0\.0\.1|localhost|VISTA PREVIA/);
  assert.equal(Buffer.from(email.attachments![0].content, 'base64').subarray(0, 2).toString('hex'), 'ffd8');
  assert.equal(email.to, config.testTo);
});

test('admin email badges use delivery evidence, including saved dates and test recipients', () => {
  const emails = orderEmailsView('order', [], [{ stage: 'confirmed', status: 'sent', mode: 'test', recipient: config.testTo, providerId: 'provider123', providerStatus: 'sent', errorCode: null, createdAt: new Date(), updatedAt: new Date(), acceptedAt: new Date(), sentAt: '2026-11-08T12:00:00Z' }]);
  assert.equal(emails[0].statusLabel, 'Enviado'); assert.equal(emails[0].deliveryAt, '2026-11-08T12:00:00.000Z'); assert.equal(emails[0].test, true);
  assert.ok(emails.slice(1).every(e => e.statusLabel === 'No enviado'));
});
