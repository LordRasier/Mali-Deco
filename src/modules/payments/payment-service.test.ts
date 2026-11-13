import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { PaymentService } from './payment-service';
import type { VerifiedPayment } from './mercadopago';
const orderId = 'ca665af8-41b6-4ba4-bb75-54cf9c0f142e';
function fixture(fail = false, pause = false) {
  let payment: Record<string, unknown> | undefined, starts = 0, status = 'not_started';
  const events: Array<{ paymentId?: string; paymentStatus?: string; changes?: { paymentStatus: { to: string } } }> = [];
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let queue = Promise.resolve();
  const query = async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT INTO order_events')) { events.push(JSON.parse(String(args[4]))); return []; }
    if (sql.includes('AS paymentId FROM checkout_orders')) return [{ paymentId: [...events].reverse().find(e => (e.paymentStatus ?? e.changes?.paymentStatus.to) === status)?.paymentId }];
    if (sql.includes('FROM checkout_orders')) return args[0] === orderId && args[1] === 'session' ? [{ id: orderId, currency: 'ARS', totalMinor: '100', paymentStatus: status }] : [];
    if (sql.includes('FROM checkout_payment_starts')) return payment ? [payment] : [];
    if (sql.startsWith('INSERT')) { payment = { state: 'uncertain', preferenceId: null, sellerId: '123' }; return []; }
    if (sql.startsWith('UPDATE checkout_payment_starts')) { payment = { state: 'ready', preferenceId: args[0], sellerId: '123' }; return { affectedRows: 1 }; }
    if (sql.startsWith('UPDATE checkout_orders')) { status = String(args[0]); return { affectedRows: 1 }; }
    throw Error(sql);
  };
  const db = { isInitialized: true, query, transaction: <T>(fn: (tx: { query: typeof query }) => Promise<T>): Promise<T> => { const result = queue.then(() => fn({ query })); queue = result.then(() => {}, () => {}); return result; } } as unknown as DataSource;
  const provider = { sellerId: '123', verifySeller: async () => {}, start: async () => { starts++; if (pause) await barrier; if (fail) throw Error('response lost'); return { preferenceId: '123-pref', url: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-pref' }; }, reconcileDetails: async (): Promise<VerifiedPayment | null> => ({ status: 'approved', paymentId: '987' }) };
  return { service: new PaymentService(db, provider), starts: () => starts, status: () => status, release, provider, events };
}
test('disabled payment service does no database or provider work', async () => {
  assert.deepEqual(await new PaymentService().start('session', orderId), { status: 'disabled' });
});

test('seller verification failure is explicitly safe to retry before any preference POST', async () => {
  const f = fixture(); f.provider.verifySeller = async () => { throw Error('offline'); };
  await assert.rejects(f.service.start('session', orderId), (error: unknown) => {
    assert.equal((error as { getResponse(): { code: string } }).getResponse().code, 'PAYMENT_NOT_STARTED'); return true;
  });
  assert.equal(f.starts(), 0); f.provider.verifySeller = async () => {};
  assert.equal((await f.service.start('session', orderId)).status, 'ready'); assert.equal(f.starts(), 1);
});
test('payment ownership precedes provider calls and concurrent starts create once', async () => {
  const f = fixture();
  await assert.rejects(() => f.service.start('other', orderId)); assert.equal(f.starts(), 0);
  await Promise.all([f.service.start('session', orderId), f.service.start('session', orderId)]);
  assert.equal(f.starts(), 1);
  assert.equal((await f.service.start('session', orderId)).status, 'approved');
});
test('a lost preference response stays uncertain across retries and does not create again', async () => {
  const f = fixture(true);
  assert.deepEqual(await f.service.start('session', orderId), { status: 'uncertain' });
  assert.deepEqual(await f.service.start('session', orderId), { status: 'uncertain' });
  assert.equal(f.starts(), 1);
});
test('only explicit authenticated reconciliation changes persisted payment status', async () => {
  const f = fixture(); await f.service.start('session', orderId);
  assert.equal(f.status(), 'pending');
  assert.equal((await f.service.refresh('session', orderId)).status, 'approved');
  assert.equal(f.status(), 'approved');
  assert.equal(f.events.at(-1)?.paymentId, '987');
  const eventCount = f.events.length;
  await f.service.refresh('session', orderId); assert.equal(f.events.length, eventCount);
  delete f.events.at(-1)!.paymentId;
  await f.service.refresh('session', orderId); assert.deepEqual(f.events.at(-1), { paymentId: '987', paymentStatus: 'approved' });
  await f.service.refresh('session', orderId); assert.equal(f.events.length, eventCount + 1);
  assert.equal((await f.service.start('session', orderId)).status, 'approved'); assert.equal(f.starts(), 1);
});

test('preference persistence cannot downgrade a concurrent authenticated approval', async () => {
  const f = fixture(false, true), start = f.service.start('session', orderId);
  while (f.starts() === 0) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.service.refresh('session', orderId)).status, 'approved');
  f.release(); assert.equal((await start).status, 'approved');
  assert.equal(f.status(), 'approved');
});

test('concurrent refreshes serialize provider reads and retain the final approval', async () => {
  const f = fixture(); await f.service.start('session', orderId);
  let release!: (value: null) => void, calls = 0;
  f.provider.reconcileDetails = async () => { calls++; return calls === 1 ? new Promise<null>(done => { release = done; }) : { status: 'approved', paymentId: '987' }; };
  const stale = f.service.refresh('session', orderId);
  while (!calls) await new Promise(resolve => setImmediate(resolve));
  const fresh = f.service.refresh('session', orderId);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1);
  release(null); await stale;
  assert.equal((await fresh).status, 'approved');
  assert.equal(f.status(), 'approved');
});
