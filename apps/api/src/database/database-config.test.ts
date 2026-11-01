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

test('passwordless access requires explicit development opt-in and literal IPv4 loopback', () => {
  const base = { NODE_ENV: 'development', DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_USERNAME: 'root', DB_PASSWORD: '', DB_DATABASE: 'store', DB_ALLOW_EMPTY_PASSWORD: '1' };
  assert.equal(validateDatabaseConfig(base).password, '');
  for (const changes of [{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { NODE_ENV: '' }, { DB_HOST: 'localhost' }, { DB_HOST: '192.168.1.10' }, { DB_ALLOW_EMPTY_PASSWORD: '0' }, { DB_PASSWORD: undefined }]) {
    assert.throws(() => validateDatabaseConfig({ ...base, ...changes }));
  }
  assert.equal(validateDatabaseConfig({ ...base, DB_PASSWORD: 'a-password', DB_HOST: 'db.example', NODE_ENV: 'production' }).password, 'a-password');
});
