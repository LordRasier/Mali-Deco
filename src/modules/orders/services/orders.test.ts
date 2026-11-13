import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { HttpException, type ExecutionContext } from '@nestjs/common';
import type { IdentityService } from '../../identity/services/identity-service';
import { OrdersService, parseOrder } from './orders.service';
import { OrdersGuard } from '../http/orders.guard';

const key = 'b957d5e1-17af-4cb6-8f3f-0af2b8ee5891';
const body = { quoteId: 'quote', optionId: 'ship', pickupPointId: null, contact: { name: 'A', email: 'a@example.com', phone: '123' }, address: { street: 'S', number: '1', unit: '' } };
const row = { name: 'Chair', variantName: 'Oak', priceMinor: '100', currency: 'ARS', supplyMode: 'made_to_order', weightGrams: 100, widthMm: 10, heightMm: 20, lengthMm: 30 };
const quote = { validUntil: 32472144000000, destination: { country: 'AR', postalCode: '1000', city: 'C', state: 'S' }, lines: [{ productId: 'p', variantId: 'v', quantity: 2, ...row }], options: [{ id: 'ship', carrierName: 'Carrier', serviceName: 'Home', currency: 'ARS', amountMinor: '50' }] };

test('orders lock parents before variants, consume current stock once and reject shortages', async () => {
  let stock = 3, stored: unknown, inserts = 0; const calls: string[] = [];
  const snapshot = { ...quote, lines: [{ ...quote.lines[0], supplyMode: 'stock', stockQuantity: 9 }] };
  const tx = { query: async (sql: string, args: unknown[]) => {
    calls.push(sql);
    if (sql.startsWith('SELECT v.id AS variantId, m.name')) return [{ variantId: 'variant', name: 'PLA' }];
    if (sql.includes('FROM checkout_sessions')) return [{ id: 'session' }];
    if (sql.includes('FROM checkout_orders')) return stored ? [stored] : [];
    if (sql.includes('FROM checkout_quotes')) return [{ snapshot: JSON.stringify(snapshot) }];
    if (sql.includes('FROM products') && !sql.includes('JOIN')) return [{ ...row, id: 'p' }];
    if (sql.includes('FROM product_variants')) return [{ ...row, supplyMode: 'stock', stockQuantity: stock }];
    if (sql.startsWith('UPDATE product_variants')) { stock -= Number(args[0]); return { affectedRows: 1 }; }
    if (sql.startsWith('INSERT')) { inserts++; stored = { bodyHash: args[4], snapshot: args[8], orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started' }; return []; }
    throw Error(sql);
  } };
  const service = new OrdersService({ isInitialized: true, transaction: async (fn: (v: typeof tx) => unknown) => fn(tx) } as unknown as DataSource);
  const result = await service.create('session', key, body); assert.equal(stock, 1);
  assert.ok(calls.findIndex(sql => sql.includes('FROM products')) < calls.findIndex(sql => sql.includes('FROM product_variants')));
  assert.deepEqual(await service.create('session', key, body), result); assert.equal(stock, 1); assert.equal(inserts, 1);
  stored = undefined;
  await assert.rejects(service.create('session', key, body), (e: unknown) => (e as { response?: { code?: string } }).response?.code === 'STOCK_UNAVAILABLE');
  assert.equal(inserts, 1);
});

test('optional DNI/CUIL preserves old request hashes and accepts only bounded numeric documents', () => {
  assert.deepEqual(parseOrder(body), body);
  assert.deepEqual(parseOrder({ ...body, contact: { ...body.contact, document: '' } }), body);
  for (const document of ['1234567', '00123456', '20123456786']) {
    const parsed = parseOrder({ ...body, contact: { ...body.contact, document: ` ${document} ` } });
    assert.equal((parsed.contact as { document?: string }).document, document);
  }
  for (const document of [null, 12345678, {}, '123456', '123456789', '123456789012', '12.345.678', '1234567\n', '<script>']) {
    assert.throws(() => parseOrder({ ...body, contact: { ...body.contact, document } }), { status: 400 });
  }
  assert.throws(() => parseOrder({ ...body, contact: { ...body.contact, document: '12345678', extra: true } }), { status: 400 });
});

test('document is saved in replay identity and restored only for the owning session', async () => {
  const f = fake(), input = { ...body, contact: { ...body.contact, document: '00123456' } };
  const first = await f.service.create('session', key, input);
  assert.equal((first.contact as { document?: string }).document, '00123456');
  assert.deepEqual(await f.service.create('session', key, input), first);
  await assert.rejects(f.service.create('session', key, { ...input, contact: { ...input.contact, document: '12345678' } }), { status: 409 });
  assert.match(JSON.stringify(await f.service.findAttempt('session', key)), /00123456/);
  assert.doesNotMatch(JSON.stringify(await f.service.findAttempt('other', key)), /00123456|document/);
});
function fake(salePriceMinor?: string) {
  let stored: { quoteId: unknown; keyHash: unknown; bodyHash: unknown; snapshot: unknown; orderStatus: string; paymentStatus: string; fulfillmentStatus: string; shippingStatus: string } | undefined; let sessionAvailable = true; let quoteAvailable = true; let catalog = { ...row }; let inserts = 0;
  const tx = { query: async (sql: string, args: unknown[]) => {
    if (sql.startsWith('SELECT v.id AS variantId, m.name')) return [{ variantId: 'variant', name: 'PLA' }];
    if (sql.includes('FROM checkout_sessions')) return sessionAvailable && typeof args[0] === 'string' && ['session', 'other'].includes(args[0]) ? [{ id: 'session' }] : [];
    if (sql.includes('FROM checkout_orders')) {
      if (!stored) return [];
      if (sql.includes('WHERE idempotency_key_hash')) return args[0] === stored.keyHash ? [stored] : [];
      if (sql.includes('WHERE quote_id')) return args[0] === stored.quoteId ? [stored] : [];
      return args[0] === 'session' && args[1] === stored.keyHash ? [stored] : [];
    }
    if (sql.includes('FROM checkout_quotes')) return quoteAvailable ? [{ snapshot: JSON.stringify(quote) }] : [];
    if (sql.includes('FROM products')) return [catalog];
    if (sql.includes('FROM product_variants')) return [{ ...catalog, ...(salePriceMinor === undefined ? {} : { priceMinor: '200', salePriceMinor }) }];
    if (sql.startsWith('INSERT')) { inserts++; stored = { quoteId: args[2], keyHash: args[3], bodyHash: args[4], snapshot: args[8], orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started' }; return []; }
    throw Error(sql);
  } };
  const db = { isInitialized: true, transaction: async (fn: (manager: typeof tx) => Promise<unknown>) => fn(tx) };
  return { service: new OrdersService(db as unknown as DataSource), setPaymentStatus: (status: string) => { if (stored) stored.paymentStatus = status; }, expire: () => { quoteAvailable = false; }, expireSession: () => { sessionAvailable = false; }, change: () => { catalog = { ...catalog, priceMinor: '101' }; if (salePriceMinor !== undefined) salePriceMinor = '99'; }, inserts: () => inserts };
}

test('order locks revalidate effective prices and reject changed discounts without repricing historical orders', async () => {
  const f = fake('100');
  const result = await f.service.create('session', key, body);
  assert.equal(result.totalMinor, '250');
  assert.equal(result.lines[0].unitPriceMinor, '100');
  f.change();
  assert.deepEqual(await f.service.create('session', key, body), result);
  for (const sale of ['99', '101', '200']) {
    const changed = fake(sale);
    await assert.rejects(changed.service.create('session', key, body), { status: 409 });
    assert.equal(changed.inserts(), 0);
  }
});
test('replays same body after quote expiry and rejects changed body', async () => {
  const f = fake(); const first = await f.service.create('session', key, body); f.expire();
  assert.equal(first.totalMinor, '250'); assert.deepEqual(await f.service.create('session', key, body), first); assert.equal(f.inserts(), 1);
  await assert.rejects(() => f.service.create('session', key, { ...body, contact: { ...body.contact, name: 'B' } }), { status: 409 });
});

test('order replay and reads use current approved payment state rather than creation snapshot', async () => {
  const f = fake(); const first = await f.service.create('session', key, body);
  f.setPaymentStatus('approved');
  assert.equal((await f.service.create('session', key, body)).paymentStatus, 'approved');
  const attempt = await f.service.findAttempt('session', key);
  assert.equal(attempt.status === 'completed' && attempt.order.paymentStatus, 'approved');
  assert.equal(first.paymentStatus, 'not_started');
});
test('catalog changes require requote without inserting', async () => {
  const f = fake(); f.change(); await assert.rejects(() => f.service.create('session', key, body), { status: 409 }); assert.equal(f.inserts(), 0);
});
test('strict request shape rejects unknown fields and invalid pickup', () => {
  assert.throws(() => parseOrder({ ...body, total: 0 }), { status: 400 });
  assert.throws(() => parseOrder({ ...body, pickupPointId: 0 }), { status: 400 });
});
test('guard delegates authentication and limits roles', async () => {
  let called: unknown[] = []; const guard = new OrdersGuard({ authorize: async (...args: unknown[]) => { called = args; throw new Error('denied'); } } as unknown as IdentityService);
  await assert.rejects(() => guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ method: 'GET', headers: {} }) }) } as unknown as ExecutionContext));
  assert.deepEqual(called[1], ['owner', 'operations']);
});


