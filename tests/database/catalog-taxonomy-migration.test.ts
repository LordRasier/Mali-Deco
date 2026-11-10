import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryRunner } from 'typeorm';
import { CatalogTaxonomy1793360400000 } from '../../src/infrastructure/database/migrations/1793360400000-catalog-taxonomy';

test('taxonomy migration retains old rows without invented data and removes FKs before tables on rollback', async () => {
  const statements: string[] = [];
  const runner = { query: async (sql: string) => { statements.push(sql); } } as unknown as QueryRunner;
  const migration = new CatalogTaxonomy1793360400000();
  await migration.up(runner);
  const up = statements.join('\n');
  for (const table of ['categories', 'materials', 'colors']) assert.match(up, new RegExp(`CREATE TABLE ${table} `));
  for (const column of ['category_id', 'material_id', 'color_id']) assert.match(up, new RegExp(`ADD ${column} CHAR\\(36\\).*NULL`));
  assert.doesNotMatch(up, /\bINSERT\b|\bUPDATE\b/i);
  const beforeDown = statements.length;
  await migration.down(runner);
  const down = statements.slice(beforeDown);
  assert.match(down[0], /ADD INDEX IF NOT EXISTS idx_variants_product_id \(product_id\)/);
  assert.match(down[1], /DROP FOREIGN KEY fk_variants_color/);
  assert.match(down[2], /DROP FOREIGN KEY fk_products_category/);
  assert.deepEqual(down.slice(3), ['DROP TABLE colors', 'DROP TABLE materials', 'DROP TABLE categories']);
});
