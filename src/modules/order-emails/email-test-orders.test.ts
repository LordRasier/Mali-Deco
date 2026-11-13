import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource, EntityManager } from 'typeorm';
import { emailConfig, type EmailConfig } from './email-config';
import { enqueueOrderEmails } from './email-outbox';
import { EmailWorker } from './email-worker';
import { EnvialoSimple, type EmailMessage } from './envialosimple';
import { exampleEmailOrder } from './order-email-model';

const config = emailConfig({ ORDER_EMAIL_MODE: 'live', ENVIALOSIMPLE_API_KEY: 'synthetic-key', ORDER_EMAIL_FROM: 'pedidos@mali-store.com.ar',
  ORDER_EMAIL_SITE_URL: 'https://mali-store.com.ar', ORDER_EMAIL_TEST_TO: 'owner@malideco.dev' });
const order = { ...exampleEmailOrder, contact: { name: 'Comprador', email: 'buyer@malideco.dev' } };
function harness(options: { queueMode?: string; paymentMode?: string; paymentStatus?: string; orderStatus?: string; testTo?: string; failure?: 'reject' | 'timeout' } = {}) {
  const queueMode = options.queueMode ?? 'test', paymentMode = options.paymentMode ?? 'test';
  const active = { ...config, testTo: options.testTo ?? config.testTo };
  let status = 'queued', errorCode: unknown = null, recipient: unknown = '', claims = 0, builtMode = '';
  const posts: EmailMessage[] = [], gets: string[] = [];
  const row = { id: 'notification', orderId: order.id, stage: 'confirmed', mode: queueMode, payload: JSON.stringify(order), providerId: 'mail_123' };
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SET status = 'uncertain'") || sql.includes("SET status = 'unconfirmed'")) return { affectedRows: 0 };
    if (sql.startsWith('SELECT') && (sql.includes("status = 'accepted'") || sql.includes("status = 'queued'"))) {
      assert.match(sql, /o\.payment_mode = 'test'/);
      const visible = queueMode === params[0] || (params[1] === 1 && queueMode === 'test' && paymentMode === 'test');
      const expected = sql.includes("status = 'accepted'") ? 'accepted' : 'queued';
      return visible && status === expected ? [row] : [];
    }
    if (sql.startsWith('SELECT') && sql.includes('FROM checkout_orders')) return [{ paymentMode, paymentStatus: options.paymentStatus ?? 'approved', orderStatus: options.orderStatus ?? 'received' }];
    if (sql.includes("SET status = 'sending'")) {
      assert.equal(params[1], queueMode);
      if (status !== 'queued') return { affectedRows: 0 };
      claims++; status = 'sending'; return { affectedRows: 1 };
    }
    if (sql.includes('SET recipient =')) { recipient = params[0]; return { affectedRows: 1 }; }
    if (sql.includes("SET status = 'accepted'")) { status = 'accepted'; return { affectedRows: 1 }; }
    if (sql.includes('SET status = ?, provider_status') || sql.includes('SET status = ?, error_code')) { status = String(params[0]); errorCode = params[1]; return { affectedRows: 1 }; }
    if (sql.includes('SET next_check_at =') || sql.startsWith('INSERT INTO order_events')) return { affectedRows: 1 };
    throw Error('Unexpected query');
  };
  const db = { isInitialized: true, query, transaction: async (fn: (tx: { query: typeof query }) => unknown) => fn({ query }) } as unknown as DataSource;
  const provider = new EnvialoSimple(active, async (url, init) => {
    if (init?.method === 'POST') {
      assert.equal(String(url), 'https://api.envialosimple.email/api/v1/mail/send');
      posts.push(JSON.parse(String(init.body)));
      if (options.failure === 'timeout') throw new DOMException('timeout', 'TimeoutError');
      if (options.failure === 'reject') return Response.json({}, { status: 401 });
      return Response.json({ queued: true, id: 'mail_123' });
    }
    gets.push(String(url));
    if (String(url).endsWith('/domains')) return Response.json({}, { status: 404 });
    return Response.json({ id: 'mail_123', status: 'sent', events: [{ type: 'sent', date: '2026-11-13T01:00:00Z' }] });
  });
  const build = async (_db: unknown, sending: EmailConfig, _id: string, _stage: unknown, _order: unknown, to: string): Promise<EmailMessage> => {
    builtMode = sending.mode;
    return { from: { name: 'Tienda', email: sending.from }, to, subject: (sending.mode === 'test' ? '[PRUEBA] ' : '') + 'Compra confirmada', html: '<p>Pedido</p>', text: 'Pedido', user_variables: { notification_id: row.id, order_id: order.id, stage: row.stage } };
  };
  return { worker: () => new EmailWorker(db, active, provider, build), state: () => ({ status, errorCode, recipient, claims, builtMode, posts, gets }) };
}

