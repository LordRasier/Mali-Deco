import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { checkoutUrl, type MercadoPagoTestProvider, type PaymentOrder, type ReconciledPayment } from './mercadopago';
import { recordOrderEvent } from '../orders/services/order-management';
import { paymentCanAdvance } from '../orders/services/order-state';

export type PaymentResult = { status: 'disabled' | 'not_started' | 'uncertain' | ReconciledPayment } | { status: 'ready'; url: string };
type OrderRow = PaymentOrder & { paymentStatus: string; orderStatus: string };
const terminal = ['approved', 'partially_refunded', 'in_mediation', 'refunded', 'charged_back'];

/** A committed uncertain claim precedes the external POST. Never repeat an uncertain POST. */
export class PaymentService {
  constructor(private readonly db?: DataSource, private readonly provider?: Pick<MercadoPagoTestProvider, 'verifySeller' | 'start' | 'reconcile' | 'sellerId'>) {}
  get available(): boolean { return !!this.provider; }
  private database(): DataSource { if (!this.db?.isInitialized) throw new ServiceUnavailableException('Payment unavailable'); return this.db; }
  private async owned(tx: Pick<EntityManager, 'query'>, sessionId: string, orderId: string): Promise<OrderRow> {
    if (!/^[a-f0-9-]{36}$/.test(orderId)) throw new BadRequestException('Invalid order');
    const rows = await tx.query(`SELECT o.id, o.currency, o.total_minor AS totalMinor, o.payment_status AS paymentStatus, o.order_status AS orderStatus FROM checkout_orders o
      JOIN checkout_sessions s ON s.id = o.session_id WHERE o.id = ? AND o.session_id = ? AND s.expires_at > UTC_TIMESTAMP(6) FOR UPDATE`, [orderId, sessionId]);
    if (rows.length !== 1) throw new NotFoundException('Order unavailable');
    return rows[0];
  }
  private existing(order: OrderRow, row: { state: string; preferenceId: string | null; sellerId: string }): PaymentResult {
    if (String(row.sellerId) !== this.provider?.sellerId) throw new ServiceUnavailableException('Payment seller changed');
    if (terminal.includes(order.paymentStatus)) return { status: order.paymentStatus as ReconciledPayment };
    if (row.state === 'uncertain') return { status: 'uncertain' };
    if (row.state !== 'ready' || !row.preferenceId || !/^[a-zA-Z0-9-]{1,128}$/.test(row.preferenceId)) throw new ServiceUnavailableException('Payment unavailable');
    return { status: 'ready', url: checkoutUrl(`https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${row.preferenceId}`, row.preferenceId) };
  }
  async start(sessionId: string, orderId: string): Promise<PaymentResult> {
    if (!this.provider) return { status: 'disabled' };
    // Ownership before any outward request. Verification failure is safe to retry: no preference POST occurred.
    const initial = await this.database().transaction(tx => this.owned(tx, sessionId, orderId));
    if (initial.orderStatus === 'cancelled') throw new ConflictException('Order cancelled');
    try { await this.provider.verifySeller(); } catch { throw new ServiceUnavailableException('Test seller unavailable'); }
    const claim = await this.database().transaction(async tx => {
      const order = await this.owned(tx, sessionId, orderId);
      if (order.orderStatus === 'cancelled') throw new ConflictException('Order cancelled');
      const rows = await tx.query('SELECT state, preference_id AS preferenceId, seller_id AS sellerId FROM checkout_payment_starts WHERE order_id = ? FOR UPDATE', [orderId]);
      if (rows.length) return { result: this.existing(order, rows[0]) };
      if (order.paymentStatus !== 'not_started') throw new ServiceUnavailableException('Payment state unavailable');
      await tx.query("INSERT INTO checkout_payment_starts (order_id, state, seller_id) VALUES (?, 'uncertain', ?)", [orderId, this.provider!.sellerId]);
      return { order };
    });
    if ('result' in claim) return claim.result!;
    try {
      const preference = await this.provider.start(claim.order!);
      return await this.database().transaction(async tx => {
        const current = await this.owned(tx, sessionId, orderId);
        await tx.query("UPDATE checkout_payment_starts SET preference_id = ?, state = 'ready' WHERE order_id = ? AND state = 'uncertain'", [preference.preferenceId, orderId]);
        if (current.paymentStatus === 'not_started') {
          await tx.query('UPDATE checkout_orders SET payment_status = ?, revision = revision + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', ['pending', orderId]);
          await recordOrderEvent(tx, orderId, 'mercadopago', 'Mercado Pago', { changes: { paymentStatus: { from: 'not_started', to: 'pending' } } });
        }
        return this.existing(current, { state: 'ready', preferenceId: preference.preferenceId, sellerId: this.provider!.sellerId });
      });
    } catch { return { status: 'uncertain' }; }
  }
  async refresh(sessionId: string, orderId: string): Promise<PaymentResult> {
    if (!this.provider) return { status: 'disabled' };
    const order = await this.database().transaction(tx => this.owned(tx, sessionId, orderId));
    const rows = await this.database().query('SELECT state, preference_id AS preferenceId, seller_id AS sellerId FROM checkout_payment_starts WHERE order_id = ?', [orderId]);
    if (!rows.length) return { status: 'not_started' };
    this.existing(order, rows[0]);
    try {
      await this.provider.verifySeller();
      // Serialize authoritative reads with S2S notifications, including dispute resolution.
      return await this.database().transaction(async tx => {
        const current = await this.owned(tx, sessionId, orderId);
        const status = await this.provider!.reconcile(current);
        if (!status) {
          const latest = await tx.query('SELECT state, preference_id AS preferenceId, seller_id AS sellerId FROM checkout_payment_starts WHERE order_id = ? FOR UPDATE', [orderId]);
          if (latest.length !== 1) throw new ServiceUnavailableException('Payment unavailable');
          return this.existing(current, latest[0]);
        }
        if (!paymentCanAdvance(current.paymentStatus, status)) return { status: current.paymentStatus as ReconciledPayment };
        if (current.paymentStatus !== status) {
          await tx.query('UPDATE checkout_orders SET payment_status = ?, revision = revision + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', [status, orderId]);
          await recordOrderEvent(tx, orderId, 'mercadopago', 'Mercado Pago', { changes: { paymentStatus: { from: current.paymentStatus, to: status } } });
        }
        return { status };
      });
    } catch { throw new ServiceUnavailableException('Payment verification unavailable'); }
  }
}
