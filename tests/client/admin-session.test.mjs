import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore, canManageCatalog } from '../../src/presentation/admin/client/session-core.ts';
import { ApiError, apiRequest, onUnauthorized } from '../../src/presentation/admin/client/api.ts';

const user = { id: '1', email: 'owner@example.test', role: 'owner' };

test('same-origin transport sends JSON and CSRF and accepts empty archive responses', async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => { calls.push(args); return calls.length === 1 ? new globalThis.Response(null, { status: 204 }) : new globalThis.Response('{}', { status: 200 }); };
  try {
    assert.equal(await apiRequest('/admin/catalog/products/1', { method: 'DELETE', csrf: 'token' }), undefined);
    assert.deepEqual(await apiRequest('/auth/login', { method: 'POST', body: { email: 'x', password: 'y' } }), {});
    assert.equal(calls[0][0], '/api/v1/admin/catalog/products/1');
    assert.equal(calls[0][1].credentials, 'same-origin');
    assert.equal(calls[0][1].cache, 'no-store');
    assert.equal(calls[0][1].headers['X-CSRF-Token'], 'token');
    assert.equal(calls[1][1].headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[1][1].body), { email: 'x', password: 'y' });
  } finally { globalThis.fetch = oldFetch; }
});

test('401 expires session; 403, 429, 503 and network errors remain distinct without retry', async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  let expired = 0;
  onUnauthorized(() => expired++);
  try {
    for (const status of [401, 403, 429, 503]) {
      globalThis.fetch = async () => { calls++; return new globalThis.Response('', { status }); };
      await assert.rejects(apiRequest('/thing', { method: 'POST' }), error => error instanceof ApiError && error.status === status && error.message.length > 10);
    }
    assert.equal(expired, 1);
    assert.equal(calls, 4);
    globalThis.fetch = async () => { throw new Error('network'); };
    await assert.rejects(apiRequest('/thing'), error => error instanceof ApiError && error.status === 0);
  } finally { globalThis.fetch = oldFetch; onUnauthorized(() => {}); }
});

test('bootstrap is deduplicated; login reuses token and logout only clears on success', async () => {
  const calls = [];
  let logoutFails = true;
  const store = createSessionStore(async (path, options) => {
    calls.push([path, options]);
    if (path === '/auth/me') return { user };
    if (path === '/auth/csrf') return { csrf: 'rotation' };
    if (path === '/auth/login') return { user, csrf: 'login-token' };
    if (path === '/auth/logout' && logoutFails) throw new Error('offline');
    return { ok: true };
  });
  await Promise.all([store.bootstrap(), store.bootstrap()]);
  assert.deepEqual(calls.map(call => call[0]), ['/auth/me', '/auth/csrf']);
  assert.equal(store.getSnapshot().csrf, 'rotation');
  await assert.rejects(store.logout(), /offline/);
  assert.equal(store.getSnapshot().status, 'authenticated');
  logoutFails = false;
  await store.logout();
  assert.equal(store.getSnapshot().status, 'anonymous');
  await store.login('email', 'password');
  assert.equal(store.getSnapshot().csrf, 'login-token');
  assert.equal(calls.filter(call => call[0] === '/auth/csrf').length, 1);
  store.expire();
  assert.equal(store.getSnapshot().csrf, null);
});

test('operations role cannot manage catalog', () => {
  assert.equal(canManageCatalog(user), true);
  assert.equal(canManageCatalog({ ...user, role: 'catalog' }), true);
  assert.equal(canManageCatalog({ ...user, role: 'operations' }), false);
  assert.equal(canManageCatalog(null), false);
});

test('superseded bootstrap never rotates the newer login token', async () => {
  let resolveMe;
  const calls = [];
  const store = createSessionStore(async path => {
    calls.push(path);
    if (path === '/auth/me') return new Promise(resolve => { resolveMe = resolve; });
    if (path === '/auth/login') return { user, csrf: 'new-login-token' };
    throw new Error(`unexpected ${path}`);
  });
  const pending = store.bootstrap();
  await store.login('email', 'password');
  resolveMe({ user });
  await pending;
  assert.deepEqual(calls, ['/auth/me', '/auth/login']);
  assert.equal(store.getSnapshot().csrf, 'new-login-token');
});

test('bootstrap distinguishes service failure from an expired session', async () => {
  const unavailable = createSessionStore(async () => { throw new ApiError(503, 'Servicio no disponible'); });
  await unavailable.bootstrap();
  assert.equal(unavailable.getSnapshot().status, 'error');
  assert.match(unavailable.getSnapshot().error, /no disponible/);
  const expired = createSessionStore(async () => { throw new ApiError(401, 'Sesión vencida'); });
  await expired.bootstrap();
  assert.equal(expired.getSnapshot().status, 'anonymous');
  assert.equal(expired.getSnapshot().csrf, null);
});

test('an expired logout clears local state without claiming a successful server logout', async () => {
  const store = createSessionStore(async path => {
    if (path === '/auth/login') return { user, csrf: 'token' };
    throw new ApiError(401, 'Sesión vencida');
  });
  await store.login('email', 'password');
  await assert.rejects(store.logout(), error => error.status === 401);
  assert.equal(store.getSnapshot().status, 'anonymous');
  assert.equal(store.getSnapshot().csrf, null);
});

