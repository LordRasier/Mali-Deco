import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { MysqlIdentityStore } from './identity-store';

test('account lookup requests binary collation even before the migration is applied', async () => {
  let query = '';
  let values: unknown[] = [];
  const db = { isInitialized: true, query: async (sql: string, params: unknown[]) => { query = sql; values = params; return []; } } as unknown as DataSource;
  assert.equal(await new MysqlIdentityStore(db).user('owner@example.test'), null);
  assert.match(query, /email COLLATE utf8mb4_0900_bin = \?/);
  assert.deepEqual(values, ['owner@example.test']);
});
