import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { StrictDataSource } from '../../src/infrastructure/database/strict-data-source';
import { databaseOptions } from '../../src/infrastructure/database/database-options';
import { SessionService, type CheckoutRequest } from '../../src/modules/checkout/sessions/session';
import { CheckoutQuoteService, type QuoteProvider } from '../../src/modules/checkout/services/quote';
import { OrdersService } from '../../src/modules/orders/services/orders.service';
import { changeVariantStock } from '../../src/modules/catalog/services/variant-stock';

test('checkout lifecycle with real isolated MariaDB and simulated provider', {
  skip: process.env.CHECKOUT_MARIADB_INTEGRATION !== '1' ? 'requires explicit checkout integration flag' : false,
}, async () => {
  if (process.env.DB_HOST !== '127.0.0.1' || process.env.DB_DATABASE !== 'store_integration_test') throw new Error('Requires 127.0.0.1/store_integration_test');
  const db = new StrictDataSource({ ...databaseOptions(), extra: { connectionLimit: 4 } });
  await db.initialize();
  let verifiedEmpty = false;
  try {
    const [server] = await db.query('SELECT VERSION() AS version');
    if (!/MariaDB/i.test(server.version)) throw new Error('Requires MariaDB');
    if ((await db.query('SHOW FULL TABLES')).length) throw new Error('Integration schema must be empty');
    verifiedEmpty = true;
    await db.runMigrations();
    const productId = randomUUID(), variantId = randomUUID();
    await db.query("INSERT INTO products (id, name, description, slug, status, product_weight_g, product_width_mm, product_height_mm, product_length_mm) VALUES (?, ?, '', ?, 'active', 100, 10, 20, 30)", [productId, 'Synthetic', `synthetic-${productId}`]);
    await db.query("INSERT INTO product_variants (id, product_id, sku, name, price_minor, currency, supply_mode) VALUES (?, ?, ?, ?, 100, 'ARS', 'made_to_order')", [variantId, productId, `sku-${variantId}`, 'Variant']);
    const env = { NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000' };
    const request: CheckoutRequest = { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' } };
    const sessions = new SessionService(db, env);
    const first = await sessions.start(request), second = await sessions.start(request);
    const provider: QuoteProvider = async () => ({ status: 'quoted', quotedAt: Date.now(), validUntil: Date.now() + 300000, packageCount: 1, options: [{ carrierId: 1, carrierName: 'Synthetic carrier', serviceCode: 'home', serviceName: 'Synthetic service', logisticType: 'delivery', amountMinor: '50', currency: 'ARS' }] });
    const postal = { resolve: () => ({ country: 'AR' as const, postalCode: '1000', city: 'Ciudad', state: 'Estado' }) };
    const quotes = new CheckoutQuoteService(db, postal, provider, env);
    const quote = () => quotes.quote(first, { lines: [{ productId, variantId, quantity: 2 }], destination: { postalCode: '1000', candidateId: 'synthetic' } });
    const orders = new OrdersService(db);
    const bodyFor = (q: Awaited<ReturnType<typeof quote>>) => ({ quoteId: q.quoteId, optionId: q.options[0].id, pickupPointId: null, contact: { name: 'Synthetic', email: 'synthetic@example.test', phone: '123' }, address: { street: 'Street', number: '1', unit: '' } });
    const q = await quote(), body = bodyFor(q), key = randomUUID();
    const [a, b] = await Promise.all([orders.create(first.id, key, body), orders.create(first.id, key, body)]);
    assert.equal(a.id, b.id); assert.equal(a.totalMinor, '250');
    assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM checkout_orders'))[0].n), 1);
    assert.deepEqual(await orders.create(first.id, key, body), a);
    await assert.rejects(() => orders.create(first.id, key, { ...body, contact: { ...body.contact, name: 'Changed' } }), { status: 409 });
    await assert.rejects(() => orders.create(first.id, randomUUID(), body), { status: 409 });
    const fresh = await quote();
    const another = await orders.create(first.id, randomUUID(), bodyFor(fresh)); assert.notEqual(another.id, a.id);
    await assert.rejects(() => orders.create(second.id, key, body), { status: 409 });
    assert.deepEqual(await orders.findAttempt(second.id, key), { status: 'unknown' });
    const qOther = await quotes.quote(second, { lines: [{ productId, variantId, quantity: 2 }], destination: { postalCode: '1000', candidateId: 'synthetic' } });
    const raceKey = randomUUID();
    const raceQuote = await quote();
    const race = await Promise.allSettled([orders.create(first.id, raceKey, bodyFor(raceQuote)), orders.create(second.id, raceKey, bodyFor(qOther))]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(race.filter(r => r.status === 'rejected').length, 1);
    assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM checkout_orders'))[0].n), 3);
    const oneQuote = await quote(), oneBody = bodyFor(oneQuote);
    const quoteRace = await Promise.allSettled([orders.create(first.id, randomUUID(), oneBody), orders.create(first.id, randomUUID(), oneBody)]);
    assert.equal(quoteRace.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(quoteRace.filter(r => r.status === 'rejected').length, 1);
    assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM checkout_orders'))[0].n), 4);
    const q2 = await quote();
    await db.query('UPDATE checkout_quotes SET expires_at = DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 SECOND) WHERE id = ?', [q2.quoteId]);
    await assert.rejects(() => orders.create(first.id, randomUUID(), bodyFor(q2)), { status: 409 });
    const q3 = await quote();
    await db.query('UPDATE product_variants SET price_minor = 101 WHERE id = ?', [variantId]);
    await assert.rejects(() => orders.create(first.id, randomUUID(), bodyFor(q3)), { status: 409 });
    const list = await orders.list({}); assert.equal(list.total, 4); assert.equal(list.items[0].shippingStatus, 'not_started');
    const detail = await orders.detail(a.id); assert.equal(detail.contact.email, 'synthetic@example.test'); assert.equal(detail.totalMinor, '250');
    // Two independent sessions compete for the same physical units; quoted stock is not reserved.
    await db.query("UPDATE product_variants SET supply_mode = 'stock', stock_quantity = 3 WHERE id = ?", [variantId]);
    const stockBody = { lines: [{ productId, variantId, quantity: 2 }], destination: { postalCode: '1000', candidateId: 'synthetic' } };
    const qStockA = await quotes.quote(first, stockBody), qStockB = await quotes.quote(second, stockBody);
    const keyA = randomUUID(), keyB = randomUUID();
    const stockRace = await Promise.allSettled([orders.create(first.id, keyA, bodyFor(qStockA)), orders.create(second.id, keyB, bodyFor(qStockB))]);
    assert.equal(stockRace.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((stockRace.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.response.code, 'STOCK_UNAVAILABLE');
    assert.equal((await db.query('SELECT stock_quantity AS quantity FROM product_variants WHERE id = ?', [variantId]))[0].quantity, 1);
    const winner = stockRace[0].status === 'fulfilled' ? [first.id, keyA, qStockA] as const : [second.id, keyB, qStockB] as const;
    await orders.create(winner[0], winner[1], bodyFor(winner[2]));
    assert.equal((await db.query('SELECT stock_quantity AS quantity FROM product_variants WHERE id = ?', [variantId]))[0].quantity, 1);
    await assert.rejects(changeVariantStock(db, productId, variantId, { stockQuantity: 10, expectedStockQuantity: 3 }), { status: 409 });
    await changeVariantStock(db, productId, variantId, { stockQuantity: 4, expectedStockQuantity: 1 });
    // A downstream insertion failure must roll the decrement back, not lose inventory.
    const rollbackQuote = await quote();
    await db.query("CREATE TRIGGER reject_test_order BEFORE INSERT ON checkout_orders FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic insert failure'");
    try { await assert.rejects(orders.create(first.id, randomUUID(), bodyFor(rollbackQuote)), { status: 503 }); }
    finally { await db.query('DROP TRIGGER reject_test_order'); }
    assert.equal((await db.query('SELECT stock_quantity AS quantity FROM product_variants WHERE id = ?', [variantId]))[0].quantity, 4);
    // Reversed input order still locks shared products/variants consistently.
    const variant2 = randomUUID();
    await db.query("INSERT INTO product_variants (id, product_id, sku, name, price_minor, currency, supply_mode, stock_quantity) VALUES (?, ?, ?, 'Second', 100, 'ARS', 'stock', 4)", [variant2, productId, variant2]);
    const both = [{ productId, variantId, quantity: 1 }, { productId, variantId: variant2, quantity: 1 }];
    const qa = await quotes.quote(first, { ...stockBody, lines: both }), qb = await quotes.quote(second, { ...stockBody, lines: [...both].reverse() });
    await Promise.all([orders.create(first.id, randomUUID(), bodyFor(qa)), orders.create(second.id, randomUUID(), bodyFor(qb))]);
    assert.deepEqual((await db.query('SELECT stock_quantity AS quantity FROM product_variants WHERE product_id = ? ORDER BY id', [productId])).map((row: { quantity: number }) => row.quantity), [2, 2]);
    await db.query('UPDATE checkout_sessions SET expires_at = DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 SECOND) WHERE id = ?', [first.id]);
    await assert.rejects(() => orders.create(first.id, key, body), { status: 409 });
    await assert.rejects(() => orders.findAttempt(first.id, key), { status: 409 });
  } finally {
    if (verifiedEmpty) {
      const tables = await db.query("SHOW TABLES LIKE 'migrations'");
      if (tables.length) {
        // This schema was verified empty and contains only this test's synthetic fixtures.
        if ((await db.query("SHOW COLUMNS FROM product_variants LIKE 'stock_quantity'")).length) {
          await db.query('UPDATE product_variants SET stock_quantity = 0');
          await db.query('UPDATE products SET bulk_warning_threshold = NULL, bulk_warning_message = NULL');
        }
        const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM migrations');
        for (let i = 0; i < Number(n); i++) await db.undoLastMigration();
        // TypeORM creates this metadata table itself; it was absent at the verified-empty start.
        await db.query('DROP TABLE migrations');
      }
    }
    await db.destroy();
  }
});
