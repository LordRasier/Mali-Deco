import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test, type TestContext } from 'node:test';
import { emailConfig, emailReadiness, loadLocalEmailCredentials, publicEmailConfig } from './email-config';

function keyFile(t: TestContext, content: string) {
  const directory = mkdtempSync(join(tmpdir(), 'mali-email-key-'));
  const path = join(directory, 'envialosimple');
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o600 });
  t.after(() => { unlinkSync(path); rmdirSync(directory); });
  return path;
}

test('production loads an explicit raw key file and makes the test-email configuration ready', t => {
  const path = keyFile(t, 'synthetic-file-key\r\n');
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', ENVIALOSIMPLE_API_KEY_FILE: relative(process.cwd(), path),
    ENVIALOSIMPLE_API_KEY: '', ORDER_EMAIL_MODE: 'test', ORDER_EMAIL_FROM: 'pedidos@mali-store.com.ar',
    ORDER_EMAIL_TEST_TO: 'owner@example.test', ORDER_EMAIL_SITE_URL: 'https://mali-store.com.ar' };
  loadLocalEmailCredentials(env);
  const config = emailConfig(env);
  assert.equal(config.apiKey, 'synthetic-file-key');
  assert.equal(emailReadiness(config), '');
  assert.equal(config.mode, 'test');
  assert.doesNotMatch(JSON.stringify(publicEmailConfig(config)), /synthetic-file-key|apiKey|API_KEY_FILE/);
});

test('development still loads absolute key paths without changing the email mode', t => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'development', ENVIALOSIMPLE_API_KEY_FILE: keyFile(t, 'synthetic-dev-key\n') };
  loadLocalEmailCredentials(env);
  assert.equal(emailConfig(env).apiKey, 'synthetic-dev-key');
  assert.equal(emailConfig(env).mode, 'disabled');
});

test('an explicit process key takes precedence without reading the configured file', t => {
  const env = { NODE_ENV: 'production', ENVIALOSIMPLE_API_KEY: 'synthetic-process-key',
    ENVIALOSIMPLE_API_KEY_FILE: keyFile(t, 'invalid key content') };
  loadLocalEmailCredentials(env);
  assert.equal(env.ENVIALOSIMPLE_API_KEY, 'synthetic-process-key');
});

test('a missing explicit file fails without exposing its private path or filesystem cause', t => {
  const path = keyFile(t, 'synthetic-key');
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', ENVIALOSIMPLE_API_KEY_FILE: path + '-missing' };
  assert.throws(() => loadLocalEmailCredentials(env), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Unable to load EnvialoSimple API key file');
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(env.ENVIALOSIMPLE_API_KEY, undefined);
});

test('empty or multiline key files fail without importing any other environment settings', t => {
  for (const content of ['', ' \r\n ', 'synthetic-secret\nORDER_EMAIL_MODE=live', 'synthetic secret']) {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', ENVIALOSIMPLE_API_KEY_FILE: keyFile(t, content), ORDER_EMAIL_MODE: 'test' };
    assert.throws(() => loadLocalEmailCredentials(env), error => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /synthetic-secret|synthetic secret|ORDER_EMAIL_MODE/);
      return true;
    });
    assert.equal(env.ENVIALOSIMPLE_API_KEY, undefined);
    assert.equal(env.ORDER_EMAIL_MODE, 'test');
  }
});

test('without an explicit file the loader leaves the environment untouched', () => {
  const env = { NODE_ENV: 'production', ORDER_EMAIL_MODE: 'disabled' };
  loadLocalEmailCredentials(env);
  assert.deepEqual(env, { NODE_ENV: 'production', ORDER_EMAIL_MODE: 'disabled' });
});
