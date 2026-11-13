import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import type { DataSource } from 'typeorm';
import { emailConfig } from '../order-emails/email-config';
import { buildEmailMessage } from '../order-emails/email-message';
import { renderOrderEmail } from '../order-emails/order-email-template';
import { exampleEmailOrder } from '../order-emails/order-email-model';
import { orderEmailLink } from './order-email-link';
import { trackingDigest } from './tracking-security';
import { TrackingService } from './tracking-service';

const config = emailConfig({ ORDER_EMAIL_MODE: 'live', ENVIALOSIMPLE_API_KEY: 'synthetic', ORDER_EMAIL_FROM: 'orders@store.dev', ORDER_EMAIL_SITE_URL: 'https://store.dev', ORDER_EMAIL_TEST_TO: 'owner@store.dev' });
function fixture(email = 'buyer@store.dev', paymentMode = 'production') {
  const grants = new Map<string, { email: string; allowTest: number; expiresAt: Date }>();
  const queries: { sql: string; args: unknown[] }[] = [];
  const db = { isInitialized: true, async query(sql: string, args: unknown[] = []) {
    queries.push({ sql, args });
    if (sql.includes('SELECT tracking_email')) return [{ email, paymentMode }];
    if (sql.startsWith('INSERT INTO order_tracking_access')) { grants.set(String(args[0]), { email: String(args[1]), allowTest: Number(args[2]), expiresAt: new Date(Date.now() + 90 * 86400000) }); return {}; }
    if (sql.includes('FROM order_tracking_access')) { const access = grants.get(String(args[0])); return access ? [access] : []; }
    if (sql.includes('FROM store_settings')) return [{ name: 'Mali', primaryColor: '#ca0707', whatsappNumber: '', instagramUsername: '' }];
    return [];
  } } as unknown as DataSource;
  return { db, grants, queries };
}

test('confirmation email contains a reusable private link authorized for its actual recipient', async () => {
  const f = fixture(), buyer = 'buyer@store.dev';
  const mail = await buildEmailMessage(f.db, config, 'notification', 'confirmed', { ...exampleEmailOrder, contact: { name: 'Buyer', email: buyer } }, buyer);
  const match = mail.text.match(/https:\/\/store\.dev\/seguimiento#([a-f0-9]{64})/); assert.ok(match);
  const token = match[1], url = match[0];
  assert.ok(mail.html.includes(`href="${url}"`)); assert.match(mail.html, /Seguir mi pedido/); assert.match(mail.text, /90 días/);
  assert.doesNotMatch(mail.text, /Ingresá el correo/); assert.equal(mail.to, buyer);
  const service = new TrackingService(f.db, config);
  for (let i = 0; i < 2; i++) assert.equal((await service.access(token)).email, buyer);
  assert.equal(f.grants.get(trackingDigest(token))?.allowTest, 0);
  assert.ok(!JSON.stringify(f.queries).includes(token), 'raw capability never enters database parameters');
  assert.ok(!JSON.stringify(mail.user_variables).includes(token));
  await assert.rejects(service.access('0'.repeat(64)), { status: 403 });
});

test('test delivery redirects never grant access to the original customer orders', async () => {
  for (const mode of ['live', 'test'] as const) {
    const f = fixture();
    assert.equal(await orderEmailLink(f.db, { ...config, mode }, 'order', config.testTo), undefined);
    assert.equal(f.grants.size, 0);
  }
  const f = fixture(config.testTo, 'test');
  const url = await orderEmailLink(f.db, { ...config, mode: 'test' }, 'order', ' OWNER@Store.Dev '); assert.ok(url);
  assert.equal((await new TrackingService(f.db, config).access(new URL(url).hash.slice(1))).allowTest, 1);
  const other = fixture('other@store.dev', 'test');
  assert.equal(await orderEmailLink(other.db, config, 'order', 'other@store.dev'), undefined);
  assert.equal(other.grants.size, 0);
});

test('private tracking keeps carrier links and rejects unsafe access URLs; previews issue no token', async () => {
  const f = fixture(), url = await orderEmailLink(f.db, config, 'order', 'buyer@store.dev');
  const brand = { name: 'Mali', primaryColor: '#ca0707', siteUrl: config.siteUrl, bannerUrl: '' };
  const shipped = renderOrderEmail('shipped', exampleEmailOrder, brand, undefined, undefined, url);
  assert.ok(shipped.html.includes(`href="${url}"`)); assert.ok(shipped.html.includes(`href="${exampleEmailOrder.trackingUrl}"`));
  for (const unsafe of ['javascript:alert(1)', 'https://foreign.dev/seguimiento#' + 'a'.repeat(64), 'https://store.dev/admin#' + 'a'.repeat(64)]) {
    const mail = renderOrderEmail('confirmed', exampleEmailOrder, brand, undefined, undefined, unsafe);
    assert.ok(!mail.html.includes(unsafe)); assert.match(mail.text, /Ingresá el correo/);
  }
  assert.doesNotMatch(renderOrderEmail('confirmed', exampleEmailOrder, brand).text, /#[a-f0-9]{64}/);
});

test('missing tracking persistence fails preparation before any unbacked link is sent', async () => {
  const db = { async query(sql: string) { if (sql.startsWith('SELECT')) return [{ email: 'buyer@store.dev', paymentMode: 'production' }]; throw Error('Database unavailable'); } } as unknown as DataSource;
  await assert.rejects(orderEmailLink(db, config, 'order', 'buyer@store.dev'), /Database unavailable/);
});
