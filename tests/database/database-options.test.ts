import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseOptions } from '../../src/infrastructure/database/database-options';

test('requires complete MariaDB configuration and never synchronizes schema', () => {
  const original = { ...process.env };
  try {
    delete process.env.DB_HOST;
    assert.throws(() => databaseOptions(), /DB_HOST/);
    Object.assign(process.env, {
      DB_HOST: 'localhost', DB_PORT: '3306', DB_USERNAME: 'dev',
      DB_PASSWORD: 'example', DB_DATABASE: 'store',
    });
    assert.equal(databaseOptions().synchronize, false);
    assert.equal(databaseOptions().type, 'mariadb');
    process.env.DB_PORT = '70000';
    assert.throws(() => databaseOptions(), /DB_PORT/);
  } finally {
    process.env = original;
  }
});
