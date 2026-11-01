import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createZipnovaTransport } from './zipnova-transport';
import { serializeZipnovaQuote } from './zipnova';

const config = { accountId: 4, originId: 8, source: 'test', currency: 'ARS', exponent: 2 };
const payload = serializeZipnovaQuote({ destination: { country: 'AR', postalCode: '7600', city: 'Mar del Plata', state: 'Buenos Aires' }, declaredValue: 5, packages: [{ widthMm: 100, heightMm: 100, lengthMm: 100, weightGrams: 100, classificationId: '1' }] }, config);

test('transport is disabled by default and rejects incomplete or invalid configuration', () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async () => { calls++; throw new Error('not called'); };
  assert.equal(createZipnovaTransport({}, fakeFetch), undefined);
  assert.throws(() => createZipnovaTransport({ ZIPNOVA_ENABLED: 'true' }, fakeFetch));
  assert.throws(() => createZipnovaTransport({ ZIPNOVA_ENABLED: 'yes' }, fakeFetch));
  assert.throws(() => createZipnovaTransport({ ZIPNOVA_ENABLED: 'true', ZIPNOVA_API_TOKEN: 'a:b', ZIPNOVA_API_SECRET: 'c' }, fakeFetch));
  assert.equal(calls, 0);
});

test('when explicitly enabled, only posts a quote to the fixed endpoint with basic authentication', async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.zipnova.com.ar/v2/shipments/quote');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), `Basic ${Buffer.from('test-token:test-secret').toString('base64')}`);
    assert.equal(headers.get('content-type'), 'application/json');
    assert.deepEqual(JSON.parse(String(init?.body)), payload);
    return new Response(JSON.stringify({ all_results: [] }), { status: 200 });
  };
  const transport = createZipnovaTransport({ ZIPNOVA_ENABLED: 'true', ZIPNOVA_API_TOKEN: 'test-token', ZIPNOVA_API_SECRET: 'test-secret' }, fakeFetch);
  assert.ok(transport);
  assert.equal(calls, 0);
  assert.deepEqual(await transport(payload), { status: 200, body: { all_results: [] } });
  assert.equal(calls, 1);
});

test('rejects oversized or malformed successful responses', async () => {
  const env = { ZIPNOVA_ENABLED: 'true', ZIPNOVA_API_TOKEN: 'test-token', ZIPNOVA_API_SECRET: 'test-secret' };
  for (const body of ['{', 'x'.repeat(1024 * 1024 + 1)]) {
    const transport = createZipnovaTransport(env, async () => new Response(body, { status: 200 }));
    assert.ok(transport);
    assert.deepEqual(await transport(payload), { status: 200, body: null });
  }
});
