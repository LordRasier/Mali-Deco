import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guardPool, type Lease, type Pool } from '../../src/infrastructure/database/strict-pool';

function fixture(failAt?: 'set' | 'verify' | 'disabled' | 'non-strict') {
  const calls: string[] = [];
  let destroyed = 0;
  const lease: Lease = {
    query(sql, callback) {
      calls.push(sql);
      if (failAt === (sql.startsWith('SET') ? 'set' : 'verify')) return callback(new Error('failed'));
      callback(null, [{ checks: failAt === 'disabled' ? 0 : 1, mode: failAt === 'non-strict' ? '' : 'STRICT_TRANS_TABLES' }]);
    },
    destroy() { destroyed++; },
  };
  const pool: Pool = { getConnection(callback) { callback(null, lease); } };
  guardPool(pool);
  const acquire = () => new Promise<Lease>((resolve, reject) => pool.getConnection((error, connection) => error ? reject(error) : resolve(connection!)));
  return { calls, acquire, destroyed: () => destroyed };
}

test('every pool checkout sets and verifies strict mode and enabled checks before delivery', async () => {
  const f = fixture();
  await f.acquire(); await f.acquire();
  assert.equal(f.calls.length, 4);
  assert.match(f.calls[0], /^SET SESSION sql_mode/);
  assert.match(f.calls[1], /check_constraint_checks/);
  assert.equal(f.destroyed(), 0);
});

test('failed setup or invalid safety settings destroy the connection and fail closed', async () => {
  for (const reason of ['set', 'verify', 'disabled', 'non-strict'] as const) {
    const f = fixture(reason);
    await assert.rejects(f.acquire());
    assert.equal(f.destroyed(), 1);
  }
});

test('unsupported pool shapes and synchronous driver errors fail closed', async () => {
  assert.throws(() => guardPool({} as Pool), /Unsupported/);
  let destroyed = false;
  const pool: Pool = { getConnection(callback) { callback(null, { query() { throw new Error('driver error'); }, destroy() { destroyed = true; } }); } };
  guardPool(pool);
  await assert.rejects(new Promise((resolve, reject) => pool.getConnection((error, connection) => error ? reject(error) : resolve(connection))));
  assert.equal(destroyed, true);
});

test('pool acquisition errors never yield a connection', async () => {
  const pool: Pool = { getConnection(callback) { callback(new Error('offline')); } };
  guardPool(pool);
  await assert.rejects(new Promise((resolve, reject) => pool.getConnection((error, connection) => error ? reject(error) : resolve(connection))), /offline/);
});
