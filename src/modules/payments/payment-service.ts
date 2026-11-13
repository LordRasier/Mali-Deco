import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { checkoutUrl, type MercadoPagoTestProvider, type PaymentOrder, type ReconciledPayment } from './mercadopago';
import { recordOrderEvent } from '../orders/services/order-management';
import { paymentCanAdvance } from '../orders/services/order-state';
import { PaymentRegistry, isPaymentMode, type PaymentMode } from './payment-registry';

export type PaymentResult = { status: 'disabled' | 'not_started' | 'uncertain' | 'expired' | 'review' | ReconciledPayment } | { status: 'ready'; url: string };
type OrderRow = PaymentOrder & { paymentStatus: string; orderStatus: string; paymentMode?: PaymentMode; sellerId?: string; reservationState?: string };
type Provider = Pick<MercadoPagoTestProvider, 'verifySeller' | 'start' | 'reconcile' | 'sellerId'>;
type Authorize = (mode: PaymentMode) => Promise<void>;
const terminal = ['approved', 'partially_refunded', 'in_mediation', 'refunded', 'charged_back'];
const expired = (order: OrderRow) => order.reservationState === 'released' || !!order.paymentExpiresAt && new Date(order.paymentExpiresAt).getTime() <= Date.now();
const paymentResult = (order: OrderRow, status: ReconciledPayment): PaymentResult => ({ status: order.orderStatus === 'cancelled' && terminal.includes(status) ? 'review' : expired(order) && ['rejected', 'cancelled'].includes(status) ? 'expired' : status });

