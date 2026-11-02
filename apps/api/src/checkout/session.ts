import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Inject, Post, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { isLocalQuoteRequest, localOperatorOrigin } from '../shipping/local-quote-guard';

export type CheckoutRequest = { method?: string; headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } };
export type CheckoutSession = { id: string; expiresAt: number };
export function assertLocalCheckoutRequest(req: CheckoutRequest, env: NodeJS.ProcessEnv): void {
  if (env.LOCAL_TEST_CHECKOUT_ENABLED !== 'true' || !isLocalQuoteRequest(req, env)) throw new ForbiddenException();
  // Next's local rewrite adds these headers. They remain untrusted; accept only
  // the expected loopback tuple and never use them to infer the browser's IP.
  const origin = new URL(localOperatorOrigin(env)!);
  const expected: Record<string, string[]> = { 'x-forwarded-host': [origin.host], 'x-forwarded-port': [origin.port], 'x-forwarded-proto': ['http'], 'x-forwarded-for': ['127.0.0.1', '::1', '::ffff:127.0.0.1'] };
  for (const [key, value] of Object.entries(req.headers)) {
    if (!/^(forwarded|x-forwarded-.+|x-real-ip)$/i.test(key)) continue;
    if (typeof value !== 'string' || !expected[key]?.includes(value)) throw new ForbiddenException();
  }
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const csrf = (token: string) => createHmac('sha256', token).update('local-checkout-csrf-v1').digest('hex');
function tokenFrom(req: CheckoutRequest): string | undefined {
  const cookie = req.headers.cookie;
  if (cookie === undefined) return undefined;
  if (typeof cookie !== 'string') throw new ForbiddenException();
  const matches = cookie.split(';').map(s => s.trim()).filter(s => s.split('=')[0] === 'store_checkout');
  if (!matches.length) return undefined;
  if (matches.length !== 1 || !/^store_checkout=[a-f0-9]{64}$/.test(matches[0])) throw new ForbiddenException();
  return matches[0].slice('store_checkout='.length);
}

/** Local test capability, not production authentication. start reuses a valid cookie;
 * requireMutation validates local origin/host/proxy, session expiry and x-csrf-token,
 * returning the durable session id for quote/order ownership. Neither method rotates
 * an existing cookie or silently replaces an invalid/expired session. */
export class SessionService {
  constructor(private readonly db?: DataSource, private readonly env: NodeJS.ProcessEnv = process.env, private readonly now = Date.now) {}
  private database(): DataSource {
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Checkout unavailable');
    return this.db;
  }
  private async query(sql: string, parameters: unknown[]) {
    try { return await this.database().query(sql, parameters); }
    catch { throw new ServiceUnavailableException('Checkout unavailable'); }
  }
  private async find(token: string): Promise<CheckoutSession> {
    const rows = await this.query('SELECT id, expires_at AS expiresAt FROM checkout_sessions WHERE token_hash = ?', [hash(token)]);
    const row = rows[0];
    const expiresAt = row ? new Date(row.expiresAt).getTime() : NaN;
    if (!row || !Number.isFinite(expiresAt) || expiresAt <= this.now()) throw new ForbiddenException();
    return { id: row.id, expiresAt };
  }
  async start(req: CheckoutRequest): Promise<CheckoutSession & { token: string; csrf: string }> {
    assertLocalCheckoutRequest(req, this.env);
    const existing = tokenFrom(req);
    if (existing) return { ...await this.find(existing), token: existing, csrf: csrf(existing) };
    const token = randomBytes(32).toString('hex'), id = randomUUID(), createdAt = this.now(), expiresAt = createdAt + 86400000;
    await this.query('INSERT INTO checkout_sessions (id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)', [id, hash(token), new Date(expiresAt), new Date(createdAt)]);
    return { id, token, csrf: csrf(token), expiresAt };
  }
  async requireMutation(req: CheckoutRequest): Promise<CheckoutSession> {
    assertLocalCheckoutRequest(req, this.env);
    const token = tokenFrom(req), supplied = req.headers['x-csrf-token'];
    if (!token || typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(csrf(token)))) throw new ForbiddenException();
    return this.find(token);
  }
  /** Recover CSRF for an existing capability only; never creates or rotates a session. */
  async resume(req: CheckoutRequest): Promise<{ csrf: string }> {
    assertLocalCheckoutRequest(req, this.env);
    const token = tokenFrom(req);
    if (!token) throw new ForbiddenException();
    await this.find(token);
    return { csrf: csrf(token) };
  }
}
@Controller('checkout')
export class SessionController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}
  @Post('session/resume') @HttpCode(200)
  async resume(@Body() body: unknown, @Req() req: CheckoutRequest) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new BadRequestException('Invalid session request');
    return this.sessions.resume(req);
  }
  @Post('session') @HttpCode(200)
  async start(@Body() body: unknown, @Req() req: CheckoutRequest, @Res({ passthrough: true }) res: { cookie(name: string, value: string, options: object): void }) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new BadRequestException('Invalid session request');
    const session = await this.sessions.start(req);
    res.cookie('store_checkout', session.token, { httpOnly: true, sameSite: 'strict', secure: false, path: '/api/v1/checkout', expires: new Date(session.expiresAt) });
    return { csrf: session.csrf };
  }
}
