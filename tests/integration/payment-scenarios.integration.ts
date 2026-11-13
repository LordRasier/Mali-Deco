import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createConnection } from 'mysql2/promise';
import { Test } from '@nestjs/testing';
import { StrictDataSource } from '../../src/infrastructure/database/strict-data-source';
import { SessionService } from '../../src/modules/checkout/sessions/session';
import { CheckoutQuoteService } from '../../src/modules/checkout/services/quote';
import { OrdersService } from '../../src/modules/orders/services/orders.service';
import { OrderManagement } from '../../src/modules/orders/services/order-management';
import { MercadoPagoTestProvider } from '../../src/modules/payments/mercadopago';
import { PaymentService } from '../../src/modules/payments/payment-service';
import { PaymentWebhook, PaymentWebhookController } from '../../src/modules/payments/payment-webhook';

type RemotePayment = { id: number; collector_id: number; live_mode: boolean; external_reference: string; currency_id: string; transaction_amount: number; status: string; status_detail?: string };

test('local payment scenarios: real MariaDB and HTTP, simulated Mercado Pago responses', {
  skip: process.env.PAYMENTS_LOCAL_INTEGRATION !== '1' ? 'run npm run test:payments:local with authorized local database credentials' : false,
}, async t => {
  if (process.env.NODE_ENV !== 'development' || process.env.DB_HOST !== '127.0.0.1') throw Error('Only local development is supported');
  const database = 'mali_payments_test_' + randomBytes(8).toString('hex');
  const connection = { host: '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD };
  if (!connection.user || connection.password === undefined || !Number.isInteger(connection.port)) throw Error('Database credentials required');
  const owner = await createConnection(connection);
  let created = false, passed = false, scenarioFailed = false;
  const scenario = (name: string, action: () => Promise<void>) => t.test(name, async () => {
    try { await action(); } catch (error) { scenarioFailed = true; throw error; }
  });
  const db = new StrictDataSource({ type: 'mariadb', host: connection.host, port: connection.port, username: connection.user, password: connection.password, database, timezone: 'Z', synchronize: false,
    migrations: [resolve(__dirname, '../../src/infrastructure/database/migrations/*.ts')], extra: { connectionLimit: 10 } });
  const remote = new Map<string, RemotePayment[]>(), posts = new Map<string, number>(), lostStarts = new Set<string>();
  let apiCalls = 0, failRead = false, incomplete = false, nextPayment = 1000;
  const provider = new MercadoPagoTestProvider({ token: 'synthetic-token', sellerId: '123', returnUrl: 'https://example.test/payments/return', notificationUrl: 'https://example.test/api/v1/payments/mercadopago/webhook' }, async (input, init) => {
    apiCalls++; const url = new URL(String(input));
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-token');
    if (url.href === 'https://api.mercadopago.com/users/me') return Response.json({ id: 123, site_id: 'MLA', tags: ['test_user'] });
    if (url.href === 'https://api.mercadopago.com/checkout/preferences') {
      const body = JSON.parse(String(init?.body)); const id = body.external_reference;
      posts.set(id, (posts.get(id) ?? 0) + 1);
      assert.equal(body.items[0].unit_price, 2.5); assert.equal(body.payer, undefined);
      assert.equal(body.notification_url, 'https://example.test/api/v1/payments/mercadopago/webhook');
      if (lostStarts.has(id)) throw Error('Synthetic lost response');
      return Response.json({ id: '123-' + id, collector_id: 123, external_reference: id, init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-' + id });
    }
    if (failRead) return Response.json({}, { status: 503 });
    if (url.origin !== 'https://api.mercadopago.com') throw Error('Unexpected remote destination');
    if (url.pathname === '/v1/payments/search') { const results = remote.get(url.searchParams.get('external_reference')!) ?? []; return Response.json({ results, paging: { total: results.length + (incomplete ? 1 : 0) } }); }
    const payment = [...remote.values()].flat().find(p => url.pathname === '/v1/payments/' + p.id);
    return Response.json(payment ?? {}, { status: payment ? 200 : 404 });
  });
  const payments = new PaymentService(db, provider), orders = new OrdersService(db), management = new OrderManagement(db);
  const webhookSecret = 'synthetic-signature-key';
  const module = await Test.createTestingModule({ controllers: [PaymentWebhookController], providers: [{ provide: PaymentWebhook, useValue: new PaymentWebhook(db, provider, webhookSecret) }] }).compile();
  const app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api/v1');
  try {
    const [version] = await owner.query('SELECT VERSION() AS version');
    if (!JSON.stringify(version).includes('MariaDB')) throw Error('Requires MariaDB');
    await owner.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); created = true;
    await db.initialize(); await db.runMigrations(); await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(), productId = randomUUID(), variantId = randomUUID();
    await db.query("INSERT INTO products (id,name,description,slug,status,product_weight_g,product_width_mm,product_height_mm,product_length_mm) VALUES (?, 'Synthetic payment product', '', ?, 'active', 100,10,20,30)", [productId, productId]);
    await db.query("INSERT INTO product_variants (id,product_id,sku,name,price_minor,currency,supply_mode,stock_quantity) VALUES (?,?,?,'Synthetic variant',100,'ARS','stock',1000)", [variantId, productId, variantId]);
    const localEnv = { NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3000' };
    const sessions = new SessionService(db, localEnv);
    const quotes = new CheckoutQuoteService(db, { resolve: () => ({ country: 'AR', postalCode: '7600', city: 'Mar del Plata', state: 'Buenos Aires' }) }, async () => ({ status: 'quoted', quotedAt: Date.now(), validUntil: Date.now() + 300000, packageCount: 1, options: [{ carrierId: 1, carrierName: 'Synthetic carrier', serviceCode: 'home', serviceName: 'Synthetic service', logisticType: 'delivery', amountMinor: '50', currency: 'ARS' }] }), localEnv);
    async function make(start = true) {
      const session = await sessions.start({ method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' } });
      const quote = await quotes.quote(session, { lines: [{ productId, variantId, quantity: 2 }], destination: { postalCode: '7600', candidateId: 'fixture' } });
      const body = { quoteId: quote.quoteId, optionId: quote.options[0].id, pickupPointId: null, contact: { name: 'Cliente de prueba', email: 'scenario@example.test', phone: '000' }, address: { street: 'Synthetic', number: '1', unit: '' } };
      const key = randomUUID(), order = await orders.create(session.id, key, body);
      const payment: RemotePayment = { id: nextPayment++, collector_id: 123, live_mode: false, external_reference: order.id, currency_id: 'ARS', transaction_amount: 2.5, status: 'pending' };
      remote.set(order.id, [payment]); if (start) assert.equal((await payments.start(session.id, order.id)).status, 'ready');
      return { order, session, payment, body, key };
    }
    async function notify(id: number, corrupt = false) {
      const requestId = randomUUID(), timestamp = String(Date.now());
      const digest = createHmac('sha256', webhookSecret).update(`id:${id};request-id:${requestId};ts:${timestamp};`).digest('hex');
      return fetch(`${base}/api/v1/payments/mercadopago/webhook?data.id=${id}&type=payment`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId, 'X-Signature': `ts=${timestamp},v1=${corrupt ? '0'.repeat(64) : digest}` }, body: JSON.stringify({ type: 'payment', data: { id: String(id) } }) });
    }
    const state = async (id: string) => (await orders.detail(id)).paymentStatus;
    const count = async (table: string, id: string) => Number((await db.query(`SELECT COUNT(*) n FROM ${table} WHERE order_id=?`, [id]))[0].n);
    const stock = async () => (await db.query('SELECT stock_quantity n FROM product_variants WHERE id=?', [variantId]))[0].n;
    for (const [remoteStatus, expected] of [['pending','pending'],['authorized','pending'],['in_process','pending'],['approved','approved'],['rejected','rejected'],['cancelled','cancelled'],['refunded','refunded'],['charged_back','charged_back'],['in_mediation','in_mediation']]) await scenario(remoteStatus, async () => {
      const f = await make(); f.payment.status = remoteStatus;
      assert.equal((await notify(f.payment.id)).status,200); assert.equal(await state(f.order.id),expected);
    });
    await scenario('concurrent notifications, order replay and refresh never duplicate stock, payment starts or events', async () => {
      const f = await make(); const before = await stock(); f.payment.status = 'approved';
      const responses = await Promise.all(Array.from({length:8},()=>notify(f.payment.id))); assert.ok(responses.every(r=>r.status===200));
      await orders.create(f.session.id,f.key,f.body); await payments.refresh(f.session.id,f.order.id);
      assert.equal(await stock(),before); assert.equal(posts.get(f.order.id),1); assert.equal(await count('order_events',f.order.id),2);
    });
    await scenario('approval, partial refund, mediation, full refund and chargeback preserve terminal evidence', async () => {
      const f = await make();
      for (const [status, detail, expected] of [['approved','','approved'],['pending','','approved'],['approved','partially_refunded','partially_refunded'],['approved','','partially_refunded'],['in_mediation','','in_mediation'],['refunded','','refunded'],['approved','','refunded'],['charged_back','','charged_back'],['refunded','','charged_back']]) {
        f.payment.status=status; f.payment.status_detail=detail; assert.equal((await notify(f.payment.id)).status,200); assert.equal(await state(f.order.id),expected);
      }
    });
    await scenario('mediation can resolve to verified approval', async () => {
      const f=await make(); f.payment.status='in_mediation'; await notify(f.payment.id); f.payment.status='approved'; await notify(f.payment.id); assert.equal(await state(f.order.id),'approved');
    });
    await scenario('invalid signature stops before provider access', async () => {
      const f=await make(), before=apiCalls; assert.equal((await notify(f.payment.id,true)).status,401); assert.equal(apiCalls,before); assert.equal(await state(f.order.id),'pending');
    });
    await scenario('Checkout Pro live_mode=true from a verified test seller is approved once', async () => {
      const f=await make(), before=await stock(); f.payment.live_mode=true; f.payment.status='approved';
      assert.equal((await notify(f.payment.id)).status,200); assert.equal(await state(f.order.id),'approved');
      assert.equal((await notify(f.payment.id)).status,200); assert.equal(await count('order_events',f.order.id),2); assert.equal(await stock(),before);
    });
    for (const change of [{collector_id:999},{live_mode:'true'},{currency_id:'USD'},{transaction_amount:2.51},{external_reference:randomUUID()},{status:'unknown'}]) await scenario('reject inconsistent provider fields: '+Object.keys(change)[0], async () => {
      const f=await make(); Object.assign(f.payment,{status:'approved'},change); const response=await notify(f.payment.id);
      assert.ok([200,503].includes(response.status)); assert.equal(await state(f.order.id),'pending');
    });
    await scenario('incomplete or ambiguous searches request retry without modifying the order', async () => {
      const f=await make(); f.payment.status='approved'; incomplete=true;
      try { assert.equal((await notify(f.payment.id)).status,503); } finally {incomplete=false;}
      remote.get(f.order.id)!.push({...f.payment,id:nextPayment++}); assert.equal((await notify(f.payment.id)).status,503); assert.equal(await state(f.order.id),'pending');
    });
    await scenario('provider outage is recoverable; expired customer sessions do not block S2S', async () => {
      const f=await make(); f.payment.status='approved'; failRead=true;
      try { assert.equal((await notify(f.payment.id)).status,503); } finally {failRead=false;}
      await db.query('UPDATE checkout_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE id=?',[f.session.id]);
      await assert.rejects(payments.refresh(f.session.id,f.order.id),{status:404});
      assert.equal((await notify(f.payment.id)).status,200); assert.equal(await state(f.order.id),'approved');
    });
    await scenario('concurrent starts create once; lost responses remain uncertain', async () => {
      const f=await make(false); await Promise.all([payments.start(f.session.id,f.order.id),payments.start(f.session.id,f.order.id)]); assert.equal(posts.get(f.order.id),1);
      const lost=await make(false); lostStarts.add(lost.order.id);
      assert.equal((await payments.start(lost.session.id,lost.order.id)).status,'uncertain'); assert.equal((await payments.start(lost.session.id,lost.order.id)).status,'uncertain'); assert.equal(posts.get(lost.order.id),1);
      lost.payment.status='approved'; assert.equal((await notify(lost.payment.id)).status,200); assert.equal(await state(lost.order.id),'approved');
    });
    await scenario('cancelled orders cannot initiate a checkout, but an existing payment is still reconciled', async () => {
      const f=await make(false);
      await db.query("UPDATE checkout_orders SET order_status='cancelled' WHERE id=?",[f.order.id]);
      await assert.rejects(payments.start(f.session.id,f.order.id),{status:409}); assert.equal(posts.has(f.order.id),false);
      const existing=await make(); await db.query("UPDATE checkout_orders SET order_status='cancelled' WHERE id=?",[existing.order.id]);
      existing.payment.status='approved'; assert.equal((await notify(existing.payment.id)).status,200);
      const result=await orders.detail(existing.order.id); assert.equal(result.orderStatus,'cancelled'); assert.equal(result.paymentStatus,'approved');
    });
    await scenario('administrative writes preserve newer payments and their audit trail', async () => {
      const f=await make(), old=await orders.detail(f.order.id); f.payment.status='approved'; await notify(f.payment.id);
      const update={revision:old.revision,orderStatus:'confirmed',paymentStatus:'pending',fulfillmentStatus:'ready',shippingStatus:'not_started',trackingNumber:'',trackingUrl:'',internalNote:'Synthetic note',reason:'Local scenario'};
      await assert.rejects(management.update(f.order.id,update,'operator@example.test'),{status:409});
      const latest=await orders.detail(f.order.id); await assert.rejects(management.update(f.order.id,{...update,revision:latest.revision},'operator@example.test'),{status:409});
      await management.update(f.order.id,{...update,revision:latest.revision,paymentStatus:'approved',shippingStatus:'shipped'},'operator@example.test');
      const edited=await orders.detail(f.order.id); assert.equal(edited.shippingStatus,'shipped'); assert.equal(edited.events.length,3);
      assert.ok((await orders.list({search:'scenario@example.test',paymentStatus:'approved'})).total>0);
    });
    await scenario('attachment retries deduplicate; downloads retain bytes; count limit is enforced', async () => {
      const f=await make(); const bytes=Buffer.from('%PDF-1.7\nSynthetic receipt'); const file={buffer:bytes,size:bytes.length,originalname:'receipt.pdf'};
      const [a,b]=await Promise.all([management.attach(f.order.id,file,'operator'),management.attach(f.order.id,file,'operator')]); assert.equal(a.id,b.id);
      assert.equal(await count('order_attachments',f.order.id),1); assert.deepEqual((await management.download(f.order.id,a.id)).content,bytes);
      for(let i=1;i<20;i++){const buffer=Buffer.from('%PDF-1.7\nSynthetic '+i);await management.attach(f.order.id,{...file,buffer,size:buffer.length},'operator');}
      const buffer=Buffer.from('%PDF-1.7\nOver limit'); await assert.rejects(management.attach(f.order.id,{...file,buffer,size:buffer.length},'operator'),{status:409});
      assert.equal((await management.attach(f.order.id,file,'operator')).id,a.id);
    });
    await scenario('audit storage failure rolls back the payment; retry succeeds after recovery', async () => {
      const f=await make(); f.payment.status='approved';
      await db.query("CREATE TRIGGER reject_payment_event BEFORE INSERT ON order_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic failure'");
      try {assert.equal((await notify(f.payment.id)).status,503);assert.equal(await state(f.order.id),'pending');}
      finally {await db.query('DROP TRIGGER reject_payment_event');}
      assert.equal((await notify(f.payment.id)).status,200);assert.equal(await state(f.order.id),'approved');
    });
    passed = !scenarioFailed;
  } finally {
    await app.close(); if (db.isInitialized) await db.destroy();
    // Drop only the freshly created, random schema owned by this run, and only on success.
    if (created && passed && /^mali_payments_test_[a-f0-9]{16}$/.test(database)) await owner.query('DROP DATABASE `' + database + '`');
    else if (created) t.diagnostic('Scenario schema retained for diagnosis: '+database);
    await owner.end();
  }
});
