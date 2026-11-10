import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { UnauthorizedException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createViewEngine } from '../../view-engine';
import { AdminPage } from '../admin-page';
import { MvcAdminController } from '../admin.controller';
import { AdminProductsPage } from './admin-products-page';
import type { ProductRow } from '../../../modules/catalog/models/catalog.entities';
import { ClassificationsPage } from '../classifications/classifications-page';

test('real product, variant and classification HTML enforce authorization, escaped forms and query isolation', async () => {
  const product: ProductRow = { id: 'p1', name: '<b>Product</b>', slug: 'product', description: '</textarea><script>bad</script>', status: 'active', archivedAt: null, categoryId: null,
    productWeightG: 100, productWidthMm: 10, productHeightMm: 10, productLengthMm: 10, packageWeightG: null, packageWidthMm: null, packageHeightMm: null, packageLengthMm: null };
  let reads = 0;
  const products = new AdminProductsPage({
    listProducts: async () => { reads++; return { items: [product], page: 1, limit: 24, total: 1 }; },
    getProduct: async id => { reads++; return { ...product, id, variants: [{ id: 'v1', productId: id, sku: 'SKU', name: 'Variant', priceMinor: '1234', currency: 'ARS', supplyMode: 'stock' as const, materialId: null, colorId: null, archivedAt: null }], page: 1, limit: 24, total: 1 }; },
  });
  let classificationReads = 0;
  const classifications = new ClassificationsPage({ list: async (kind, query) => { classificationReads++; return { page: Number(query.page), limit: 24, total: 1,
    items: [{ id: 'c1', name: '<b>Classification</b>', slug: 'classification', sortOrder: 0, archivedAt: null, ...(kind === 'colors' ? { hex: '#F47B6B' } : {}) }] }; } });
  const page = new AdminPage({ me: async token => {
    if (!['owner', 'catalog', 'operations'].includes(token ?? '')) throw new UnauthorizedException();
    return { user: { id: 'admin', email: 'admin@example.invalid', role: token as 'owner' | 'catalog' | 'operations' } };
  } }, { products, classifications });
  const module = await Test.createTestingModule({ controllers: [MvcAdminController], providers: [{ provide: AdminPage, useValue: page }] }).compile();
  const app = module.createNestApplication<NestExpressApplication>({ logger: false });
  app.engine('hbs', createViewEngine({ admin_product_images: readFileSync(join(__dirname, '..', 'views', 'admin-product-images.hbs'), 'utf8') }).__express); app.setBaseViewsDir(join(__dirname, '..', 'views')); app.setViewEngine('hbs'); await app.listen(0, '127.0.0.1');
  try {
    const origin = await app.getUrl();
    const get = (query: string, role = 'catalog') => fetch(`${origin}/admin/sections/products${query}`, { headers: { Cookie: `store_admin=${role}` } });
    assert.equal((await get('?view=detail&id=p1', 'operations')).status, 403); assert.equal((await get('', '')).status, 401); assert.equal(reads, 0);
    for (const query of ['', '?view=create', '?view=detail&id=p1', '?view=edit&id=p1', '?view=variant-create&id=p1', '?view=variant-edit&id=p1&variantId=v1']) {
      const response = await get(query); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const html = await response.text(); assert.match(html, /data-admin-section="products"/); assert.doesNotMatch(html, /<b>Product|<script>bad/);
      if (query.startsWith('?view=edit')) { assert.match(html, /&lt;\/textarea&gt;/); assert.match(html, /data-product-form/); }
      if (query.includes('variant-')) { assert.match(html, /data-variant-form/); assert.match(html, /name="supplyMode"/); }
    }
    assert.equal((await get('?view=list&layout=secret')).status, 400); assert.equal((await get('?view=edit&id=p1&id=p2')).status, 400);
    product.archivedAt = new Date(); assert.equal((await get('?view=edit&id=p1')).status, 404);
    assert.equal((await get('?view=variant-create&id=p1')).status, 404);
    const archived = await (await get('?view=detail&id=p1')).text(); assert.doesNotMatch(archived, /data-product-action="(?:edit|archive)"/);
    assert.equal((await fetch(`${origin}/admin/sections/products`, { method: 'POST', headers: { Cookie: 'store_admin=owner' } })).status, 404);
    const classify = (query: string, role = 'catalog') => fetch(`${origin}/admin/sections/classifications${query}`, { headers: { Cookie: `store_admin=${role}` } });
    assert.equal((await classify('', 'operations')).status, 403); assert.equal(classificationReads, 0);
    for (const query of ['', '?kind=colors', '?kind=materials&view=create', '?kind=colors&view=edit&id=c1&page=1']) {
      const response = await classify(query); assert.equal(response.status, 200);
      const html = await response.text(); assert.match(html, /data-admin-section="classifications"/); assert.doesNotMatch(html, /<b>Classification/);
      if (query.includes('view=edit')) assert.match(html, /name="slug"[^>]*disabled/);
    }
    assert.equal((await classify('?kind=unknown')).status, 400); assert.equal((await classify('?view=edit&id=off-page')).status, 404);
  } finally { await app.close(); }
});
