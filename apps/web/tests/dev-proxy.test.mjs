import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function readRewrites(env) {
  return spawnSync(globalThis.process.execPath, ['--input-type=module', '-e',
    "import config from './next.config.mjs'; console.log(JSON.stringify(await config.rewrites()))"], {
    cwd: new globalThis.URL('..', import.meta.url),
    encoding: 'utf8',
    env: { ...globalThis.process.env, ...env },
  });
}

test('development proxy uses only the configured canonical origin', () => {
  const result = readRewrites({ NODE_ENV: 'development', DEV_API_PROXY_ORIGIN: 'http://localhost:3001' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [{ source: '/api/v1/:path*', destination: 'http://localhost:3001/api/v1/:path*' }]);
});

test('production never installs a rewrite', () => {
  const result = readRewrites({ NODE_ENV: 'production', DEV_API_PROXY_ORIGIN: 'not-an-origin' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

test('development rejects paths, credentials and noncanonical origins', () => {
  for (const origin of ['http://localhost:3001/api/v1', 'http://user:pass@localhost:3001', 'http://localhost:3001/', 'ftp://localhost:3001']) {
    assert.notEqual(readRewrites({ NODE_ENV: 'development', DEV_API_PROXY_ORIGIN: origin }).status, 0, origin);
  }
});
