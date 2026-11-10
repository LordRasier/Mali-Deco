import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminUser, IdentityStore, StoredSession } from '../persistence/identity-store';
import { IdentityService } from './identity-service';
import { hashPassword } from '../security/security';
import { AuthController } from '../http/auth.controller';

class MemoryStore implements IdentityStore {
  userRow: AdminUser | null = null;
  sessions = new Map<string, StoredSession>();
  allowed = true;
  async limit(keys: string[]) { void keys; return this.allowed; }
  async user(email: string) { return this.userRow?.email === email ? this.userRow : null; }
  async createSession(hash: string, userId: string, csrfHash: string, expiresAt: Date, previousHash?: string) {
    if (previousHash && this.sessions.has(previousHash)) this.sessions.get(previousHash)!.revokedAt = new Date();
    this.sessions.set(hash, { userId, email: this.userRow!.email, role: this.userRow!.role, csrfHash, expiresAt, revokedAt: null, disabledAt: null });
  }
  async session(hash: string) { return this.sessions.get(hash) ?? null; }
  async rotateCsrf(hash: string, csrfHash: string) { this.sessions.get(hash)!.csrfHash = csrfHash; }
  async revoke(hash: string) { this.sessions.get(hash)!.revokedAt = new Date(); }
}

test('session login, rotation, roles, CSRF and revocation', async () => {
  const store = new MemoryStore();
  store.userRow = { id: '1', email: 'owner@example.test', passwordHash: await hashPassword('temporary-password-only'), role: 'catalog', disabledAt: null };
  const service = new IdentityService(store, 'https://admin.example');
  await assert.rejects(service.login('owner@example.test', 'bad', '127.0.0.1', 'https://admin.example'), { status: 401 });
  await assert.rejects(service.login('unknown@example.test', 'bad', '127.0.0.2', 'https://admin.example'), { status: 401 });
  await assert.rejects(service.authorize(undefined, ['catalog']), { status: 401 });
  const first = await service.login('OWNER@example.test', 'temporary-password-only', '127.0.0.1', 'https://admin.example');
  assert.equal([...store.sessions.keys()].includes(first.token), false);
  await assert.rejects(service.authorize(first.token, ['owner']), { status: 403 });
  await assert.rejects(service.authorize(first.token, ['catalog'], { origin: 'https://evil.example', csrf: first.csrf }), { status: 403 });
  await assert.rejects(service.authorize(first.token, ['catalog'], { origin: 'https://admin.example', csrf: 'wrong' }), { status: 403 });
  await service.authorize(first.token, ['catalog'], { origin: 'https://admin.example', csrf: first.csrf });
  const second = await service.login('owner@example.test', 'temporary-password-only', '127.0.0.1', 'https://admin.example', first.token);
  await assert.rejects(service.authorize(first.token, ['catalog']), { status: 401 });
  const refreshed = await service.issueCsrf(second.token, 'https://admin.example');
  await assert.rejects(service.logout(second.token, 'https://admin.example', second.csrf), { status: 403 });
  await service.logout(second.token, 'https://admin.example', refreshed.csrf);
  await assert.rejects(service.authorize(second.token, ['catalog']), { status: 401 });
  store.allowed = false;
  await assert.rejects(service.login('owner@example.test', 'temporary-password-only', '127.0.0.1', 'https://admin.example'), { status: 429 });
});

test('accented aliases never reach lookup; canonical case and whitespace share one account budget', async () => {
  class TrackingStore extends MemoryStore {
    counts = new Map<string, number>();
    lookups: string[] = [];
    override async limit(keys: string[]) {
      const account = keys[1];
      const count = (this.counts.get(account) ?? 0) + 1;
      this.counts.set(account, count);
      return count <= 10;
    }
    override async user(email: string) { this.lookups.push(email); return this.userRow; }
  }
  const store = new TrackingStore();
  store.userRow = { id: '1', email: 'owner@example.test', passwordHash: await hashPassword('temporary-password-only'), role: 'owner', disabledAt: null };
  const service = new IdentityService(store, 'https://admin.example');
  const aliases = ['ó', 'ò', 'ô', 'ö', 'õ', 'ō', 'ŏ', 'ő', 'ø', 'ǒ', 'ȯ'];
  for (const [index, alias] of aliases.entries()) {
    await assert.rejects(service.login(`${alias}wner@example.test`, 'temporary-password-only', `127.0.0.${index + 1}`, 'https://admin.example'), { status: 401 });
  }
  assert.deepEqual(store.lookups, []);
  for (let i = 0; i < 10; i++) {
    await assert.rejects(service.login(i % 2 ? ' OWNER@example.test ' : 'owner@example.test', 'wrong', `127.0.1.${i + 1}`, 'https://admin.example'), { status: 401 });
  }
  await assert.rejects(service.login('owner@example.test', 'wrong', '127.0.2.1', 'https://admin.example'), { status: 429 });
  assert.equal(new Set(store.lookups).size, 1);
});

test('controller returns no session token or password hash in JSON', async () => {
  const store = new MemoryStore();
  store.userRow = { id: '1', email: 'owner@example.test', passwordHash: await hashPassword('temporary-password-only'), role: 'owner', disabledAt: null };
  const controller = new AuthController(new IdentityService(store, 'https://admin.example'));
  let cookie = '';
  const res = { cookie: (_name: string, value: string) => { cookie = value; }, clearCookie: () => {} };
  const response = await controller.login({ headers: { origin: 'https://admin.example' }, method: 'POST', ip: '127.0.0.1' }, res, { email: 'owner@example.test', password: 'temporary-password-only' });
  assert.equal(cookie.length, 64);
  assert.equal(JSON.stringify(response).includes(cookie), false);
  assert.equal(JSON.stringify(response).includes(store.userRow.passwordHash), false);
});
