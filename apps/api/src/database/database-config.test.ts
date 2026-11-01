import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDatabaseConfig } from './database-config';

test('rejects malformed or incomplete MariaDB configuration', () => {
  const valid = { DB_HOST: 'localhost', DB_PORT: '3306', DB_USERNAME: 'dev', DB_PASSWORD: 'example', DB_DATABASE: 'store' };
  assert.deepEqual(validateDatabaseConfig(valid), {
    host: 'localhost', port: 3306, username: 'dev', password: 'example', database: 'store',
  });
  for (const DB_PORT of ['0', '1.5', '65536', 'nope']) {
    assert.throws(() => validateDatabaseConfig({ ...valid, DB_PORT }));
  }
  for (const key of ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'] as const) {
    assert.throws(() => validateDatabaseConfig({ ...valid, [key]: '' }));
  }
});
