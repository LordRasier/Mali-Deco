import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RequestMethod, type DynamicModule, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// Public API inventory. Checkout writes are intentionally absent from the storefront.
const expectedRoutes = [
  "DELETE /admin/catalog/categories/:id",
  "DELETE /admin/catalog/colors/:id",
  "DELETE /admin/catalog/materials/:id",
  "DELETE /admin/catalog/products/:id",
  "DELETE /admin/catalog/products/:id/variants/:variantId",
  "DELETE /admin/catalog/products/:productId/images/:imageId",
  "GET /admin/catalog/categories",
  "GET /admin/catalog/colors",
  "GET /admin/catalog/materials",
  "GET /admin/catalog/products",
  "GET /admin/catalog/products/:id",
  "GET /admin/catalog/products/:productId/images",
  "GET /admin/catalog/products/:productId/images/:imageId/content",
  "GET /admin/order-email-previews",
  "GET /admin/order-email-previews/:kind",
  "GET /admin/orders",
  "GET /admin/orders/:id",
  "GET /admin/orders/:id/attachments/:attachmentId",
  "GET /admin/settings",
  "GET /admin/settings/content",
  "GET /admin/settings/content/editor",
  "GET /admin/settings/seo",
  "GET /auth/me",
  "GET /catalog/branding/:kind",
  "GET /catalog/facets",
  "GET /catalog/images/:imageId",
  "GET /catalog/products",
  "GET /catalog/products/:slug",
  "GET /catalog/settings",
  "GET /catalog/theme.css",
  "GET /health",
  "POST /admin/catalog/categories",
  "POST /admin/catalog/colors",
  "POST /admin/catalog/materials",
  "POST /admin/catalog/products",
  "POST /admin/catalog/products/:id/publish",
  "POST /admin/catalog/products/:id/unpublish",
  "POST /admin/catalog/products/:id/variants",
  "POST /admin/catalog/products/:productId/images",
  "POST /admin/catalog/products/:productId/images/:imageId/restore",
  "POST /admin/catalog/products/with-price",
  "POST /admin/orders/:id/attachments",
  "POST /admin/settings/content/editor/publish",
  "POST /admin/settings/content/editor/restore",
  "POST /auth/csrf",
  "POST /auth/login",
  "POST /auth/logout",
  "POST /catalog/cart/resolve",
  "POST /shipping/destination",
  "POST /shipping/quote",
  "PUT /admin/catalog/categories/:id",
  "PUT /admin/catalog/colors/:id",
  "PUT /admin/catalog/materials/:id",
  "PUT /admin/catalog/products/:id",
  "PUT /admin/catalog/products/:id/variants/:variantId",
  "PUT /admin/catalog/products/:id/variants/:variantId/image",
  "PUT /admin/catalog/products/:id/variants/:variantId/price",
  "PUT /admin/catalog/products/:id/variants/:variantId/pricing",
  "PUT /admin/catalog/products/:id/variants/:variantId/quick-adjustment",
  "PUT /admin/catalog/products/:id/variants/:variantId/stock",
  "PUT /admin/catalog/products/:productId/images/:imageId",
  "PUT /admin/catalog/products/:productId/images/order",
  "PUT /admin/orders/:id",
  "PUT /admin/settings",
  "PUT /admin/settings/branding/:kind",
  "PUT /admin/settings/content",
  "PUT /admin/settings/content/editor/draft",
  "PUT /admin/settings/seo",
];

const featureOwnership: Record<string, string[]> = {
  IdentityModule: ['IdentityService', 'CatalogGuard', 'OwnerGuard'],
  CatalogModule: ['PublicCatalog', 'PublicFacets', 'PublicCartResolver', 'CatalogAdmin', 'CatalogTaxonomy'],
  SettingsModule: ['StoreSettings', 'SiteSettings'],
  ShippingModule: ['PostalCodeResolver', 'ShippingQuoteService'],
  OrdersModule: ['OrdersService', 'OrdersGuard'],
  MediaModule: ['MediaRepository', 'MediaService', 'MediaUploadInterceptor'],
};

