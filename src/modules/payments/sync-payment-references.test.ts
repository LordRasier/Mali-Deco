import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataSource } from 'typeorm';
import { PaymentRegistry } from './payment-registry';
import { syncPaymentReferences } from './sync-payment-references';

const id = 'ca665af8-41b6-4ba4-bb75-54cf9c0f142e';
function fixture(options: { changed?: boolean; mismatch?: boolean; fail?: boolean } = {}) {
  const queries: string[] = [], requests: string[] = [], events: object[] = [];
  let reference: string | null = null;
  const query = async (sql: string, args: unknown[]) => {
    queries.push(sql);
    if (sql.includes('ORDER BY id LIMIT 100')) return args[0] === '' && !reference ? [{ id }] : [];
    if (sql.includes('AS paymentId FROM checkout_orders')) return [{ paymentId: reference }];
    if (sql.includes('FROM checkout_orders WHERE id = ? FOR UPDATE')) return [{ id, mode: 'test', sellerId: '123', paymentStatus: 'approved', currency: 'ARS', totalMinor: '100' }];
    if (sql.includes('FROM checkout_payment_starts')) return [{ mode: 'test', sellerId: options.mismatch ? '999' : '123' }];
    if (sql.startsWith('INSERT INTO order_events')) { const event = JSON.parse(String(args[4])); events.push(event); reference = event.paymentId; return []; }
    throw Error('Unexpected write or query: ' + sql);
  };
  const db = { isInitialized: true, query, transaction: async <T>(fn: (tx: { query: typeof query }) => Promise<T>) => fn({ query }) } as unknown as DataSource;
  const registry = new PaymentRegistry({ PUBLIC_SITE_URL: 'https://store.dev', MERCADOPAGO_TEST_SELLER_ID: '123', MERCADOPAGO_TEST_ACCESS_TOKEN: 'fixture', MERCADOPAGO_TEST_WEBHOOK_SECRET: 'synthetic-secret' }, async (url, init) => {
    assert.equal(init?.method, 'GET'); requests.push(String(url));
    if (options.fail) throw Error('offline');
    return Response.json(String(url).endsWith('/users/me') ? { id: 123, site_id: 'MLA', tags: ['test_user'] }
      : { results: [{ id: '1234567890123456', live_mode: false, collector_id: 123, external_reference: id, currency_id: 'ARS', transaction_amount: 1, status: options.changed ? 'refunded' : 'approved' }], paging: { total: 1 } });
  });
  return { db, registry, queries, requests, events };
}
test('historical recovery verifies the seller and amount, is repeatable, and only records a reference', async () => {
  const f = fixture();
  assert.deepEqual(await syncPaymentReferences(f.db, f.registry), { checked: 1, recovered: 1, skipped: 0, failed: 0 });
  assert.deepEqual(f.events, [{ paymentId: '1234567890123456', paymentStatus: 'approved' }]);
  assert.ok(f.queries.every(sql => !/UPDATE|INSERT INTO order_email/.test(sql.replace('FOR UPDATE', ''))));
  assert.equal(f.requests.length, 2);
  assert.deepEqual(await syncPaymentReferences(f.db, f.registry), { checked: 0, recovered: 0, skipped: 0, failed: 0 });
  assert.equal(f.requests.length, 2); assert.equal(f.events.length, 1);
});
test('historical recovery never labels a mismatched or failed verification as the stored payment', async () => {
  for (const options of [{ changed: true }, { mismatch: true }, { fail: true }]) {
    const f = fixture(options), result = await syncPaymentReferences(f.db, f.registry);
    assert.equal(result.recovered, 0); assert.equal(f.events.length, 0);
    assert.equal(result.failed, options.fail ? 1 : 0);
    if (options.mismatch) assert.equal(f.requests.length, 0);
  }
});
