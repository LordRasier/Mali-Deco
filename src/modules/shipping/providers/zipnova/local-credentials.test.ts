import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { loadZipnovaEnvironment } from './local-credentials';
import { pendingShippingService } from '../../quotes/catalog-quote';

const settings = {
  ZIPNOVA_ENABLED: 'true', ZIPNOVA_CURRENCY: 'ARS', ZIPNOVA_CURRENCY_EXPONENT: '2',
  ZIPNOVA_API_TOKEN: 'synthetic-token', ZIPNOVA_API_SECRET: 'synthetic-secret',
  ZIPNOVA_ACCOUNT_ID: '4', ZIPNOVA_ORIGIN_ID: '8', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000',
};
const fixture = (run: (path: string) => void) => {
  const directory = mkdtempSync(join(tmpdir(), 'mali-zipnova-env-'));
  try {
    const path = join(directory, 'private.env');
    const content = Object.entries(settings).map(([key, value]) => `${key}=${value}`).join('\n');
    writeFileSync(path, content + '\nNODE_ENV=untrusted\nPUBLIC_SITE_URL=https://untrusted.invalid\nDB_HOST=untrusted.invalid\nMERCADOPAGO_ACCESS_TOKEN=untrusted\nLOCAL_TEST_CHECKOUT_ENABLED=true\nZIPNOVA_ENV_FILE=untrusted.env\n');
    run(path);
  } finally { rmSync(directory, { recursive: true, force: true }); }
};

test('an explicit provider file configures production and direct development starts without network or unrelated settings', () => {
  fixture(path => {
    for (const nodeEnv of ['production', 'development']) {
      const env: NodeJS.ProcessEnv = { NODE_ENV: nodeEnv, PUBLIC_SITE_URL: 'https://store.example', ZIPNOVA_ENV_FILE: path };
      loadZipnovaEnvironment(env);
      assert.deepEqual(env, { NODE_ENV: nodeEnv, PUBLIC_SITE_URL: 'https://store.example', ZIPNOVA_ENV_FILE: path, ...settings });
      const provider = pendingShippingService(undefined, env, async () => { throw Error('Network prohibited'); });
      assert.equal(provider.unavailableReason(), null);
    }
  });
});

test('relative explicit file paths resolve from the process working directory', () => {
  fixture(path => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', ZIPNOVA_ENV_FILE: relative(process.cwd(), path) };
    loadZipnovaEnvironment(env);
    assert.equal(env.ZIPNOVA_API_TOKEN, settings.ZIPNOVA_API_TOKEN);
    assert.equal(env.ZIPNOVA_ACCOUNT_ID, settings.ZIPNOVA_ACCOUNT_ID);
  });
});

test('existing process configuration wins for every permitted key, including disabled and empty values', () => {
  fixture(path => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', ZIPNOVA_ENV_FILE: path,
      ...Object.fromEntries(Object.keys(settings).map(key => [key, 'existing-value'])),
      ZIPNOVA_ENABLED: 'false', ZIPNOVA_API_TOKEN: '', PUBLIC_SITE_URL: 'https://store.example' };
    const before = { ...env };
    loadZipnovaEnvironment(env);
    assert.deepEqual(env, before);
    assert.equal(pendingShippingService(undefined, env).unavailableReason(), 'DISABLED');
  });
});

test('missing or blank required provider configuration stays unavailable after loading', () => {
  fixture(path => {
    for (const key of ['ZIPNOVA_API_TOKEN', 'ZIPNOVA_API_SECRET', 'ZIPNOVA_ACCOUNT_ID', 'ZIPNOVA_ORIGIN_ID', 'ZIPNOVA_CURRENCY', 'ZIPNOVA_CURRENCY_EXPONENT']) {
      const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://store.example', ZIPNOVA_ENV_FILE: path, [key]: '' };
      loadZipnovaEnvironment(env);
      assert.equal(pendingShippingService(undefined, env).unavailableReason(), 'CONFIG_UNAVAILABLE', key);
    }
    writeFileSync(path, 'ZIPNOVA_ENABLED=true\nZIPNOVA_API_TOKEN=synthetic-token\n');
    const incomplete: NodeJS.ProcessEnv = { NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://store.example', ZIPNOVA_ENV_FILE: path };
    loadZipnovaEnvironment(incomplete);
    assert.equal(pendingShippingService(undefined, incomplete).unavailableReason(), 'CONFIG_UNAVAILABLE');
  });
});

test('no private file is discovered or loaded unless a path was explicitly configured', () => {
  for (const nodeEnv of ['development', 'production', 'test']) {
    const env: NodeJS.ProcessEnv = { NODE_ENV: nodeEnv };
    loadZipnovaEnvironment(env);
    assert.deepEqual(env, { NODE_ENV: nodeEnv });
  }
});

test('an unreadable explicitly configured file fails startup without leaking its path', () => {
  fixture(path => {
    assert.throws(() => loadZipnovaEnvironment({ NODE_ENV: 'production', ZIPNOVA_ENV_FILE: path + '.missing' }),
      { message: 'Unable to load Zipnova configuration file' });
  });
});
