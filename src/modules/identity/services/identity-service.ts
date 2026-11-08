import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { authorize, AdminRole, requireOrigin } from '../security/access';
import { IdentityStore, StoredSession } from '../persistence/identity-store';
import { checkPassword, hashPassword, issueSecret, secretHash } from '../security/security';
import { canonicalEmail } from '../security/email';

const lifetimeMs = 8 * 60 * 60 * 1000;
const validToken = (token: string | undefined): token is string => !!token && /^[a-f0-9]{64}$/.test(token);
export class IdentityService {
  private dummyHash?: Promise<string>;
  constructor(private readonly store: IdentityStore, private readonly allowedOrigin: string) {}

  private origin(origin: string | undefined): void {
    if (!this.allowedOrigin || origin !== this.allowedOrigin) throw new ForbiddenException();
  }
  async login(email: unknown, password: unknown, ip: string, origin?: string, previous?: string) {
    this.origin(origin);
    if (typeof email !== 'string' || email.length > 255 || typeof password !== 'string' || Buffer.byteLength(password) > 1024 || !ip || ip.length > 128) throw new UnauthorizedException();
    const canonical = canonicalEmail(email);
    const rateKey = canonical ?? email.trim().toLowerCase();
    if (!await this.store.limit([secretHash(`ip:${ip}`), secretHash(`account:${rateKey}`)])) throw new HttpException('Too many attempts', 429);
    const user = canonical ? await this.store.user(canonical) : null;
    this.dummyHash ??= hashPassword('non-user-placeholder-password');
    const dummy = await this.dummyHash;
    const valid = await checkPassword(password, user?.passwordHash ?? dummy);
    if (!valid || !user || user.disabledAt) throw new UnauthorizedException();
    const session = issueSecret();
    const csrf = issueSecret();
    const expires = new Date(Date.now() + lifetimeMs);
    await this.store.createSession(session.hash, user.id, csrf.hash, expires, validToken(previous) ? secretHash(previous) : undefined);
    return { token: session.token, csrf: csrf.token, expires, user: { id: user.id, email: user.email, role: user.role } };
  }
  async authorize(token: string | undefined, roles: AdminRole[], mutation?: { origin?: string; csrf?: string }): Promise<StoredSession> {
    if (!validToken(token)) throw new UnauthorizedException();
    const session = await this.store.session(secretHash(token));
    authorize(session, roles);
    if (!session) throw new UnauthorizedException();
    if (mutation) requireOrigin(mutation.origin, this.allowedOrigin, mutation.csrf, session.csrfHash);
    return session;
  }
  async me(token: string | undefined) {
    const session = await this.authorize(token, ['owner', 'catalog', 'operations']);
    return { user: { id: session.userId, email: session.email, role: session.role } };
  }
  async issueCsrf(token: string | undefined, origin?: string) {
    this.origin(origin);
    await this.authorize(token, ['owner', 'catalog', 'operations']);
    const csrf = issueSecret();
    await this.store.rotateCsrf(secretHash(token!), csrf.hash);
    return { csrf: csrf.token };
  }
  async logout(token: string | undefined, origin?: string, csrf?: string) {
    await this.authorize(token, ['owner', 'catalog', 'operations'], { origin, csrf });
    await this.store.revoke(secretHash(token!));
  }
}
