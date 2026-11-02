import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { CreateCatalog1793360000000 } from './migrations/1793360000000-create-catalog';
import { Identity1793360200000 } from './migrations/1793360200000-identity';
import { CanonicalAdminEmail1793360300000 } from './migrations/1793360300000-canonical-admin-email';
import { CatalogTaxonomy1793360400000 } from './migrations/1793360400000-catalog-taxonomy';

test('migration statements target MariaDB and preserve binary checks for security-sensitive fields', async () => {
  const statements: string[] = [];
  const runner = { query: async (sql: string) => { statements.push(sql); return []; } } as unknown as QueryRunner;
  for (const migration of [new CreateCatalog1793360000000(), new Identity1793360200000(), new CanonicalAdminEmail1793360300000(), new CatalogTaxonomy1793360400000()]) await migration.up(runner);
  const sql = statements.join('\n');
  assert.doesNotMatch(sql, /utf8mb4_0900|REGEXP_LIKE/i);
  assert.match(sql, /COLLATE[ =]+utf8mb4_unicode_ci/);
  assert.match(sql, /currency REGEXP BINARY/);
  assert.match(sql, /slug REGEXP BINARY/);
  assert.match(sql, /email REGEXP BINARY/);
  assert.match(sql, /email VARCHAR\(255\) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL/);
  statements.length = 0;
  await new CanonicalAdminEmail1793360300000().down(runner);
  assert.match(statements[0], /DROP CONSTRAINT chk_admin_email_canonical/);
});
