import { Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { emailConfig, emailReadiness, validEmail, type EmailConfig } from './email-config';
import { emailLabels, type EmailKind, type EmailOrder } from './order-email-model';
import { buildEmailMessage } from './email-message';
import { EmailSendError, EnvialoSimple } from './envialosimple';

type QueueRow = { id: string; orderId: string; stage: EmailKind; mode: string; payload: string };
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private warned = false;
  private verifiedUntil = 0;
  private readonly logger = new Logger('OrderEmails');
  constructor(private readonly db?: DataSource, private readonly config: EmailConfig = emailConfig(),
    private readonly provider = new EnvialoSimple(config), private readonly build = buildEmailMessage) {}
  onModuleInit() {
    if (emailReadiness(this.config) || !this.db) return;
    this.timer = setInterval(() => { void this.tick(); }, 15000); this.timer.unref();
    void this.tick();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick() {
    if (this.running || !this.db?.isInitialized || emailReadiness(this.config)) return;
    this.running = true;
    try {
      // A crashed process may already have handed the message to the provider. Do not resend it.
      await this.db.query(`UPDATE order_email_outbox SET status = 'uncertain', error_code = 'interrupted_dispatch', updated_at = UTC_TIMESTAMP(6)
        WHERE status = 'sending' AND updated_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE)`);
      await this.reconcile();
      const [row]: QueueRow[] = await this.db.query(`SELECT id, order_id AS orderId, stage, mode, payload FROM order_email_outbox
        WHERE status = 'queued' AND mode = ? ORDER BY created_at, id LIMIT 1`, [this.config.mode]);
      if (row) await this.dispatch(row);
      this.warned = false;
    } catch {
      if (!this.warned) this.logger.warn('Email worker unavailable; check database migration and provider connectivity. No automatic resend of uncertain deliveries.');
      this.warned = true;
    } finally { this.running = false; }
  }
  private async finish(id: string, status: string, error: string | null) {
    await this.db!.query(`UPDATE order_email_outbox SET status = ?, error_code = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND status = 'sending'`, [status, error, id]);
  }
  private async dispatch(row: QueueRow) {
    const db = this.db!;
    // Verification failure happens before claiming/sending; queued messages remain safe to retry.
    if (Date.now() >= this.verifiedUntil) {
      const domain = this.config.from.split('@')[1].toLowerCase();
      try {
        if (!(await this.provider.domains()).some(d => d.name.toLowerCase() === domain && d.status === 'verified')) throw Error('Sender domain is not verified');
      } catch {
        await db.query(`UPDATE order_email_outbox SET error_code = 'provider_unavailable', updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND status = 'queued'`, [row.id]);
        throw Error('Email provider unavailable');
      }
      this.verifiedUntil = Date.now() + 300000;
    }
    const claimed = await db.query(`UPDATE order_email_outbox SET status = 'sending', error_code = NULL, attempts = attempts + 1, updated_at = UTC_TIMESTAMP(6)
      WHERE id = ? AND status = 'queued' AND mode = ?`, [row.id, this.config.mode]);
    if (Number(claimed.affectedRows) !== 1) return;
    let message;
    try {
      const order = JSON.parse(row.payload) as EmailOrder;
      const recipient = this.config.mode === 'test' ? this.config.testTo : order.contact.email;
      if (!validEmail(recipient) || /@(?:.*\.)?(?:example\.(?:com|org|net|test|invalid)|[^@]+\.(?:test|invalid|localhost))$/i.test(recipient)) {
        await this.finish(row.id, 'failed', 'invalid_recipient'); return;
      }
      const [current] = await db.query('SELECT payment_status AS paymentStatus, order_status AS orderStatus FROM checkout_orders WHERE id = ?', [row.orderId]);
      if (!current || current.paymentStatus !== 'approved' || current.orderStatus === 'cancelled') { await this.finish(row.id, 'skipped', 'order_no_longer_eligible'); return; }
      message = await this.build(db, this.config, row.id, row.stage, order, recipient);
      await db.query(`UPDATE order_email_outbox SET recipient = ? WHERE id = ? AND status = 'sending'`, [recipient, row.id]);
    } catch { await this.finish(row.id, 'failed', 'message_preparation_failed'); return; }
    let providerId: string;
    try { providerId = await this.provider.send(message); }
    catch (error) {
      const failure = error instanceof EmailSendError ? error : new EmailSendError('provider_response_unknown', true);
      await this.finish(row.id, failure.uncertain ? 'uncertain' : 'failed', failure.code); return;
    }
    // If this write fails, the durable 'sending' claim becomes uncertain. It must NEVER trigger a second POST.
    await db.transaction(async tx => {
      await tx.query(`UPDATE order_email_outbox SET status = 'accepted', provider_id = ?, accepted_at = UTC_TIMESTAMP(6),
        next_check_at = UTC_TIMESTAMP(6), updated_at = UTC_TIMESTAMP(6), error_code = NULL WHERE id = ? AND status IN ('sending', 'uncertain')`, [providerId, row.id]);
      await tx.query(`INSERT INTO order_events (id, order_id, source, actor, detail, created_at) VALUES (?, ?, 'email', 'EnvíaloSimple', ?, UTC_TIMESTAMP(6))`,
        [randomUUID(), row.orderId, JSON.stringify({ reason: emailLabels[row.stage] + ' · Email aceptado por EnvíaloSimple', stage: row.stage, providerId })]);
    });
  }
  private async reconcile() {
    const db = this.db!;
    const rows: { id: string; orderId: string; stage: EmailKind; providerId: string }[] = await db.query(`SELECT id, order_id AS orderId, stage, provider_id AS providerId FROM order_email_outbox
      WHERE status = 'accepted' AND mode = ? AND next_check_at <= UTC_TIMESTAMP(6) ORDER BY next_check_at LIMIT 5`, [this.config.mode]);
    for (const row of rows) {
      // Claim this poll, and bound retries to the provider's retention window (24h on the free plan).
      await db.query('UPDATE order_email_outbox SET next_check_at = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 2 MINUTE) WHERE id = ?', [row.id]);
      try {
        const delivery = await this.provider.delivery(row.providerId);
        const status = delivery.status === 'sent' ? 'sent' : ['rejected', 'failed', 'excluded'].includes(delivery.status) ? 'failed' : 'accepted';
        await db.transaction(async tx => {
          const updated = await tx.query(`UPDATE order_email_outbox SET status = ?, provider_status = ?, sent_at = ?, error_code = ?, updated_at = UTC_TIMESTAMP(6)
            WHERE id = ? AND status = 'accepted'`, [status, delivery.status, status === 'sent' ? delivery.sentAt : null, status === 'failed' ? 'provider_' + delivery.status : null, row.id]);
          if (status !== 'accepted' && updated.affectedRows === 1) await tx.query(`INSERT INTO order_events (id, order_id, source, actor, detail, created_at) VALUES (?, ?, 'email', 'EnvíaloSimple', ?, UTC_TIMESTAMP(6))`,
            [randomUUID(), row.orderId, JSON.stringify({ reason: emailLabels[row.stage] + (status === 'sent' ? ' · Email enviado' : ' · Email no entregado'), stage: row.stage, providerId: row.providerId })]);
        });
      } catch { /* GET is safe to retry; never convert it into a new send. */ }
    }
    await db.query(`UPDATE order_email_outbox SET status = 'unconfirmed', error_code = 'delivery_confirmation_unavailable', updated_at = UTC_TIMESTAMP(6)
      WHERE status = 'accepted' AND accepted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 24 HOUR)`);
  }
}
