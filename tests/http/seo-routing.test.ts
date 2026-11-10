import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from '../../src/presentation/configure-http';
import { PublicCatalog } from '../../src/modules/catalog/services/public-catalog';
import { PublicFacets } from '../../src/modules/catalog/services/public-facets';
import { SiteSettings } from '../../src/modules/settings/site-settings';
import { defaultSiteConfig } from '../../src/modules/settings/site-config';
import { SeoCatalog } from '../../src/modules/catalog/services/seo-catalog';
import { publicCatalogFixture, publicFacetsFixture } from '../support/public-storefront';
import { requestInMemory } from '../support/in-memory-http';

test('real SSR pipeline serves SEO, discovery, consent bootstrap and protected settings', async () => {
  const previous = { ...process.env }; let app: NestExpressApplication | undefined;
  delete process.env.DB_HOST; process.env.NODE_ENV = 'development';
  process.env.ZIPNOVA_ENABLED = 'false'; process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false';
  const config = { ...defaultSiteConfig(), publicSiteUrl: 'https://shop.example', analyticsMode: 'ga4' as const, ga4Id: 'G-TEST12345' };
  try {
    const { applicationModule } = await import('../../src/app.module');
    const builder = Test.createTestingModule({ imports: [applicationModule({ NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://shop.example' })] })
      .overrideProvider(PublicCatalog).useValue(publicCatalogFixture).overrideProvider(PublicFacets).useValue(publicFacetsFixture)
      .overrideProvider(SiteSettings).useValue({ publicSettings: async () => config, get: async () => ({ settings: config, revision: 1, available: true }) })
      .overrideProvider(SeoCatalog).useValue({ count: async () => 1, products: async () => [{ slug: 'florero-ondas' }], categories: async () => [{ slug: 'decoracion', name: 'Decoración' }], category: async (slug: string) => slug === 'decoracion' ? { slug, name: 'Decoración' } : undefined, redirect: async (slug: string) => slug === 'viejo' ? 'florero-ondas' : undefined });
    app = (await builder.compile()).createNestApplication<NestExpressApplication>({ logger: false });
    configureHttp(app); await app.init();
    const request = (path: string, options?: Parameters<typeof requestInMemory>[2]) => requestInMemory(app!.getHttpAdapter().getInstance(), path, options);
    const home = await request('/?utm_source=instagram');
    assert.equal(home.status, 200); assert.match(home.text, /rel="canonical" href="https:\/\/shop.example\/"/);
    assert.match(home.text, /data-site-analytics="ga4"/); assert.match(home.text, /data-measurement-id="G-TEST12345"/);
    assert.doesNotMatch(home.text, /src="https:\/\/www.googletagmanager/);
    assert.match(home.headers['content-security-policy'], /nonce-/); assert.match(home.text, /application\/ld\+json/);
    const catalog = await request('/catalogo?utm_source=instagram&gclid=example');
    assert.equal(catalog.status, 200); assert.match(catalog.text, /rel="canonical" href="https:\/\/shop.example\/catalogo"/);
    const filtered = await request('/catalogo?search=Ondas');
    assert.equal(filtered.status, 200); assert.match(filtered.headers['x-robots-tag'], /noindex/); assert.doesNotMatch(filtered.text, /rel="canonical"/);
    const beyond = await request('/catalogo?page=50'); assert.equal(beyond.status, 404); assert.match(beyond.text, /Anterior/);
    const asset = await request('/assets/storefront/generated/analytics.js'); assert.equal(asset.status, 200); assert.match(asset.headers['cache-control'], /must-revalidate/); assert.ok(asset.headers.etag);
    assert.equal((await request('/assets/storefront/generated/analytics.js', { headers: { 'if-none-match': asset.headers.etag } })).status, 304);
    const product = await request('/productos/florero-ondas?variant=arena');
    assert.equal(product.status, 200); assert.match(product.text, /data-product-price[^>]*>[^<]*10,00/);
    assert.match(product.text, /"price":"10.00"/); assert.match(product.text, /rel="canonical" href="https:\/\/shop.example\/productos\/florero-ondas"/);
    const renamed = await request('/productos/viejo'); assert.equal(renamed.status, 301); assert.equal(renamed.headers.location, '/productos/florero-ondas');
    const category = await request('/categorias/decoracion'); assert.equal(category.status, 200); assert.match(category.text, /rel="canonical" href="https:\/\/shop.example\/categorias\/decoracion"/);
    assert.equal((await request('/sobre-mali')).headers.location, '/sobre-nosotros');
    for (const response of [home, catalog, product, category, await request('/sobre-nosotros'), await request('/envios-y-reembolsos')]) {
      const head = response.text.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
      assert.equal((head.match(/<title>/g) ?? []).length, 1);
      for (const name of ['description', 'robots', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) assert.equal((head.match(new RegExp(`name="${name}"`, 'g')) ?? []).length, 1, name);
      for (const name of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt']) assert.equal((head.match(new RegExp(`property="${name}"`, 'g')) ?? []).length, 1, name);
      assert.doesNotMatch(head, /(?:name="description"|property="og:image:alt") content=""/);
    }
    assert.equal((await request('/categorias/missing')).status, 404);
    for (const path of ['/carrito', '/admin', '/productos/missing']) {
      const response = await request(path); assert.doesNotMatch(response.text, /data-site-analytics|application\/ld\+json/);
    }
    const robots = await request('/robots.txt'); assert.equal(robots.status, 200); assert.match(robots.text, /Sitemap: https:\/\/shop.example\/sitemap.xml/);
    const sitemap = await request('/sitemap.xml'); assert.equal(sitemap.status, 200); assert.match(sitemap.text, /sitemaps\/products-1.xml/);
    const pages = await request('/sitemaps/pages.xml'); assert.match(pages.text, /categorias\/decoracion/); assert.doesNotMatch(pages.text, /admin|carrito|search=|politica-de-privacidad/);
    assert.match((await request('/sitemaps/products-1.xml')).text, /productos\/florero-ondas/);
    assert.equal((await request('/sitemaps/products-0.xml')).status, 404);
    for (const method of ['GET', 'PUT']) assert.equal((await request('/api/v1/admin/settings/seo', { method, ...(method === 'PUT' ? { body: { settings: config, revision: 1 } } : {}) })).status, 401);
    assert.equal((await request('/api/v1/sitemap.xml')).status, 404);
    config.analyticsMode = 'ga4'; config.ga4Id = ''; // Corrupt public settings must not cause an external bootstrap.
    assert.doesNotMatch((await request('/')).text, /data-site-analytics/);
  } finally { await app?.close(); process.env = previous; }
});
