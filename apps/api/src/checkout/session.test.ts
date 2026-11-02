import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import type { DataSource } from 'typeorm';
import { SessionService, assertLocalCheckoutRequest, type CheckoutRequest } from './session';
const env = { NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000' };
const request = (): CheckoutRequest => ({ method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3001', origin: env.ZIPNOVA_OPERATOR_ORIGIN, 'content-type': 'application/json' } });
test('session is durable, reused without rotation, and expired or tampered capabilities never create sessions', async () => {
  let now = 1000, writes = 0;
  const rows = new Map<string, object>();
  const db = { isInitialized: true, query: async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT')) { writes++; rows.set(args[1] as string, { id: args[0], expiresAt: args[2] }); return []; }
    const row = rows.get(args[0] as string); return row ? [row] : [];
  } } as unknown as DataSource;
  const service = new SessionService(db, env, () => now), req = request();
  await assert.rejects(service.resume(req), { status: 403 });
  const first = await service.start(req);
  req.headers.cookie = `store_checkout=${first.token}`;
  assert.deepEqual(await service.start(req), first);
  assert.deepEqual(await service.resume(req), { csrf: first.csrf });
  assert.equal(writes, 1);
  await assert.rejects(service.requireMutation(req), { status: 403 });
  req.headers['x-csrf-token'] = first.csrf;
  assert.equal((await service.requireMutation(req)).id, first.id);
  req.headers['x-csrf-token'] = '0'.repeat(64);
  await assert.rejects(service.requireMutation(req), { status: 403 });
  req.headers['x-csrf-token'] = first.csrf;
  now = first.expiresAt;
  await assert.rejects(service.resume(req), { status: 403 });
  await assert.rejects(service.start(req), { status: 403 });
  await assert.rejects(service.requireMutation(req), { status: 403 });
  req.headers.cookie = `store_checkout=${'f'.repeat(64)}`;
  await assert.rejects(service.start(req), { status: 403 });
  assert.equal(writes, 1);
});
test('local guard rejects disabled, production, wrong origin, host, remote and proxy headers', () => {
  assert.doesNotThrow(() => assertLocalCheckoutRequest(request(), env));
  for (const config of [{ ...env, LOCAL_TEST_CHECKOUT_ENABLED: 'false' }, { ...env, NODE_ENV: 'production' }]) assert.throws(() => assertLocalCheckoutRequest(request(), config), { status: 403 });
  for (const headers of [{ origin: 'http://evil.test' }, { host: 'evil.test' }, { forwarded: 'for=127.0.0.1' }, { 'x-forwarded-for': '10.1.1.1' }, { 'x-forwarded-for': '127.0.0.1, 10.1.1.1' }, { 'x-forwarded-host': 'evil.test' }, { 'x-forwarded-port': '3001' }, { 'x-forwarded-proto': 'https' }, { 'x-forwarded-other': 'anything' }]) assert.throws(() => assertLocalCheckoutRequest({ ...request(), headers: { ...request().headers, ...headers } }, env), { status: 403 });
  assert.doesNotThrow(() => assertLocalCheckoutRequest({ ...request(), headers: { ...request().headers, 'x-forwarded-for': '127.0.0.1', 'x-forwarded-host': '127.0.0.1:3000', 'x-forwarded-port': '3000', 'x-forwarded-proto': 'http' } }, env));
  assert.throws(() => assertLocalCheckoutRequest({ ...request(), socket: { remoteAddress: '192.168.1.1' } }, env), { status: 403 });
});
test('session database failures expose neither query parameters nor cause', async () => {
  const secret = 'synthetic-private-token-hash';
  const db = { isInitialized: true, query: async () => { throw Object.assign(new Error(secret), { parameters: [secret] }); } } as unknown as DataSource;
  const service = new SessionService(db, env), req = request();
  const safe = (error: unknown) => {
    const value = error as Error & { status: number; cause?: unknown };
    assert.equal(value.status, 503); assert.equal(value.cause, undefined);
    assert.ok(!value.message.includes(secret)); assert.ok(!JSON.stringify(value).includes(secret)); return true;
  };
  await assert.rejects(service.start(req), safe);
  req.headers.cookie = `store_checkout=${'a'.repeat(64)}`;
  await assert.rejects(service.resume(req), safe);
});
