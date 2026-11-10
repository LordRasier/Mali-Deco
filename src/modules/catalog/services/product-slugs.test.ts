import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntityManager } from 'typeorm';
import { availableProductSlug, saveProductWithHistory } from './product-slugs';
import { SeoCatalog } from './seo-catalog';
import type { DataSource } from 'typeorm';

test('renames retain every old slug and reserve it against other products', async () => {
  const history = new Map<string, string>(); const product = { id: 'p', slug: 'old', status: 'active' as const };
  const manager = { getRepository: () => ({ findOne: async () => ({ ...product }), update: async (_where: unknown, values: Partial<typeof product>) => { Object.assign(product, values); return { affected: 1 }; } }),
    query: async (sql: string, args: string[]) => { if (sql.startsWith('INSERT')) { if (!history.has(args[0])) history.set(args[0], args[1]); return {}; } return history.has(args[0]) ? [{ product_id: history.get(args[0]) }] : []; } } as unknown as EntityManager;
  await saveProductWithHistory(manager, 'p', { slug: 'middle', status: 'active' });
  await saveProductWithHistory(manager, 'p', { slug: 'current', status: 'active' });
  assert.deepEqual([...history], [['old', 'p'], ['middle', 'p']]);
  await assert.rejects(availableProductSlug(manager, 'old', 'other'), { status: 409 });
  await assert.rejects(availableProductSlug(manager, 'old'), { status: 409 });
  await availableProductSlug(manager, 'old', 'p');
  await saveProductWithHistory(manager, 'p', { slug: 'old', status: 'active' });
  assert.equal(product.slug, 'old'); assert.equal(history.get('current'), 'p');
});

test('missing migration blocks renames before any product write and does not break legacy creation', async () => {
  let writes = 0;
  const manager = { getRepository: () => ({ findOne: async () => ({ id: 'p', slug: 'old', status: 'draft' }), update: async () => { writes++; } }), query: async () => { throw Object.assign(Error(), { code: 'ER_NO_SUCH_TABLE' }); } } as unknown as EntityManager;
  await availableProductSlug(manager, 'new');
  await assert.rejects(saveProductWithHistory(manager, 'p', { slug: 'new', status: 'draft' }), { status: 503 });
  assert.equal(writes, 0);
});

test('public slug lookup redirects directly to the current active product and never loops', async () => {
  let slug = 'current';
  const db = { isInitialized: true, query: async (sql: string) => { assert.match(sql, /p.status = 'active'/); assert.match(sql, /p.archived_at IS NULL/); return [{ slug }]; } } as unknown as DataSource;
  const catalog = new SeoCatalog(db); assert.equal(await catalog.redirect('old'), 'current');
  slug = 'old'; assert.equal(await catalog.redirect('old'), undefined);
});
