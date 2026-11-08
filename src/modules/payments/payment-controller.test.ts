import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionService } from '../checkout/sessions/session';
import type { PaymentService } from './payment-service';
import { PaymentController } from './payment-controller';
test('payment endpoints require the original session and accept only an order id', async () => {
  let allowed = false, calls = 0;
  const sessions = { requireMutation: async () => { if (!allowed) throw Error('denied'); return { id: 'session' }; } } as unknown as SessionService;
  const payments = { start: async (session: string) => { assert.equal(session, 'session'); calls++; return { status: 'uncertain' }; }, refresh: async () => { calls++; return { status: 'pending' }; } } as unknown as PaymentService;
  const controller = new PaymentController(sessions, payments), req = { headers: {}, socket: {} };
  await assert.rejects(() => controller.start(req, { orderId: 'o' })); assert.equal(calls, 0);
  allowed = true;
  await assert.rejects(() => controller.start(req, { orderId: 'o', amount: 1 }), { status: 400 });
  assert.deepEqual(await controller.start(req, { orderId: 'o' }), { status: 'uncertain' });
  assert.deepEqual(await controller.refresh(req, { orderId: 'o' }), { status: 'pending' });
});
