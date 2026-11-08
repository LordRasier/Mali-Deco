import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { OrderManagement, parseUpdate, receiptFile, validateTransition } from './order-management';
import { orderDetail, orderFilters } from './orders-query';
const update = { revision: 1, orderStatus: 'confirmed', paymentStatus: 'approved', fulfillmentStatus: 'ready', shippingStatus: 'shipped', trackingNumber: 'TEST123', trackingUrl: 'https://example.test/tracking', internalNote: 'Frágil', reason: 'Entregado al correo' };
test('manual dispatch requires payment and preparation; completed requires delivery; unsafe tracking URLs are rejected', () => {
  assert.equal(parseUpdate(update).shippingStatus, 'shipped');
  for (const diff of [{ trackingUrl: 'javascript:alert(1)' }, { reason: ' ' }, { revision: 0 }, { orderStatus: 'invented' }]) assert.throws(() => parseUpdate({ ...update, ...diff }), { status: 400 });
  const previous = { ...update, shippingStatus: 'not_started' };
  for (const diff of [{ paymentStatus: 'pending' }, { fulfillmentStatus: 'preparing' }, { orderStatus: 'completed' }]) assert.throws(() => validateTransition(previous, { ...update, ...diff }), { status: 400 });
  assert.doesNotThrow(() => validateTransition({ ...update, paymentStatus: 'refunded' }, { ...update, paymentStatus: 'refunded' }));
});
test('edits lock the order, reject stale revisions and cannot overwrite gateway-managed payments', async () => {
  let events = 0, writes = 0;
  const row = { revision: 1, orderStatus: 'received', paymentStatus: 'pending', fulfillmentStatus: 'not_started', shippingStatus: 'not_started', trackingNumber: '', trackingUrl: '', internalNote: '' };
  const query = async (sql: string) => {
    if (sql.includes('FROM checkout_orders')) { assert.match(sql, /FOR UPDATE/); return [row]; }
    if (sql.includes('FROM checkout_payment_starts')) return [{}];
    if (sql.startsWith('INSERT INTO order_events')) { events++; return []; }
    if (sql.startsWith('UPDATE')) { writes++; return { affectedRows: 1 }; }
    throw Error(sql);
  };
  const service = new OrderManagement({ isInitialized: true, transaction: async (fn: (tx: {query: typeof query}) => unknown) => fn({query}) } as unknown as DataSource);
  await assert.rejects(service.update('test', { ...update, revision: 2 }, 'operator'), { status: 409 });
  await assert.rejects(service.update('test', update, 'operator'), { status: 409 });
  assert.equal(writes, 0);
  await service.update('test', { ...update, paymentStatus: 'pending', shippingStatus: 'not_started' }, 'operator');
  assert.equal(writes, 1); assert.equal(events, 1);
});
test('attachments validate actual content, size and safe filenames independently of declared MIME', () => {
  const file = { buffer: Buffer.from('%PDF-1.7\nfixture'), size: 16, originalname: '../../invoice.html' }; file.size = file.buffer.length;
  const parsed = receiptFile(file); assert.equal(parsed.mime, 'application/pdf'); assert.match(parsed.name, /\.pdf$/); assert.equal(parsed.name.includes('/'), false); assert.equal(parsed.name.includes('\\'), false);
  for (const invalid of [{ ...file, buffer: Buffer.from('<script>bad</script>') }, { ...file, size: 3 * 1024 * 1024 }, { ...file, buffer: Buffer.from('<svg>bad</svg>'), size: 14 }]) assert.throws(() => receiptFile(invalid), { status: 400 });
});
test('search and filters stay parameterized, bounded and accept only known statuses', () => {
  const filter = orderFilters({ search: "a%' OR 1=1 --", paymentStatus: 'approved', page: '2' });
  assert.equal(filter.limit, 20); assert.equal(filter.page, 2); assert.doesNotMatch(filter.where, /OR 1=1/); assert.deepEqual(filter.params, ['approved', "a%' OR 1=1 --"]);
  for (const query of [{ paymentStatus: 'bad' }, { page: '0' }, { limit: '101' }, { search: ['name'] }, { unexpected: '1' }]) assert.throws(() => orderFilters(query), { status: 400 });
});

test('pending additive migrations preserve read-only order access without hiding other database failures', async () => {
  const query = async (sql: string) => {
    if (sql.includes('revision')) throw Object.assign(new Error('Pending schema'), { code: 'ER_BAD_FIELD_ERROR' });
    return [{ ...update, snapshot: JSON.stringify({ result: { id: 'test', contact: { name: 'Customer' } } }) }];
  };
  const result = await orderDetail({ query } as unknown as DataSource, 'test');
  assert.equal(result.managementAvailable, false);
  assert.equal(result.contact.name, 'Customer');
  assert.deepEqual(result.events, []);
  assert.equal(result.paymentStatus, 'approved');
  await assert.rejects(orderDetail({ query: async () => { throw Object.assign(new Error('Offline'), { code: 'ECONNREFUSED' }); } } as unknown as DataSource, 'test'), { code: 'ECONNREFUSED' });
});
