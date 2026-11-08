import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function run(env) {
  return spawnSync(process.execPath, ['--import', './scripts/migration-local-root.mjs', '-e', 'console.log(JSON.stringify({user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,optIn:process.env.DB_ALLOW_EMPTY_PASSWORD,database:process.env.DB_DATABASE}))'], {
    encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', NODE_ENV: 'development', DB_HOST: '127.0.0.1', DB_USERNAME: 'example_app', DB_PASSWORD: 'synthetic-password', DB_DATABASE: 'example_local', ...env },
  });
}

test('local migration credentials are process-scoped and preserve the selected database', () => {
  const result = run({});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { user: 'root', password: '', optIn: '1', database: 'example_local' });
});

test('local passwordless migration refuses production, missing environment and non-loopback hosts', () => {
  for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: '' }, { DB_HOST: 'localhost' }, { DB_HOST: 'db.example' }]) {
    const result = run(env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requiere NODE_ENV=development y DB_HOST=127\.0\.0\.1/);
    assert.equal(result.stdout, '');
  }
});
import process from 'node:process';

