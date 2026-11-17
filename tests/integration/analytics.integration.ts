import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { createConnection } from 'mysql2/promise';
import { StrictDataSource } from '../../src/infrastructure/database/strict-data-source';
import { CommerceAnalytics1793363000000 } from '../../src/infrastructure/database/migrations/1793363000000-commerce-analytics';
import { CheckoutAnalytics } from '../../src/modules/analytics/analytics-context';
import { AnalyticsWorker } from '../../src/modules/analytics/analytics-worker';

test('real MariaDB: consent, verified approval, duplicate workers, cancelled-order refund and revocation', { skip: process.env.ANALYTICS_LOCAL_INTEGRATION !== '1' }, async () => {
  if (process.env.NODE_ENV !== 'development' || process.env.DB_HOST !== '127.0.0.1') throw Error('Local development database only');
  const database = 'mali_analytics_test_' + randomBytes(8).toString('hex');
  const connection = { host: '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, connectTimeout: 5000 };
  const owner = await createConnection(connection);
  const db = new StrictDataSource({ type: 'mariadb', host: connection.host, port: connection.port, username: connection.user, password: connection.password, database, timezone: 'Z', synchronize: false, migrations: [CommerceAnalytics1793363000000] });
  let created = false;
  const config = { enabled: true, measurementId: 'G-TEST12345', apiSecret: 'synthetic-only' };
  const session = randomUUID(), token = 'a'.repeat(64), sent: { events: { name: string; params: { transaction_id: string; value: number } }[] }[] = [];
  const sender: typeof fetch = async (_url, init) => { sent.push(JSON.parse(String(init?.body))); return new Response(null, { status: 204 }); };
  try {
    await owner.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created = true; await db.initialize();
    await db.query(`CREATE TABLE checkout_orders (id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, session_id CHAR(36), snapshot LONGTEXT NOT NULL, payment_mode VARCHAR(16), payment_status VARCHAR(32), order_status VARCHAR(32), created_at DATETIME(6))`);
    await db.query(`CREATE TABLE order_events (order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin, source VARCHAR(32), detail LONGTEXT, created_at DATETIME(6))`);
    await db.query(`CREATE TABLE store_site_settings (id INT PRIMARY KEY, config LONGTEXT)`);
    await db.query('INSERT INTO store_site_settings VALUES (1, ?)', [JSON.stringify({ analyticsMode: 'gtm', ga4Id: config.measurementId })]);
    await db.runMigrations();
    const service = new CheckoutAnalytics(db, config), worker = () => new AnalyticsWorker(db, config, sender);
    const insert = async (revocationToken = token) => {
      const id = randomUUID();
      const snapshot = { result: { id, testLocal: false, paymentMode: 'production', currency: 'ARS', totalMinor: '5500', shipping: { amountMinor: '500' } }, quote: { lines: [{ productId: 'p', variantId: 'v', name: 'Florero', quantity: 2, currency: 'ARS', priceMinor: '2500' }] } };
      await db.query(`INSERT INTO checkout_orders VALUES (?,?,?,'production','pending','pending',UTC_TIMESTAMP(6))`, [id, session, JSON.stringify(snapshot)]);
      const input = { orderId: id, consent: true, measurementId: config.measurementId, clientId: '123.456', sessionId: String(Math.floor(Date.now() / 1000) - 10), revocationToken };
      assert.deepEqual(await service.save(randomUUID(), input), { saved: false });
      assert.deepEqual(await service.save(session, input), { saved: true });
      await service.save(session, { ...input, clientId: '999.999' });
      assert.equal((await db.query('SELECT client_id FROM checkout_analytics_context WHERE order_id = ?', [id]))[0].client_id, '123.456');
      return id;
    };
    const transition = async (id: string, status: string, source = 'mercadopago') => {
      await db.query('INSERT INTO order_events VALUES (?,?,?,UTC_TIMESTAMP(6))', [id, source, JSON.stringify({ changes: { paymentStatus: { to: status } } })]);
    };
    const id = await insert(); await transition(id, 'approved', 'admin'); await worker().tick(); assert.equal(sent.length, 0);
    await transition(id, 'approved'); await transition(id, 'approved');
    await Promise.all([worker().tick(), worker().tick()]); await worker().tick();
    assert.equal(sent.length, 1); assert.equal(sent[0].events[0].name, 'purchase'); assert.equal(sent[0].events[0].params.value, 50);
    await db.query("UPDATE checkout_orders SET order_status = 'cancelled' WHERE id = ?", [id]);
    await transition(id, 'refunded'); await worker().tick(); await worker().tick();
    assert.equal(sent.length, 2); assert.equal(sent[1].events[0].name, 'refund'); assert.equal(sent[1].events[0].params.transaction_id, id);
    const revoked = await insert(); await service.revoke({ token }); await transition(revoked, 'approved'); await worker().tick(); assert.equal(sent.length, 2);
    assert.deepEqual(await service.save(session, { orderId: revoked, consent: true, measurementId: config.measurementId, clientId: '123.456', sessionId: String(Math.floor(Date.now() / 1000)), revocationToken: token }), { saved: false });
    const expired = await insert('b'.repeat(64)); await db.query('UPDATE checkout_analytics_context SET expires_at = DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 DAY) WHERE order_id = ?', [expired]);
    await new AnalyticsWorker(db, { ...config, enabled: false }, sender).tick();
    assert.equal((await db.query('SELECT client_id FROM checkout_analytics_context WHERE order_id = ?', [expired]))[0].client_id, null);
    assert.equal(sent.length, 2);
    await assert.rejects(db.undoLastMigration(), /Retain analytics/);
  } finally {
    if (db.isInitialized) await db.destroy();
    if (created) await owner.query(`DROP DATABASE ${database}`); await owner.end();
  }
});
