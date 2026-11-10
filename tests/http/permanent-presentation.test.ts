import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from 'node:http';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PublicCatalog } from '../../src/modules/catalog/services/public-catalog';
import { PublicFacets } from '../../src/modules/catalog/services/public-facets';
import { configureHttp } from '../../src/presentation/configure-http';
import { SeoCatalog } from '../../src/modules/catalog/services/seo-catalog';

async function application(env: NodeJS.ProcessEnv, run: (origin: string) => Promise<void>, options: { failed?: boolean; afterDefinition?: () => void } = {}) {
  const saved = { ...process.env }; let app: NestExpressApplication | undefined;
  // Only rendering policy is under test: synthetic providers avoid production DB startup/credentials.
  delete process.env.DB_HOST; process.env.NODE_ENV = 'development'; process.env.STOREFRONT_MODE = 'api';
  process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false'; process.env.ZIPNOVA_ENABLED = 'false';
  try {
    const { applicationModule } = await import('../../src/app.module');
    const definition = applicationModule(env); options.afterDefinition?.();
    const variant = { id: 'v1', name: 'Variant', priceMinor: 1234, currency: 'ARS', supplyMode: 'stock', material: null, color: null };
    const builder = Test.createTestingModule({ imports: [definition] }).overrideProvider(PublicCatalog).useValue({
      settings: async () => { if (options.failed) throw Error('private database detail'); return { name: '<script>Brand</script>' }; },
      list: async () => ({ items: [{ id: 'p1', slug: 'synthetic', name: '<img src=x>', description: '', category: null, primaryImage: null, priceRange: null, matchedVariant: variant }], page: 1, limit: 24, total: 1 }),
      detail: async (slug: string) => { if (slug === 'missing') throw new NotFoundException(); return { id: 'p1', slug, name: 'Synthetic product', description: 'Public description',
        category: null, images: [], productWidthMm: null, productHeightMm: null, productLengthMm: null, variants: [variant], page: 1, limit: 100, total: 1 }; },
    }).overrideProvider(PublicFacets).useValue({ get: async () => ({ categories: [], materials: [], colors: [], currencies: ['ARS'], priceRange: null, truncated: { categories: false, materials: false, colors: false } }) });
    builder.overrideProvider(SeoCatalog).useValue({ redirect: async () => undefined });
    app = (await builder.compile()).createNestApplication<NestExpressApplication>({ logger: false });
    configureHttp(app); await app.listen(0, '127.0.0.1'); await run(await app.getUrl());
  } finally { await app?.close(); process.env = saved; }
}

test('canonical presentation is permanent without MVC flags and preserves prefixed API/admin boundaries', async () => {
  for (const env of [{}, { NODE_ENV: 'development', MVC_PILOT_ENABLED: 'false' }, { NODE_ENV: 'production', MVC_PILOT_ENABLED: 'true', MVC_PUBLIC_ROUTES_ENABLED: 'true' }]) {
    await application(env, async origin => {
      for (const path of ['/', '/catalogo?currency=ARS', '/productos/synthetic', '/carrito', '/admin']) {
        const response = await fetch(origin + path); assert.equal(response.status, 200, path);
        assert.match(response.headers.get('content-type') ?? '', /text\/html/); assert.equal(response.headers.get('set-cookie'), null);
        assert.equal((await fetch(origin + path, { method: 'HEAD' })).status, 200);
        assert.equal((await fetch(origin + path, { method: 'POST' })).status, 404);
        const html = await response.text(); assert.doesNotMatch(html, /__mvc|Vista MVC en desarrollo|data-mvc-notice/);
      }
      for (const path of ['/__mvc/pilot', '/__mvc/inicio', '/__mvc/catalogo', '/__mvc/productos/synthetic', '/__mvc/cart', '/__mvc/admin', '/__mvc/checkout',
        '/api/v1/catalogo', '/api/v1/productos/synthetic', '/api/v1/carrito', '/api/v1/admin', '/admin/orders', '/admin/settings']) {
        assert.equal((await fetch(origin + path)).status, 404, path);
      }
      assert.equal((await fetch(origin + '/api/v1/health')).status, 200);
      for (const path of ['/api/v1/admin/orders', '/api/v1/admin/settings', '/admin/sections/products']) assert.equal((await fetch(origin + path)).status, 401, path);
    });
  }
});

