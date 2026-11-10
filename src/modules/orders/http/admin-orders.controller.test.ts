import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersGuard } from './orders.guard';
import { OrdersService } from '../services/orders.service';
import { OrderManagement } from '../services/order-management';
import { IdentityService } from '../../identity/services/identity-service';

test('admin mutations and private attachments require role, session, origin and CSRF before storage', async () => {
  let role = 'owner', writes = 0;
  const token = 'a'.repeat(64), pdf = Buffer.from('%PDF-1.7\nSynthetic receipt');
  const module = await Test.createTestingModule({ controllers: [AdminOrdersController], providers: [OrdersGuard,
    { provide: OrdersService, useValue: { detail: async () => ({}) } },
    { provide: OrderManagement, useValue: {
      update: async (_id: string, _body: unknown, actor: string) => { assert.equal(actor, 'operator@example.test'); writes++; return { ok: true }; },
      attach: async (_id: string, file: {buffer: Buffer}) => { assert.deepEqual(file.buffer, pdf); writes++; return { ok: true }; },
      download: async () => ({ name: 'comprobante.pdf', mime: 'application/pdf', content: pdf }),
    } },
    { provide: IdentityService, useValue: { authorize: async (value: string, roles: string[], mutation?: { origin?: string; csrf?: string }) => {
      if (value !== token) throw new UnauthorizedException();
      if (!roles.includes(role) || (mutation && (mutation.origin !== 'http://localhost' || mutation.csrf !== 'test-csrf'))) throw new ForbiddenException();
      return { email: 'operator@example.test' };
    } } },
  ] }).compile();
  const app = module.createNestApplication({ logger: false }); await app.listen(0, '127.0.0.1');
  try {
    const url = await app.getUrl(), headers = { Cookie: 'store_admin=' + token, Origin: 'http://localhost', 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' };
    assert.equal((await fetch(url + '/admin/orders/order', { method: 'PUT', headers, body: '{}' })).status, 200);
    const before = writes;
    for (const changes of [{ Cookie: '' }, { Origin: 'https://evil.test' }, { 'X-CSRF-Token': '' }]) assert.ok([401, 403].includes((await fetch(url + '/admin/orders/order', { method: 'PUT', headers: { ...headers, ...changes }, body: '{}' })).status));
    role = 'catalog'; assert.equal((await fetch(url + '/admin/orders/order', { method: 'PUT', headers, body: '{}' })).status, 403); assert.equal(writes, before);
    role = 'operations'; const data = new FormData(); data.append('file', new Blob([pdf], { type: 'application/pdf' }), 'receipt.pdf');
    const upload = await fetch(url + '/admin/orders/order/attachments', { method: 'POST', headers: { Cookie: headers.Cookie, Origin: headers.Origin, 'X-CSRF-Token': headers['X-CSRF-Token'] }, body: data });
    assert.equal(upload.status, 200); assert.equal(writes, before + 1);
    const file = await fetch(url + '/admin/orders/order/attachments/file', { headers: { Cookie: headers.Cookie } });
    assert.equal(file.status, 200); assert.equal(file.headers.get('cache-control'), 'private, no-store'); assert.match(file.headers.get('content-disposition')!, /^attachment/); assert.equal(file.headers.get('x-content-type-options'), 'nosniff'); assert.deepEqual(Buffer.from(await file.arrayBuffer()), pdf);
    assert.equal((await fetch(url + '/admin/orders/order/attachments/file')).status, 401);
  } finally { await app.close(); }
});
