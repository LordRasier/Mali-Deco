import 'reflect-metadata';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from '../../src/presentation/configure-http';

function rawGet(origin: string, path: string) {
  const url = new URL(origin);
  return new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
    const req = request({ hostname: url.hostname, port: url.port, path, method: 'GET', timeout: 5000 }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => body += chunk);
      response.on('error', reject); response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    req.on('timeout', () => req.destroy(new Error('Raw local request timed out'))); req.on('error', reject); req.end();
  });
}
async function withApplication(env: NodeJS.ProcessEnv, run: (origin: string) => Promise<void>) {
  const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
  let app: NestExpressApplication | undefined, origin = '';
  delete process.env.DB_HOST; delete process.env.ADMIN_ORIGIN;
  for (const key of Object.keys(process.env)) if (key.startsWith('ZIPNOVA_')) delete process.env[key];
  process.env.NODE_ENV = 'development'; process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false';
  globalThis.fetch = (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!origin || new URL(url).origin !== origin) throw new Error('External network prohibited by presentation test');
    return originalFetch(input, { ...options, redirect: 'error' });
  };
  try {
    const { applicationModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({ imports: [applicationModule(env)] }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false }); configureHttp(app);
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl(); await run(origin);
  } finally { await app?.close(); globalThis.fetch = originalFetch; process.env = originalEnv; }
}

test('retired preview routes and assets stay absent even when legacy flags are present', async () => {
  for (const env of [{ NODE_ENV: 'development' }, { NODE_ENV: 'production', MVC_PILOT_ENABLED: 'true' }]) await withApplication(env, async origin => {
    for (const method of ['GET', 'HEAD']) for (const path of ['/__mvc/pilot', '/__mvc/assets/pilot.css', '/__mvc/cart', '/__mvc/cart-assets/generated/cart.js',
      '/__mvc/catalogo', '/__mvc/productos/florero-ondas', '/__mvc/inicio', '/__mvc/home-assets/home.css', '/__mvc/admin', '/__mvc/checkout']) {
      const response = await fetch(origin + path, { method }); assert.equal(response.status, 404, `${method} ${path}`); await response.arrayBuffer();
    }
    assert.equal((await fetch(origin + '/api/v1/health')).status, 200);
  });
});

test('canonical cart retains storage-oriented markup, rejects mode injection and serves a standalone client', async () => {
  await withApplication({ NODE_ENV: 'development' }, async origin => {
    const response = await fetch(origin + '/carrito'); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(response.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    const html = await response.text(); assert.match(html, /data-cart-page-slot/); assert.equal((html.match(/data-cart-content/g) ?? []).length, 1);
    assert.match(html, /data-site-header/); assert.doesNotMatch(html, /data-cart-checkout/); assert.match(html, /<dialog[^>]+aria-labelledby="cart-title"/);
    assert.match(html, /data-cart-mode="api"/); assert.match(html, /src="\/assets\/storefront\/generated\/cart.js"/); assert.match(html, /<noscript>/);
    for (const path of ['/carrito?mode=demo', '/carrito?layout=pilot']) assert.equal((await fetch(origin + path)).status, 400);
    for (const path of ['/api/v1/carrito', '/assets/storefront/cart.hbs', '/assets/storefront/generated/cart.js.map']) assert.equal((await fetch(origin + path)).status, 404);
    assert.equal((await fetch(origin + '/carrito', { method: 'POST' })).status, 404);
    const script = await fetch(origin + '/assets/storefront/generated/cart.js'); assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type') ?? '', /javascript/); assert.equal(script.headers.get('x-content-type-options'), 'nosniff');
    const js = await script.text(); assert.ok(js.length > 1000 && js.length < 100000); assert.doesNotMatch(js, /sourceMappingURL|process\.env|react-dom|__webpack_require__/);
  });
});

test('retired demo variables and query parameters cannot select a different cart source', async () => {
  await withApplication({ NODE_ENV: 'development', STOREFRONT_MODE: 'demo' }, async origin => {
    const response = await fetch(origin + '/carrito'); assert.equal(response.status, 200); assert.match(await response.text(), /data-cart-mode="api"/);
    assert.equal((await fetch(origin + '/carrito?mode=api')).status, 400);
  });
});

test('canonical HTML composes fixed shell/partials and exposes only approved CSS for GET and HEAD', async () => {
  await withApplication({ NODE_ENV: 'production' }, async origin => {
    const page = await fetch(origin + '/carrito'); const html = await page.text(); assert.match(html, /<!doctype html>/i);
    assert.match(html, /class="site-footer"/); assert.doesNotMatch(html, /data-mvc-notice|__mvc/);
    for (const method of ['GET', 'HEAD']) {
      const css = await fetch(origin + '/assets/storefront/cart.css', { method }); assert.equal(css.status, 200);
      assert.equal(css.headers.get('cache-control'), 'public, max-age=0, must-revalidate'); assert.equal(css.headers.get('x-content-type-options'), 'nosniff');
      assert.match(css.headers.get('content-type') ?? '', /text\/css/); await css.arrayBuffer();
    }
  });
});

test('canonical views reject rendering-option injection and static roots reject traversal', async () => {
  await withApplication({ NODE_ENV: 'development' }, async origin => {
    for (const query of ['layout=../secret', 'settings[views]=../', '_locals[layout]=secret', 'cache=true', 'message=a&message=b']) {
      for (const path of ['/carrito', '/admin']) assert.equal((await fetch(`${origin}${path}?${query}`)).status, 400);
    }
    for (const path of ['/assets/storefront/.env', '/assets/admin/README.md', '/assets/storefront/views/cart.hbs']) assert.equal((await fetch(origin + path)).status, 404);
    for (const path of ['/assets/storefront/%2e%2e/views/cart.hbs', '/assets/storefront/..%2fviews%2fcart.hbs', '/assets/admin/..%2fviews%2fadmin.hbs']) {
      const response = await rawGet(origin, path); assert.equal(response.status, 404); assert.doesNotMatch(response.body, /<!doctype|data-cart-mode|data-admin-root/i);
    }
  });
});

test('canonical HTML creates no API-prefixed aliases or write routes and preserves API-only admin endpoints', async () => {
  await withApplication({ NODE_ENV: 'development' }, async origin => {
    for (const [path, status] of [['/api/v1/carrito', 404], ['/admin/orders', 404], ['/admin/settings', 404], ['/api/v1/admin/orders', 401],
      ['/api/v1/admin/settings', 401], ['/api/v1/health', 200], ['/health', 404]] as const) assert.equal((await fetch(origin + path)).status, status, path);
    for (const path of ['/', '/carrito', '/admin', '/checkout']) assert.equal((await fetch(origin + path, { method: 'POST' })).status, 404);
  });
});

test('canonical admin is private HTML without cookie issuance, prefixed aliases or write handlers', async () => {
  await withApplication({ NODE_ENV: 'production' }, async origin => {
    const response = await fetch(origin + '/admin'); assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.match(await response.text(), /data-admin-root/);
    assert.equal((await fetch(origin + '/admin/sections/products')).status, 401);
    assert.equal((await fetch(origin + '/api/v1/admin')).status, 404); assert.equal((await fetch(origin + '/admin', { method: 'POST' })).status, 404);
  });
});
