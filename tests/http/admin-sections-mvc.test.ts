import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from '../../src/presentation/configure-http';
import { IdentityService } from '../../src/modules/identity/services/identity-service';
import { StoreSettings } from '../../src/modules/settings/store-settings';
import { OrdersService } from '../../src/modules/orders/services/orders.service';

test('orders/settings HTML uses private escaped views and authorizes before service reads', async () => {
  const saved = { ...process.env }; let app: NestExpressApplication | undefined;
  delete process.env.DB_HOST; process.env.NODE_ENV = 'development'; process.env.STOREFRONT_MODE = 'api';
  process.env.ZIPNOVA_ENABLED = 'false'; process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false';
  let role: 'owner' | 'catalog' | 'operations' = 'owner', orderReads = 0, settingsReads = 0;
  const token = 'a'.repeat(64), env = { NODE_ENV: 'development', MVC_PILOT_ENABLED: 'true' };
  const summary = { id: 'synthetic-order', createdAt: '2026-01-01T12:00:00Z', currency: 'ARS', totalMinor: '1200', testLocal: true, orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started' };
  try {
    const { applicationModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({ imports: [applicationModule(env)] })
      .overrideProvider(IdentityService).useValue({ me: async (value: string) => { if (value !== token) throw new UnauthorizedException(); return { user: { id: 'synthetic', email: 'synthetic@example.test', role } }; } })
      .overrideProvider(StoreSettings).useValue({ get: async () => { settingsReads++; return { name: '<script>brand</script>' }; } })
      .overrideProvider(OrdersService).useValue({ list: async () => { orderReads++; return { items: [summary], page: 1, limit: 20, total: 1 }; }, detail: async () => { orderReads++; return { ...summary, contact: { name: '<img onerror=bad>', email: 'synthetic@example.test', phone: '123' }, destination: { street: 'Synthetic', number: '1', unit: '', city: 'City', state: 'State', country: 'AR', postalCode: '1000' }, shipping: { carrierName: 'Synthetic', serviceName: 'Local test', amountMinor: '200', currency: 'ARS', pickupPoint: null }, lines: [{ name: 'Synthetic product', variantName: 'Example', quantity: 1, unitPriceMinor: '1000', lineTotalMinor: '1000', currency: 'ARS' }] }; } }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false }); configureHttp(app); await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl(), get = (path: string) => fetch(origin + '/admin/sections/' + path, { headers: { Cookie: 'store_admin=' + token } });
    const settings = await get('settings'); assert.equal(settings.status, 200); const html = await settings.text();
    assert.match(html, /value="&lt;script&gt;brand&lt;\/script&gt;"/); assert.match(html, /data-settings-fields disabled/); assert.doesNotMatch(html, /<script>|csrf|aaaaaa/);
    assert.equal(settings.headers.get('cache-control'), 'private, no-store');
    const detail = await get('orders?view=detail&id=synthetic-order'); assert.equal(detail.status, 200); const body = await detail.text();
    assert.match(body, /&lt;img onerror&#x3D;bad&gt;/); assert.match(body, /Synthetic product/); assert.doesNotMatch(body, /<img onerror/); assert.match(body, /data-order-edit/);
    role = 'catalog'; const before = orderReads; assert.equal((await get('orders')).status, 403); assert.equal(orderReads, before);
    role = 'operations'; assert.equal((await get('orders')).status, 200); const settingsBefore = settingsReads;
    assert.equal((await get('settings')).status, 403); assert.equal(settingsReads, settingsBefore);
    role = 'owner'; assert.equal((await get('settings?layout=secret')).status, 400); assert.equal((await get('orders?view=other')).status, 400);
    assert.equal((await fetch(origin + '/admin/sections/orders')).status, 401);
    assert.equal((await fetch(origin + '/admin/sections/settings', { method: 'PUT' })).status, 404);
  } finally { await app?.close(); process.env = saved; }
});
