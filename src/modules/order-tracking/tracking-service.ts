import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { emailConfig, emailReadiness, type EmailConfig } from '../order-emails/email-config';
import { statusColumns } from '../orders/services/order-state';
import { trackingDigest, trackingEmail, validTrackingToken } from './tracking-security';
import { trackingOrder, type TrackingRow } from './tracking-orders';
import { paymentReferenceSql } from '../payments/payment-reference';

export const trackingAcknowledgement = { message: 'Si hay pedidos asociados a ese correo, vas a recibir un enlace para consultarlos. Revisá también Spam. Si ya lo pediste, esperá unos minutos.' };
export class TrackingService {
  constructor(private readonly db?: DataSource, private readonly config: EmailConfig = emailConfig()) {}
  private database() { if (!this.db?.isInitialized) throw new ServiceUnavailableException('El seguimiento no está disponible. Intentá más tarde.'); return this.db; }
  async requestLink(value: unknown) {
    const email = trackingEmail(value);
    if (emailReadiness(this.config)) throw new ServiceUnavailableException('El envío de enlaces no está disponible. Intentá más tarde.');
    // Every valid address takes the same path; existence is checked asynchronously by the mail worker.
    await this.database().transaction(async tx => {
      await tx.query('SELECT id FROM order_tracking_lock WHERE id = 1 FOR UPDATE');
      const [quota] = await tx.query(`SELECT COUNT(*) AS total, COALESCE(SUM(email = ?), 0) AS account,
        COALESCE(SUM(email = ? AND created_at > DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 MINUTE)), 0) AS recent
        FROM order_tracking_requests WHERE created_at > DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 HOUR)`, [email, email]);
      if (Number(quota.total) >= 60 || Number(quota.account) >= 3 || Number(quota.recent) > 0) return;
      await tx.query(`INSERT INTO order_tracking_requests (id, email, mode, created_at, updated_at)
        VALUES (?, ?, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`, [randomUUID(), email, this.config.mode]);
    });
    return trackingAcknowledgement;
  }
  async access(token: unknown) {
    if (!validTrackingToken(token)) throw new ForbiddenException('El enlace no es válido o venció. Pedí uno nuevo.');
    const [access] = await this.database().query(`SELECT email, allow_test AS allowTest, expires_at AS expiresAt FROM order_tracking_access
      WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(6)`, [trackingDigest(token)]);
    if (!access) throw new ForbiddenException('El enlace no es válido o venció. Pedí uno nuevo.');
    return access as { email: string; allowTest: number; expiresAt: Date };
  }
  async orders(token: string, page: unknown) {
    if (!Number.isSafeInteger(page) || Number(page) < 1 || Number(page) > 10000) throw new BadRequestException('Página inválida.');
    const access = await this.access(token), db = this.database(), params = [access.email, Number(access.allowTest) === 1 ? 1 : 0];
    const where = "tracking_email = ? AND (payment_mode = 'production' OR ? = 1)";
    const [count] = await db.query(`SELECT COUNT(*) AS total FROM checkout_orders WHERE ${where}`, params);
    const rows: TrackingRow[] = await db.query(`SELECT id, created_at AS createdAt, updated_at AS updatedAt, currency, total_minor AS totalMinor,
      snapshot, payment_mode AS paymentMode, tracking_number AS trackingNumber, tracking_url AS trackingUrl, ${statusColumns}, ${paymentReferenceSql} AS paymentId
      FROM checkout_orders WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT 10 OFFSET ?`, [...params, (Number(page) - 1) * 10]);
    return { email: access.email, items: rows.map(trackingOrder), page: Number(page), total: Number(count.total), pageSize: 10 };
  }
}
