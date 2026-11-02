import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createZipnovaTransport } from './zipnova-transport';
import { parseZipnovaQuote, serializeZipnovaQuote } from './zipnova';

const config = { accountId: 4, originId: 8, source: 'test', currency: 'ARS', exponent: 2 };
const payload = serializeZipnovaQuote({ destination: { country: 'AR', postalCode: '7600', city: 'Mar del Plata', state: 'Buenos Aires' }, declaredValue: 5, packages: [{ widthMm: 100, heightMm: 100, lengthMm: 100, weightGrams: 100, classificationId: '1' }] }, config);

test('bounds provider concurrency when hundreds of requests arrive together', async () => {
  const env = { ZIPNOVA_ENABLED: 'true', ZIPNOVA_API_TOKEN: 'test-token', ZIPNOVA_API_SECRET: 'test-secret' };
  let calls = 0; const releases: (() => void)[] = [];
  const fakeFetch: typeof fetch = async () => { calls++; await new Promise<void>(resolve => releases.push(resolve)); return new Response('{"all_results":[]}', { status: 200 }); };
  const transport = createZipnovaTransport(env, fakeFetch)!;
  const pending = Array.from({ length: 501 }, () => transport(payload));
  await new Promise(resolve => setImmediate(resolve));
  const started = calls;
  releases.forEach(resolve => resolve());
  const results = await Promise.all(pending);
  assert.equal(started, 2);
  assert.equal(results.filter(result => result.status === 200).length, 2);
  assert.equal(results.filter(result => result.status === 429).length, 499);
});

test('honors Retry-After and limits the local request budget', async () => {
  const env = { ZIPNOVA_ENABLED: 'true', ZIPNOVA_API_TOKEN: 'test-token', ZIPNOVA_API_SECRET: 'test-secret' };
  let calls = 0; let now = 1700000000000;
  const fakeFetch: typeof fetch = async () => { calls++; return calls === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '120' } }) : new Response('{"all_results":[]}', { status: 200 }); };
  const transport = createZipnovaTransport(env, fakeFetch, () => now)!;
  assert.equal((await transport(payload)).status, 429);
  now += 119999;
  assert.equal((await transport(payload)).status, 429);
  assert.equal(calls, 1);
  now++;
  assert.equal((await transport(payload)).status, 200);
  for (let i = 0; i < 9; i++) assert.equal((await transport(payload)).status, 200);
  assert.equal((await transport(payload)).status, 429);
  assert.equal(calls, 11);
});

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

test('preserves the original JSON monetary digits even when Number would round them', async () => {
  const env = { ZIPNOVA_ENABLED: 'true', ZIPNOVA_API_TOKEN: 'test-token', ZIPNOVA_API_SECRET: 'test-secret' };
  const body = '{"all_results":[{"selectable":true,"impediments":null,"logistic_type":"carrier_dropoff","carrier":{"id":1,"name":"Correo"},"service_type":{"code":"standard_delivery","name":"Domicilio"},"amounts":{"price_incl_tax":70368744177664.01}}]}';
  const transport = createZipnovaTransport(env, async () => new Response(body, { status: 200 }));
  assert.ok(transport);
  const response = await transport(payload);
  assert.equal(parseZipnovaQuote(response.body, config)[0].amountMinor, '7036874417766401');
});

test('cancels error response streams for each unsuccessful status', async () => {
  const env = { ZIPNOVA_ENABLED: 'true', ZIPNOVA_API_TOKEN: 'test-token', ZIPNOVA_API_SECRET: 'test-secret' };
  for (const status of [401, 403, 422, 429, 500]) {
    let cancelled = false;
    const stream = new ReadableStream({ cancel() { cancelled = true; } });
    const transport = createZipnovaTransport(env, async () => new Response(stream, { status }));
    assert.ok(transport);
    assert.deepEqual(await transport(payload), { status, body: null });
    assert.equal(cancelled, true);
  }
});
