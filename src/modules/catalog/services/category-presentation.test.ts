import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import type { DataSource } from 'typeorm';
import { CategoryPresentations } from './category-presentation';
import { AdminCategoryPresentationController } from '../controllers/category-presentation.controller';
import { CatalogGuard } from '../../identity/http/catalog.guard';
import { parseCategoryPresentation } from '../../../shared/category-presentation';

const id = '12345678-1234-1234-1234-123456789012';
const details = { description: 'Dados para tu próxima aventura', imageAlt: 'Dados azules sobre una mesa', icon: 'dice', removeImage: false };
test('category presentation validates metadata and refuses markup, unknown fields and arbitrary icons', () => {
  assert.deepEqual(parseCategoryPresentation(details), details);
  for (const value of [{ ...details, icon: '<svg>' }, { ...details, description: '<script>' }, { ...details, image: 'https://foreign.test' }, { ...details, imageAlt: 'a'.repeat(151) }, { ...details, removeImage: 'true' }]) assert.throws(() => parseCategoryPresentation(value));
  assert.deepEqual(Reflect.getMetadata('__guards__', AdminCategoryPresentationController), [CatalogGuard]);
});
test('category image replacement, metadata-only edits and removal preserve the category identity', async () => {
  let row: Record<string, unknown> | undefined, active = true, published = false;
  const database = { isInitialized: true, transaction: async (work: (db: unknown) => unknown) => work(database), query: async (sql: string, args: unknown[]) => {
    if (sql.startsWith('SELECT id FROM categories')) return active ? [{ id }] : [];
    if (sql.startsWith('INSERT')) { row = { ...row, id: args[0], description: args[1], icon: args[2], imageAlt: args[3] }; return {}; }
    if (sql.startsWith('UPDATE')) { Object.assign(row!, { data: args[0], version: args[1] }); return {}; }
    if (sql.startsWith('SELECT a.image_data')) return row?.data && row.version === args[1] && active && (!sql.includes('EXISTS') || published) ? [{ data: row.data }] : [];
    return row ? [row] : [];
  } };
  const service = new CategoryPresentations(database as unknown as DataSource);
  const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#468ab2' } }).png().toBuffer();
  const first = await service.save(id, details, { buffer: image, size: image.length });
  const version = first.presentation.image.split('/').at(-1)!;
  assert.equal(first.id, id); assert.equal(first.presentation.icon, 'dice');
  assert.equal((await sharp(row!.data as Buffer).metadata()).format, 'webp');
  assert.equal((await service.decorate([{ id, name: 'Dados' }]))[0].presentation?.image, first.presentation.image);
  await service.image(id, version, false); await assert.rejects(service.image(id, version, true), { status: 404 });
  published = true; await service.image(id, version, true);
  const text = await service.save(id, { ...details, description: 'Nueva descripción' });
  assert.equal(text.presentation.image, first.presentation.image);
  const replaced = await service.save(id, details, { buffer: image, size: image.length });
  assert.notEqual(replaced.presentation.image, first.presentation.image); await assert.rejects(service.image(id, version, true), { status: 404 });
  const removed = await service.save(id, { ...details, removeImage: true }); assert.equal(removed.presentation.image, ''); assert.equal(removed.presentation.description, details.description);
  active = false; await assert.rejects(service.save(id, details), { status: 404 });
  await assert.rejects(service.save(id, details, { buffer: Buffer.from('<svg/>'), size: 6 }), { status: 400 });
  await assert.rejects(service.save(id, { ...details, removeImage: true }, { buffer: image, size: image.length }), { status: 400 });
  await assert.rejects(service.image('../other', version, false), { status: 404 });
});
test('stores awaiting the additive migration keep category reads, while writes fail explicitly', async () => {
  const database = { isInitialized: true, transaction: async (work: (db: unknown) => unknown) => work(database), query: async (sql: string) => {
    if (sql.startsWith('SELECT id FROM categories')) return [{ id }];
    throw Object.assign(Error('Missing table'), { code: 'ER_NO_SUCH_TABLE' });
  } };
  const service = new CategoryPresentations(database as unknown as DataSource);
  const decorated = await service.decorate([{ id, name: 'Existente' }]);
  assert.equal(decorated[0].name, 'Existente'); assert.equal(decorated[0].presentation?.icon, 'grid');
  await assert.rejects(service.save(id, details), { status: 503 });
});
