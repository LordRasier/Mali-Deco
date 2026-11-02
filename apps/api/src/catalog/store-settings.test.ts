import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { StoreSettings, parseStoreName } from './store-settings';
import { OwnerGuard } from '../identity/owner.guard';
import { IdentityService } from '../identity/identity-service';
import type { IdentityStore, StoredSession } from '../identity/identity-store';
import { issueSecret } from '../identity/security';

test('requires an explicitly supplied, bounded, printable store name only', () => {
  assert.equal(parseStoreName({ name: '  Taller Ámbar  ' }), 'Taller Ámbar');
  assert.equal(parseStoreName({ name: '🟠'.repeat(255) }).length, 510);
  for (const invalid of [null, {}, { name: '' }, { name: '  ' }, { name: 'a\nb' }, { name: '\nTienda' }, { name: 'a\u0000b' }, { name: '\ud800' }, { name: '🟠'.repeat(256) }, { name: 'Tienda', currency: 'ARS' }]) {
    assert.throws(() => parseStoreName(invalid), { status: 400 });
  }
});

test('reads missing settings distinctly and writes only the supplied name', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  let name: string | null = null;
  const db = { isInitialized: true, query: async (sql: string, params?: unknown[]) => {
    queries.push({ sql, params });
    if (sql.startsWith('SELECT')) return name === null ? [] : [{ name }];
    name = params![0] as string;
    return [];
  } } as unknown as DataSource;
  const settings = new StoreSettings(db);
  assert.deepEqual(await settings.get(), { name: null });
  assert.deepEqual(await settings.set({ name: ' Taller de prueba ' }), { name: 'Taller de prueba' });
  assert.deepEqual(await settings.get(), { name: 'Taller de prueba' });
  assert.deepEqual(queries[1].params, ['Taller de prueba']);
  await assert.rejects(new StoreSettings().get(), { status: 503 });
  await assert.rejects(new StoreSettings().set({ name: 'Taller' }), { status: 503 });
});

test('only owner can read settings and owner mutations require origin and CSRF', async () => {
  const token = issueSecret(); const csrf = issueSecret();
  const session: StoredSession = { userId: '1', email: 'a@example.test', role: 'operations', expiresAt: new Date(Date.now() + 10000), revokedAt: null, disabledAt: null, csrfHash: csrf.hash };
  const store = { session: async () => session } as unknown as IdentityStore;
  const guard = new OwnerGuard(new IdentityService(store, 'https://admin.example'));
  const context = (headers: Record<string, string>, method = 'GET') => ({ switchToHttp: () => ({ getRequest: () => ({ headers, method }) }) }) as unknown as ExecutionContext;
  await assert.rejects(guard.canActivate(context({})), { status: 401 });
  const cookie = `store_admin=${token.token}`;
  await assert.rejects(guard.canActivate(context({ cookie })), { status: 403 });
  session.role = 'catalog';
  await assert.rejects(guard.canActivate(context({ cookie })), { status: 403 });
  session.role = 'owner';
  assert.equal(await guard.canActivate(context({ cookie })), true);
  await assert.rejects(guard.canActivate(context({ cookie, origin: 'https://admin.example' }, 'PUT')), { status: 403 });
  await assert.rejects(guard.canActivate(context({ cookie, origin: 'https://evil.example', 'x-csrf-token': csrf.token }, 'PUT')), { status: 403 });
  assert.equal(await guard.canActivate(context({ cookie, origin: 'https://admin.example', 'x-csrf-token': csrf.token }, 'PUT')), true);
});
