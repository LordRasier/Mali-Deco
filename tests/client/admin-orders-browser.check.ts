import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrdersReader } from '../../src/presentation/admin/client/browser/orders/orders-reader';
test('orders ignores stale reads, retains explicit retry query and stops on disposal', async () => {
  const pending: Array<(html: string) => void> = [], rendered: string[] = []; let message = '', busy = false;
  const reader = createOrdersReader({ busy: value => { busy = value; }, show: html => { rendered.push(html); }, error: value => { message = value; } }, { getEpoch: () => 1, expire: () => { throw Error('Unexpected expiry'); } }, async () => new Promise(resolve => pending.push(resolve)));
  const first = reader.read(new URLSearchParams('page=1')), second = reader.read(new URLSearchParams('page=2'));
  pending[0]('old'); await first; assert.deepEqual(rendered, []); pending[1]('new'); await second; assert.deepEqual(rendered, ['new']); assert.equal(busy, false); assert.equal(message, '');
  const third = reader.retry(); reader.dispose(); pending[2]('late'); await third; assert.deepEqual(rendered, ['new']);
});
test('orders expires only the current identity after an unauthorized read', async () => {
  let expired = 0, epoch = 1; let reject!: (error: Error) => void;
  const reader = createOrdersReader({ busy: () => {}, show: () => {}, error: () => {} }, { getEpoch: () => epoch, expire: () => { expired++; } }, () => new Promise((_resolve, no) => { reject = no; }));
  const old = reader.read(new URLSearchParams()); epoch++; reject(Object.assign(new Error(), { status: 401 })); await old; assert.equal(expired, 0);
  reader.dispose();
});
