import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database-options';
import { CatalogAdmin } from '../catalog/catalog-admin';
import { PublicCatalog } from '../catalog/public-catalog';
import { IdentityService } from '../identity/identity-service';
import { MysqlIdentityStore } from '../identity/identity-store';
import { hashPassword } from '../identity/security';

test('migration creates constraints and can be reverted on empty isolated MySQL', {
  skip: process.env.MYSQL_INTEGRATION !== '1' ? 'requires explicit isolated MySQL configuration' : false,
}, async () => {
  if (process.env.DB_DATABASE !== 'store_integration_test' || !['127.0.0.1', 'localhost'].includes(process.env.DB_HOST ?? '')) {
    throw new Error('Integration test requires local store_integration_test database');
  }
  const db = new DataSource(databaseOptions());
  await db.initialize();
  try {
    const existing: unknown[] = await db.query('SHOW TABLES');
    if (existing.length) throw new Error('Integration database must be empty');
    await db.runMigrations();
    await db.query('INSERT INTO products (id, name, description, slug) VALUES (?, ?, ?, ?)', ['p1', 'Pieza', '', 'pieza']);
    const insert = 'INSERT INTO product_variants (id, product_id, sku, name, price_minor, currency) VALUES (?, ?, ?, ?, ?, ?)';
    await db.query(insert, ['v1', 'p1', 'SKU-1', 'Rojo', 100, 'ARS']);
    await assert.rejects(db.query(insert, ['v2', 'p1', 'SKU-1', 'Azul', 100, 'ARS']), { code: 'ER_DUP_ENTRY' });
    await assert.rejects(db.query(insert, ['v3', 'missing', 'SKU-2', 'Azul', 100, 'ARS']), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(db.query(insert, ['v4', 'p1', 'SKU-3', 'Azul', 100, 'ar']), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    await assert.rejects(db.query(insert, ['v5', 'p1', 'SKU-4', 'Azul', '9007199254740992', 'ARS']), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    await db.query('INSERT INTO store_settings (id, store_name) VALUES (1, ?)', ['Tienda']);
    await assert.rejects(db.query('INSERT INTO store_settings (id, store_name) VALUES (2, ?)', ['Otra']), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    const admin = new CatalogAdmin(db);
    const publicCatalog = new PublicCatalog(db);
    const product = await admin.createProduct({ name: 'Objeto', slug: 'objeto', description: '', status: 'active' });
    const variantInput = { sku: 'SKU-5', name: 'Rojo', priceMinor: 100, currency: 'ARS', supplyMode: 'stock' as const };
    const createdVariant = await admin.createVariant(product.id, variantInput);
    assert.equal((await publicCatalog.detail('objeto')).variants[0].priceMinor, 100);
    assert.deepEqual(await publicCatalog.settings(), { name: 'Tienda' });
    await admin.archiveVariant(product.id, createdVariant.id);
    await assert.rejects(admin.updateVariant(product.id, createdVariant.id, variantInput), { status: 404 });
    await admin.archiveProduct(product.id);
    await assert.rejects(admin.updateProduct(product.id, { name: 'Otro', slug: 'objeto', description: '', status: 'active' }), { status: 404 });
    await assert.rejects(publicCatalog.detail('objeto'), { status: 404 });
    await db.query('INSERT INTO admin_users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', ['owner-test', 'owner@example.test', await hashPassword('temporary-password-only'), 'owner']);
    const store = new MysqlIdentityStore(db);
    assert.equal(await store.user('ówner@example.test'), null);
    await assert.rejects(db.query('INSERT INTO admin_users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', ['noncanonical', 'ówner@example.test', 'unused', 'owner']), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    const identity = new IdentityService(store, 'https://admin.example');
    const login = await identity.login(' OWNER@EXAMPLE.TEST ', 'temporary-password-only', '127.0.0.1', 'https://admin.example');
    assert.equal((await identity.me(login.token)).user.role, 'owner');
    await identity.logout(login.token, 'https://admin.example', login.csrf);
    await assert.rejects(identity.me(login.token), { status: 401 });
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
