/* global require, Response, process, console */
/* eslint-disable @typescript-eslint/no-require-imports -- Repository hook probe. */
const assert = require('node:assert/strict');
const React = require('react');
require('tsx/cjs');
require.extensions['.css'] = () => {};
const { hookRunner } = require('./hook-runner.cjs');
const sessionPath = require.resolve('../src/admin/session.tsx');
let role = 'owner';
require.cache[sessionPath] = { id: sessionPath, filename: sessionPath, loaded: true, exports: { useSession: () => ({ user: { role } }) } };
const { Orders } = require('../src/admin/Orders.tsx');
const { OrderDetail } = require('../src/admin/OrderDetail.tsx');
const summary = { id: 'order-1', createdAt: '2026-01-01T12:00:00Z', orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', testLocal: true, currency: 'ARS', totalMinor: '1234' };
const detail = { ...summary, contact: { name: 'Private Name', email: 'private@example.test', phone: '123' }, destination: { country: 'AR', postalCode: '1000', city: 'Ciudad', state: 'Provincia', street: 'Private Street', number: '1', unit: null }, shipping: { carrierName: 'Correo', serviceName: 'Servicio', amountMinor: '100', currency: 'ARS', pickupPoint: null }, lines: [{ name: 'Mesa', variantName: 'Natural', quantity: 1, unitPriceMinor: '1134', lineTotalMinor: '1134', currency: 'ARS' }] };
const json = value => new Response(JSON.stringify(value));
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const match = find(child, predicate); if (match) return match; }
  return null;
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  return React.Children.toArray(node.props?.children).map(text).join(' ');
}
async function main() {
  const calls = [];
  let respond;
  globalThis.fetch = (url, options) => { calls.push({ url, options }); return new Promise(resolve => { respond = resolve; }); };
  for (const currentRole of ['owner', 'operations']) {
    role = currentRole;
    let runner = hookRunner(React, () => Orders());
    runner.flush();
    assert.match(text(runner.output), /Cargando pedidos/);
    assert.equal(calls.at(-1).url, '/api/v1/admin/orders?page=1&limit=20');
    respond(json({ items: [{ ...summary, contact: detail.contact, destination: detail.destination }], page: 1, limit: 20, total: 1 }));
    await runner.settle();
    const visible = text(runner.output);
    assert.match(visible, /Prueba local/);
    assert.doesNotMatch(visible, /Private|private@example/);
    assert.ok(find(runner.output, n => n.type === 'button' && n.props['aria-label'] === 'Ver detalle del pedido order-1'));
    runner.unmount();
    runner = hookRunner(React, () => OrderDetail({ id: 'order-1', onBack() {} }));
    runner.flush();
    assert.match(text(runner.output), /Cargando pedido/);
    assert.equal(calls.at(-1).url, '/api/v1/admin/orders/order-1');
    respond(json(detail));
    await runner.settle();
    assert.match(text(runner.output), /Private Name/);
    assert.match(text(runner.output), /Prueba local/);
    assert.ok(!find(runner.output, n => n.type === 'form'));
    assert.ok(!find(runner.output, n => n.type === 'button' && n.props.children !== '← Volver a pedidos'));
    runner.unmount();
  }
  assert.ok(calls.every(call => call.options.method === 'GET'));
  role = 'catalog';
  const before = calls.length;
  let runner = hookRunner(React, () => Orders());
  await runner.settle(); assert.equal(runner.output, null); runner.unmount();
  runner = hookRunner(React, () => OrderDetail({ id: 'order-1', onBack() {} }));
  await runner.settle(); assert.equal(runner.output, null); runner.unmount();
  assert.equal(calls.length, before);
  role = 'owner';
  runner = hookRunner(React, () => Orders()); runner.flush();
  respond(json({ items: [], page: 1, limit: 20, total: 0 })); await runner.settle();
  assert.match(text(runner.output), /No hay pedidos/); runner.unmount();
  runner = hookRunner(React, () => Orders()); runner.flush();
  respond(new Response('', { status: 503 })); await runner.settle();
  assert.ok(find(runner.output, n => n.props?.role === 'alert'));
  assert.ok(find(runner.output, n => n.type === 'button' && n.props.children === 'Reintentar'));
  runner.unmount();
  console.log('orders UI probes passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