test('public API pages are indexable, demo/error/private pages are not, and canonical URL never uses Host', async () => {
  await application({ NODE_ENV: 'production', STOREFRONT_MODE: 'api', PUBLIC_SITE_URL: 'https://shop.example' }, async origin => {
    for (const path of ['/', '/catalogo?currency=ARS', '/productos/synthetic']) {
      const response = await fetch(origin + path, { headers: { Host: 'untrusted.invalid' } }); assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-robots-tag'), null); const html = await response.text();
      assert.doesNotMatch(html, /name="robots" content="noindex|https?:\/\/untrusted/);
      assert.doesNotMatch(html, /<script>Brand|<img src=x>/);
      if (path.startsWith('/productos/')) assert.match(html, /rel="canonical" href="https:\/\/shop.example\/productos\/synthetic"/);
    }
    for (const path of ['/admin', '/carrito', '/productos/missing']) {
      const response = await fetch(origin + path); assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', path);
    }
  });
  await application({ NODE_ENV: 'development', STOREFRONT_MODE: 'demo' }, async origin => {
    for (const path of ['/', '/catalogo?currency=ARS', '/productos/synthetic']) {
      const response = await fetch(origin + path); assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
      const html = await response.text(); assert.match(html, /data-cart-mode="api"/); assert.doesNotMatch(html, /Vista de demostración|TU MARCA/);
    }
  });
  await application({ NODE_ENV: 'production', STOREFRONT_MODE: 'api' }, async origin => {
    const response = await fetch(origin + '/'); assert.equal(response.status, 503); assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.doesNotMatch(await response.text(), /private database detail/);
  }, { failed: true });
});

test('checkout stays absent without explicit development opt-in, including production with the flag', async () => {
  for (const env of [{ NODE_ENV: 'development' }, { NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'false' }, { NODE_ENV: 'production', LOCAL_TEST_CHECKOUT_ENABLED: 'true' }]) await application(env, async origin => {
    for (const path of ['/checkout', '/checkout?layout=secret']) {
      assert.equal((await fetch(origin + path)).status, 404, path);
    }
    for (const action of ['session', 'session/reset', 'session/resume', 'quotes', 'order-attempt', 'orders']) {
      const response = await fetch(origin + '/api/v1/checkout/' + action, {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}',
      });
      assert.equal(response.status, 404, action);
      assert.equal(response.headers.get('set-cookie'), null);
    }
  });
});

test('the catalog and cart explain Instagram ordering without replacing the cart estimate', async () => {
  await application({ NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'false' }, async origin => {
    for (const path of ['/', '/catalogo?currency=ARS', '/productos/synthetic', '/carrito']) {
      const response = await fetch(origin + path); assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.match(html, /<footer\b[^>]*>[\s\S]*?pedidos por Instagram[\s\S]*?<\/footer>/i, path);
      const summary = html.match(/<aside class="cart-summary"[\s\S]*?<\/aside>/)?.[0] ?? '';
      assert.match(summary, /Instagram/);
      assert.match(summary, /pronto[^<]*pagos? en línea/i);
      assert.match(summary, /data-cart-totals/); assert.match(summary, /data-shipping-total/);
      assert.doesNotMatch(html, /href="\/checkout"|data-cart-checkout|data-checkout-form/);
    }
  });
});

