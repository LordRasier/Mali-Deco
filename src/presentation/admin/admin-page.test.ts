import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { AdminPage } from './admin-page';

const owner = { id: 'owner-1', email: 'owner@example.invalid', role: 'owner' as const };
test('HTML bootstrap reads identity only and exposes no token or private session fields', async () => {
  const calls: unknown[] = [];
  const page = new AdminPage({ me: async token => { calls.push(token); return { user: owner }; } });
  const result = await page.read('opaque-session');
  assert.equal(result.status, 200); assert.equal(result.model.authenticated, true);
  assert.deepEqual(result.model.navigation.map(item => item.id), ['products', 'classifications', 'orders', 'editor', 'settings']);
  assert.deepEqual(calls, ['opaque-session']);
  assert.doesNotMatch(JSON.stringify(result), /opaque-session|csrf|password|hash/i);
});

test('anonymous login and identity outages are distinct and do not expose exception details', async () => {
  const anonymous = await new AdminPage({ me: async () => { throw new UnauthorizedException(); } }).read(undefined);
  assert.equal(anonymous.status, 200); assert.equal(anonymous.model.anonymous, true);
  assert.equal(anonymous.model.authenticated, false); assert.deepEqual(anonymous.model.navigation, []);
  const unavailable = await new AdminPage({ me: async () => { throw Error('private database credentials'); } }).read('token');
  assert.equal(unavailable.status, 503); assert.equal(unavailable.model.unavailable, true);
  assert.doesNotMatch(JSON.stringify(unavailable), /private database|credentials/);
});

test('every section request rechecks identity and rejects role-forbidden or unknown sections', async () => {
  let calls = 0;
  const page = new AdminPage({ me: async () => { calls++; return { user: { ...owner, role: 'catalog' } }; } });
  assert.equal((await page.section('token', 'products')).status, 200);
  assert.equal((await page.section('token', 'classifications')).status, 200);
  assert.equal((await page.section('token', 'orders')).status, 403);
  assert.equal((await page.section('token', 'settings')).status, 403);
  assert.equal((await page.section('token', '../settings')).status, 404);
  assert.equal(calls, 5);
  const unauthenticated = new AdminPage({ me: async () => { throw new UnauthorizedException(); } });
  assert.equal((await unauthenticated.section(undefined, 'products')).status, 401);
});

test('operations receives only orders and development sections do not pretend to be operational', async () => {
  const page = new AdminPage({ me: async () => ({ user: { ...owner, role: 'operations' } }) });
  const result = await page.read('token');
  assert.deepEqual(result.model.navigation.map(item => item.id), ['orders']);
  const section = await page.section('token', 'orders');
  assert.equal(section.model.section, 'orders'); assert.equal(section.model.available, false);
  assert.match(section.model.message, /desarrollo/);
  assert.equal((await page.section('token', 'products')).status, 403);
});
