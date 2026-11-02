import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { bootstrapFailureMessage, createInitialOwner } from './bootstrap-owner';
import { canonicalEmail } from './email';

function fakeDb(options: { connectFails?: boolean; releaseFails?: boolean; existing?: number; lock?: number } = {}) {
  const calls: string[] = [];
  const runner = {
    isTransactionActive: false,
    async connect() { calls.push('connect'); if (options.connectFails) throw new Error('private connection details'); },
    async query(sql: string) {
      if (sql.startsWith('SELECT GET_LOCK')) { calls.push('lock'); return [{ acquired: options.lock ?? 1 }]; }
      if (sql.startsWith('SELECT COUNT')) { calls.push('count'); return [{ count: options.existing ?? 0 }]; }
      if (sql.startsWith('INSERT')) { calls.push('insert'); return []; }
      if (sql.startsWith('SELECT RELEASE_LOCK')) { calls.push('unlock'); return []; }
      throw new Error('Unexpected query');
    },
    async startTransaction() { calls.push('start'); this.isTransactionActive = true; },
    async commitTransaction() { calls.push('commit'); this.isTransactionActive = false; },
    async rollbackTransaction() { calls.push('rollback'); this.isTransactionActive = false; },
    async release() { calls.push('release'); if (options.releaseFails) throw new Error('private driver failure'); },
  };
  const db = { async initialize() { calls.push('initialize'); }, createQueryRunner() { return runner; }, async destroy() { calls.push('destroy'); } } as unknown as DataSource;
  return { db, calls };
}

test('normalizes email before bootstrap and refuses invalid or noncanonical identifiers', async () => {
  const email = canonicalEmail(' OWNER@EXAMPLE.TEST ');
  assert.equal(email, 'owner@example.test');
  const f = fakeDb();
  await createInitialOwner(f.db, email!, 'hashed-value');
  assert.deepEqual(f.calls, ['initialize', 'connect', 'lock', 'start', 'count', 'insert', 'commit', 'unlock', 'release', 'destroy']);
  const invalid = fakeDb();
  await assert.rejects(createInitialOwner(invalid.db, 'OWNER@example.test', 'hashed-value'));
  assert.deepEqual(invalid.calls, []);
});

test('refuses an existing administrator and closes the pool after a failed connection', async () => {
  const existing = fakeDb({ existing: 1 });
  await assert.rejects(createInitialOwner(existing.db, 'owner@example.test', 'hashed-value'));
  assert.deepEqual(existing.calls, ['initialize', 'connect', 'lock', 'start', 'count', 'rollback', 'unlock', 'release', 'destroy']);
  const failed = fakeDb({ connectFails: true });
  await assert.rejects(createInitialOwner(failed.db, 'owner@example.test', 'hashed-value'));
  assert.deepEqual(failed.calls, ['initialize', 'connect', 'release', 'destroy']);
  const releaseFailed = fakeDb({ connectFails: true, releaseFails: true });
  await assert.rejects(createInitialOwner(releaseFailed.db, 'owner@example.test', 'hashed-value'));
  assert.deepEqual(releaseFailed.calls, ['initialize', 'connect', 'release', 'destroy']);
  const locked = fakeDb({ lock: 0 });
  await assert.rejects(createInitialOwner(locked.db, 'owner@example.test', 'hashed-value'));
  assert.deepEqual(locked.calls, ['initialize', 'connect', 'lock', 'release', 'destroy']);
  assert.doesNotMatch(bootstrapFailureMessage, /private|owner@example|password|hashed-value/i);
});
