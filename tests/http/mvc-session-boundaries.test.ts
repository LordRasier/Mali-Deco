import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from '../../src/presentation/configure-http';
import { IdentityService } from '../../src/modules/identity/services/identity-service';
import type { AdminUser, IdentityStore, StoredSession } from '../../src/modules/identity/persistence/identity-store';
import { hashPassword } from '../../src/modules/identity/security/security';
import { CatalogAdmin } from '../../src/modules/catalog/services/catalog-admin';
import { OrdersService } from '../../src/modules/orders/services/orders.service';
import { StoreSettings } from '../../src/modules/settings/store-settings';

test('MVC HTTP composition preserves cookie flags, roles, CSRF rotation and revocation', async () => {
  const original = { ...process.env };
  delete process.env.DB_HOST;
  process.env.NODE_ENV = 'development';
  process.env.ZIPNOVA_ENABLED = 'false';
  process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false';
  const frontend = 'http://127.0.0.1:3170';
  const sessions = new Map<string, StoredSession>();
  const user: AdminUser = { id: 'synthetic-owner', email: 'owner@example.test', passwordHash: await hashPassword('synthetic-password'), role: 'owner', disabledAt: null };
  const store: IdentityStore = {
    limit: async () => true,
    user: async email => email === user.email ? user : null,
    createSession: async (hash, userId, csrfHash, expiresAt) => {
      sessions.set(hash, { userId, email: user.email, role: user.role, csrfHash, expiresAt, revokedAt: null, disabledAt: null });
    },
    session: async hash => sessions.get(hash) ?? null,
    rotateCsrf: async (hash, csrfHash) => { sessions.get(hash)!.csrfHash = csrfHash; },
    revoke: async hash => { sessions.get(hash)!.revokedAt = new Date(); },
  };
  let writes = 0;
  let app: NestExpressApplication | undefined;
  try {
    const { applicationModule } = await import('../../src/app.module');
    const env = { NODE_ENV: 'development', MVC_PILOT_ENABLED: 'true' };
    const module = await Test.createTestingModule({ imports: [applicationModule(env)] })
      .overrideProvider(IdentityService).useValue(new IdentityService(store, frontend))
      .overrideProvider(CatalogAdmin).useValue({ listProducts: () => ({ items: [] }) })
      .overrideProvider(OrdersService).useValue({ list: () => ({ items: [] }) })
      .overrideProvider(StoreSettings).useValue({ get: () => ({ name: 'Synthetic' }), set: () => { writes++; return { name: 'Synthetic' }; } }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    configureHttp(app);
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const login = await fetch(origin + '/api/v1/auth/login', {
      method: 'POST', headers: { Origin: frontend, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'synthetic-password' }),
    });
    assert.equal(login.status, 201);
    const cookieHeader = login.headers.get('set-cookie')!;
    assert.match(cookieHeader, /HttpOnly/i);
    assert.match(cookieHeader, /SameSite=Strict/i);
    assert.match(cookieHeader, /Path=\//i);
    assert.doesNotMatch(cookieHeader, /; Secure/i);
    const cookie = cookieHeader.split(';')[0];
    const { csrf: firstCsrf } = await login.json() as { csrf: string };
    const session = [...sessions.values()][0];
    for (const [role, expected] of [['owner', [200, 200, 200]], ['catalog', [200, 403, 403]], ['operations', [403, 200, 403]]] as const) {
      session.role = role;
      for (const [index, path] of ['/admin/catalog/products', '/admin/orders', '/admin/settings'].entries()) {
        const response = await fetch(origin + '/api/v1' + path, { headers: { Cookie: cookie } });
        assert.equal(response.status, expected[index], `${role}: ${path}`);
        await response.arrayBuffer();
      }
    }
    session.role = 'owner';
    const mutate = async (csrf?: string, requestOrigin = frontend, form = false) => {
      const response = await fetch(origin + '/api/v1/admin/settings', {
        method: 'PUT', headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        body: form ? `name=Synthetic&csrf=${firstCsrf}` : JSON.stringify({ name: 'Synthetic' }),
      });
      await response.arrayBuffer();
      return response.status;
    };
    assert.equal(await mutate(), 403);
    assert.equal(await mutate(undefined, frontend, true), 403);
    assert.equal(await mutate(firstCsrf, 'http://attacker.example'), 403);
    assert.equal(writes, 0);
    assert.equal(await mutate(firstCsrf), 200);
    const rotated = await fetch(origin + '/api/v1/auth/csrf', { method: 'POST', headers: { Cookie: cookie, Origin: frontend } });
    assert.equal(rotated.status, 201);
    const { csrf: secondCsrf } = await rotated.json() as { csrf: string };
    assert.notEqual(secondCsrf, firstCsrf);
    assert.equal(await mutate(firstCsrf), 403, 'another tab holding the old CSRF token must not write');
    assert.equal(await mutate(secondCsrf), 200);
    assert.equal(writes, 2);
    const logout = await fetch(origin + '/api/v1/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: frontend, 'X-CSRF-Token': secondCsrf } });
    assert.equal(logout.status, 201);
    assert.match(logout.headers.get('set-cookie') ?? '', /Path=\//);
    await logout.arrayBuffer();
    const expired = await fetch(origin + '/api/v1/auth/me', { headers: { Cookie: cookie } });
    assert.equal(expired.status, 401);
    await expired.arrayBuffer();
    session.revokedAt = null;
    session.expiresAt = new Date(0);
    const timedOut = await fetch(origin + '/api/v1/auth/me', { headers: { Cookie: cookie } });
    assert.equal(timedOut.status, 401);
    await timedOut.arrayBuffer();
  } finally {
    await app?.close();
    process.env = original;
  }
});