test('feature modules own their providers without duplicate root registrations', async () => {
  const original = { ...process.env };
  try {
    delete process.env.DB_HOST;
    process.env.NODE_ENV = 'development';
    const { AppModule } = await import('../../src/app.module');
    const imports: Type[] = Reflect.getMetadata('imports', AppModule) ?? [];
    const rootProviders: Array<Type | { provide: Type }> = Reflect.getMetadata('providers', AppModule) ?? [];
    const providerName = (provider: Type | { provide: Type }) => ('provide' in provider ? provider.provide : provider).name;
    for (const [name, expected] of Object.entries(featureOwnership)) {
      const feature = imports.find(module => module.name === name);
      assert.ok(feature, `${name} must be imported by the composition root`);
      const providers: Array<Type | { provide: Type }> = Reflect.getMetadata('providers', feature) ?? [];
      for (const token of expected) {
        assert.ok(providers.some(provider => providerName(provider) === token), `${name} owns ${token}`);
        assert.ok(!rootProviders.some(provider => providerName(provider) === token), `${token} must not be duplicated in root`);
      }
    }
  } finally { process.env = original; }
});

function declaredRoutes(module: Type, visited = new Set<Type>()): string[] {
  if (visited.has(module)) return [];
  visited.add(module);
  const routes: string[] = [];
  const controllers: Type[] = Reflect.getMetadata('controllers', module) ?? [];
  for (const controller of controllers) {
    const prefix: string = Reflect.getMetadata('path', controller);
    const seen = new Set<string>();
    for (let proto = controller.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor' || seen.has(name)) continue;
        seen.add(name);
        const method: RequestMethod | undefined = Reflect.getMetadata('method', proto[name]);
        if (method === undefined) continue;
        const suffix: string = Reflect.getMetadata('path', proto[name]);
        const path = [prefix, suffix].map(part => (part ?? '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
        routes.push(`${RequestMethod[method]} /${path}`);
      }
    }
  }
  const imports: Array<Type | DynamicModule> = Reflect.getMetadata('imports', module) ?? [];
  for (const imported of imports) routes.push(...declaredRoutes('module' in imported ? imported.module : imported, visited));
  return routes;
}

test('application module preserves the catalog API surface without checkout routes', async () => {
  const original = { ...process.env };
  try {
    delete process.env.DB_HOST;
    process.env.NODE_ENV = 'development';
    const { AppModule } = await import('../../src/app.module');
    assert.deepEqual(declaredRoutes(AppModule).sort(), expectedRoutes);
  } finally { process.env = original; }
});

test('real HTTP composition keeps API prefix, unavailable reads and denied mutations offline', async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let origin = '';
  delete process.env.DB_HOST;
  delete process.env.LOCAL_TEST_CHECKOUT_ENABLED;
  for (const key of Object.keys(process.env)) if (key.startsWith('ZIPNOVA_')) delete process.env[key];
  process.env.NODE_ENV = 'development';
  globalThis.fetch = (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!origin || new URL(url).origin !== origin) throw new Error('External network prohibited by routing test');
    return originalFetch(input, options);
  };
  let app: import('@nestjs/common').INestApplication | undefined;
  try {
    const { AppModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
    const health = await fetch(`${origin}/api/v1/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const cases: Array<[string, number]> = [
      ['/health', 404], ['/catalog/facets', 404],
      ['/api/v1/catalog/products', 503], ['/api/v1/catalog/facets?currency=ARS', 503],
      ['/api/v1/catalog/facets?currency=ars', 400], ['/api/v1/auth/me', 401],
      ['/api/v1/admin/catalog/products', 401], ['/api/v1/admin/catalog/categories', 401],
      ['/api/v1/admin/orders', 401], ['/api/v1/admin/settings', 401],
    ];
    for (const [path, status] of cases) {
      const response = await fetch(origin + path);
      assert.equal(response.status, status, path);
      await response.arrayBuffer();
    }
    for (const action of ['publish', 'unpublish']) {
      const response = await fetch(`${origin}/api/v1/admin/catalog/products/p/${action}`, { method: 'POST' });
      assert.equal(response.status, 401);
      await response.arrayBuffer();
    }
    const deniedPrice = await fetch(origin + '/api/v1/admin/catalog/products/p/variants/v/price', { method: 'PUT' });
    assert.equal(deniedPrice.status, 401);
    await deniedPrice.arrayBuffer();
    const deniedBrand = await fetch(origin + '/api/v1/admin/settings/branding/logo', { method: 'PUT' });
    assert.equal(deniedBrand.status, 401);
    await deniedBrand.arrayBuffer();
    for (const path of ['/checkout/session', '/checkout/orders', '/shipping/quote']) {
      const response = await fetch(`${origin}/api/v1${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, path.startsWith('/checkout/') ? 404 : 403, path);
      await response.arrayBuffer();
    }
  } finally {
    await app?.close();
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
