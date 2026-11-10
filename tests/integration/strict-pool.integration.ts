import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseOptions } from '../../src/infrastructure/database/database-options';
import { StrictDataSource } from '../../src/infrastructure/database/strict-data-source';

test('real pooled connections enforce session safety on creation and reuse', {
  skip: process.env.MARIADB_POOL_INTEGRATION !== '1' ? 'requires the explicitly authorized local development database' : false,
}, async () => {
  if (process.env.DB_HOST !== '127.0.0.1' || process.env.DB_DATABASE !== 'mali_local_development') throw new Error('Unexpected integration target');
  const options = databaseOptions();
  if (options.type !== 'mariadb') throw new Error('Unexpected database driver');
  const db = new StrictDataSource({ ...options, poolSize: 2 });
  await db.initialize();
  const first = db.createQueryRunner();
  const second = db.createQueryRunner();
  try {
    await Promise.all([first.connect(), second.connect()]);
    const state = 'SELECT CONNECTION_ID() AS id, @@SESSION.sql_mode AS mode, @@SESSION.check_constraint_checks AS checks';
    const [[a], [b]] = await Promise.all([first.query(state), second.query(state)]);
    assert.notEqual(a.id, b.id);
    for (const value of [a, b]) {
      assert.match(value.mode, /STRICT_(?:TRANS|ALL)_TABLES/);
      assert.equal(Number(value.checks), 1);
    }
    await first.query("SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'");
    await first.release();
    const reused = db.createQueryRunner();
    await reused.connect();
    const [restored] = await reused.query(state);
    assert.equal(restored.id, a.id);
    assert.match(restored.mode, /STRICT_(?:TRANS|ALL)_TABLES/);
    await reused.query('SET SESSION check_constraint_checks = 0');
    await reused.release();
    const unsafe = db.createQueryRunner();
    await assert.rejects(unsafe.connect(), /session safety validation failed/);
    const replacement = db.createQueryRunner();
    await replacement.connect();
    const [safe] = await replacement.query(state);
    assert.notEqual(safe.id, a.id);
    assert.equal(Number(safe.checks), 1);
    assert.match(safe.mode, /STRICT_(?:TRANS|ALL)_TABLES/);
    await replacement.release();
  } finally {
    await first.release();
    await second.release();
    await db.destroy();
  }
});
