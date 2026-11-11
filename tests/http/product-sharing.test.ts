import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PublicCatalog } from '../../src/modules/catalog/services/public-catalog';
import { PublicFacets } from '../../src/modules/catalog/services/public-facets';
import { SiteSettings } from '../../src/modules/settings/site-settings';
import { defaultSiteConfig } from '../../src/modules/settings/site-config';
import { configureHttp } from '../../src/presentation/configure-http';
import { publicCatalogFixture, publicFacetsFixture } from '../support/public-storefront';
import { requestInMemory } from '../support/in-memory-http';
import { SEO_ENV } from '../../src/presentation/seo/metadata';

test('public shared links render the product thumbnail, anchor and sharing controls without scripts or authentication', async () => {
  const previous = { ...process.env }; let app: NestExpressApplication | undefined;
  delete process.env.DB_HOST; process.env.NODE_ENV = 'test';
  try {
    const { applicationModule } = await import('../../src/app.module');
    const base = (await publicCatalogFixture.list()).items[0];
    const image = { id: 'cover-photo', alt: 'Front view', width: 800, height: 800 };
    const product = { ...base, primaryImage: image, images: [image], variantCount: 1 };
    const module = await Test.createTestingModule({ imports: [applicationModule({ NODE_ENV: 'test' })] })
      .overrideProvider(SEO_ENV).useValue({ NODE_ENV: 'production' })
      .overrideProvider(PublicCatalog).useValue({ ...publicCatalogFixture, selected: async (ids: string[]) => ({ items: ids[0] === base.id ? [product] : [], page: 1, limit: 24, total: ids[0] === base.id ? 1 : 0 }) })
      .overrideProvider(PublicFacets).useValue(publicFacetsFixture)
      .overrideProvider(SiteSettings).useValue({ publicSettings: async () => ({ ...defaultSiteConfig(), publicSiteUrl: 'https://share.test' }) }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false }); configureHttp(app); await app.init();
    const request = (path: string) => requestInMemory(app!.getHttpAdapter().getInstance(), path);
    const response = await request('/catalogo?articulo=fixture-product');
    assert.equal(response.status, 200); const html = response.text;
    assert.match(html, /<meta property="og:image" content="https:\/\/share.test\/api\/v1\/catalog\/images\/cover-photo\?w&#x3D;1600"/);
    assert.match(html, /<meta property="og:title" content="Florero Ondas \| Test store"/);
    assert.match(html, /<meta property="og:url" content="https:\/\/share.test\/catalogo\?articulo&#x3D;fixture-product"/);
    assert.match(html, /id="producto-fixture-product" tabindex="-1" data-shared-product/);
    assert.equal([...html.matchAll(/data-catalog-card\b/g)].length, 1, 'The highlighted product is not duplicated in the grid');
    for (const attribute of ['data-product-share', 'data-share-whatsapp', 'data-share-instagram', 'data-share-copy']) assert.ok(html.includes(attribute));
    assert.match(response.headers['x-robots-tag'] ?? '', /noindex/);
    assert.doesNotMatch(response.headers['content-security-policy'] ?? '', /unsafe-inline|facebook|instagram|whatsapp/);
    const absent = await request('/catalogo?articulo=private');
    assert.equal(absent.status, 404); assert.doesNotMatch(absent.text, /cover-photo|data-shared-product/);
    const ordinary = await request('/catalogo');
    assert.equal(ordinary.status, 200); assert.doesNotMatch(ordinary.text, /data-shared-product/);
  } finally { await app?.close(); process.env = previous; }
});
