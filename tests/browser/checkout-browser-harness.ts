/**
 * Local browser-only harness. Install @nestjs/testing at the matching Nest version first.
 * In a clean shell set CHECKOUT_BROWSER_E2E=1, NODE_ENV=development, DB_HOST=127.0.0.1,
 * DB_DATABASE=store_integration_test, DB_PORT=3306, DB_USERNAME=root, DB_PASSWORD empty,
 * DB_ALLOW_EMPTY_PASSWORD=1, STOREFRONT_MODE=api, PORT=3000,
 * ZIPNOVA_OPERATOR_ORIGIN=http://127.0.0.1:3000.
 * Run: node_modules/.bin/tsx tests/browser/checkout-browser-harness.ts
 * Build browser assets first. This one Nest server serves HTML and the unchanged /api/v1 API.
 * Login: synthetic@example.test / synthetic-only. Use synthetic contact details only.
 * Type verify + Enter to exercise persistence/idempotency; type stop + Enter to stop.
 * The schema must already exist and be empty. Coordinate exclusive access externally;
 * preflight detects current clients but cannot prevent future connections. Migration failure preserves objects.
 * On shutdown the schema is always preserved for manual inspection and cleanup.
 * No database is created or dropped. Never use this harness with real data.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { checkoutHarnessPolicy } from './checkout-browser-policy';
import { harnessFetch } from './checkout-browser-network';
import { assertCheckoutSchema } from './checkout-browser-schema';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function main() {
  const { port, origin } = checkoutHarnessPolicy(process.env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = harnessFetch(originalFetch, port);
  process.env.NODE_ENV = 'development';
  process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'true';
  // Import only after the policy has passed: AppModule evaluates DB_HOST at import time.
  const [{ Test }, { DataSource }, { applicationModule }, { StrictDataSource }, { databaseOptions },
    { PostalCodeResolver }, { ShippingQuoteService }, { CheckoutQuoteService }, { IdentityService },
    { ForbiddenException, UnauthorizedException }, { configureHttp }] = await Promise.all([
    import('@nestjs/testing'), import('typeorm'), import('../../src/app.module'), import('../../src/infrastructure/database/strict-data-source'), import('../../src/infrastructure/database/database-options'),
    import('../../src/modules/shipping/postal/postal-code-resolver'), import('../../src/modules/shipping/quotes/catalog-quote'), import('../../src/modules/checkout/services/quote'), import('../../src/modules/identity/services/identity-service'),
    import('@nestjs/common'), import('../../src/presentation/configure-http'),
  ]);
  const db = new StrictDataSource(databaseOptions());
  await db.initialize();

  let app: NestExpressApplication | undefined;

  const product = randomUUID(), variant = randomUUID();
  try {
    const [server] = await db.query('SELECT DATABASE() AS schema_name, VERSION() AS version');
    if (server.schema_name !== 'store_integration_test' || !/MariaDB/i.test(server.version)) throw new Error('Wrong schema or server');
    if ((await db.query('SHOW FULL TABLES')).length) throw new Error('Schema is not empty; no changes made');
    // Fail closed if visibility of other users' connections and stored objects is uncertain.
    const privileges: Array<{ PRIVILEGE_TYPE: string }> = await db.query(`SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES
      WHERE GRANTEE = CONCAT(QUOTE(SUBSTRING_INDEX(CURRENT_USER(), '@', 1)), '@', QUOTE(SUBSTRING_INDEX(CURRENT_USER(), '@', -1)))`);
    const availablePrivileges = new Set(privileges.map(row => row.PRIVILEGE_TYPE));
    if (!['SELECT', 'PROCESS', 'EVENT', 'SHOW DATABASES'].every(name => availablePrivileges.has(name))) throw new Error('Insufficient preflight visibility');
    const [objects] = await db.query("SELECT (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?) AS routines, (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?) AS events", ['store_integration_test', 'store_integration_test']);
    if (Number(objects.routines) !== 0 || Number(objects.events) !== 0) throw new Error('Schema contains stored objects');
    const [clients] = await db.query('SELECT COUNT(*) AS n FROM information_schema.PROCESSLIST WHERE DB = ? AND ID <> CONNECTION_ID()', ['store_integration_test']);
    if (Number(clients.n) !== 0) throw new Error('Other schema clients are connected');
    // A partial migration is deliberately not unwound: ownership cannot be established safely.
    await db.runMigrations();
    const rows = await db.query('SHOW FULL TABLES');
    assertCheckoutSchema(rows);

    await db.query("INSERT INTO products (id,name,description,slug,status,product_weight_g,product_width_mm,product_height_mm,product_length_mm) VALUES (?,?,'Synthetic browser test',?,'active',100,10,20,30)", [product, 'Synthetic made-to-order item', `synthetic-${product}`]);
    await db.query("INSERT INTO product_variants (id,product_id,sku,name,price_minor,currency,supply_mode) VALUES (?,?,?,?,10000,'ARS','made_to_order')", [variant, product, `synthetic-${variant}`, 'Synthetic variant']);
    await db.query("INSERT INTO store_settings (id,store_name) VALUES (1,'Synthetic store')");
    const candidate = 's'.repeat(24);
    const postal = {
      lookup: async (code: string) => /^\d{4}$/.test(code) ? { status: 'resolved' as const, candidate: { id: candidate, label: 'Ciudad sintética, Estado' } } : { status: 'invalid' as const },
      resolve: (code: string, id: string) => /^\d{4}$/.test(code) && id === candidate ? { country: 'AR' as const, postalCode: code, city: 'Ciudad', state: 'Estado' } : null,
    };
    const provider = async () => ({ status: 'quoted' as const, quotedAt: Date.now(), validUntil: Date.now() + 300000, packageCount: 1, options: [{ carrierId: 1, carrierName: 'Synthetic carrier', serviceCode: 'home', serviceName: 'Synthetic delivery', logisticType: 'delivery', amountMinor: '50', currency: 'ARS' }] });
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    const user = { id: randomUUID(), email: 'synthetic@example.test', role: 'owner' as const };
    const identity = {
      login: async (email: unknown, password: unknown, _ip: string, requestOrigin?: string) => {
        if (requestOrigin !== origin || email !== user.email || password !== 'synthetic-only') throw new UnauthorizedException();
        return { token, csrf, user, expires: new Date(Date.now() + 3600000) };
      },
      authorize: async (supplied: string | undefined, roles: string[], mutation?: { origin?: string; csrf?: string }) => {
        if (supplied !== token || !roles.includes(user.role)) throw new UnauthorizedException();
        if (mutation && (mutation.origin !== origin || mutation.csrf !== csrf)) throw new ForbiddenException();
        return { userId: user.id, email: user.email, role: user.role };
      },
      me: async (supplied: string | undefined) => { await identity.authorize(supplied, ['owner']); return { user }; },
      issueCsrf: async (supplied: string | undefined, requestOrigin?: string) => { await identity.authorize(supplied, ['owner']); if (requestOrigin !== origin) throw new ForbiddenException(); return { csrf }; },
      logout: async (supplied: string | undefined, requestOrigin?: string, suppliedCsrf?: string) => { await identity.authorize(supplied, ['owner'], { origin: requestOrigin, csrf: suppliedCsrf }); },
    };
    const quotes = new CheckoutQuoteService(db, postal, provider, process.env);
    // Only this isolated harness mounts checkout alongside the real catalog.
    const { CheckoutModule } = await import('../../src/modules/checkout/checkout.module');
    const { MvcCheckoutController } = await import('../../src/presentation/checkout/checkout.controller');
    const { CheckoutPage } = await import('../../src/presentation/checkout/checkout-page');
    const { CatalogModule } = await import('../../src/modules/catalog/catalog.module');
    const { PublicCatalog } = await import('../../src/modules/catalog/services/public-catalog');
    const module = await Test.createTestingModule({ imports: [applicationModule(process.env), CatalogModule, CheckoutModule],
      controllers: [MvcCheckoutController], providers: [{ provide: CheckoutPage, useFactory: (catalog: InstanceType<typeof PublicCatalog>) =>
        new CheckoutPage(catalog, 'api', process.env), inject: [PublicCatalog] }] })
      .overrideProvider(DataSource).useValue(db)
      .overrideProvider(PostalCodeResolver).useValue(postal)
      .overrideProvider(ShippingQuoteService).useValue(new ShippingQuoteService(provider, true))
      .overrideProvider(CheckoutQuoteService).useValue(quotes)
      .overrideProvider(IdentityService).useValue(identity).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app);
    await app.listen(port, '127.0.0.1');
    console.log('Synthetic same-origin Nest storefront/API ready on loopback. Commands: verify, stop.');
    const input = createInterface({ input: process.stdin, terminal: false });
    const stop = () => input.close();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    for await (const command of input) {
      if (command.trim() === 'stop') break;
      if (command.trim() !== 'verify') { console.log('Commands: verify, stop'); continue; }
      try {
        // Require one existing synthetic order before verification traffic. Browser observation separately proves the rendered checkout flow.
        const existing = await db.query('SELECT snapshot, order_status, payment_status, fulfillment_status, shipping_status FROM checkout_orders');
        assert.equal(existing.length, 1);
        const snapshot = JSON.parse(existing[0].snapshot);
        assert.equal(snapshot.result.testLocal, true);
        assert.equal(existing[0].order_status, 'received');
        assert.equal(existing[0].payment_status, 'not_started');
        assert.equal(existing[0].fulfillment_status, 'not_started');
        assert.equal(existing[0].shipping_status, 'not_started');
        assert.match(snapshot.result.contact.email, /^[^@\s]+@example\.test$/i);
        assert.ok(Array.isArray(snapshot.quote.lines) && snapshot.quote.lines.some((line: { productId: string; variantId: string }) => line.productId === product && line.variantId === variant));
        const base = `http://127.0.0.1:${port}/api/v1/checkout`;
        const common = { host: new URL(origin).host, origin, 'content-type': 'application/json' };
        const start = await fetch(`${base}/session`, { method: 'POST', headers: common, body: '{}' });
        assert.equal(start.status, 200);
        const cookie = start.headers.getSetCookie().map(value => value.split(';', 1)[0]).find(value => value.startsWith('store_checkout='));
        assert.ok(cookie);
        const session = await start.json() as { csrf: string };
        assert.equal(typeof session.csrf, 'string');
        const headers = { ...common, cookie, 'x-csrf-token': session.csrf };
        const quote = async () => {
          const response = await fetch(`${base}/quotes`, { method: 'POST', headers, body: JSON.stringify({ lines: [{ productId: product, variantId: variant, quantity: 2 }], destination: { postalCode: '1000', candidateId: candidate } }) });
          assert.equal(response.status, 200);
          return await response.json() as { quoteId: string; options: { id: string }[] };
        };
        const orderBody = (q: Awaited<ReturnType<typeof quote>>) => ({ quoteId: q.quoteId, optionId: q.options[0].id, pickupPointId: null, contact: { name: 'Synthetic', email: 'synthetic@example.test', phone: '123' }, address: { street: 'Synthetic', number: '1', unit: '' } });
        const order = (key: string, body: ReturnType<typeof orderBody>) => fetch(`${base}/orders`, { method: 'POST', headers: { ...headers, 'idempotency-key': key }, body: JSON.stringify(body) });
        const firstBody = orderBody(await quote()), key = randomUUID();
        const firstResponse = await order(key, firstBody); assert.equal(firstResponse.status, 200);
        const first = await firstResponse.json() as { id: string };
        const replayResponse = await order(key, firstBody); assert.equal(replayResponse.status, 200);
        const replay = await replayResponse.json() as { id: string }; assert.equal(replay.id, first.id);
        assert.equal((await order(randomUUID(), firstBody)).status, 409);
        const secondResponse = await order(randomUUID(), orderBody(await quote())); assert.equal(secondResponse.status, 200);
        const second = await secondResponse.json() as { id: string }; assert.notEqual(second.id, first.id);
        assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM checkout_orders'))[0].n), 3);
        console.log('Verification passed: existing synthetic order, HTTP replay, quote reuse rejection and three persisted orders.');
      } catch {
        process.exitCode = 1;
        console.error('Verification failed; schema will be preserved for inspection.');
      }
    }
    input.close();
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  } finally {
    try {
      if (app) await app.close();
    } finally {
      if (db.isInitialized) await db.destroy();
      globalThis.fetch = originalFetch;
      console.error('Schema preserved for manual inspection and cleanup.');
    }
  }
}
void main().catch(() => { console.error('Harness failed; inspect configuration and preserve schema for manual review.'); process.exitCode = 1; });
