import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { ServiceUnavailableException } from '@nestjs/common';
import { paymentProbe } from './payment-probe';
import { PaymentRegistry } from './payment-registry';

const url = 'https://api.mercadopago.com/users/me';
const requestId = '12345678-1234-1234-1234-123456789abc';

test('probe extracts allowlisted policy codes and UUID without consuming the provider response', async () => {
  const data = { code: 'PA_UNAUTHORIZED_RESULT_FROM_POLICIES', error: 'forbidden', message: 'private-secret',
    cause: [{ code: 'invalid_scope' }, { code: 'private-secret' }], access_token: 'private-secret' };
  let calls = 0;
  const probe = paymentProbe(async () => { calls++; return Response.json(data, { status: 403, headers: { 'x-request-id': requestId } }); });
  const response = await probe.request(url, { method: 'GET' });
  assert.deepEqual(await response.json(), data); assert.equal(calls, 1);
  assert.deepEqual(probe.responses, [{ endpoint: `GET ${url}`, status: 403,
    codes: ['PA_UNAUTHORIZED_RESULT_FROM_POLICIES', 'forbidden', 'invalid_scope'], requestId, body: 'json' }]);
  assert.equal(JSON.stringify(probe.responses).includes('private-secret'), false);
});

test('probe hides arbitrary bodies, headers and personal information, and cannot perform writes', async () => {
  const secret = 'APP_USR-private-secret';
  for (const reply of [
    () => Response.json({ code: secret, message: secret, error: secret, cause: [{ code: secret }] }, { status: 403, headers: { 'x-request-id': secret } }),
    () => new Response('<html>' + secret + '</html>', { status: 403 }),
    () => Response.json({ id: 123, email: 'private@example.test', access_token: secret }),
  ]) {
    let calls = 0;
    const probe = paymentProbe(async () => { calls++; return reply(); });
    await probe.request(url, { method: 'GET' });
    assert.equal(probe.responses[0].codes.length, 0);
    assert.equal(probe.responses[0].requestId, undefined);
    assert.doesNotMatch(JSON.stringify(probe.responses), /APP_USR|private@example|<html>/);
    await assert.rejects(probe.request(url, { method: 'POST', body: '{}' }));
    await assert.rejects(probe.request('https://api.mercadopago.com/v1/payments', { method: 'GET' }));
    assert.equal(calls, 1);
  }
});

test('additional diagnostic details never turn a provider rejection into a verified account', async () => {
  const env = { NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://example.test', MERCADOPAGO_SELLER_ID: '123',
    MERCADOPAGO_ACCESS_TOKEN: 'fixture-token', MERCADOPAGO_WEBHOOK_SECRET: 'fixture-webhook-secret' };
  const probe = paymentProbe(async () => Response.json({ code: 'PA_UNAUTHORIZED_RESULT_FROM_POLICIES' }, { status: 403 }));
  await assert.rejects(new PaymentRegistry(env, probe.request).verify('production'), error => {
    assert.ok(error instanceof ServiceUnavailableException);
    const body = error.getResponse() as { reason: string; writeOccurred: boolean };
    assert.equal(body.reason, 'provider_http_403'); assert.equal(body.writeOccurred, false); return true;
  });
  assert.deepEqual(probe.responses[0].codes, ['PA_UNAUTHORIZED_RESULT_FROM_POLICIES']);
});

test('CLI all diagnoses both accounts without real network access or leaking credentials', () => {
  const mock = `globalThis.fetch = async (url, init) => {
    if (url !== '${url}' || init.method !== 'GET') throw Error('Unexpected request');
    return init.headers.Authorization === 'Bearer live-fixture-token'
      ? Response.json({ code: 'PA_UNAUTHORIZED_RESULT_FROM_POLICIES', message: 'private-provider-message' }, { status: 403 })
      : Response.json({ id: 456, site_id: 'MLA', tags: ['test_user'] });
  };`;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--import', 'data:text/javascript,' + encodeURIComponent(mock), 'scripts/check-payments.ts', 'all'], {
    encoding: 'utf8', timeout: 15000, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://example.test', MERCADOPAGO_SELLER_ID: '123',
      MERCADOPAGO_ACCESS_TOKEN: 'live-fixture-token', MERCADOPAGO_WEBHOOK_SECRET: 'live-fixture-secret',
      MERCADOPAGO_TEST_SELLER_ID: '456', MERCADOPAGO_TEST_ACCESS_TOKEN: 'test-fixture-token', MERCADOPAGO_TEST_WEBHOOK_SECRET: 'test-fixture-secret' },
  });
  assert.equal(child.error, undefined); assert.equal(child.status, 1, child.stderr);
  for (const expected of ['Diagnóstico v2', 'production', 'test', 'verificado', 'provider_http_403', 'PA_UNAUTHORIZED_RESULT_FROM_POLICIES', 'entorno/.env']) assert.ok(child.stdout.includes(expected), expected);
  for (const secret of ['live-fixture-token', 'test-fixture-token', 'live-fixture-secret', 'test-fixture-secret', 'private-provider-message']) assert.equal((child.stdout + child.stderr).includes(secret), false);
});
