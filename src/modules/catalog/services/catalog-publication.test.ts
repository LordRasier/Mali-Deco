import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import type { DataSource } from 'typeorm';
import { CatalogAdmin } from './catalog-admin';

// Real row filtering in an isolated database. TypeORM's product repository and
// MariaDB-only row-lock syntax are adapted; production lock contention is not simulated.
function fixture(t: TestContext) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.function('regexp', (pattern, value) => Number(new RegExp(String(pattern)).test(String(value))));
  sql.exec(`CREATE TABLE product_images (id TEXT, product_id TEXT, width INTEGER, height INTEGER, position INTEGER, retired_at TEXT);
    CREATE TABLE product_image_derivatives (image_id TEXT, rendition INTEGER, byte_length INTEGER);
    CREATE TABLE product_variants (id TEXT, product_id TEXT, price_minor INTEGER, currency TEXT, archived_at TEXT);`);
  const product = { id: 'p', slug: 'editada', status: 'draft', archivedAt: null as Date | null, name: 'Pieza' };
  type Criteria = { id: string; status?: string; archivedAt: { type: string } };
  const matches = (where: Criteria) => where.id === product.id && where.archivedAt.type === 'isNull' && !product.archivedAt
    && (!where.status || where.status === product.status);
  const repo = {
    findOne: async ({ where, lock }: { where: Criteria; lock: { mode: string } }) => {
      assert.equal(lock.mode, 'pessimistic_write'); return matches(where) ? { ...product } : null;
    },
    findOneBy: async (where: Criteria) => matches(where) ? { ...product } : null,
    update: async (where: Criteria, fields: Partial<typeof product>) => {
      if (!matches(where)) return { affected: 0 };
      Object.assign(product, fields); return { affected: 1 };
    },
  };
  const manager = { getRepository: () => repo, query: async (query: string, args: string[]) => {
    if (query.includes('FROM product_variants')) assert.match(query, /FOR UPDATE/);
    return sql.prepare(query.replace(/FOR UPDATE|REGEXP BINARY/g, match => match === 'FOR UPDATE' ? '' : 'REGEXP')).all(...args);
  } };
  const db = { isInitialized: true, getRepository: () => repo, transaction: async (work: (m: typeof manager) => unknown) => work(manager) };
  return { admin: new CatalogAdmin(db as unknown as DataSource), product, sql };
}
const incomplete = (missing: string[]) => ({ status: 409, response: { code: 'PUBLICATION_INCOMPLETE', missing } });
const live = { name: 'Editada', description: '', slug: 'editada', status: 'active' as const };

test('publication checks the actual first active photo and a usable price on this product', async t => {
  const { admin, product, sql } = fixture(t);
  product.name = '   ';
  sql.exec(`INSERT INTO product_images VALUES ('cover','p',320,240,0,NULL), ('ok','p',100,100,1,NULL);
    INSERT INTO product_image_derivatives VALUES ('ok',320,9),('ok',800,9),('ok',1600,9);
    INSERT INTO product_variants VALUES ('archived','p',0,'ARS','yesterday'),('other','other',0,'ARS',NULL),
      ('negative','p',-1,'ARS',NULL),('bad-currency','p',0,'ars',NULL),('unsafe','p',9007199254740992,'ARS',NULL);`);
  await assert.rejects(admin.publishProduct('p'), incomplete(['name', 'cover', 'price']));
  assert.equal(product.status, 'draft');
  product.name = 'Pieza';
  sql.exec("INSERT INTO product_image_derivatives VALUES ('cover',320,393216),('cover',800,393216),('cover',1600,393216)");
  await assert.rejects(admin.publishProduct('p'), incomplete(['cover', 'price']));
  sql.exec("UPDATE product_images SET retired_at = 'yesterday' WHERE id = 'cover'");
  await assert.rejects(admin.publishProduct('p'), incomplete(['price']));
  sql.exec("INSERT INTO product_variants VALUES ('good','p',0,'ARS',NULL)");
  const result = await admin.publishProduct('p');
  assert.equal(result.id, 'p'); assert.equal(result.status, 'active'); assert.equal(product.status, 'active');
  await assert.rejects(admin.publishProduct('p'), { status: 409, response: { code: 'PUBLICATION_REQUIRES_DRAFT' } });
});

test('generic writes cannot publish drafts or unpublish a live product after a stale read', async t => {
  const { admin, product } = fixture(t);
  const useAction = { status: 409, response: { code: 'USE_PUBLICATION_ACTION' } };
  await assert.rejects(admin.createProduct(live), useAction);
  await assert.rejects(admin.updateProduct('p', live), useAction);
  assert.equal(product.name, 'Pieza');
  product.status = 'active';
  assert.equal((await admin.updateProduct('p', live)).status, 'active');
  await assert.rejects(admin.updateProduct('p', { ...live, status: 'draft' }), { status: 409, response: { code: 'PRODUCT_STATUS_CHANGED' } });
  assert.equal(product.status, 'active');
  assert.equal((await admin.unpublishProduct('p')).status, 'draft');
  await assert.rejects(admin.unpublishProduct('p'), { status: 409 });
});

test('missing and archived products cannot be published, updated or sent back to draft', async t => {
  const { admin, product } = fixture(t);
  product.archivedAt = new Date();
  for (const id of ['p', 'missing']) {
    await assert.rejects(admin.publishProduct(id), { status: 404 });
    await assert.rejects(admin.unpublishProduct(id), { status: 404 });
    await assert.rejects(admin.updateProduct(id, live), { status: 404 });
  }
});
