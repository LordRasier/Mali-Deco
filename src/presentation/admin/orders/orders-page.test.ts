import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrdersPage } from './orders-page';
import { AdminPage } from '../admin-page';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
const summary = { id: 'synthetic-order', createdAt: '2026-01-01T12:00:00Z', currency: 'ARS', totalMinor: '1200', testLocal: true, orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started' };
test('admin shows verified payment status independently of fulfillment', async () => {
  const page = new OrdersPage({ list: async () => ({ items: [{ ...summary, paymentStatus: 'approved' }], page: 1, limit: 20, total: 1 }), detail: async () => null });
  const result = await page.read({});
  assert.equal(result.model.items[0].payment, 'Aprobado');
  assert.equal(result.model.items[0].fulfillment, 'No iniciado');
});

test('order detail displays the optional document and supports older orders', async () => {
  for (const document of [undefined, '00123456']) {
    const page = new OrdersPage({ list: async () => { throw Error(); }, detail: async () => ({ ...summary,
      contact: { name: 'Test', email: 'test@example.invalid', phone: '000', document },
      destination: { street: 'Test', number: '1', unit: '', city: 'C', state: 'S', postalCode: '1000', country: 'AR' },
      shipping: { carrierName: 'C', serviceName: 'S', amountMinor: '100', currency: 'ARS', pickupPoint: null }, lines: [],
    }) });
    assert.equal((await page.read({ view: 'detail', id: 'synthetic-order' })).model.order?.document, document ?? 'No informado');
  }
});
test('orders list remains bounded and formats exact amounts', async () => {
  let query: unknown;
  const page = new OrdersPage({ list: async input => { query = input; return { items: [summary], page: 2, limit: 20, total: 22 }; }, detail: async () => null });
  const result = await page.read({ page: '2' }); assert.deepEqual(query, { page: '2', limit: '20' });
  assert.equal(result.view, 'admin-orders-list'); assert.equal(result.model.section, 'orders'); assert.match(result.model.items[0].total, /12,00/); assert.equal(result.model.previous, '1'); assert.equal(result.model.next, '');
});

test('order email status never confuses a completed business stage with a sent email', async () => {
  const events = [
    { id: 'paid', source: 'mercadopago', actor: 'system', createdAt: '2026-11-08T12:00:00Z', detail: JSON.stringify({ changes: { paymentStatus: { from: 'pending', to: 'approved' } } }) },
    { id: 'shipped', source: 'manual', actor: 'operator', createdAt: '2026-11-08T13:00:00Z', detail: JSON.stringify({ changes: { shippingStatus: { from: 'ready_to_ship', to: 'shipped' } } }) },
    { id: 'delivered', source: 'manual', actor: 'operator', createdAt: '2026-11-08T14:00:00Z', detail: JSON.stringify({ changes: { shippingStatus: { from: 'shipped', to: 'delivered' } } }) },
  ];
  const template = Handlebars.compile(readFileSync('src/presentation/admin/views/admin-order-detail.hbs', 'utf8'));
  for (const stageCount of [0, 1, 2, 3]) {
    const page = new OrdersPage({ list: async () => { throw Error(); }, detail: async () => ({ ...summary,
      contact: { name: 'Cliente', email: 'test@example.invalid', phone: '000' },
      destination: { street: 'Test', number: '1', unit: '', city: 'C', state: 'S', postalCode: '1000', country: 'AR' },
      shipping: { carrierName: 'C', serviceName: 'S', amountMinor: '100', currency: 'ARS', pickupPoint: null }, lines: [], events: events.slice(0, stageCount),
    }) });
    const result = await page.read({ view: 'detail', id: summary.id });
    const emails = result.model.order!.emailPreviews;
    assert.equal(emails.length, 3);
    assert.ok(emails.every(email => email.deliveryStatus === 'not_sent' && email.statusLabel === 'No enviado'));
    assert.equal(emails.filter(email => email.stageAt).length, stageCount);
    assert.equal(emails.filter(email => email.statusTone === 'warning').length, stageCount);
    const html = template(result.model);
    assert.equal((html.match(/data-email-status="not_sent"/g) ?? []).length, 3);
    assert.equal((html.match(/>No enviado<\/span>/g) ?? []).length, 3);
    assert.match(html, /Abrir una vista previa no envía el email/);
    assert.equal((html.match(/aria-label="Ver vista previa:/g) ?? []).length, 3);
  }
});

test('shipping progress identifies the saved stage and never presents a return as delivered', async () => {
  for (const shippingStatus of ['not_started', 'ready_to_ship', 'shipped', 'delivered', 'returned']) {
    const page = new OrdersPage({ list: async () => { throw Error(); }, detail: async () => ({ ...summary, shippingStatus,
      contact: { name: 'Cliente Prueba', email: 'test@example.invalid', phone: '000' },
      destination: { street: 'Test', number: '1', unit: '', city: 'C', state: 'S', postalCode: '1000', country: 'AR' },
      shipping: { carrierName: 'C', serviceName: 'S', amountMinor: '100', currency: 'ARS', pickupPoint: null }, lines: [],
    }) });
    const result = (await page.read({ view: 'detail', id: 'synthetic-order' })).model.order!;
    assert.deepEqual(result.shippingSteps.filter(step => step.current).map(step => step.value), [shippingStatus]);
    assert.equal(result.customerInitials, 'CP');
    if (shippingStatus === 'returned') assert.equal(result.shippingSteps.some(step => step.completed), false);
    if (shippingStatus === 'shipped') assert.deepEqual(result.shippingSteps.filter(step => step.completed).map(step => step.value), ['not_started', 'ready_to_ship']);
  }
});
test('orders rejects unknown rendering options and invalid IDs before service reads', async () => {
  let reads = 0; const page = new OrdersPage({ list: async () => { reads++; throw Error(); }, detail: async () => { reads++; throw Error(); } });
  for (const query of [{ layout: 'secret' }, { page: ['1', '2'] }, { view: 'detail' }, { view: 'detail', id: 'x\n' }, { page: '0' }]) await assert.rejects(page.read(query));
  assert.equal(reads, 0);
});
test('catalog role cannot reach the orders renderer; operations may read it', async () => {
  let reads = 0;
  const renderer = new OrdersPage({ list: async () => { reads++; return { items: [], page: 1, limit: 20, total: 0 }; }, detail: async () => null });
  for (const role of ['catalog', 'operations'] as const) {
    const page = new AdminPage({ me: async () => ({ user: { id: 'synthetic', email: 'synthetic@example.test', role } }) }, { orders: renderer });
    assert.equal((await page.section('synthetic', 'orders')).status, role === 'catalog' ? 403 : 200);
  }
  assert.equal(reads, 1);
});