test('live automatically sends a queued test purchase to the test recipient once and reconciles its delivery', async () => {
  const h = harness(), first = h.worker();
  await Promise.all([first.tick(), h.worker().tick()]);
  assert.equal(h.state().claims, 1); assert.equal(h.state().posts.length, 1);
  assert.equal(h.state().recipient, config.testTo); assert.equal(h.state().builtMode, 'test');
  assert.match(h.state().posts[0].subject, /^\[PRUEBA\]/);
  assert.equal(h.state().posts[0].to, config.testTo);
  assert.ok(!h.state().gets.some(url => url.endsWith('/domains')));
  await first.tick(); assert.equal(h.state().status, 'sent'); assert.equal(h.state().posts.length, 1);
});

test('real purchases keep their buyer recipient and live subject', async () => {
  const h = harness({ queueMode: 'live', paymentMode: 'production' });
  await h.worker().tick();
  assert.equal(h.state().recipient, order.contact.email); assert.equal(h.state().builtMode, 'live');
  assert.doesNotMatch(h.state().posts[0].subject, /PRUEBA/);
});

test('live never falls back to the buyer when a test recipient is absent and never promotes historical test notifications for real purchases', async () => {
  for (const options of [{ testTo: '' }, { queueMode: 'test', paymentMode: 'production' }]) {
    const h = harness(options); await h.worker().tick();
    assert.equal(h.state().claims, 0); assert.equal(h.state().status, 'queued'); assert.equal(h.state().posts.length, 0);
  }
  const legacy = harness({ queueMode: 'live', paymentMode: 'test' }); await legacy.worker().tick();
  assert.equal(legacy.state().status, 'skipped'); assert.equal(legacy.state().posts.length, 0);
});

test('test confirmations still require approved payment and a non-cancelled order', async () => {
  for (const options of [{ paymentStatus: 'pending' }, { orderStatus: 'cancelled' }]) {
    const h = harness(options); await h.worker().tick();
    assert.equal(h.state().status, 'skipped'); assert.equal(h.state().posts.length, 0);
  }
});

test('provider rejects and ambiguous test sends are never automatically repeated', async () => {
  for (const failure of ['reject', 'timeout'] as const) {
    const h = harness({ failure }), worker = h.worker(); await worker.tick(); await worker.tick();
    assert.equal(h.state().status, failure === 'reject' ? 'failed' : 'uncertain'); assert.equal(h.state().posts.length, 1);
  }
});

test('live outbox preserves test isolation even without a test recipient and real purchases stay live', async () => {
  for (const testLocal of [true, false]) {
    const writes: unknown[][] = [];
    const tx = { query: async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT')) return [{ snapshot: JSON.stringify({ result: { ...order, testLocal } }), orderStatus: 'received' }];
      writes.push(params); return { affectedRows: 1 };
    } } as unknown as Pick<EntityManager, 'query'>;
    await enqueueOrderEmails(tx, order.id, { changes: { paymentStatus: { from: 'pending', to: 'approved' } } }, { ...config, testTo: '' });
    assert.equal(writes[0][3], testLocal ? 'test' : 'live'); assert.equal(writes[0][4], 'queued');
  }
});
