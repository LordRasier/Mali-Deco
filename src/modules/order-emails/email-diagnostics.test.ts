import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { emailConfig } from './email-config';
import { verifyEmailSender } from './email-diagnostics';
import { EnvialoSimple, EmailSendError } from './envialosimple';
import { EmailWorker } from './email-worker';
import { orderEmailsView } from '../../presentation/admin/orders/order-emails-view';
import type { EmailDelivery } from './email-outbox';

const config = emailConfig({ ORDER_EMAIL_MODE: 'live', ENVIALOSIMPLE_API_KEY: 'PRIVATE-API-KEY', ORDER_EMAIL_FROM: 'pedidos@mali-store.com.ar', ORDER_EMAIL_SITE_URL: 'https://mali-store.com.ar' });
const queued: EmailDelivery = { stage: 'confirmed', mode: 'test', status: 'queued', recipient: '', providerId: null, providerStatus: null, errorCode: null,
  createdAt: '2026-11-13T00:35:00Z', updatedAt: '2026-11-13T00:35:00Z', acceptedAt: null, sentAt: null };

test('queued mail from another mode is visibly paused without changing recorded delivery evidence', () => {
  const paused = orderEmailsView('order', [], [queued], 'live')[0];
  assert.equal(paused.statusLabel, 'Pausado');
  assert.match(paused.error, /pertenece a pruebas/);
  assert.equal(paused.deliveryStatus, 'queued');
  assert.equal(paused.deliveryAt, '2026-11-13T00:35:00.000Z');
  assert.equal(orderEmailsView('order', [], [queued], 'test')[0].statusLabel, 'En cola');
  assert.equal(orderEmailsView('order', [], [queued], 'live', true)[0].statusLabel, 'En cola');
  assert.equal(orderEmailsView('order', [], [queued])[0].statusLabel, 'En cola');
  assert.match(orderEmailsView('order', [], [queued], 'disabled')[0].error, /desactivado/);
  assert.match(orderEmailsView('order', [], [{ ...queued, mode: 'live' }], 'test')[0].error, /ventas reales/);
  for (const status of ['sent', 'failed', 'uncertain', 'accepted', 'skipped']) {
    assert.notEqual(orderEmailsView('order', [], [{ ...queued, status }], 'live')[0].statusLabel, 'Pausado');
  }
});

test('sender verification checks the configured domain via GET and never sends a message', async () => {
  const calls: string[] = [];
  const provider = new EnvialoSimple(config, async (url, init) => {
    calls.push(String(url)); assert.equal(init?.method, 'GET');
    return Response.json({ payload: [{ name: 'MALI-STORE.COM.AR', status: 'verified' }] });
  });
  const check = await verifyEmailSender(config, provider);
  assert.equal(check.ok, true); assert.equal(check.code, 'verified');
  assert.deepEqual(calls, ['https://api.envialosimple.email/api/v1/domains']);
  const disabled = await verifyEmailSender({ ...config, mode: 'disabled' }, provider);
  assert.equal(disabled.ok, false); assert.equal(calls.length, 1);
  assert.doesNotMatch(JSON.stringify(check), /PRIVATE-API-KEY|apiKey|Authorization/);
});

test('verification distinguishes rejected credentials, domain status and malformed responses without leaking provider data', async () => {
  for (const [response, code] of [
    [Response.json({ error: 'PRIVATE-API-KEY' }, { status: 401 }), 'provider_http_401'],
    [Response.json({}, { status: 403 }), 'provider_http_403'],
    [Response.json({}, { status: 429 }), 'provider_http_429'],
    [Response.json({}, { status: 404 }), 'provider_domains_unavailable'],
    [Response.json({}, { status: 503 }), 'provider_http_503'],
    [Response.json({ payload: [] }), 'provider_domain_missing'],
    [Response.json({ payload: [{ name: 'mali-store.com.ar', status: 'paused' }] }), 'provider_domain_unverified'],
    [Response.json({ unexpected: 'PRIVATE-API-KEY' }), 'provider_invalid_domains'],
    [new Response('PRIVATE-API-KEY'), 'provider_invalid_response'],
  ] as const) {
    const check = await verifyEmailSender(config, new EnvialoSimple(config, async () => response));
    assert.equal(check.ok, false); assert.equal(check.code, code);
    assert.doesNotMatch(JSON.stringify(check), /PRIVATE-API-KEY|unexpected|apiKey/);
  }
  const check = await verifyEmailSender(config, { domains: async () => { throw new EmailSendError('PRIVATE-API-KEY'); } });
  assert.equal(check.code, 'provider_unavailable'); assert.doesNotMatch(JSON.stringify(check), /PRIVATE/);
});

test('GET connection diagnostics distinguish DNS, timeout and TLS while POST remains uncertain', async () => {
  for (const [failure, code] of [
    [new Error('PRIVATE-API-KEY', { cause: { code: 'ENOTFOUND' } }), 'provider_dns_error'],
    [new Error('PRIVATE-API-KEY', { cause: { code: 'CERT_HAS_EXPIRED' } }), 'provider_tls_error'],
    [new DOMException('PRIVATE-API-KEY', 'TimeoutError'), 'provider_timeout'],
    [new Error('PRIVATE-API-KEY', { cause: { code: 'ECONNRESET' } }), 'provider_network_error'],
  ] as const) {
    let calls = 0;
    const provider = new EnvialoSimple(config, async () => { calls++; throw failure; });
    const check = await verifyEmailSender(config, provider);
    assert.equal(check.code, code); assert.doesNotMatch(JSON.stringify(check), /PRIVATE-API-KEY/);
    await assert.rejects(provider.send({ from: { name: 'Tienda', email: config.from }, to: 'owner@malideco.dev', subject: 'Test', text: 'Test', html: '<p>Test</p>', user_variables: { notification_id: 'n', order_id: 'o', stage: 'confirmed' } }),
      error => error instanceof EmailSendError && error.code === 'provider_response_unknown' && error.uncertain);
    assert.equal(calls, 2);
  }
});

test('a live worker without a test recipient does not attempt test mail or contact the provider', async () => {
  let providerCalls = 0, sends = 0;
  const db = { isInitialized: true, query: async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('SELECT')) { if (sql.includes("status = 'queued'")) assert.deepEqual(params, ['live', 0]); return []; }
    if (sql.includes("SET status = 'uncertain'") || sql.includes("SET status = 'unconfirmed'")) return { affectedRows: 0 };
    throw Error('An ineligible message must not be claimed or sent');
  } } as unknown as DataSource;
  const provider = { domains: async () => { providerCalls++; throw new EmailSendError('provider_http_401'); }, send: async () => { sends++; return 'mail'; } } as unknown as EnvialoSimple;
  const worker = new EmailWorker(db, config, provider);
  await worker.tick(); assert.equal(providerCalls, 0); assert.equal(sends, 0);
});
