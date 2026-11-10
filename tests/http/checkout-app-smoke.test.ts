import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';

test('the isolated checkout module starts offline with quotes unavailable by default', async () => {
  delete process.env.DB_HOST;
  delete process.env.LOCAL_TEST_CHECKOUT_ENABLED;
  for (const key of Object.keys(process.env)) if (key.startsWith('ZIPNOVA_')) delete process.env[key];
  process.env.NODE_ENV = 'development';
  process.env.ADMIN_ORIGIN = 'http://127.0.0.1:3000';
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected network call'); };
  const { CheckoutModule } = await import('../../src/modules/checkout/checkout.module');
  const { CheckoutQuoteService } = await import('../../src/modules/checkout/services/quote');
  const module = await Test.createTestingModule({ imports: [CheckoutModule] }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    await app.init();
    await assert.rejects(() => app.get(CheckoutQuoteService).quote({ id: 'test', expiresAt: Date.now() + 1000 }, {}), { status: 503 });
    assert.equal(calls, 0);
  } finally {
    await app.close();
    globalThis.fetch = originalFetch;
  }
});
