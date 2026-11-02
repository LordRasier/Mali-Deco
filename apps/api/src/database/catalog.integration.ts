import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database-options';
import { CatalogAdmin } from '../catalog/catalog-admin';
import { PublicCatalog } from '../catalog/public-catalog';
import { PublicFacets } from '../catalog/public-facets';
import { PublicCartResolver } from '../catalog/cart-resolver';
import { CatalogTaxonomy } from '../catalog/catalog-taxonomy';
import { IdentityService } from '../identity/identity-service';
import { MysqlIdentityStore } from '../identity/identity-store';
import { hashPassword } from '../identity/security';
import { StoreSettings } from '../catalog/store-settings';

test('migration creates constraints and can be reverted on empty isolated MariaDB', {
  skip: process.env.MARIADB_INTEGRATION !== '1' ? 'requires explicit isolated MariaDB configuration' : false,
}, async () => {
  if (process.env.DB_DATABASE !== 'store_integration_test' || !['127.0.0.1', 'localhost'].includes(process.env.DB_HOST ?? '')) {
    throw new Error('Integration test requires local store_integration_test database');
  }
  // A separate explicit flag permits the confirmed passwordless XAMPP root only in this guarded test.
  const emptyPassword = process.env.MARIADB_INTEGRATION_EMPTY_PASSWORD === '1';
  if (emptyPassword && process.env.DB_USERNAME !== 'root') throw new Error('Empty-password test requires the explicitly confirmed local root');
  const db = new DataSource({ ...databaseOptions(), ...(emptyPassword ? { password: '' } : {}), extra: { connectionLimit: 1 } });
  await db.initialize();
  try {
    // This isolated test sets strict mode only on its own pooled connection, never globally.
    await db.query("SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES')");
    const [server]: Array<{ version: string; checks: number; mode: string }> = await db.query('SELECT VERSION() AS version, @@SESSION.check_constraint_checks AS checks, @@SESSION.sql_mode AS mode');
    if (!/MariaDB/i.test(server.version) || Number(server.checks) !== 1 || !/STRICT_(?:TRANS|ALL)_TABLES/.test(server.mode)) {
      throw new Error('Integration test requires MariaDB with CHECK constraints and strict SQL mode enabled');
    }
    const existing: unknown[] = await db.query('SHOW TABLES');
    if (existing.length) throw new Error('Integration database must be empty');
    await db.runMigrations();
    await db.query('INSERT INTO products (id, name, description, slug) VALUES (?, ?, ?, ?)', ['p1', 'Pieza', '', 'pieza']);
    const insert = 'INSERT INTO product_variants (id, product_id, sku, name, price_minor, currency) VALUES (?, ?, ?, ?, ?, ?)';
    await db.query(insert, ['v1', 'p1', 'SKU-1', 'Rojo', 100, 'ARS']);
    // Reverting and reapplying only taxonomy twice must retain the product FK and its supporting index.
    for (let cycle = 0; cycle < 2; cycle++) {
      await db.undoLastMigration();
      await db.undoLastMigration();
      await db.undoLastMigration();
      const indexes: Array<{ Column_name: string }> = await db.query("SHOW INDEX FROM product_variants WHERE Key_name = 'idx_variants_product_id'");
      assert.equal(indexes.length, 1);
      assert.equal(indexes[0].Column_name, 'product_id');
      assert.equal((await db.query('SELECT id FROM product_variants WHERE id = ?', ['v1'])).length, 1);
      await db.runMigrations();
    }
    await assert.rejects(db.query(insert, ['v2', 'p1', 'SKU-1', 'Azul', 100, 'ARS']), { code: 'ER_DUP_ENTRY' });
    await assert.rejects(db.query(insert, ['v3', 'missing', 'SKU-2', 'Azul', 100, 'ARS']), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(db.query(insert, ['v4', 'p1', 'SKU-3', 'Azul', 100, 'ars']), { errno: 4025 });
    await assert.rejects(db.query(insert, ['v5', 'p1', 'SKU-4', 'Azul', '9007199254740992', 'ARS']), { errno: 4025 });
    await db.query(insert, ['v6', 'p1', 'sku-1', 'Azul', 100, 'ARS']);
    await assert.rejects(db.query('INSERT INTO products (id, name, description, slug) VALUES (?, ?, ?, ?)', ['p2', 'Pieza', '', 'PIÉZA']), { code: 'ER_DUP_ENTRY' });
    const storeSettings = new StoreSettings(db);
    assert.deepEqual(await storeSettings.get(), { name: null });
    assert.deepEqual(await storeSettings.set({ name: ' Tienda ' }), { name: 'Tienda' });
    assert.deepEqual(await storeSettings.set({ name: 'Tienda modificada' }), { name: 'Tienda modificada' });
    assert.deepEqual(await storeSettings.set({ name: 'Tienda' }), { name: 'Tienda' });
    await assert.rejects(db.query('INSERT INTO store_settings (id, store_name) VALUES (2, ?)', ['Otra']), { errno: 4025 });
    await assert.rejects(db.query('INSERT INTO categories (id, slug, name) VALUES (?, ?, ?)', ['bad-slug', 'MAYUS', 'Inválida']), { errno: 4025 });
    await assert.rejects(db.query('INSERT INTO colors (id, slug, name, hex) VALUES (?, ?, ?, ?)', ['bad-color', 'color', 'Inválido', '#ff0000']), { errno: 4025 });
    const admin = new CatalogAdmin(db);
    const publicCatalog = new PublicCatalog(db);
    const taxonomy = new CatalogTaxonomy(db);
    const category = await taxonomy.create('categories', { slug: 'decoracion', name: 'Decoración' });
    const pla = await taxonomy.create('materials', { slug: 'pla', name: 'PLA' });
    const petg = await taxonomy.create('materials', { slug: 'petg', name: 'PETG' });
    const red = await taxonomy.create('colors', { slug: 'rojo', name: 'Rojo', hex: '#FF0000' });
    const blue = await taxonomy.create('colors', { slug: 'azul', name: 'Azul' });
    const product = await admin.createProduct({ name: 'Objeto', slug: 'objeto', description: '', status: 'active', categoryId: category.id });
    // Distinct rows must not be combined to satisfy a single variant's predicates.
    const bluePla = await admin.createVariant(product.id, { sku: 'PAIR-1', name: 'Azul PLA', priceMinor: 100, currency: 'ARS', supplyMode: 'stock', materialId: pla.id, colorId: blue.id });
    const redPetg = await admin.createVariant(product.id, { sku: 'PAIR-2', name: 'Rojo PETG', priceMinor: 200, currency: 'ARS', supplyMode: 'stock', materialId: petg.id, colorId: red.id });
    const redPlaUsd = await admin.createVariant(product.id, { sku: 'PAIR-3', name: 'Rojo PLA', priceMinor: 0, currency: 'USD', supplyMode: 'made_to_order', materialId: pla.id, colorId: red.id });
    assert.equal((await publicCatalog.list({ material: 'pla', color: 'rojo', currency: 'ARS' })).total, 0);
    const usd = await publicCatalog.list({ category: 'decoracion', material: 'pla,petg', color: 'rojo', currency: 'USD', minPriceMinor: '0', maxPriceMinor: '0', sort: 'price_asc' });
    assert.equal(usd.total, 1);
    assert.equal(usd.items[0].matchedVariant?.id, redPlaUsd.id);
    assert.deepEqual(usd.items[0].priceRange, { currency: 'USD', minMinor: 0, maxMinor: 0 });
    assert.equal((await publicCatalog.list({ category: 'unknown' })).total, 0);
    const facets = await new PublicFacets(db).get({ currency: 'ARS' });
    assert.deepEqual(facets.currencies, ['ARS', 'USD']);
    assert.equal(facets.categories[0].slug, 'decoracion');
    assert.equal(facets.priceRange?.currency, 'ARS');
    await assert.rejects(taxonomy.archive('categories', category.id), { status: 409 });
    const resolver = new PublicCartResolver(db);
    const resolved = await resolver.resolve({ lines: [{ productId: product.id, variantId: bluePla.id }, { productId: product.id, variantId: redPetg.id }, { productId: 'missing', variantId: bluePla.id }] });
    assert.equal(resolved.resolved.length, 2);
    assert.deepEqual(resolved.missing, [{ productId: 'missing', variantId: bluePla.id }]);
    assert.equal(resolved.resolved[0].variant.material?.slug, 'pla');
    const legacy = await admin.createProduct({ name: 'Sin clasificar', slug: 'sin-clasificar', description: '', status: 'active' });
    const unfiltered = await publicCatalog.list({ search: 'Sin clasificar' });
    assert.equal(unfiltered.items.find(item => item.id === legacy.id)?.category, null);
    assert.equal(unfiltered.items.find(item => item.id === legacy.id)?.matchedVariant, null);
    const ties = await taxonomy.create('categories', { slug: 'empates', name: 'Empates' });
    const a = await admin.createProduct({ name: 'Igual', slug: 'igual-a', description: '', status: 'active', categoryId: ties.id });
    const b = await admin.createProduct({ name: 'Igual', slug: 'igual-b', description: '', status: 'active', categoryId: ties.id });
    for (const [parent, sku] of [[a, 'TIE-A'], [b, 'TIE-B']] as const) {
      await admin.createVariant(parent.id, { sku, name: 'Uno', priceMinor: 100, currency: 'ARS', supplyMode: 'stock' });
    }
    await admin.createVariant(a.id, { sku: 'TIE-A2', name: 'Dos', priceMinor: 100, currency: 'ARS', supplyMode: 'stock' });
    const first = await publicCatalog.list({ category: 'empates', currency: 'ARS', sort: 'price_asc', limit: '1', page: '1' });
    const second = await publicCatalog.list({ category: 'empates', currency: 'ARS', sort: 'price_asc', limit: '1', page: '2' });
    assert.equal(first.total, 2);
    assert.equal(second.total, 2);
    assert.deepEqual([first.items[0].id, second.items[0].id], [a.id, b.id].sort());
    const variantInput = { sku: 'SKU-5', name: 'Rojo', priceMinor: 100, currency: 'ARS', supplyMode: 'stock' as const };
    const createdVariant = await admin.createVariant(product.id, variantInput);
    assert.equal((await publicCatalog.detail('objeto')).variants.find(v => v.id === createdVariant.id)?.priceMinor, 100);
    assert.deepEqual(await publicCatalog.settings(), { name: 'Tienda' });
    await admin.archiveVariant(product.id, createdVariant.id);
    await assert.rejects(admin.updateVariant(product.id, createdVariant.id, variantInput), { status: 404 });
    await admin.archiveProduct(product.id);
    await assert.rejects(admin.updateProduct(product.id, { name: 'Otro', slug: 'objeto', description: '', status: 'active' }), { status: 404 });
    await assert.rejects(publicCatalog.detail('objeto'), { status: 404 });
    await db.query('INSERT INTO admin_users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', ['owner-test', 'owner@example.test', await hashPassword('temporary-password-only'), 'owner']);
    const store = new MysqlIdentityStore(db);
    assert.equal(await store.user('ówner@example.test'), null);
    await assert.rejects(db.query('INSERT INTO admin_users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', ['noncanonical', 'ówner@example.test', 'unused', 'owner']), { errno: 4025 });
    await assert.rejects(db.query('INSERT INTO admin_users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', ['uppercase', 'OTHER@example.test', 'unused', 'owner']), { errno: 4025 });
    await assert.rejects(db.query('INSERT INTO admin_users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', ['spaces', 'other@example.test ', 'unused', 'owner']), { errno: 4025 });
    assert.equal(await store.user('OWNER@example.test'), null);
    assert.equal(await store.user('owner@example.test '), null);
    const identity = new IdentityService(store, 'https://admin.example');
    const login = await identity.login(' OWNER@EXAMPLE.TEST ', 'temporary-password-only', '127.0.0.1', 'https://admin.example');
    assert.equal((await identity.me(login.token)).user.role, 'owner');
    await identity.logout(login.token, 'https://admin.example', login.csrf);
    await assert.rejects(identity.me(login.token), { status: 401 });
    await db.undoLastMigration();
    await db.undoLastMigration();
    await db.undoLastMigration();
    await db.undoLastMigration();
    await db.undoLastMigration();
    await db.undoLastMigration();
    await db.undoLastMigration();
    await db.query('DROP TABLE migrations');
    assert.deepEqual(await db.query('SHOW TABLES'), []);
  } finally {
    await db.destroy();
  }
});
