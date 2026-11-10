import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { CheckoutPaymentStarts1793361100000 } from '../../infrastructure/database/migrations/1793361100000-checkout-payment-starts';
import { checkoutUrl } from './mercadopago';
import { startPayment, refreshPayment } from '../../presentation/shared/checkout/checkout-client';

test('provider redirect validates exact origin/path/preference, never suffix matching', () => {
  for (const url of ['javascript:alert(1)', 'https://www.mercadopago.com.ar.evil.test/checkout/v1/redirect?pref_id=123', 'https://user@www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123', 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=other', 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123&next=https://evil.test']) assert.throws(() => checkoutUrl(url, '123'));
});
test('browser rejects unsafe provider links and sends only owned order id with CSRF', async () => {
  const original = globalThis.fetch;
  try {
    let value: unknown = { status: 'ready', url: 'https://evil.test/' };
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /^\/api\/v1\/checkout\/payments\/(start|refresh)$/);
      assert.deepEqual(JSON.parse(String(init?.body)), { orderId: 'order' });
      assert.equal((init?.headers as Record<string, string>)['X-CSRF-Token'], 'csrf');
      assert.equal(init?.credentials, 'same-origin'); return Response.json(value);
    };
    await assert.rejects(() => startPayment('csrf', 'order'));
    value = { status: 'approved' }; assert.deepEqual(await refreshPayment('csrf', 'order'), value);
    value = { status: 'paid' }; await assert.rejects(() => refreshPayment('csrf', 'order'));
  } finally { globalThis.fetch = original; }
});
test('payment-start migration enforces one attempt per order and one owner per preference without altering stock', async () => {
  const statements: string[] = [], queryRunner = { query: async (sql: string) => { if (sql.startsWith('SELECT')) return [{ total: 0 }]; statements.push(sql); } } as unknown as QueryRunner;
  const migration = new CheckoutPaymentStarts1793361100000(); await migration.up(queryRunner); await migration.down(queryRunner);
  assert.match(statements[0], /order_id[\s\S]+PRIMARY KEY/);
  assert.match(statements[0], /UNIQUE \(preference_id\)/);
  assert.match(statements[0], /FOREIGN KEY \(order_id\) REFERENCES checkout_orders\(id\)/);
  assert.doesNotMatch(statements.join(' '), /product_variants|stock_quantity/);
  assert.equal(statements[1], 'DROP TABLE checkout_payment_starts');
});

test('rollback refuses to discard any durable payment-start or uncertain-outcome evidence', async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ total: 1 }]; } } as unknown as QueryRunner;
  await assert.rejects(() => new CheckoutPaymentStarts1793361100000().down(queryRunner), /retained/);
  assert.equal(statements.some(sql => sql.startsWith('DROP')), false);
});