test('explicit local checkout exposes the compact test form and cart entry without creating a session on GET', async () => {
  await application({ NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true' }, async origin => {
    const response = await fetch(origin + '/checkout');
    assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const html = await response.text();
    assert.match(html, /data-checkout-form/); assert.match(html, /Mercado Pago/);
    assert.match(html, /No se realizarán cobros/); assert.match(html, /data-checkout-payment[^>]*disabled/);
    assert.match(html, /class="checkout-fields-row"/); assert.match(html, /data-checkout-order[^>]*tabindex="-1"/);
    assert.doesNotMatch(html, /sdk\.mercadopago|api\.mercadopago|access_token|init_point/);
    for (const path of ['/', '/catalogo', '/productos/synthetic', '/carrito']) {
      const page = await (await fetch(origin + path)).text();
      assert.match(page, /href="\/checkout"[^>]*data-cart-checkout/);
    }
    assert.equal((await fetch(origin + '/api/v1/checkout/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.invalid' }, body: '{}' })).status, 403);
  });
});

test('asset roots serve only the fixed public files for GET/HEAD, never adjacent source or traversal', async () => {
  await application({ NODE_ENV: 'production', STOREFRONT_MODE: 'api' }, async origin => {
    for (const path of ['/assets/storefront/cart.css', '/assets/storefront/catalog.css', '/assets/storefront/product.css', '/assets/storefront/home.css', '/assets/storefront/shell.css',
      '/assets/storefront/generated/cart.js', '/assets/admin/admin.css', '/assets/admin/generated/admin.js', '/assets/admin/generated/admin.css', '/assets/checkout/checkout.css', '/storefront/hero-3d-objects.webp']) {
      for (const method of ['GET', 'HEAD']) { const response = await fetch(origin + path, { method }); assert.equal(response.status, 200, path);
        assert.equal(response.headers.get('cache-control'), path.startsWith('/assets/admin/') || path.startsWith('/assets/checkout/') ? 'no-store' : 'public, max-age=0, must-revalidate'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); await response.arrayBuffer(); }
      assert.equal((await fetch(origin + path, { method: 'POST' })).status, 404);
    }
    for (const path of ['/assets/storefront/README.md', '/assets/admin/README.md', '/assets/checkout/README.md', '/assets/storefront/generated/cart.js.map', '/assets/admin/.env', '/assets/storefront/',
      '/__mvc/assets/pilot.css', '/__mvc/cart-assets/cart.css', '/__mvc/admin-assets/admin.css']) assert.equal((await fetch(origin + path)).status, 404, path);
    const url = new URL(origin);
    for (const path of ['/assets/storefront/..%2f..%2fviews%2fhome.hbs', '/assets/admin/%2e%2e/views/admin.hbs']) {
      const result = await new Promise<{ status?: number; body: string }>((resolve, reject) => {
        const req = request({ hostname: url.hostname, port: url.port, path, method: 'GET' }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', value => body += value); res.on('end', () => resolve({ status: res.statusCode, body })); }); req.on('error', reject); req.end();
      });
      assert.equal(result.status, 404); assert.doesNotMatch(result.body, /data-admin-root|home-hero/);
    }
  });
});

test('presentation captures its environment rather than rereading mutable globals or caller objects', async () => {
  const env = { NODE_ENV: 'development', STOREFRONT_MODE: 'demo', LOCAL_TEST_CHECKOUT_ENABLED: 'false' };
  await application(env, async origin => {
    const response = await fetch(origin + '/'); assert.equal(response.status, 200); assert.match(await response.text(), /data-cart-mode="api"/);
  }, { afterDefinition: () => { env.STOREFRONT_MODE = 'api'; process.env.STOREFRONT_MODE = 'api'; } });
});

test('configured fixture artwork remains explicitly development-only and is captured by every public page', async () => {
  for (const environment of ['development', 'production']) {
    const env = { NODE_ENV: environment, STOREFRONT_MODE: 'api', DEV_FIXTURE_PRODUCT_ID: 'p1' };
    await application(env, async origin => {
      for (const path of ['/', '/catalogo?currency=ARS', '/productos/synthetic']) {
        const html = await (await fetch(origin + path)).text();
        assert.equal(html.includes('src="/storefront/florero-ondas.webp"'), environment === 'development', path);
      }
    }, { afterDefinition: () => { env.DEV_FIXTURE_PRODUCT_ID = 'another-fixture'; process.env.DEV_FIXTURE_PRODUCT_ID = 'another-fixture'; } });
  }
});
