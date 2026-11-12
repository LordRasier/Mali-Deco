import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import type { DataSource } from 'typeorm';
import { CheckoutQuoteService, pendingCheckoutQuoteService, type QuoteSnapshot } from './quote';
import { PostalCodeResolver } from '../../shipping/postal/postal-code-resolver';
import type { ShippingOptionsResult } from '../../shipping/providers/zipnova/zipnova-provider';
const env = { NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true' };
const destination = { country: 'AR' as const, postalCode: '1234', city: 'Ciudad', state: 'Provincia' };
const postal = { resolve: () => destination };
const body = { lines: [{ productId: 'p', variantId: 'v', quantity: 2 }], destination: { postalCode: '1234', candidateId: 'candidate' } };
const row = { productId: 'p', variantId: 'v', name: 'Lamp', variantName: 'White', priceMinor: '12300', currency: 'ARS', supplyMode: 'made_to_order', weightGrams: 100, widthMm: 100, heightMm: 100, lengthMm: 100 };
const session = { id: 'session', expiresAt: 900000 };

test('quotes capture the payable discounted price for provider and persisted order snapshot', async () => {
  let stored: QuoteSnapshot | undefined;
  const db = { isInitialized: true, query: async (sql: string, args: unknown[]) => {
    if (sql.startsWith('SELECT')) { assert.match(sql, /sale_price_minor/); return [{ ...row, salePriceMinor: '9840' }]; }
    stored = JSON.parse(args[2] as string); return [];
  } } as unknown as DataSource;
  const service = new CheckoutQuoteService(db, postal, async captured => {
    assert.equal(captured.lines[0].priceMinor, '9840'); return quoted as ShippingOptionsResult;
  }, env, () => 1000);
  await service.quote(session, body);
  assert.equal(stored!.lines[0].priceMinor, '9840');
});

test('stock quotes accept exact availability and reject shortages without reserving units', async () => {
  let stockQuantity = 2, providers = 0; const writes: string[] = [];
  const db = { isInitialized: true, query: async (sql: string) => { if (sql.startsWith('SELECT')) return [{ ...row, supplyMode: 'stock', stockQuantity }]; writes.push(sql); return []; } } as unknown as DataSource;
  const service = new CheckoutQuoteService(db, postal, async () => { providers++; return quoted as ShippingOptionsResult; }, env, () => 1000);
  await service.quote(session, body); assert.equal(providers, 1); assert.equal(writes.some(sql => sql.includes('UPDATE')), false);
  stockQuantity = 1;
  await assert.rejects(service.quote(session, body), (e: unknown) => (e as { response?: { code?: string } }).response?.code === 'STOCK_UNAVAILABLE');
  assert.equal(providers, 1);
});

test('enabling local cart estimates alone does not activate checkout', async () => {
  let reads = 0, requests = 0;
  const db = { isInitialized: true, query: async () => { reads++; return []; } } as unknown as DataSource;
  const estimateEnv = { NODE_ENV: 'development', ZIPNOVA_ENABLED: 'true', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000',
    ZIPNOVA_API_TOKEN: 'fake-token', ZIPNOVA_API_SECRET: 'fake-secret', ZIPNOVA_ACCOUNT_ID: '4', ZIPNOVA_ORIGIN_ID: '8', ZIPNOVA_CURRENCY: 'ARS', ZIPNOVA_CURRENCY_EXPONENT: '2' };
  for (const checkout of [undefined, 'false']) {
    const service = pendingCheckoutQuoteService(db, new PostalCodeResolver(), { ...estimateEnv, LOCAL_TEST_CHECKOUT_ENABLED: checkout }, async () => { requests++; throw new Error('Network prohibited'); });
    await assert.rejects(service.quote({ ...session, expiresAt: Date.now() + 60000 }, body), { status: 503 });
  }
  assert.equal(reads, 0); assert.equal(requests, 0);
});

test('explicit local test checkout quotes validated article measurements without claiming dispatch readiness', async () => {
  let requests = 0, stored = 0;
  const db = { isInitialized: true, query: async (sql: string) => {
    if (sql.startsWith('SELECT')) return [{ ...row }];
    stored++; return [];
  } } as unknown as DataSource;
  const config = { ...env, ZIPNOVA_ENABLED: 'true', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000',
    ZIPNOVA_API_TOKEN: 'fake-token', ZIPNOVA_API_SECRET: 'fake-secret', ZIPNOVA_ACCOUNT_ID: '4', ZIPNOVA_ORIGIN_ID: '8', ZIPNOVA_CURRENCY: 'ARS', ZIPNOVA_CURRENCY_EXPONENT: '2' };
  const service = pendingCheckoutQuoteService(db, Object.assign(new PostalCodeResolver(), postal), config, async () => {
    requests++; return new Response('{}', { status: 422 });
  });
  await assert.rejects(service.quote({ ...session, expiresAt: Date.now() + 60000 }, body), { status: 503 });
  assert.equal(requests, 1); assert.equal(stored, 0);
});
test('quote persists the exact provider snapshot, random option IDs and ownership without rereading catalog', async () => {
  let reads = 0; let stored: QuoteSnapshot | undefined;
  const db = { isInitialized: true, query: async (sql: string, args: unknown[]) => {
    if (sql.startsWith('SELECT')) { reads++; return [{ ...row }]; }
    assert.equal(args[1], session.id); stored = JSON.parse(args[2] as string); return [];
  } } as unknown as DataSource;
  const service = new CheckoutQuoteService(db, postal, async captured => {
    assert.equal(captured.lines[0].priceMinor, '12300');
    captured.lines[0].name = 'malicious mutation';
    return { status: 'quoted', quotedAt: 1000, validUntil: 301000, packageCount: 1, options: [{ carrierId: 1, carrierName: 'Carrier', serviceCode: 'home', serviceName: 'Home', logisticType: 'standard', amountMinor: '500', currency: 'ARS' }] };
  }, env, () => 1000);
  const result = await service.quote(session, body);
  assert.equal(reads, 1); assert.equal(stored!.lines[0].name, 'Lamp');
  assert.equal(stored!.lines[0].quantity, 2); assert.equal(stored!.lines[0].supplyMode, 'made_to_order');
  assert.equal(stored!.validUntil, 301000); assert.equal(result.options[0].id, stored!.options[0].id);
  assert.match(result.quoteId, /^[a-f0-9-]{36}$/); assert.notEqual(result.quoteId, result.options[0].id);
});
test('disabled, client price tampering, expired session and stock are rejected before provider', async () => {
  let calls = 0;
  const db = { isInitialized: true, query: async () => [{ ...row, supplyMode: 'stock' }] } as unknown as DataSource;
  const provider = async () => { calls++; return { status: 'unavailable' as const, reason: 'DISABLED' as const }; };
  const service = new CheckoutQuoteService(db, postal, provider, env, () => 1000);
  await assert.rejects(service.quote(session, body), { status: 503 });
  await assert.rejects(service.quote(session, { ...body, priceMinor: '1' }), { status: 400 });
  await assert.rejects(service.quote({ ...session, expiresAt: 1000 }, body), { status: 403 });
  await assert.rejects(new CheckoutQuoteService(db, postal, provider, { ...env, NODE_ENV: 'production' }).quote(session, body), { status: 503 });
  assert.equal(calls, 0);
});
test('evicted destination is identified before any catalog read or provider call', async () => {
  let calls = 0;
  const db = { isInitialized:true, query:async () => { calls++; return []; } } as unknown as DataSource;
  const service = new CheckoutQuoteService(db, { resolve: () => null }, async () => { calls++; return {status:'unavailable',reason:'DISABLED'}; }, env, () => 1000);
  await assert.rejects(service.quote(session, body), (error:unknown) => {
    const value = error as {status?:number; response?:{code?:string}};
    return value.status === 400 && value.response?.code === 'INVALID_DESTINATION';
  });
  assert.equal(calls, 0);
});
const option = { carrierId: 1, carrierName: 'Carrier', serviceCode: 'home', serviceName: 'Home', logisticType: 'standard', amountMinor: '500', currency: 'ARS' };
const quoted = { status: 'quoted', quotedAt: 1000, validUntil: 301000, packageCount: 1, options: [option] };
test('corrupt provider amounts, expiry, options and pickup points never persist', async () => {
  let writes = 0;
  const db = { isInitialized: true, query: async (sql: string) => { if (sql.startsWith('INSERT')) writes++; return [{ ...row }]; } } as unknown as DataSource;
  const invalidOptions = [null, ...['01', '-1', '1.5', '9007199254740992', '9007199254740991', 500].map(amountMinor => ({ ...option, amountMinor })),
    { ...option, currency: 'USD' }, { ...option, serviceName: 'bad\nname' }, { ...option, serviceCode: 'pickup_point' },
    ...[{}, [], [null], [{ id: 0, description: 'Point' }], [{ id: 1.5, description: 'Point' }], [{ id: 1, description: 'x'.repeat(151) }],
      [{ id: 1, description: 'Point' }, { id: 1, description: 'Duplicate' }], Array.from({ length: 1001 }, (_, id) => ({ id: id + 1, description: 'Point' }))].map(pickupPoints => ({ ...option, pickupPoints }))];
  const invalidResults = [null, ...invalidOptions.map(value => ({ ...quoted, options: [value] })),
    ...[[], {}, Array(101).fill(option)].map(options => ({ ...quoted, options })),
    ...[0, 1001, 1.5].map(packageCount => ({ ...quoted, packageCount })),
    ...[1000, 1000.5, Infinity, Number.MAX_SAFE_INTEGER + 1].map(validUntil => ({ ...quoted, validUntil }))];
  for (const value of invalidResults) {
    const service = new CheckoutQuoteService(db, postal, async () => value as ShippingOptionsResult, env, () => 1000);
    await assert.rejects(service.quote(session, body), { status: 503 });
  }
  assert.equal(writes, 0);
});
test('subtotal overflow, mixed currencies and invalid dimensions stop before provider; TTL is capped', async () => {
  let calls = 0;
  for (const rows of [[{ ...row, priceMinor: '9007199254740991' }], [{ ...row, weightGrams: 10000001 }], [{ ...row, widthMm: 50001 }], [{ ...row }, { ...row, variantId: 'v2', currency: 'USD' }]]) {
    const db = { isInitialized: true, query: async () => rows } as unknown as DataSource;
    const service = new CheckoutQuoteService(db, postal, async () => { calls++; return quoted as ShippingOptionsResult; }, env, () => 1000);
    const input = rows.length === 2 ? { ...body, lines: [...body.lines, { productId: 'p', variantId: 'v2', quantity: 1 }] } : body;
    await assert.rejects(service.quote(session, input), { status: 503 });
  }
  assert.equal(calls, 0);
  const db = { isInitialized: true, query: async () => [{ ...row }] } as unknown as DataSource;
  const service = new CheckoutQuoteService(db, postal, async () => ({ ...quoted, validUntil: 1000000 }) as ShippingOptionsResult, env, () => 1000);
  assert.equal((await service.quote(session, body)).validUntil, 301000);
});
test('database and provider errors expose no private parameters or cause', async () => {
  const secret = 'synthetic-private-postal-and-token';
  for (const failAt of ['read', 'write', 'provider']) {
    const failure = Object.assign(new Error(secret), { parameters: [secret] });
    const db = { isInitialized: true, query: async (sql: string) => { if ((sql.startsWith('SELECT') && failAt === 'read') || (sql.startsWith('INSERT') && failAt === 'write')) throw failure; return [{ ...row }]; } } as unknown as DataSource;
    const service = new CheckoutQuoteService(db, postal, async () => { if (failAt === 'provider') throw failure; return quoted as ShippingOptionsResult; }, env, () => 1000);
    await assert.rejects(service.quote(session, body), (error: unknown) => {
      const safe = error as Error & { status: number; cause?: unknown };
      assert.equal(safe.status, 503); assert.equal(safe.cause, undefined);
      assert.ok(!JSON.stringify(safe).includes(secret)); assert.ok(!safe.message.includes(secret)); return true;
    });
  }
});
