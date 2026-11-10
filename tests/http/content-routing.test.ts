import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from '../../src/presentation/configure-http';
import { ContentSettings } from '../../src/modules/settings/content-settings';
import { defaultContentConfig, pagePaths } from '../../src/modules/settings/content-config';
import { PublicCatalog } from '../../src/modules/catalog/services/public-catalog';
import { PublicFacets } from '../../src/modules/catalog/services/public-facets';
import { SeoCatalog } from '../../src/modules/catalog/services/seo-catalog';
import { SiteSettings } from '../../src/modules/settings/site-settings';
import { defaultSiteConfig } from '../../src/modules/settings/site-config';
import { publicCatalogFixture, publicFacetsFixture } from '../support/public-storefront';
import { requestInMemory } from '../support/in-memory-http';

test('configured storefront enforces routes, links, discovery and commerce on every request', async () => {
  const previous = { ...process.env }; let app: NestExpressApplication | undefined;
  delete process.env.DB_HOST; process.env.NODE_ENV = 'development'; process.env.ZIPNOVA_ENABLED = 'false'; process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false';
  const config = defaultContentConfig();
  config.copy.home.title = 'Runica: equipá tu mazo'; config.copy.catalog.description = 'Deckboxes, dados y folios';
  config.contact.email = 'hola@runica.example'; config.contact.legalName = 'Runica'; config.contact.legalAddress = 'Dirección de ejemplo';
  try {
    const { applicationModule } = await import('../../src/app.module');
    const builder = Test.createTestingModule({ imports: [applicationModule({ NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://runica.example' })] })
      .overrideProvider(ContentSettings).useValue({ get: async () => ({ settings: config, revision: 1, available: true }) })
      .overrideProvider(PublicCatalog).useValue(publicCatalogFixture).overrideProvider(PublicFacets).useValue(publicFacetsFixture)
      .overrideProvider(SiteSettings).useValue({ publicSettings: async () => ({ ...defaultSiteConfig(), analyticsMode: 'ga4', ga4Id: 'G-TEST12345' }) })
      .overrideProvider(SeoCatalog).useValue({ count: async () => 1, products: async () => [{ slug: 'florero-ondas' }], categories: async () => [], redirect: async () => undefined });
    app = (await builder.compile()).createNestApplication<NestExpressApplication>({ logger: false }); configureHttp(app); await app.init();
    const request = (path: string, options?: Parameters<typeof requestInMemory>[2]) => requestInMemory(app!.getHttpAdapter().getInstance(), path, options);
    const home = await request('/'); assert.equal(home.status, 200); assert.match(home.text, /Runica: equipá tu mazo/);
    assert.match((await request('/catalogo')).text, /Deckboxes, dados y folios/);
    assert.equal((await request('/sobre-mali')).headers.location, '/sobre-nosotros');
    assert.match((await request('/contacto')).text, /hola@runica.example/);
    for (const [key, path] of Object.entries(pagePaths)) {
      const page = config.pages[key as keyof typeof config.pages];
      assert.equal((await request(path)).status, 200, path);
      page.enabled = false;
      assert.equal((await request(path, { method: 'HEAD' })).status, 404);
      for (const url of [path, path + '/', path.toUpperCase(), path + '?test=1']) assert.equal((await request(url)).status, 404, url);
      assert.doesNotMatch((await request('/')).text, new RegExp(`href="${path}"`));
      assert.doesNotMatch((await request('/sitemaps/pages.xml')).text, new RegExp(`<loc>https://runica.example${path}</loc>`));
      if (key === 'sobre-mali') assert.equal((await request('/sobre-mali')).status, 404);
      page.enabled = true; assert.equal((await request(path)).status, 200);
    }
    config.pages['politica-de-privacidad'].enabled = false; assert.doesNotMatch((await request('/')).text, /data-site-analytics=/);
    config.features.cart = false;
    assert.equal((await request('/carrito')).status, 404); assert.equal((await request('/checkout')).status, 404);
    assert.equal((await request('/api/v1/catalog/cart/resolve', { method: 'POST', body: {} })).status, 404);
    assert.doesNotMatch((await request('/')).text, /data-cart-open|data-cart-dialog/);
    assert.doesNotMatch((await request('/productos/florero-ondas')).text, /data-product-add/);
    config.features.catalog = false;
    assert.equal((await request('/catalogo')).status, 404); assert.equal((await request('/productos/florero-ondas')).status, 404);
    assert.equal((await request('/api/v1/catalog/products')).status, 404);
    assert.doesNotMatch((await request('/')).text, /href="\/catalogo"|class="catalog-card"/);
    assert.doesNotMatch((await request('/sitemap.xml')).text, /products-1/);
    assert.equal((await request('/api/v1/admin/settings/content')).status, 401);
  } finally { await app?.close(); process.env = previous; }
});
