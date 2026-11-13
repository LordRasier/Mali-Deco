import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MercadoPagoTestProvider, paymentConfig } from './mercadopago';

const env = { NODE_ENV: 'development', LOCAL_TEST_CHECKOUT_ENABLED: 'true', MERCADOPAGO_TEST_ENABLED: 'true', MERCADOPAGO_TEST_ACCESS_TOKEN: 'fixture-only', MERCADOPAGO_TEST_SELLER_ID: '123', MERCADOPAGO_TEST_RETURN_URL: 'https://owned.example.test/payment-return' };
const order = { id: 'ca665af8-41b6-4ba4-bb75-54cf9c0f142e', currency: 'ARS', totalMinor: '12345' };

test('preference validity is bounded by the reservation and return is requested for approved payments', async () => {
  let posted: Record<string, unknown> = {};
  const provider = new MercadoPagoTestProvider(paymentConfig(env)!, async (url, init) => {
    if (String(url).endsWith('/users/me')) return Response.json({ id: 123, site_id: 'MLA', tags: ['test_user'] });
    posted = JSON.parse(String(init?.body));
    return Response.json({ id: '123-pref', collector_id: 123, external_reference: order.id, init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-pref' });
  });
  const deadline = new Date(Date.now() + 1800000); await provider.verifySeller(); await provider.start({ ...order, paymentExpiresAt: deadline });
  assert.equal(posted.expires, true); assert.equal(posted.expiration_date_to, deadline.toISOString()); assert.equal(posted.auto_return, 'approved');
  await assert.rejects(provider.start({ ...order, paymentExpiresAt: new Date(0) }));
});

test('expiry proof requires the matching collector, order, deadline and expired flag', async () => {
  const deadline = Date.now() - 1000;
  const valid = { id: '123-pref', collector_id: 123, external_reference: order.id, preference_expired: true, expiration_date_to: new Date(deadline).toISOString() };
  for (const changes of [{}, { collector_id: 999 }, { external_reference: 'other' }, { id: 'wrong' }, { preference_expired: false }, { expiration_date_to: new Date(Date.now() + 60000).toISOString() }]) {
    const provider = new MercadoPagoTestProvider(paymentConfig(env)!, async url => Response.json(String(url).endsWith('/users/me') ? { id: 123, site_id: 'MLA', tags: ['test_user'] } : { ...valid, ...changes }));
    await provider.verifySeller();
    if ('collector_id' in changes || 'external_reference' in changes || 'id' in changes) await assert.rejects(provider.preferenceExpired('123-pref', order, deadline));
    else assert.equal(await provider.preferenceExpired('123-pref', order, deadline), !Object.keys(changes).length);
  }
});
test('payment activation is explicit, development only and requires a public HTTPS return', () => {
  assert.equal(paymentConfig({}), null);
  for (const change of [{ NODE_ENV: 'production' }, { MERCADOPAGO_TEST_RETURN_URL: 'http://127.0.0.1:3000' }, { MERCADOPAGO_TEST_ACCESS_TOKEN: '' }, { MERCADOPAGO_TEST_ENABLED: 'false' }]) assert.equal(paymentConfig({ ...env, ...change }), null);
  assert.ok(paymentConfig(env));
});
test('preference starts only after the authenticated seller is verified as a test account', async () => {
  const requests: { url: string; body?: string }[] = [];
  const provider = new MercadoPagoTestProvider(paymentConfig(env)!, async (url, init) => {
    requests.push({ url: String(url), body: init?.body as string });
    return Response.json(String(url).endsWith('/users/me') ? { id: 123, site_id: 'MLA', tags: ['test_user'] } : { id: '123-pref', collector_id: 123, external_reference: order.id, init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-pref' });
  });
  await provider.verifySeller();
  assert.equal((await provider.start(order)).preferenceId, '123-pref');
  const body = JSON.parse(requests[1].body!);
  assert.equal(body.items[0].unit_price, 123.45);
  assert.equal(body.external_reference, order.id);
  assert.equal(body.payer, undefined);
  assert.equal(body.notification_url, undefined);
});
test('real seller, mismatched seller and missing test evidence fail closed', async () => {
  for (const seller of [{ id: 123, site_id: 'MLA', tags: [] }, { id: 124, site_id: 'MLA', tags: ['test_user'] }, { id: 123, site_id: 'MLA' }]) {
    const provider = new MercadoPagoTestProvider(paymentConfig(env)!, async () => Response.json(seller));
    await assert.rejects(() => provider.verifySeller());
    await assert.rejects(() => provider.start(order));
    await assert.rejects(() => provider.notificationOrder('456'));
    await assert.rejects(() => provider.reconcile(order));
  }
});
test('only authenticated matching test payments can confirm an order', async () => {
  const valid = { id: 456, live_mode: false, collector_id: 123, external_reference: order.id, currency_id: 'ARS', transaction_amount: 123.45, status: 'approved' };
  for (const changes of [{}, { live_mode: 'true' }, { live_mode: undefined }, { collector_id: 999 }, { transaction_amount: 123.46 }, { external_reference: 'other' }, { currency_id: 'USD' }]) {
    const provider = new MercadoPagoTestProvider(paymentConfig(env)!, async url => Response.json(String(url).endsWith('/users/me') ? { id: 123, site_id: 'MLA', tags: ['test_user'] } : { results: [{ ...valid, ...changes }], paging: { total: 1 } }));
    await provider.verifySeller();
    if (!Object.keys(changes).length) assert.equal(await provider.reconcile(order), 'approved');
    else await assert.rejects(() => provider.reconcile(order));
  }
});

test('Checkout Pro accepts both live_mode flags only for the verified test collector', async () => {
  for (const live_mode of [false, true]) {
    const payment = { id: 456, live_mode, collector_id: 123, external_reference: order.id, currency_id: 'ARS', transaction_amount: 123.45, status: 'approved' };
    const provider = new MercadoPagoTestProvider(paymentConfig(env)!, async url => Response.json(String(url).endsWith('/users/me') ? { id: 123, site_id: 'MLA', tags: ['test_user'] } : String(url).endsWith('/456') ? payment : { results: [payment], paging: { total: 1 } }));
    await assert.rejects(() => provider.notificationOrder('456'));
    await assert.rejects(() => provider.reconcile(order));
    await provider.verifySeller();
    assert.equal(await provider.notificationOrder('456'), order.id);
    assert.equal(await provider.reconcile(order), 'approved');
    payment.collector_id = 999;
    await assert.rejects(() => provider.notificationOrder('456'));
    await assert.rejects(() => provider.reconcile(order));
  }
});

test('concurrent seller verification shares a successful immutable-config proof', async () => {
  let resolve!: (response: Response) => void, calls = 0;
  const provider = new MercadoPagoTestProvider(paymentConfig(env)!, async url => {
    if (String(url).endsWith('/users/me')) { calls++; return new Promise<Response>(done => { resolve = done; }); }
    return Response.json({ id: '123-pref', collector_id: 123, external_reference: order.id, init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-pref' });
  });
  const a = provider.verifySeller(), b = provider.verifySeller();
  assert.equal(calls, 1);
  resolve(Response.json({ id: 123, site_id: 'MLA', tags: ['test_user'] }));
  await Promise.all([a, b]); await provider.start(order);
});

test('no payment result is not reported as a pending payment', async () => {
  const provider = new MercadoPagoTestProvider(paymentConfig(env)!, async url => Response.json(String(url).endsWith('/users/me') ? { id: 123, site_id: 'MLA', tags: ['test_user'] } : { results: [], paging: { total: 0 } }));
  await provider.verifySeller(); assert.equal(await provider.reconcile(order), null);
});

test('the reference belongs to the selected verified payment, not the latest rejected attempt', async () => {
  const common = { live_mode: false, collector_id: 123, external_reference: order.id, currency_id: 'ARS', transaction_amount: 123.45 };
  let results = [{ ...common, id: '999', status: 'rejected' }, { ...common, id: '9007199254740993', status: 'approved' }];
  const provider = new MercadoPagoTestProvider(paymentConfig(env)!, async url => Response.json(String(url).endsWith('/users/me')
    ? { id: 123, site_id: 'MLA', tags: ['test_user'] } : { results, paging: { total: results.length } }));
  await provider.verifySeller();
  assert.deepEqual(await provider.reconcileDetails(order), { status: 'approved', paymentId: '9007199254740993' });
  results = [{ ...common, id: '999', status: 'rejected' }, { ...common, id: '888', status: 'pending' }];
  assert.deepEqual(await provider.reconcileDetails(order), { status: 'pending', paymentId: '888' });
  results = [{ ...common, id: '999', status: 'approved' }, { ...common, id: '888', status: 'approved' }];
  await assert.rejects(provider.reconcileDetails(order), /Multiple monetary outcomes/);
  results = [{ ...common, id: '999', status: 'approved', collector_id: 999 }];
  await assert.rejects(provider.reconcileDetails(order), /Untrusted payment/);
});
