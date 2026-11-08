import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadLocalZipnovaCredentials } from './local-credentials';

test('explicit local estimates load only credentials, never activation, checkout or database settings', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mali-zipnova-env-'));
  try {
    const path = join(directory, 'private.env');
    writeFileSync(path, 'ZIPNOVA_API_TOKEN=synthetic-token\nZIPNOVA_API_SECRET=synthetic-secret\nZIPNOVA_ENABLED=false\nLOCAL_TEST_CHECKOUT_ENABLED=true\nDB_HOST=untrusted.invalid\n');
    const env = { npm_lifecycle_event: 'dev', NODE_ENV: 'development', ZIPNOVA_ENABLED: 'true', ZIPNOVA_ENV_FILE: path, LOCAL_TEST_CHECKOUT_ENABLED: 'false' };
    loadLocalZipnovaCredentials(env);
    assert.deepEqual(env, { npm_lifecycle_event: 'dev', NODE_ENV: 'development', ZIPNOVA_ENABLED: 'true', ZIPNOVA_ENV_FILE: path,
      LOCAL_TEST_CHECKOUT_ENABLED: 'false', ZIPNOVA_API_TOKEN: 'synthetic-token', ZIPNOVA_API_SECRET: 'synthetic-secret' });
    const explicit = { ...env, ZIPNOVA_API_TOKEN: 'explicit-token', ZIPNOVA_API_SECRET: 'explicit-secret' };
    loadLocalZipnovaCredentials(explicit);
    assert.equal(explicit.ZIPNOVA_API_TOKEN, 'explicit-token');
    assert.equal(explicit.ZIPNOVA_API_SECRET, 'explicit-secret');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('disabled providers, tests, production and direct starts never read the private file', () => {
  const enabled = { npm_lifecycle_event: 'dev', NODE_ENV: 'development', ZIPNOVA_ENABLED: 'true', ZIPNOVA_ENV_FILE: 'missing-private.env' };
  for (const override of [{ ZIPNOVA_ENABLED: 'false' }, { ZIPNOVA_ENABLED: undefined }, { NODE_ENV: 'test' }, { NODE_ENV: 'production' }, { NODE_ENV: undefined }, { npm_lifecycle_event: undefined }, { ZIPNOVA_ENV_FILE: undefined }]) {
    const env = { ...enabled, ...override }, before = { ...env };
    assert.doesNotThrow(() => loadLocalZipnovaCredentials(env));
    assert.deepEqual(env, before);
  }
});

test('an explicitly configured missing private file fails without leaking its path', () => {
  assert.throws(() => loadLocalZipnovaCredentials({ npm_lifecycle_event: 'dev', NODE_ENV: 'development', ZIPNOVA_ENABLED: 'true', ZIPNOVA_ENV_FILE: 'missing-private.env' }),
    { message: 'Unable to load local Zipnova credentials' });
});
