import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { createConnection } from 'mysql2/promise';
import { StrictDataSource } from '../../src/infrastructure/database/strict-data-source';
import { OrderTracking1793362800000 } from '../../src/infrastructure/database/migrations/1793362800000-order-tracking';
import { emailConfig } from '../../src/modules/order-emails/email-config';
import { EnvialoSimple, type EmailMessage } from '../../src/modules/order-emails/envialosimple';
import { exampleEmailOrder } from '../../src/modules/order-emails/order-email-model';
import { TrackingService } from '../../src/modules/order-tracking/tracking-service';
import { TrackingWorker } from '../../src/modules/order-tracking/tracking-worker';
import { trackingDigest } from '../../src/modules/order-tracking/tracking-security';

test('tracking migration and reusable access with real isolated MariaDB, synthetic email provider only', { skip: process.env.TRACKING_LOCAL_INTEGRATION !== '1' }, async () => {
  if (process.env.NODE_ENV !== 'development' || process.env.DB_HOST !== '127.0.0.1') throw Error('Local development database only');
  const database = 'mali_tracking_test_' + randomBytes(8).toString('hex');
  const connection = { host: '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, connectTimeout: 5000 };
  const owner = await createConnection(connection), db = new StrictDataSource({ type: 'mariadb', host: connection.host, port: connection.port, username: connection.user, password: connection.password, database, timezone: 'Z', synchronize: false, migrations: [OrderTracking1793362800000] });
  let created = false;
  const config = emailConfig({ ORDER_EMAIL_MODE: 'live', ENVIALOSIMPLE_API_KEY: 'synthetic', ORDER_EMAIL_FROM: 'orders@store.dev', ORDER_EMAIL_SITE_URL: 'https://store.dev', ORDER_EMAIL_TEST_TO: 'owner@store.dev' });
  const messages: EmailMessage[] = [], provider = new EnvialoSimple(config, async (_url, init) => { messages.push(JSON.parse(String(init?.body))); return Response.json({ queued: true, id: 'synthetic-mail-' + messages.length }); });
  try {
    await owner.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created = true; await db.initialize();
    await db.query(`CREATE TABLE checkout_orders (id CHAR(36) PRIMARY KEY, snapshot LONGTEXT NOT NULL, payment_mode VARCHAR(16) NOT NULL,
      created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL, currency CHAR(3) NOT NULL, total_minor BIGINT NOT NULL,
      payment_status VARCHAR(32) DEFAULT 'approved', order_status VARCHAR(32) DEFAULT 'confirmed', fulfillment_status VARCHAR(32) DEFAULT 'preparing', shipping_status VARCHAR(32) DEFAULT 'not_started', tracking_number VARCHAR(160) DEFAULT '', tracking_url VARCHAR(1000) DEFAULT '')`);
    const insertOrder = async (email: string, mode = 'production') => { const id = randomUUID(); await db.query(`INSERT INTO checkout_orders (id,snapshot,payment_mode,created_at,updated_at,currency,total_minor) VALUES (?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),'ARS',50000)`, [id, JSON.stringify({ result: { ...exampleEmailOrder, contact: { name: 'Fixture', email } } }), mode]); return id; };
    // Backfill the generated ownership index from existing orders, including case and whitespace normalization.
    await insertOrder(' BUYER@store.dev '); await insertOrder('other@store.dev'); await insertOrder('buyer+alias@store.dev');
    await db.runMigrations();
    const service = new TrackingService(db, config), worker = () => new TrackingWorker(db, config, provider, async () => 'Fixture');
    await Promise.all(Array.from({ length: 5 }, () => service.requestLink('buyer@store.dev')));
    assert.equal(Number((await db.query('SELECT COUNT(*) AS total FROM order_tracking_requests'))[0].total), 1);
    await Promise.all([worker().tick(), worker().tick()]); assert.equal(messages.length, 1);
    const token = /seguimiento#([a-f0-9]{64})/.exec(messages[0].text)![1];
    assert.equal((await service.orders(token, 1)).total, 1); assert.equal((await service.orders(token, 1)).items.length, 1);
    await insertOrder('buyer@store.dev'); await insertOrder('buyer@store.dev', 'test');
    assert.equal((await service.orders(token, 1)).total, 2);
    assert.ok((await service.orders(token, 1)).items.every(o => !o.test && o.email.trim().toLowerCase() === 'buyer@store.dev'));
    await assert.rejects(service.orders('b'.repeat(64), 1));
    await service.requestLink('unknown@store.dev'); await worker().tick(); assert.equal(messages.length, 1);
    await insertOrder('owner@store.dev', 'test'); await service.requestLink('owner@store.dev'); await worker().tick(); assert.equal(messages.length, 2);
    const testToken = /seguimiento#([a-f0-9]{64})/.exec(messages[1].text)![1]; assert.equal((await service.orders(testToken, 1)).items[0].test, true);
    await db.query('UPDATE order_tracking_access SET expires_at = DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 DAY) WHERE token_hash = ?', [trackingDigest(token)]);
    await assert.rejects(service.orders(token, 1));
    await assert.rejects(db.undoLastMigration(), /retained/);
  } finally {
    if (db.isInitialized) await db.destroy();
    if (created) await owner.query(`DROP DATABASE ${database}`); await owner.end();
  }
});
