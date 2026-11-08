import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PublicCatalog } from '../../src/modules/catalog/services/public-catalog';
import { configureHttp } from '../../src/presentation/configure-http';

async function application(mode: 'api' | 'demo', enabled: boolean, run: (origin: string) => Promise<void>, unavailable = false) {
  const saved = { ...process.env }, originalFetch = globalThis.fetch;
  let app: NestExpressApplication | undefined, origin = '';
  delete process.env.DB_HOST; process.env.NODE_ENV = 'development'; process.env.STOREFRONT_MODE = mode;
  process.env.ZIPNOVA_ENABLED = 'false'; process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false';
  const env = { NODE_ENV: 'development', STOREFRONT_MODE: mode, MVC_PILOT_ENABLED: String(enabled) };
  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!origin || new URL(url).origin !== origin) throw Error('External requests prohibited');
    return originalFetch(input, { ...init, redirect: 'error' });
  };
  try {
    const { applicationModule } = await import('../../src/app.module');
    const builder = Test.createTestingModule({ imports: [applicationModule(env)] });
    builder.overrideProvider(PublicCatalog).useValue({
      settings: async () => { if (unavailable) throw Error('Synthetic private failure'); return { name: 'Synthetic brand' }; },
      detail: async (slug: string) => { if (slug === 'missing') throw new NotFoundException(); return { id: 'p1', slug: 'synthetic', name: '</script><script>bad</script>', description: '<img onerror=bad>',
        productWidthMm: null, productHeightMm: null, productLengthMm: null, category: null, images: slug === 'multiple' ? [{ id: 'image-1', alt: 'Front' }, { id: 'image-2', alt: 'Back' }] : [], page: 1, limit: 100, total: 1,
        variants: [{ id: 'v1', name: 'Variant', priceMinor: 0, currency: 'ARS', supplyMode: null, material: null, color: null }] }; },
    });
    app = (await builder.compile()).createNestApplication<NestExpressApplication>({ logger: false });
    configureHttp(app); await app.listen(0, '127.0.0.1'); origin = await app.getUrl(); await run(origin);
  } finally { await app?.close(); process.env = saved; globalThis.fetch = originalFetch; }
}
test('product SSR escapes HTML and bootstrap attributes without inline executable data', async () => {
  await application('api', true, async origin => {
    const response = await fetch(origin + '/productos/synthetic?variant=v1&layout=missing');
    assert.equal(response.status, 200); const html = await response.text();
    assert.match(html, /data-product-bootstrap="\{&quot;id&quot;/);
    assert.doesNotMatch(html, /<script>bad|<img onerror|window\.__/);
    assert.match(html, /&lt;\/script&gt;&lt;script&gt;bad&lt;\/script&gt;/);
    assert.match(html, /data-product-add disabled/); assert.match(html, /data-cart-dialog/);
    assert.match(response.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    assert.equal((await fetch(origin + '/api/v1/productos/synthetic')).status, 404);
    assert.equal((await fetch(origin + '/productos/synthetic', { method: 'POST' })).status, 404);
  });
});
test('multi-image product renders labelled thumbnails and separate measurements', async () => {
  await application('api', true, async origin => {
    const html = await (await fetch(origin + '/productos/multiple')).text();
    assert.match(html, /data-gallery-thumb disabled aria-label="Ver imagen 1" aria-pressed="true"/);
    assert.match(html, /data-gallery-thumb disabled aria-label="Ver imagen 2" aria-pressed="false"/);
    assert.match(html, /<dt>Ancho<\/dt><dd>No informado<\/dd>/);
    assert.match(html, /<dt>Alto<\/dt><dd>No informado<\/dd>/);
    assert.match(html, /<dt>Largo<\/dt><dd>No informado<\/dd>/);
  });
});
test('obsolete demo configuration uses provider details and missing products return HTML404', async () => {
  await application('demo', true, async origin => {
    const product = await fetch(origin + '/productos/florero-ondas?variant=arena&variant=coral');
    assert.equal(product.status, 200); const html = await product.text(); assert.match(html, /data-cart-mode="api"/); assert.doesNotMatch(html, /Florero Ondas|precio de ejemplo/);
    const missing = await fetch(origin + '/productos/missing'); assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Este producto no está disponible/);
  });
});
test('canonical product and assets ignore retired flags while preview aliases remain absent', async () => {
  await application('demo', false, async origin => {
    for (const path of ['/productos/florero-ondas', '/assets/storefront/product.css']) assert.equal((await fetch(origin + path)).status, 200);
    assert.equal((await fetch(origin + '/__mvc/productos/florero-ondas')).status, 404);
  });
});
test('unavailable product HTML offers retry without a product bootstrap or private error', async () => {
  await application('api', true, async origin => {
    const response = await fetch(origin + '/productos/synthetic?variant=v1');
    assert.equal(response.status, 503); const html = await response.text();
    assert.match(html, /href="">Reintentar/); assert.doesNotMatch(html, /data-product-bootstrap|Synthetic private failure/);
  }, true);
});
