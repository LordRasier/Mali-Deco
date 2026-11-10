import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PublicCatalog } from '../../src/modules/catalog/services/public-catalog';
import { PublicFacets } from '../../src/modules/catalog/services/public-facets';
import { configureHttp } from '../../src/presentation/configure-http';

async function application(mode: 'api' | 'demo', fixture: boolean, run: (origin: string) => Promise<void>,
  { failMetadata = false, emptyStore = false }: { failMetadata?: boolean; emptyStore?: boolean } = {}) {
  const original = { ...process.env }, originalFetch = globalThis.fetch;
  let app: NestExpressApplication | undefined, origin = '';
  delete process.env.DB_HOST; process.env.NODE_ENV = 'development'; process.env.STOREFRONT_MODE = mode;
  process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false'; process.env.ZIPNOVA_ENABLED = 'false';
  const env = { NODE_ENV: 'development', STOREFRONT_MODE: mode };
  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!origin || new URL(url).origin !== origin) throw Error('Only this test loopback origin is allowed');
    return originalFetch(input, { ...init, redirect: 'manual' });
  };
  try {
    const { applicationModule } = await import('../../src/app.module');
    const builder = Test.createTestingModule({ imports: [applicationModule(env)] });
    if (fixture) {
      builder.overrideProvider(PublicCatalog).useValue({
        settings: async () => ({ name: '<script>private-brand</script>' }),
        list: async () => emptyStore ? { items: [], page: 1, limit: 24, total: 0 } : ({ items: [{ id: 'p', slug: 'safe-product', name: '<img src=x onerror=bad>', description: '', productWidthMm: 125, productHeightMm: null, productLengthMm: 80, category: null, primaryImage: null, variantCount: 1, priceRange: null, matchedVariant: { id: 'v', name: 'Zero', priceMinor: 0, currency: 'USD', supplyMode: null, material: null, color: null } }], page: 1, limit: 24, total: 1 }),
      });
      builder.overrideProvider(PublicFacets).useValue({ get: async () => {
        if (failMetadata) throw Error('Synthetic metadata outage');
        return { categories: [], materials: [], colors: [], currencies: emptyStore ? [] : ['USD'], priceRange: null, truncated: { categories: false, materials: false, colors: false } };
      } });
    }
    app = (await builder.compile()).createNestApplication<NestExpressApplication>({ logger: false });
    configureHttp(app); await app.listen(0, '127.0.0.1'); origin = await app.getUrl(); await run(origin);
  } finally { await app?.close(); process.env = original; globalThis.fetch = originalFetch; }
}

test('SSR catalog renders escaped HTML, shared cart and a default currency without redirects', async () => {
  await application('api', true, async origin => {
    const redirect = await fetch(origin + '/catalogo?search=light&page=3');
    assert.equal(redirect.status, 404); assert.equal(redirect.headers.get('location'), null);
    assert.equal((await fetch(origin + '/catalogo?search=light')).status, 200);
    const response = await fetch(origin + '/catalogo?currency=USD');
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy') ?? '', /form-action 'self'/);
    const html = await response.text();
    assert.ok(html.includes('&lt;script&gt;private-brand&lt;/script&gt;')); assert.ok(!html.includes('<img src=x'));
    assert.match(html, /&lt;img src&#x3D;x onerror&#x3D;bad&gt;/); assert.match(html, /0,00/);
    assert.match(html, /data-cart-dialog/); assert.match(html, /data-shipping-postal/);
    const dimensions = html.match(/<p class="catalog-card-dimensions">([\s\S]*?)<\/p>/)?.[1];
    assert.ok(dimensions);
    assert.match(dimensions, /<span class="sr-only">Ancho: <\/span>12,5 cm<\/span>/);
    assert.match(dimensions, /<span class="sr-only">Largo: <\/span>8 cm<\/span>/);
    assert.doesNotMatch(dimensions, /Alto|mm|null/);
    assert.doesNotMatch(html, /class="catalog-pages"/);
    assert.match(html, /\/productos\/safe-product\?variant&#x3D;v/);
    assert.equal((await fetch(origin + '/catalogo?currency=USD&currency=ARS')).status, 400);
    assert.equal((await fetch(origin + '/catalogo?layout=secret')).status, 400);
    assert.equal((await fetch(origin + '/api/v1/catalogo')).status, 404);
    assert.equal((await fetch(origin + '/catalogo', { method: 'POST' })).status, 404);
  });
});

test('SSR API failure is 503 HTML rather than a fabricated empty or demo catalog', async () => {
  await application('api', false, async origin => {
    const response = await fetch(origin + '/catalogo?currency=ARS');
    assert.equal(response.status, 503);
    const html = await response.text(); assert.match(html, /No pudimos cargar/); assert.doesNotMatch(html, /Florero Ondas/);
  });
});

test('obsolete demo configuration renders provider data and recovery links without filter controls', async () => {
  await application('demo', true, async origin => {
    const response = await fetch(origin + '/catalogo?currency=USD&search=Ondas');
    assert.equal(response.status, 200); const html = await response.text();
    assert.doesNotMatch(html, /Florero Ondas|Maceta Espiral|Vista de demostración/); assert.match(html, /class="catalog-results-count">1 objeto<\/p>/);
    assert.match(html, /data-cart-mode="api"/);
    assert.doesNotMatch(html, /data-filter-(form|open|dialog)|mvc-search|mvc-sort/);
    assert.match(html, /Búsqueda: Ondas ×/);
    assert.match(html, /href="\/catalogo\?currency&#x3D;USD">Limpiar todo<\/a>/);
    assert.match(html, /&lt;img src&#x3D;x onerror&#x3D;bad&gt;/);
  });
});

test('metadata failure never exposes forms that could silently discard existing filters', async () => {
  await application('api', true, async origin => {
    const response = await fetch(origin + '/catalogo?currency=USD&category=deco&search=light&sort=price_desc');
    assert.equal(response.status, 503); const html = await response.text();
    assert.doesNotMatch(html, /class="catalog-search"|id="mvc-sort"/);
    assert.match(html, /href="\/catalogo\?search&#x3D;light&amp;category&#x3D;deco&amp;currency&#x3D;USD&amp;sort&#x3D;price_desc"/);
  }, { failMetadata: true });
});

test('unpublished, filtered and out-of-range pages offer only meaningful actions', async () => {
  await application('api', true, async origin => {
    const body = async (query: string, status = 200) => {
      const res = await fetch(origin + '/catalogo' + query);
      assert.equal(res.status, status);
      return res.text();
    };
    const empty = await body('');
    assert.match(empty, /Todavía no hay objetos publicados/);
    assert.doesNotMatch(empty, /Limpiar filtros|catalog-pages|data-filter-form|data-filter-open|data-filter-dialog|id="mvc-sort"/);
    assert.match(empty, /data-cart-dialog/);
    const filtered = await body('?search=florero');
    assert.match(filtered, /No encontramos objetos/);
    assert.match(filtered, /Limpiar filtros/);
    assert.match(filtered, /class="catalog-categories"/);
    assert.match(filtered, /href="\/catalogo">Limpiar filtros<\/a>/);
    assert.doesNotMatch(filtered, /data-filter-(open|form|dialog)|mvc-search|mvc-sort/);
    assert.doesNotMatch(filtered, /Todavía no hay objetos publicados|catalog-pages/);
    const later = await body('?page=2', 404);
    assert.match(later, /Anterior/);
    assert.doesNotMatch(later, /Todavía no hay objetos publicados|>Limpiar filtros<\/a>/);
  }, { emptyStore: true });
});
