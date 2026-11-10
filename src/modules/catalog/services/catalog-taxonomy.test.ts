import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUARDS_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { DataSource } from 'typeorm';
import { CatalogGuard } from '../../identity/http/catalog.guard';
import { AdminCategoriesController, AdminColorsController, AdminMaterialsController } from '../controllers/admin-taxonomy.controller';
import { CatalogAdmin } from './catalog-admin';
import { CatalogTaxonomy } from './catalog-taxonomy';

const uuid = '11111111-1111-4111-8111-111111111111';

test('taxonomy routes use the same role and CSRF guard as product mutations', () => {
  for (const [controller, path] of [[AdminCategoriesController, 'admin/catalog/categories'], [AdminMaterialsController, 'admin/catalog/materials'], [AdminColorsController, 'admin/catalog/colors']] as const) {
    assert.equal(Reflect.getMetadata(PATH_METADATA, controller), path);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, controller), [CatalogGuard]);
    for (const method of ['list', 'create', 'update', 'archive'] as const) {
      assert.notEqual(Reflect.getMetadata(METHOD_METADATA, controller.prototype[method]), undefined);
    }
  }
});

test('taxonomy validates fields, immutable slugs and bounded paging before database access', async () => {
  const service = new CatalogTaxonomy();
  await assert.rejects(service.create('categories', { name: 'Mesa', slug: 'Bad slug' }), { status: 400 });
  await assert.rejects(service.create('categories', { name: '  ', slug: 'mesa' }), { status: 400 });
  await assert.rejects(service.create('colors', { name: 'Rojo', slug: 'rojo', hex: '#xxxxxx' }), { status: 400 });
  await assert.rejects(service.create('materials', { name: 'Lana', slug: 'lana', sortOrder: -1 }), { status: 400 });
  await assert.rejects(service.update('categories', uuid, { name: 'Mesa', slug: 'new' }), { status: 400 });
  await assert.rejects(service.list('categories', { limit: '101' }), { status: 400 });
  await assert.rejects(service.list('categories', { extra: '1' }), { status: 400 });
  await assert.rejects(service.list('categories', {}), { status: 503 });
});

test('taxonomy creates normalized data, sorts bounded pages and reports conflicts', async () => {
  let saved: Record<string, unknown> = {};
  let options: Record<string, unknown> = {};
  const repo = {
    create: (row: Record<string, unknown>) => row,
    save: async (row: Record<string, unknown>) => { saved = row; return row; },
    findAndCount: async (o: Record<string, unknown>) => { options = o; return [[], 0]; },
  };
  const db = { isInitialized: true, getRepository: () => repo } as unknown as DataSource;
  const service = new CatalogTaxonomy(db);
  await service.create('colors', { name: '  Rojo  ', slug: 'rojo', hex: '#ab12ff' });
  assert.equal(saved.name, 'Rojo'); assert.equal(saved.hex, '#AB12FF'); assert.equal(saved.sortOrder, 0);
  assert.equal(saved.archivedAt, null);
  assert.deepEqual(await service.list('colors', { page: '2', limit: '20' }), { items: [], page: 2, limit: 20, total: 0 });
  assert.equal(options.skip, 20); assert.equal(options.take, 20);
  assert.deepEqual(options.order, { sortOrder: 'ASC', name: 'ASC', id: 'ASC' });
  repo.save = async () => { throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }); };
  await assert.rejects(service.create('colors', { name: 'Rojo', slug: 'rojo' }), { status: 409 });
});

test('archive locks before checking references, retains rows, and distinguishes missing from referenced', async () => {
  let existing = true, referenced = false;
  const queries: Array<{ sql: string; args: unknown[] }> = [];
  const manager = { query: async (sql: string, args: unknown[]) => {
    queries.push({ sql, args });
    if (sql.startsWith('SELECT id FROM materials')) return existing ? [{ id: uuid }] : [];
    if (sql.startsWith('SELECT id FROM product_variants')) return referenced ? [{ id: 'v' }] : [];
    return { affectedRows: 1 };
  } };
  const db = { isInitialized: true, transaction: async (work: (manager: unknown) => unknown) => work(manager) } as unknown as DataSource;
  const service = new CatalogTaxonomy(db);
  await service.archive('materials', uuid);
  assert.match(queries[0].sql, /FROM materials.*FOR UPDATE/);
  assert.match(queries[1].sql, /FROM product_variants WHERE material_id = \? LIMIT 1 FOR UPDATE/);
  assert.match(queries[2].sql, /UPDATE materials SET archived_at/);
  assert.deepEqual(queries.map((query) => query.args), [[uuid], [uuid], [uuid]]);
  referenced = true;
  await assert.rejects(service.archive('materials', uuid), { status: 409 });
  existing = false;
  await assert.rejects(service.archive('materials', uuid), { status: 404 });
});

test('assignments are validated, locked transactionally and omitted updates preserve legacy metadata', async () => {
  const product = { name: 'Mesa', slug: 'mesa', description: '', status: 'draft' as const };
  const updates: Array<Record<string, unknown>> = [];
  const locked: Array<{ sql: string; args: unknown[] }> = [];
  let exists = true;
  const repo = { update: async (_where: unknown, values: Record<string, unknown>) => { updates.push(values); return { affected: 1 }; },
    findOne: async () => ({ id: 'p', ...product }),
    findOneBy: async () => ({ id: 'p' }) };
  const manager = { query: async (sql: string, args: unknown[]) => { locked.push({ sql, args }); return exists ? [{ id: uuid }] : []; }, getRepository: () => repo };
  const db = { isInitialized: true, getRepository: () => repo, transaction: async (work: (manager: unknown) => unknown) => work(manager) } as unknown as DataSource;
  const admin = new CatalogAdmin(db);
  await admin.updateProduct('p', product);
  assert.equal('categoryId' in updates[0], false);
  await admin.updateProduct('p', { ...product, categoryId: null });
  assert.equal(updates[1].categoryId, null);
  await admin.updateProduct('p', { ...product, categoryId: uuid });
  assert.match(locked[0].sql, /FROM categories.*FOR UPDATE/); assert.deepEqual(locked[0].args, [uuid]);
  assert.equal(updates[2].categoryId, uuid);
  exists = false;
  await assert.rejects(admin.updateProduct('p', { ...product, categoryId: uuid }), { status: 400 });
  await assert.rejects(admin.updateProduct('p', { ...product, categoryId: 'not-uuid' }), { status: 400 });
  assert.equal(updates.length, 3);
  const variant = { sku: 'S', name: 'V', priceMinor: 100, currency: 'ARS', supplyMode: 'stock' as const };
  await admin.updateVariant('p', 'v', variant);
  assert.equal('materialId' in updates[3], false); assert.equal('colorId' in updates[3], false);
  await admin.updateVariant('p', 'v', { ...variant, materialId: null, colorId: null });
  assert.equal(updates[4].materialId, null); assert.equal(updates[4].colorId, null);
});
