import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { CatalogGuard } from './catalog.guard';
import { IdentityService } from './identity-service';
import { IdentityStore, StoredSession } from './identity-store';
import { issueSecret } from './security';

test('guard rejects anonymous, operations role and bad CSRF while allowing authorized requests', async () => {
  const token = issueSecret();
  const csrf = issueSecret();
  const session: StoredSession = { userId: '1', email: 'a@example.test', role: 'operations', expiresAt: new Date(Date.now() + 10000), revokedAt: null, disabledAt: null, csrfHash: csrf.hash };
  const store = { session: async () => session } as unknown as IdentityStore;
  const guard = new CatalogGuard(new IdentityService(store, 'https://admin.example'));
  const context = (headers: Record<string, string>, method = 'GET') => ({ switchToHttp: () => ({ getRequest: () => ({ headers, method }) }) }) as unknown as ExecutionContext;
  await assert.rejects(guard.canActivate(context({})), { status: 401 });
  await assert.rejects(guard.canActivate(context({ cookie: `store_admin=${token.token}` })), { status: 403 });
  session.role = 'catalog';
  await assert.rejects(guard.canActivate(context({ cookie: `store_admin=${token.token}`, origin: 'https://admin.example' }, 'POST')), { status: 403 });
  assert.equal(await guard.canActivate(context({ cookie: `store_admin=${token.token}`, origin: 'https://admin.example', 'x-csrf-token': csrf.token }, 'POST')), true);
});
