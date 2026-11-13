import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalPaymentCredentials } from './local-credentials';

test('explicit private payment file loads only missing secrets in development and production', () => {
  const folder = mkdtempSync(join(tmpdir(), 'mali-payment-credentials-')), file = join(folder, 'fixture.env');
  writeFileSync(file, 'MERCADOPAGO_TEST_ACCESS_TOKEN=fixture\nMERCADOPAGO_WEBHOOK_SECRET=fixture-secret\nMERCADOPAGO_TEST_SELLER_ID=999\nDB_PASSWORD=untrusted\n');
  try {
    const env: NodeJS.ProcessEnv = { npm_lifecycle_event:'dev',NODE_ENV:'development',MERCADOPAGO_TEST_ENABLED:'true',MERCADOPAGO_ENV_FILE:file };
    loadLocalPaymentCredentials(env); assert.equal(env.MERCADOPAGO_TEST_ACCESS_TOKEN,'fixture'); assert.equal(env.MERCADOPAGO_TEST_SELLER_ID,undefined); assert.equal(env.DB_PASSWORD,undefined);
    env.MERCADOPAGO_TEST_ACCESS_TOKEN='exported'; loadLocalPaymentCredentials(env); assert.equal(env.MERCADOPAGO_TEST_ACCESS_TOKEN,'exported');
    for(const change of [{NODE_ENV:'production'},{npm_lifecycle_event:'start'},{MERCADOPAGO_TEST_ENABLED:'false'}]) {
      const configured = {...env,...change, MERCADOPAGO_TEST_ACCESS_TOKEN: undefined};
      loadLocalPaymentCredentials(configured); assert.equal(configured.MERCADOPAGO_TEST_ACCESS_TOKEN, 'fixture');
      assert.throws(()=>loadLocalPaymentCredentials({...env,...change,MERCADOPAGO_ENV_FILE:'missing-file'}), /Unable to load/);
    }
    assert.doesNotThrow(() => loadLocalPaymentCredentials({NODE_ENV:'production'}));
    assert.equal(env.MERCADOPAGO_TEST_WEBHOOK_SECRET, undefined); // Never fall back to the live secret.
  } finally {unlinkSync(file);rmdirSync(folder);}
});

test('credential diagnostics expose precedence and conflicts without revealing values or paths', () => {
  const folder = mkdtempSync(join(tmpdir(), 'mali-payment-sources-')), file = join(folder, 'fixture.env');
  writeFileSync(file, 'MERCADOPAGO_ACCESS_TOKEN=private-token\nMERCADOPAGO_TEST_ACCESS_TOKEN=test-private-token\nMERCADOPAGO_WEBHOOK_SECRET=same-private-secret\n');
  try {
    for (const existing of ['exported-token', '']) {
      const env = { MERCADOPAGO_ENV_FILE: file, MERCADOPAGO_ACCESS_TOKEN: existing, MERCADOPAGO_WEBHOOK_SECRET: 'same-private-secret' };
      const sources = loadLocalPaymentCredentials(env);
      assert.equal(env.MERCADOPAGO_ACCESS_TOKEN, existing);
      assert.deepEqual(sources.find(item => item.key === 'MERCADOPAGO_ACCESS_TOKEN'), { key: 'MERCADOPAGO_ACCESS_TOKEN', source: 'environment', privateFileConflict: true });
      assert.deepEqual(sources.find(item => item.key === 'MERCADOPAGO_TEST_ACCESS_TOKEN'), { key: 'MERCADOPAGO_TEST_ACCESS_TOKEN', source: 'private_file', privateFileConflict: false });
      assert.deepEqual(sources.find(item => item.key === 'MERCADOPAGO_WEBHOOK_SECRET'), { key: 'MERCADOPAGO_WEBHOOK_SECRET', source: 'environment', privateFileConflict: false });
      assert.deepEqual(sources.find(item => item.key === 'MERCADOPAGO_TEST_WEBHOOK_SECRET'), { key: 'MERCADOPAGO_TEST_WEBHOOK_SECRET', source: 'missing', privateFileConflict: false });
      for (const secret of ['private-token', 'exported-token', 'test-private-token', 'same-private-secret', file]) assert.equal(JSON.stringify(sources).includes(secret), false);
    }
    assert.ok(loadLocalPaymentCredentials({}).every(item => item.source === 'missing' && !item.privateFileConflict));
  } finally { unlinkSync(file); rmdirSync(folder); }
});
