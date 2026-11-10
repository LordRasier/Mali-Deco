import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DisabledPaymentProvider } from './payment-provider';

test('disabled payment never creates a transaction', async () => {
  assert.deepEqual(await new DisabledPaymentProvider().start(), { status: 'unavailable', reason: 'disabled' });
});