/** A committed uncertain claim precedes the external POST. Never repeat an uncertain POST. */
export class PaymentService {
  constructor(private readonly db?: DataSource, private readonly provider?: Provider | PaymentRegistry) {}
  get available(): boolean { return !!this.provider; }
  private database(): DataSource { if (!this.db?.isInitialized) throw new ServiceUnavailableException('Payment unavailable'); return this.db; }
  private async owned(tx: Pick<EntityManager, 'query'>, sessionId: string, orderId: string): Promise<OrderRow> {
    if (!/^[a-f0-9-]{36}$/.test(orderId)) throw new BadRequestException('Invalid order');
    const rows = await tx.query(`SELECT o.id, o.currency, o.total_minor AS totalMinor, o.payment_status AS paymentStatus, o.order_status AS orderStatus, o.payment_mode AS paymentMode, o.payment_seller_id AS sellerId,
      r.expires_at AS paymentExpiresAt, r.state AS reservationState FROM checkout_orders o
      JOIN checkout_sessions s ON s.id = o.session_id LEFT JOIN checkout_order_reservations r ON r.order_id = o.id
      WHERE o.id = ? AND o.session_id = ? AND s.expires_at > UTC_TIMESTAMP(6) FOR UPDATE`, [orderId, sessionId]);
    if (rows.length !== 1) throw new NotFoundException('Order unavailable');
    return rows[0];
  }
  private forOrder(order: OrderRow): Provider {
    if (!(this.provider instanceof PaymentRegistry)) return this.provider!;
    if (!isPaymentMode(order.paymentMode) || !order.sellerId) throw new ServiceUnavailableException('Payment environment unavailable');
    return this.provider.get(order.paymentMode, order.sellerId);
  }
  private async authorize(order: OrderRow, authorize?: Authorize) {
    if (this.provider instanceof PaymentRegistry && order.paymentMode === 'test' && !authorize) throw new ServiceUnavailableException('Test authorization required');
    await authorize?.(order.paymentMode ?? 'test');
  }
  private existing(order: OrderRow, row: { state: string; preferenceId: string | null; sellerId: string; paymentMode?: string }, provider: Provider): PaymentResult {
    if (String(row.sellerId) !== provider.sellerId || (this.provider instanceof PaymentRegistry && row.paymentMode !== order.paymentMode)) throw new ServiceUnavailableException('Payment seller or environment changed');
    if (terminal.includes(order.paymentStatus)) return paymentResult(order, order.paymentStatus as ReconciledPayment);
    if (row.state === 'uncertain') return { status: 'uncertain' };
    if (expired(order)) return { status: 'expired' };
    if (row.state !== 'ready' || !row.preferenceId || !/^[a-zA-Z0-9-]{1,128}$/.test(row.preferenceId)) throw new ServiceUnavailableException('Payment unavailable');
    return { status: 'ready', url: checkoutUrl(`https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${row.preferenceId}`, row.preferenceId) };
  }
  async start(sessionId: string, orderId: string, authorize?: Authorize): Promise<PaymentResult> {
    if (!this.provider) return { status: 'disabled' };
    // Ownership before any outward request. Verification failure is safe to retry: no preference POST occurred.
    const initial = await this.database().transaction(tx => this.owned(tx, sessionId, orderId));
    await this.authorize(initial, authorize);
    if (expired(initial)) return this.refresh(sessionId, orderId, authorize);
    if (initial.orderStatus === 'cancelled') throw new ConflictException('Order cancelled');
    let provider: Provider;
    try { provider = this.forOrder(initial); await provider.verifySeller(); }
    catch { throw new ServiceUnavailableException({ code: 'PAYMENT_NOT_STARTED', message: 'No se pudo preparar el pago. Podés reintentar con el mismo pedido.' }); }
    const claim = await this.database().transaction(async tx => {
      const order = await this.owned(tx, sessionId, orderId);
      if (order.orderStatus === 'cancelled') throw new ConflictException('Order cancelled');
      const rows = await tx.query('SELECT state, preference_id AS preferenceId, seller_id AS sellerId, payment_mode AS paymentMode FROM checkout_payment_starts WHERE order_id = ? FOR UPDATE', [orderId]);
      if (rows.length) return { result: this.existing(order, rows[0], provider) };
      if (expired(order)) return { result: { status: 'expired' } as PaymentResult };
      if (order.paymentStatus !== 'not_started') throw new ServiceUnavailableException('Payment state unavailable');
      await tx.query("INSERT INTO checkout_payment_starts (order_id, state, seller_id, payment_mode) VALUES (?, 'uncertain', ?, ?)", [orderId, provider.sellerId, order.paymentMode ?? 'test']);
      return { order };
    });
    if ('result' in claim) {
      if (claim.result!.status !== 'ready') return claim.result!;
      // A saved URL may already have an in-process/approved payment. Reconcile before offering it again.
      const checked = await this.refresh(sessionId, orderId, authorize);
      return ['rejected', 'cancelled'].includes(checked.status) ? claim.result! : checked;
    }
    try {
      const preference = await provider.start(claim.order!);
      return await this.database().transaction(async tx => {
        const current = await this.owned(tx, sessionId, orderId);
        await tx.query("UPDATE checkout_payment_starts SET preference_id = ?, state = 'ready' WHERE order_id = ? AND state = 'uncertain'", [preference.preferenceId, orderId]);
        if (current.paymentStatus === 'not_started') {
          await tx.query('UPDATE checkout_orders SET payment_status = ?, revision = revision + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', ['pending', orderId]);
          await recordOrderEvent(tx, orderId, 'mercadopago', 'Mercado Pago', { changes: { paymentStatus: { from: 'not_started', to: 'pending' } } });
        }
        return this.existing(current, { state: 'ready', preferenceId: preference.preferenceId, sellerId: provider.sellerId, paymentMode: current.paymentMode }, provider);
      });
    } catch { return { status: 'uncertain' }; }
  }
  async refresh(sessionId: string, orderId: string, authorize?: Authorize): Promise<PaymentResult> {
    if (!this.provider) return { status: 'disabled' };
    const order = await this.database().transaction(tx => this.owned(tx, sessionId, orderId));
    await this.authorize(order, authorize);
    const provider = this.forOrder(order);
    const rows = await this.database().query('SELECT state, preference_id AS preferenceId, seller_id AS sellerId, payment_mode AS paymentMode FROM checkout_payment_starts WHERE order_id = ?', [orderId]);
    if (!rows.length) return { status: expired(order) ? 'expired' : 'not_started' };
    this.existing(order, rows[0], provider);
    try {
      await provider.verifySeller();
      // Serialize authoritative reads with S2S notifications, including dispute resolution.
      return await this.database().transaction(async tx => {
        const current = await this.owned(tx, sessionId, orderId);
        const status = await provider.reconcile(current);
        if (!status) {
          const latest = await tx.query('SELECT state, preference_id AS preferenceId, seller_id AS sellerId, payment_mode AS paymentMode FROM checkout_payment_starts WHERE order_id = ? FOR UPDATE', [orderId]);
          if (latest.length !== 1) throw new ServiceUnavailableException('Payment unavailable');
          return this.existing(current, latest[0], provider);
        }
        if (!paymentCanAdvance(current.paymentStatus, status)) return paymentResult(current, current.paymentStatus as ReconciledPayment);
        if (current.paymentStatus !== status) {
          await tx.query('UPDATE checkout_orders SET payment_status = ?, revision = revision + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', [status, orderId]);
          await recordOrderEvent(tx, orderId, 'mercadopago', 'Mercado Pago', { ...(current.orderStatus === 'cancelled' ? { reason: 'Pago recibido sobre un pedido cancelado. Requiere revision antes de preparar o reembolsar.' } : {}), changes: { paymentStatus: { from: current.paymentStatus, to: status } } });
        }
        return paymentResult(current, status);
      });
    } catch { throw new ServiceUnavailableException('Payment verification unavailable'); }
  }
}
