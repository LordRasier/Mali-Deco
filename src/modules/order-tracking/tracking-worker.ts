import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { emailConfig, emailReadiness, type EmailConfig } from '../order-emails/email-config';
import { EmailSendError, EnvialoSimple } from '../order-emails/envialosimple';
import { StoreSettings } from '../settings/store-settings';
import { trackingDays, trackingDigest } from './tracking-security';
import { trackingMail } from './tracking-mail';

export class TrackingWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private warned = false;
  private readonly logger = new Logger('OrderTracking');
  constructor(private readonly db?: DataSource, private readonly config: EmailConfig = emailConfig(),
    private readonly provider = new EnvialoSimple(config), private readonly brand = async () => (await new StoreSettings(db).get()).name || 'Tienda') {}
  onModuleInit() {
    if (!this.db || emailReadiness(this.config)) return;
    this.timer = setInterval(() => { void this.tick(); }, 5000); this.timer.unref(); void this.tick();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick() {
    if (this.running || !this.db?.isInitialized || emailReadiness(this.config)) return;
    this.running = true;
    try {
      const db = this.db;
      await db.query(`UPDATE order_tracking_requests SET status = 'uncertain', error_code = 'interrupted_dispatch', updated_at = UTC_TIMESTAMP(6)
        WHERE status = 'sending' AND updated_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE)`);
      await db.query('DELETE FROM order_tracking_access WHERE expires_at < UTC_TIMESTAMP(6) LIMIT 100');
      await db.query(`DELETE FROM order_tracking_requests WHERE created_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 90 DAY) AND status <> 'sending' LIMIT 100`);
      const [row] = await db.query(`SELECT id, email FROM order_tracking_requests WHERE status = 'queued' AND mode = ? ORDER BY created_at, id LIMIT 1`, [this.config.mode]);
      if (!row) return;
      const claim = await db.query(`UPDATE order_tracking_requests SET status = 'sending', updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND status = 'queued'`, [row.id]);
      if (Number(claim.affectedRows) !== 1) return;
      const finish = (status: string, code: string | null, id: string | null = null) => db.query(`UPDATE order_tracking_requests SET status = ?, error_code = ?, provider_id = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND status = 'sending'`, [status, code, id, row.id]);
      let message;
      try {
        const allowTest = row.email === this.config.testTo.trim().toLowerCase();
        // Access links are NEVER redirected: that would expose someone else's orders to the test inbox.
        if (this.config.mode === 'test' && !allowTest) { await finish('skipped', 'test_recipient_mismatch'); return; }
        const [order] = await db.query(`SELECT id FROM checkout_orders WHERE tracking_email = ? AND (payment_mode = 'production' OR ? = 1) LIMIT 1`, [row.email, allowTest ? 1 : 0]);
        if (!order) { await finish('skipped', 'no_matching_orders'); return; }
        const token = randomBytes(32).toString('hex');
        message = trackingMail(this.config, await this.brand(), row.email, token, row.id);
        // Only the digest is durable. A crash before/during POST is not replayed; the customer may request another link.
        await db.query(`INSERT INTO order_tracking_access (token_hash, email, allow_test, created_at, expires_at)
          VALUES (?, ?, ?, UTC_TIMESTAMP(6), DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ${trackingDays} DAY))`, [trackingDigest(token), row.email, allowTest ? 1 : 0]);
      } catch { await finish('failed', 'link_preparation_failed'); return; }
      try {
        const id = await this.provider.send(message);
        await finish('accepted', null, id);
      } catch (error) {
        const failure = error instanceof EmailSendError ? error : new EmailSendError('provider_response_unknown', true);
        await finish(failure.uncertain ? 'uncertain' : 'failed', failure.code);
      }
      this.warned = false;
    } catch {
      if (!this.warned) this.logger.warn('Tracking unavailable. Check migration and email configuration; uncertain deliveries are not replayed.');
      this.warned = true;
    } finally { this.running = false; }
  }
}
