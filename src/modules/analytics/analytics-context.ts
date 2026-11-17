import { BadRequestException, Body, Controller, ForbiddenException, Header, HttpCode, Inject, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { SessionService, type CheckoutRequest } from '../checkout/sessions/session';
import { analyticsConfig, parseAnalyticsIdentity, type AnalyticsConfig } from './analytics-model';

export class CheckoutAnalytics {
  constructor(private readonly db?: DataSource, private readonly config: AnalyticsConfig = analyticsConfig()) {}
  async save(sessionId: string, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException();
    const value = body as Record<string, unknown>;
    if (!this.db?.isInitialized) throw new ServiceUnavailableException();
    if (Object.keys(value).length !== 6 || typeof value.orderId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.orderId) || typeof value.revocationToken !== 'string' || !/^[a-f0-9]{64}$/.test(value.revocationToken)) throw new BadRequestException();
    const revokeHash = createHash('sha256').update(value.revocationToken).digest('hex');
    const context = parseAnalyticsIdentity(value, this.config.measurementId);
    if (!context) throw new BadRequestException('Invalid analytics context');
    if (!this.config.enabled) return { saved: false };
    return this.db.transaction(async tx => {
      const [order] = await tx.query(`SELECT id FROM checkout_orders WHERE id = ? AND session_id = ? AND payment_mode = 'production'
        AND payment_status IN ('not_started', 'pending') AND order_status <> 'cancelled'
        AND created_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 15 MINUTE) FOR UPDATE`, [value.orderId, sessionId]);
      if (!order) return { saved: false };
      // Serialize grants and revocation, including a rejection arriving before the context POST.
      await tx.query('INSERT IGNORE INTO checkout_analytics_grants (revocation_hash) VALUES (?)', [revokeHash]);
      const [grant] = await tx.query('SELECT revoked_at FROM checkout_analytics_grants WHERE revocation_hash = ? FOR UPDATE', [revokeHash]);
      if (!grant || grant.revoked_at) return { saved: false };
      await tx.query('UPDATE checkout_analytics_grants SET updated_at = UTC_TIMESTAMP(6) WHERE revocation_hash = ?', [revokeHash]);
      const result = await tx.query(`INSERT INTO checkout_analytics_context (order_id, checkout_session_id, measurement_id, client_id, analytics_session_id, revocation_hash, consent_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6), DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 DAY)) ON DUPLICATE KEY UPDATE order_id = order_id`,
      [value.orderId, sessionId, context.measurementId, context.clientId, context.sessionId, revokeHash]);
      return { saved: Number(result.affectedRows) === 1 };
    });
  }
  async revoke(body: unknown) {
    const token = body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 1 && 'token' in body ? body.token : null;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new BadRequestException();
    if (!this.db?.isInitialized) throw new ServiceUnavailableException();
    const hash = createHash('sha256').update(token).digest('hex');
    await this.db.transaction(async tx => {
      await tx.query(`INSERT INTO checkout_analytics_grants (revocation_hash, revoked_at) VALUES (?, UTC_TIMESTAMP(6))
        ON DUPLICATE KEY UPDATE revoked_at = UTC_TIMESTAMP(6), updated_at = UTC_TIMESTAMP(6)`, [hash]);
      await tx.query(`UPDATE checkout_analytics_context SET revoked_at = UTC_TIMESTAMP(6), client_id = NULL, analytics_session_id = NULL WHERE revocation_hash = ?`, [hash]);
    });
    return { revoked: true };
  }
}
@Controller('checkout')
export class CheckoutAnalyticsController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService, @Inject(CheckoutAnalytics) private readonly analytics: CheckoutAnalytics) {}
  @Post('analytics-context') @HttpCode(200) @Header('Cache-Control', 'private, no-store')
  async save(@Req() req: CheckoutRequest, @Body() body: unknown) {
    const session = await this.sessions.requireMutation(req);
    return this.analytics.save(session.id, body);
  }
  @Post('analytics-revoke') @HttpCode(200) @Header('Cache-Control', 'private, no-store')
  async revoke(@Req() req: CheckoutRequest, @Body() body: unknown) {
    // Revocation is authorized by a 256-bit capability, never a client ID or an order number.
    let origin = '';
    try { origin = new URL(process.env.PUBLIC_SITE_URL || process.env.ADMIN_ORIGIN || '').origin; } catch { /* Reject an unconfigured origin. */ }
    if (!origin || req.headers.origin !== origin || req.headers['sec-fetch-site'] !== 'same-origin') throw new ForbiddenException();
    return this.analytics.revoke(body);
  }
}
