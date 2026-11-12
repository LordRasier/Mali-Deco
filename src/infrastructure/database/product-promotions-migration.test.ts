import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryRunner } from 'typeorm';
import { ProductPromotions1793362200000 } from './migrations/1793362200000-product-promotions';

test('promotion migration is additive, retryable and bounds prices without updating existing products', async () => {
  const sql: string[] = [], q = { query: async (text: string) => { sql.push(text); return []; } } as unknown as QueryRunner;
  await new ProductPromotions1793362200000().up(q);
  assert.match(sql[0], /ADD COLUMN IF NOT EXISTS featured TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(sql[1], /ADD COLUMN IF NOT EXISTS sale_price_minor BIGINT UNSIGNED NULL CHECK \(sale_price_minor <= 9007199254740991\)/);
  assert.ok(sql.every(text => text.startsWith('ALTER TABLE')));
});

test('rollback refuses to discard any populated sale price or featured flag', async () => {
  for (const total of [1, 10, undefined]) {
    const calls: string[] = [], q = { hasColumn: async () => true, query: async (sql: string) => { calls.push(sql); return total === undefined ? [] : [{ total }]; } } as unknown as QueryRunner;
    await assert.rejects(new ProductPromotions1793362200000().down(q), /populated/);
    assert.equal(calls.length, 1);
  }
});

test('an interrupted empty rollback resumes safely without querying an already removed column', async () => {
  const columns = new Set(['featured', 'sale_price_minor']); let interrupted = false;
  const q = { hasColumn: async (_table: string, column: string) => columns.has(column), query: async (sql: string) => {
    if (sql.startsWith('SELECT')) {
      if (sql.includes('sale_price_minor')) assert.ok(columns.has('sale_price_minor'));
      return [{ total: 0 }];
    }
    if (sql.includes('DROP COLUMN sale_price_minor')) columns.delete('sale_price_minor');
    if (sql.includes('DROP COLUMN featured')) { if (!interrupted) { interrupted = true; throw Error('Interrupted'); } columns.delete('featured'); }
    return [];
  } } as unknown as QueryRunner;
  await assert.rejects(new ProductPromotions1793362200000().down(q), /Interrupted/);
  await new ProductPromotions1793362200000().down(q);
  assert.equal(columns.size, 0);
});
