import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { DataSource } from 'typeorm';
import { configureHttp } from '../../src/presentation/configure-http';
import { SessionService } from '../../src/modules/checkout/sessions/session';
import { CheckoutQuoteService } from '../../src/modules/checkout/services/quote';
import { CheckoutModule } from '../../src/modules/checkout/checkout.module';

test('MVC HTTP composition preserves checkout cookie scope, JSON/CSRF and proxy-header restrictions', async () => {
  const original = { ...process.env };
  delete process.env.DB_HOST;
  process.env.NODE_ENV = 'development';
  process.env.ZIPNOVA_ENABLED = 'false';
  process.env.LOCAL_TEST_CHECKOUT_ENABLED = 'false';
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'development', MVC_PILOT_ENABLED: 'true', LOCAL_TEST_CHECKOUT_ENABLED: 'true', ZIPNOVA_OPERATOR_ORIGIN: 'http://127.0.0.1:3170' };
  const rows = new Map<string, { id: string; expiresAt: Date }>();
  let writes = 0, quotes = 0;
  const db = { isInitialized: true, query: async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT')) { writes++; rows.set(args[1] as string, { id: args[0] as string, expiresAt: args[2] as Date }); return []; }
    const row = rows.get(args[0] as string); return row ? [row] : [];
  } } as unknown as DataSource;
  let app: NestExpressApplication | undefined;
  try {
    const { applicationModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({ imports: [applicationModule(env), CheckoutModule] })
      .overrideProvider(SessionService).useValue(new SessionService(db, env))
      .overrideProvider(CheckoutQuoteService).useValue({ quote: () => { quotes++; return { quoteId: 'synthetic-only' }; } }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    configureHttp(app);
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    env.PORT = new URL(origin).port;
    env.ZIPNOVA_OPERATOR_ORIGIN = origin;
    const post = (path: string, headers: Record<string, string> = {}, body = '{}') => fetch(origin + '/api/v1/checkout' + path, {
      method: 'POST', headers: { Origin: env.ZIPNOVA_OPERATOR_ORIGIN!, 'Content-Type': 'application/json', ...headers }, body,
    });
    const first = await post('/session');
    assert.equal(first.status, 200);
    const cookieHeader = first.headers.get('set-cookie')!;
    assert.match(cookieHeader, /Path=\/api\/v1\/checkout(?:;|$)/);
    assert.match(cookieHeader, /HttpOnly/i);
    assert.match(cookieHeader, /SameSite=Strict/i);
    const cookie = cookieHeader.split(';')[0];
    const { csrf } = await first.json() as { csrf: string };
    const reused = await post('/session', { Cookie: cookie });
    assert.equal(reused.status, 200);
    assert.equal((await reused.json()).csrf, csrf);
    assert.equal(writes, 1);
    const rejectedHeaders: Array<Record<string, string>> = [
      {}, { 'X-CSRF-Token': '0'.repeat(64) },
      { 'X-CSRF-Token': csrf, Forwarded: 'for=127.0.0.1' },
      { 'X-CSRF-Token': csrf, 'X-Forwarded-Host': 'attacker.example' },
      { 'X-CSRF-Token': csrf, Origin: 'http://attacker.example' },
    ];
    for (const extra of rejectedHeaders) {
      const response = await post('/quotes', { Cookie: cookie, ...extra });
      assert.equal(response.status, 403);
      await response.arrayBuffer();
    }
    const form = await post('/quotes', { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/x-www-form-urlencoded' }, 'csrf=synthetic');
    assert.equal(form.status, 403);
    await form.arrayBuffer();
    assert.equal(quotes, 0);
    const allowed = await post('/quotes', { Cookie: cookie, 'X-CSRF-Token': csrf });
    assert.equal(allowed.status, 200);
    await allowed.arrayBuffer();
    assert.equal(quotes, 1);
    assert.equal(writes, 1);
  } finally {
    await app?.close();
    process.env = original;
  }
});
