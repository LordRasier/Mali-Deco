import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { analyticsConfig, measurementBody, orderCommerce, type AnalyticsConfig } from './analytics-model';

type QueueRow = { orderId: string; eventName: 'purchase' | 'refund'; eventAt: Date };
/** A durable claim precedes the external POST. Ambiguous deliveries are never automatically repeated. */
export class AnalyticsWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private warned = false;
  private readonly logger = new Logger('CommerceAnalytics');
  constructor(private readonly db?: DataSource, private readonly config: AnalyticsConfig = analyticsConfig(), private readonly send: typeof fetch = fetch) {}
  onModuleInit() {
    if (!this.db || !this.config.measurementId) return;
    this.timer = setInterval(() => { void this.tick(); }, 15000); this.timer.unref(); void this.tick();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async allowed() {
    const [row] = await this.db!.query('SELECT config FROM store_site_settings WHERE id = 1');
    try {
      const settings = JSON.parse(row?.config ?? '{}');
      return ['ga4', 'gtm'].includes(settings.analyticsMode) && (settings.ga4Id || this.config.measurementId) === this.config.measurementId;
    } catch { return false; }
  }
  async tick() {
    if (this.running || !this.db?.isInitialized) return;
    this.running = true;
    try {
      await this.db.query(`UPDATE checkout_analytics_context SET client_id = NULL, analytics_session_id = NULL
        WHERE expires_at <= UTC_TIMESTAMP(6) AND client_id IS NOT NULL`);
      await this.db.query(`DELETE FROM checkout_analytics_grants WHERE updated_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 180 DAY)`);
      if (!this.config.enabled) return;
      await this.db.query(`UPDATE commerce_analytics_outbox SET status = 'uncertain', error_code = 'interrupted_dispatch', updated_at = UTC_TIMESTAMP(6)
        WHERE status = 'sending' AND updated_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE)`);
      if (!await this.allowed()) return;
      // Payment history is durable and only provider-verified transitions are eligible.
      // Full refunds require a previously recorded approval; no invented historical purchase.
      for (const [name, status] of [['purchase', 'approved'], ['refund', 'refunded']] as const) {
        await this.db.query(`INSERT INTO commerce_analytics_outbox (order_id, event_name, event_at)
          SELECT c.order_id, ?, MIN(e.created_at) FROM checkout_analytics_context c
          JOIN checkout_orders o ON o.id = c.order_id
          JOIN order_events e ON e.order_id = c.order_id AND e.source = 'mercadopago'
          WHERE c.revoked_at IS NULL AND c.client_id IS NOT NULL AND c.expires_at > UTC_TIMESTAMP(6) AND c.measurement_id = ?
            AND o.payment_mode = 'production' AND (? = 'refund' OR o.order_status <> 'cancelled')
            AND JSON_UNQUOTE(JSON_EXTRACT(e.detail, '$.changes.paymentStatus.to')) = ?
            AND e.created_at >= c.consent_at AND e.created_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 72 HOUR)
            AND (? = 'purchase' OR EXISTS (SELECT 1 FROM commerce_analytics_outbox p WHERE p.order_id = o.id AND p.event_name = 'purchase'))
          GROUP BY c.order_id ON DUPLICATE KEY UPDATE event_name = VALUES(event_name)`, [name, this.config.measurementId, name, status, name]);
      }
      const rows: QueueRow[] = await this.db.query(`SELECT order_id AS orderId, event_name AS eventName, event_at AS eventAt FROM commerce_analytics_outbox
        WHERE status = 'queued' AND (event_name = 'purchase' OR EXISTS (SELECT 1 FROM commerce_analytics_outbox p
          WHERE p.order_id = commerce_analytics_outbox.order_id AND p.event_name = 'purchase' AND p.status = 'accepted'))
        ORDER BY event_at, event_name LIMIT 10`);
      for (const row of rows) await this.dispatch(row);
      this.warned = false;
    } catch {
      if (!this.warned) this.logger.warn('Analytics unavailable; check configuration, migration and delivery ledger. Payment processing is unaffected.');
      this.warned = true;
    } finally { this.running = false; }
  }
  private async finish(row: QueueRow, status: string, code: string | null = null) {
    await this.db!.query(`UPDATE commerce_analytics_outbox SET status = ?, error_code = ?, updated_at = UTC_TIMESTAMP(6)
      WHERE order_id = ? AND event_name = ? AND status = 'sending'`, [status, code, row.orderId, row.eventName]);
  }
  private async dispatch(row: QueueRow) {
    const claimed = await this.db!.query(`UPDATE commerce_analytics_outbox SET status = 'sending', updated_at = UTC_TIMESTAMP(6)
      WHERE order_id = ? AND event_name = ? AND status = 'queued'`, [row.orderId, row.eventName]);
    if (Number(claimed.affectedRows) !== 1) return;
    let body;
    try {
      const [order] = await this.db!.query(`SELECT o.snapshot, c.measurement_id AS measurementId, c.client_id AS clientId, c.analytics_session_id AS sessionId
        FROM checkout_orders o JOIN checkout_analytics_context c ON c.order_id = o.id
        WHERE o.id = ? AND o.payment_mode = 'production' AND (? = 'refund' OR o.order_status <> 'cancelled')
          AND c.revoked_at IS NULL AND c.client_id IS NOT NULL AND c.expires_at > UTC_TIMESTAMP(6) AND c.measurement_id = ?`, [row.orderId, row.eventName, this.config.measurementId]);
      if (!order || !await this.allowed()) { await this.finish(row, 'skipped', 'consent_or_destination_unavailable'); return; }
      body = measurementBody(order, row.eventName, orderCommerce(order.snapshot, row.orderId), new Date(row.eventAt));
    } catch { await this.finish(row, 'failed', 'invalid_or_expired_event'); return; }
    let response: Response;
    try {
      const url = new URL('https://www.google-analytics.com/mp/collect');
      url.searchParams.set('measurement_id', this.config.measurementId); url.searchParams.set('api_secret', this.config.apiSecret);
      response = await this.send(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000), redirect: 'error' });
    } catch { await this.finish(row, 'uncertain', 'response_unknown'); return; }
    // HTTP 2xx means received, not validated in GA4. Validate the schema with /debug/mp/collect before enabling live.
    await this.finish(row, response.ok ? 'accepted' : 'failed', response.ok ? null : `http_${response.status}`);
  }
}
