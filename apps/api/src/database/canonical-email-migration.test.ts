import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { CanonicalAdminEmail1793360300000 } from './migrations/1793360300000-canonical-admin-email';

test('migration refuses noncanonical existing accounts before changing schema', async () => {
  const calls: string[] = [];
  const runner = { query: async (sql: string) => { calls.push(sql); return [{ email: 'ówner@example.test' }]; } } as unknown as QueryRunner;
  await assert.rejects(new CanonicalAdminEmail1793360300000().up(runner), /canonicalization/);
  assert.deepEqual(calls, ['SELECT email FROM admin_users']);
});
