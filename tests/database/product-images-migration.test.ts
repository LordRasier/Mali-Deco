import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { ProductImages1793360700000 } from '../../src/infrastructure/database/migrations/1793360700000-product-images';

test('preflight rejects either existing media schema object before DDL', async () => {
  for (const kind of ['table', 'column']) {
    const calls: string[] = [];
    const runner = { query: async (sql: string) => { calls.push(sql); return [{ kind }]; } } as unknown as QueryRunner;
    await assert.rejects(new ProductImages1793360700000().up(runner), /schema already exists/);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /information_schema\.tables/);
    assert.match(calls[0], /information_schema\.columns/);
  }
});

test('rollback refuses to delete any images, including retired rows', async () => {
  const calls: string[] = [];
  const runner = { query: async (sql: string) => { calls.push(sql); return [{ total: '1' }]; } } as unknown as QueryRunner;
  await assert.rejects(new ProductImages1793360700000().down(runner), /images exist/);
  assert.deepEqual(calls, ['SELECT COUNT(*) AS total FROM product_images']);
});

test('empty media table permits rollback in dependency order', async () => {
  const calls: string[] = [];
  const runner = { query: async (sql: string) => { calls.push(sql); return [{ total: 0 }]; } } as unknown as QueryRunner;
  await new ProductImages1793360700000().down(runner);
  assert.deepEqual(calls, ['SELECT COUNT(*) AS total FROM product_images', 'DROP TABLE product_image_quota', 'DROP TABLE product_image_derivatives', 'DROP TABLE product_images', 'ALTER TABLE products DROP COLUMN media_revision']);
});