test('rapid retries share one CSRF rotation', async () => {
  let resolveMe;
  let calls = 0;
  const store = createSessionStore(async path => {
    if (path === '/auth/me') return new Promise(resolve => { resolveMe = resolve; });
    if (path === '/auth/csrf') { calls++; return { csrf: 'token' }; }
    throw new Error('unexpected');
  });
  const first = store.retry();
  const second = store.retry();
  resolveMe({ user });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(store.getSnapshot().csrf, 'token');
});

test('a late 401 from an old request cannot expire a newly authenticated session', async () => {
  const oldFetch = globalThis.fetch;
  let resolveOld;
  const store = createSessionStore(apiRequest);
  onUnauthorized(store.expire, store.getEpoch);
  globalThis.fetch = async (path) => {
    if (path === '/api/v1/old') return new Promise(resolve => { resolveOld = resolve; });
    if (path === '/api/v1/auth/login') return new globalThis.Response(JSON.stringify({ user, csrf: 'new-token' }), { status: 200 });
    throw new Error(`unexpected ${path}`);
  };
  try {
    const oldRequest = apiRequest('/old');
    await store.login('email', 'password');
    resolveOld(new globalThis.Response('', { status: 401 }));
    await assert.rejects(oldRequest, error => error.status === 401);
    assert.equal(store.getSnapshot().status, 'authenticated');
    assert.equal(store.getSnapshot().csrf, 'new-token');
    globalThis.fetch = async () => new globalThis.Response('', { status: 401 });
    await assert.rejects(apiRequest('/current'), error => error.status === 401);
    assert.equal(store.getSnapshot().status, 'anonymous');
  } finally { globalThis.fetch = oldFetch; onUnauthorized(() => {}); }
});


test('only archive accepts an empty success; interrupted writes have an unknown outcome', async () => {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new globalThis.Response(null, { status: 200 });
    assert.equal(await apiRequest('/admin/catalog/products/1/variants/2', { method: 'DELETE' }), undefined);
    await assert.rejects(apiRequest('/auth/me'), error => error.status === 502);
    await assert.rejects(apiRequest('/auth/login', { method: 'POST', body: {} }), error => error.status === 502 && /podría haberse completado/.test(error.message));
    await assert.rejects(apiRequest('/other', { method: 'DELETE' }), error => error.status === 502);
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(apiRequest('/admin/catalog/products', { method: 'POST', body: {} }), error => error.status === 0 && /revisá el catálogo antes de reintentar/.test(error.message));
  } finally { globalThis.fetch = oldFetch; }
});


test('a stale logout response cannot clear a newer login', async () => {
  let finishLogout;
  let loginCount = 0;
  const store = createSessionStore(async path => {
    if (path === '/auth/login') return { user, csrf: `token-${++loginCount}` };
    if (path === '/auth/logout') return new Promise(resolve => { finishLogout = resolve; });
    throw new Error('unexpected');
  });
  await store.login('email', 'password');
  const pending = store.logout();
  await Promise.resolve();
  const newerLogin = store.login('email', 'password');
  assert.equal(loginCount, 1); // The new Set-Cookie must follow the old clear-cookie.
  finishLogout({ ok: true });
  await pending;
  await newerLogin;
  assert.equal(store.getSnapshot().csrf, 'token-2');
});


test('503 on a mutation reports service outage and uncertain result', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new globalThis.Response('', { status: 503 });
  try {
    await assert.rejects(apiRequest('/admin/catalog/products', { method: 'POST', body: {} }), error =>
      error.status === 503 && /no está disponible/.test(error.message) && /podría haberse completado/.test(error.message) && /revisá el catálogo/.test(error.message));
  } finally { globalThis.fetch = oldFetch; }
});


test('failed logout does not poison queue and repeated logins serialize', async () => {
  let releaseLogout;
  let releaseFirstLogin;
  let loginCount = 0;
  const store = createSessionStore(async path => {
    if (path === '/auth/logout') return new Promise((_, reject) => { releaseLogout = reject; });
    if (path === '/auth/login') {
      loginCount++;
      if (loginCount === 2) return new Promise(resolve => { releaseFirstLogin = resolve; });
      return { user, csrf: `token-${loginCount}` };
    }
    throw new Error('unexpected');
  });
  await store.login('email', 'password');
  const logout = store.logout();
  const secondLogout = store.logout();
  await Promise.resolve();
  const first = store.login('email', 'password');
  const second = store.login('email', 'password');
  assert.equal(loginCount, 1);
  releaseLogout(new Error('network'));
  await assert.rejects(logout, /network/);
  await assert.rejects(secondLogout, /network/);
  // Allow the queued first login to start.
  while (!releaseFirstLogin) await Promise.resolve();
  assert.equal(loginCount, 2);
  releaseFirstLogin({ user, csrf: 'token-2' });
  await first;
  await second;
  assert.equal(loginCount, 3);
  assert.equal(store.getSnapshot().csrf, 'token-3');
});
