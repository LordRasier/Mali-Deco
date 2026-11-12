import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from '../../src/presentation/configure-http';
import { PublicCatalog } from '../../src/modules/catalog/services/public-catalog';
import { PublicFacets } from '../../src/modules/catalog/services/public-facets';
import { publicCatalogFixture, publicFacetsFixture } from '../support/public-storefront';
import { SeoCatalog } from '../../src/modules/catalog/services/seo-catalog';

async function appFor(env: NodeJS.ProcessEnv, run: (origin: string) => Promise<void>, fixture = false) {
  const saved = { ...process.env }; let app: NestExpressApplication | undefined;
  delete process.env.DB_HOST; process.env.NODE_ENV = 'development'; process.env.STOREFRONT_MODE = 'demo';
  process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false'; process.env.ZIPNOVA_ENABLED = 'false';
  try {
    const { applicationModule } = await import('../../src/app.module');
    const builder = Test.createTestingModule({ imports: [applicationModule(env)] });
    if (fixture) builder.overrideProvider(PublicCatalog).useValue(publicCatalogFixture).overrideProvider(PublicFacets).useValue(publicFacetsFixture);
    if (fixture) builder.overrideProvider(SeoCatalog).useValue({ redirect: async () => undefined });
    app = (await builder.compile()).createNestApplication<NestExpressApplication>({ logger: false });
    configureHttp(app); await app.listen(0, '127.0.0.1'); await run(await app.getUrl());
  } finally { await app?.close(); process.env = saved; }
}
test('canonical public controllers keep fixed local links and API boundaries without preview routes', async () => {
  await appFor({ NODE_ENV: 'development', STOREFRONT_MODE: 'demo' }, async origin => {
    for (const path of ['/', '/catalogo?currency=ARS', '/productos/florero-ondas?variant=arena', '/carrito']) {
      const response = await fetch(origin + path); assert.equal(response.status, 200, path); const html = await response.text();
      assert.match(html, /data-cart-mode="api"/); assert.match(html, /data-product-base="\/productos"/);
      assert.match(html, /href="\/catalogo"/); assert.doesNotMatch(html, /data-cart-view/);
      assert.equal(response.headers.get('cache-control'), 'no-store'); assert.match(response.headers.get('content-security-policy') ?? '', /script-src 'self'/);
      assert.equal((await fetch(origin + path, { method: 'HEAD' })).status, 200);
      assert.equal((await fetch(origin + path, { method: 'POST' })).status, 404);
    }
    const redirect = await fetch(origin + '/catalogo?search=Ondas', { redirect: 'manual' });
    assert.equal(redirect.status, 200); assert.equal(redirect.headers.get('location'), null);
    assert.match(await (await fetch(origin + '/catalogo?currency=ARS')).text(), /href="\/productos\/florero-ondas\?variant&#x3D;arena"/);
    assert.equal((await fetch(origin + '/catalogo?_rsc=invalid')).status, 400);
    assert.equal((await fetch(origin + '/productos/missing')).status, 404);
    assert.equal((await fetch(origin + '/carrito?layout=missing')).status, 400);
    for (const path of ['/api/v1/catalogo', '/api/v1/carrito', '/api/v1/productos/florero-ondas']) assert.equal((await fetch(origin + path)).status, 404, path);
    const checkout = await fetch(origin + '/checkout'); assert.equal(checkout.status, 200); assert.match(await checkout.text(), /data-new-orders-enabled="false"/);
    assert.equal((await fetch(origin + '/admin')).status, 200);
    assert.equal((await fetch(origin + '/api/v1/health')).status, 200);
    for (const path of ['/api/v1/admin/orders', '/api/v1/admin/settings']) assert.equal((await fetch(origin + path)).status, 401);
    assert.equal((await fetch(origin + '/__mvc/inicio')).status, 404);
  }, true);
});
test('retired flags cannot disable canonical pages, including API-mode rendering in production', async () => {
  for (const env of [
    { NODE_ENV: 'development', STOREFRONT_MODE: 'demo' },
    { NODE_ENV: 'development', STOREFRONT_MODE: 'demo', MVC_PILOT_ENABLED: 'false', MVC_PUBLIC_ROUTES_ENABLED: '1' },
    { NODE_ENV: 'production', STOREFRONT_MODE: 'api', MVC_PILOT_ENABLED: 'true', MVC_PUBLIC_ROUTES_ENABLED: 'false' },
  ]) await appFor(env, async origin => {
    for (const path of ['/', '/catalogo?currency=ARS', '/productos/florero-ondas']) assert.equal((await fetch(origin + path)).status, 503, path);
    assert.equal((await fetch(origin + '/carrito')).status, 200);
    assert.equal((await fetch(origin + '/api/v1/catalogo')).status, 404);
    assert.equal((await fetch(origin + '/__mvc/inicio')).status, 404);
  });
});
