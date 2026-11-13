import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataSource } from 'typeorm';
import { emailConfig } from '../order-emails/email-config';
import { EnvialoSimple, type EmailMessage } from '../order-emails/envialosimple';
import { TrackingWorker } from './tracking-worker';
import { trackingDigest } from './tracking-security';

function harness(options: { mode?: string; email?: string; exists?: boolean; failure?: 'reject' | 'timeout' } = {}) {
  const config = emailConfig({ ORDER_EMAIL_MODE: options.mode ?? 'live', ENVIALOSIMPLE_API_KEY: 'synthetic', ORDER_EMAIL_FROM: 'orders@store.dev', ORDER_EMAIL_SITE_URL: 'https://store.dev', ORDER_EMAIL_TEST_TO: 'owner@store.dev' });
  let status = 'queued'; const email = options.email ?? 'buyer@store.dev', stored: unknown[][] = [], posts: EmailMessage[] = [];
  const db = { isInitialized: true, query: async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('DELETE') || sql.includes("SET status = 'uncertain'")) return { affectedRows: 0 };
    if (sql.startsWith('SELECT') && sql.includes('order_tracking_requests')) return status === 'queued' ? [{ id: 'request', email }] : [];
    if (sql.includes("SET status = 'sending'")) { if (status !== 'queued') return { affectedRows: 0 }; status = 'sending'; return { affectedRows: 1 }; }
    if (sql.startsWith('SELECT') && sql.includes('checkout_orders')) { assert.equal(params[0], email); assert.equal(params[1], email === config.testTo ? 1 : 0); return options.exists === false ? [] : [{ id: 'order' }]; }
    if (sql.startsWith('INSERT')) { stored.push(params); return { affectedRows: 1 }; }
    if (sql.includes('SET status = ?')) { status = String(params[0]); return { affectedRows: 1 }; }
    throw Error('Unexpected SQL');
  } } as unknown as DataSource;
  const provider = new EnvialoSimple(config, async (_url, init) => {
    assert.equal(init?.method, 'POST'); posts.push(JSON.parse(String(init.body)));
    if (options.failure === 'timeout') throw Error('Ambiguous send');
    return options.failure === 'reject' ? Response.json({}, { status: 401 }) : Response.json({ queued: true, id: 'mail-id' });
  });
  return { worker: () => new TrackingWorker(db, config, provider, async () => 'Tienda'), state: () => ({ status, posts, stored }) };
}
test('concurrent workers send one access link to its exact owner and only persist its digest', async () => {
  const h = harness(); await Promise.all([h.worker().tick(), h.worker().tick()]);
  assert.equal(h.state().posts.length, 1); assert.equal(h.state().status, 'accepted');
  const mail = h.state().posts[0], token = /seguimiento#([a-f0-9]{64})/.exec(mail.text)![1];
  assert.equal(mail.to, 'buyer@store.dev'); assert.equal(h.state().stored[0][0], trackingDigest(token)); assert.ok(!JSON.stringify(h.state().stored).includes(token));
  await h.worker().tick(); assert.equal(h.state().posts.length, 1);
});
test('unknown accounts and test-mode mismatches never send or redirect access to another inbox', async () => {
  for (const options of [{ exists: false }, { mode: 'test' }]) { const h = harness(options); await h.worker().tick(); assert.equal(h.state().posts.length, 0); assert.equal(h.state().stored.length, 0); }
  const allowed = harness({ mode: 'test', email: 'owner@store.dev' }); await allowed.worker().tick(); assert.equal(allowed.state().posts[0].to, 'owner@store.dev'); assert.equal(allowed.state().stored[0][2], 1);
});
test('failed or ambiguous access sends are not automatically repeated', async () => {
  for (const failure of ['reject', 'timeout'] as const) {
    const h = harness({ failure }), worker = h.worker(); await worker.tick(); await worker.tick();
    assert.equal(h.state().status, failure === 'reject' ? 'failed' : 'uncertain'); assert.equal(h.state().posts.length, 1);
  }
});