test('attempt lookup restores checkout details only within the original live session', async () => {
  const f = fake(); assert.deepEqual(await f.service.findAttempt('session', key), { status: 'unknown' });
  await f.service.create('session', key, body);
  const found = await f.service.findAttempt('session', key);
  assert.equal(found.status, 'completed');
  if (found.status === 'completed') { assert.deepEqual(found.order.checkout.contact, body.contact); assert.deepEqual(found.order.checkout.address, body.address); }
  assert.deepEqual(await f.service.findAttempt('other', key), { status: 'unknown' });
  await assert.rejects(() => f.service.create('other', key, body), { status: 409 }); assert.equal(f.inserts(), 1);
  f.expireSession(); await assert.rejects(() => f.service.create('session', key, body), { status: 409 });
});
test('expired quote and unquoted pickup point are rejected', async () => {
  const f = fake(); f.expire(); await assert.rejects(() => f.service.create('session', key, body), { status: 409 });
  const g = fake(); await assert.rejects(() => g.service.create('session', key, { ...body, pickupPointId: 1 }), { status: 409 });
});


test('UUID v4 key is required on creation and attempt lookup', async () => {
  const f = fake();
  await assert.rejects(() => f.service.create('session', 'key', body), { status: 400 });
  await assert.rejects(() => f.service.findAttempt('session', 'key'), { status: 400 });
});
test('admin reads persisted statuses and fails closed on invalid stored status', async () => {
  const snapshot = JSON.stringify({ result: { id: 'o', orderStatus: 'tampered', contact: { name: 'A' }, totalMinor: '250' } });
  const row = { id: 'o', createdAt: '2026-01-01T00:00:00Z', currency: 'ARS', totalMinor: '250', snapshot, orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started' };
  const db = { isInitialized: true, query: async (sql: string) => sql.includes('COUNT') ? [{ total: 1 }] : [row] };
  const svc = new OrdersService(db as unknown as DataSource);
  assert.equal((await svc.list({})).items[0].orderStatus, 'received');
  assert.equal((await svc.detail('o')).orderStatus, 'received');
  row.paymentStatus = 'invalid';
  await assert.rejects(() => svc.list({}), { status: 503 });
  await assert.rejects(() => svc.detail('o'), { status: 503 });
});

test('a completed quote cannot be reused with a different idempotency key', async () => {
  const f = fake(); await f.service.create('session', key, body);
  await assert.rejects(() => f.service.create('session', '9d487c98-2366-4a1b-a6c3-1e4e54c732b1', body), { status: 409 });
  assert.equal(f.inserts(), 1);
});




test('database failures never expose query parameters or causes', async () => {
  const leak = Object.assign(new Error('synthetic@example.test'), { parameters: ['synthetic@example.test'] });
  const db = { isInitialized: true, transaction: async () => { throw leak; }, query: async () => { throw leak; } };
  const svc = new OrdersService(db as unknown as DataSource);
  for (const action of [() => svc.create('session', key, body), () => svc.findAttempt('session', key), () => svc.list({}), () => svc.detail('o')]) {
    await assert.rejects(action, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'Orders database unavailable');
      assert.equal(error.cause, undefined);
      assert.equal(JSON.stringify(error).includes('synthetic@example.test'), false);
      return true;
    });
  }
});

test('safe requote conflicts are distinct from used key and quote conflicts', async () => {
  const code = (expected: string) => (error: unknown) => {
    assert.ok(error instanceof HttpException); assert.equal(error.getStatus(), 409);
    const response = error.getResponse(); assert.equal(typeof response, 'object');
    assert.equal((response as { code: string }).code, expected);
    assert.equal(JSON.stringify(response).includes('example.com'), false); return true;
  };
  const expired = fake(); expired.expire();
  await assert.rejects(() => expired.service.create('session', key, body), code('QUOTE_CHANGED'));
  const changed = fake(); changed.change();
  await assert.rejects(() => changed.service.create('session', key, body), code('QUOTE_CHANGED'));
  const used = fake(); await used.service.create('session', key, body);
  await assert.rejects(() => used.service.create('session', key, { ...body, contact: { ...body.contact, name: 'Other' } }), code('KEY_USED'));
  await assert.rejects(() => used.service.create('session', '9d487c98-2366-4a1b-a6c3-1e4e54c732b1', body), code('QUOTE_USED'));
});
