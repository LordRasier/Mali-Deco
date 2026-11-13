import { Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { PaymentRegistry, isPaymentMode } from '../../payments/payment-registry';
import { recordOrderEvent } from '../../orders/services/order-management';
import { paymentCanAdvance } from '../../orders/services/order-state';

export type ReservedItem = { productId: string; variantId: string; quantity: number };
export async function reserveOrder(tx: EntityManager, orderId: string, items: ReservedItem[]) {
  await tx.query(`INSERT INTO checkout_order_reservations (order_id, items, expires_at, review_after)
    VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 MINUTE), DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 MINUTE))`, [orderId, JSON.stringify(items)]);
}

/** Expiry is not evidence of failed payment. Provider verification precedes any release. */
export class OrderReservationWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger('OrderReservations');
  constructor(private readonly db?: DataSource, private readonly registry?: PaymentRegistry) {}
  onModuleInit() {
    if (!this.db) return;
    this.timer = setInterval(() => { void this.tick(); }, 60000); this.timer.unref();
    void this.tick();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick() {
    if (this.running || !this.db?.isInitialized) return;
    this.running = true;
    try {
      const rows: { id: string }[] = await this.db.query(`SELECT r.order_id AS id FROM checkout_order_reservations r
        WHERE r.state = 'held' AND r.review_after <= UTC_TIMESTAMP(6) ORDER BY r.review_after, r.order_id LIMIT 20`);
      for (const row of rows) {
        try { await this.review(row.id); }
        catch { this.logger.warn('Reservation retained: payment or inventory verification unavailable.'); }
        finally { await this.db.query("UPDATE checkout_order_reservations SET review_after = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE) WHERE order_id = ? AND state = 'held'", [row.id]); }
      }
    } catch { this.logger.warn('Reservation review unavailable; check migration and database.'); }
    finally { this.running = false; }
  }
  async review(id: string) {
    if (!this.db?.isInitialized) return;
    await this.db.transaction(async tx => {
      // Same order lock as payment start, webhook and admin changes; stock can return only once.
      const [order] = await tx.query(`SELECT id, order_status AS orderStatus, payment_status AS paymentStatus,
        fulfillment_status AS fulfillmentStatus, shipping_status AS shippingStatus,
        payment_mode AS mode, payment_seller_id AS sellerId, currency, total_minor AS totalMinor
        FROM checkout_orders WHERE id = ? FOR UPDATE`, [id]);
      const [reservation] = await tx.query(`SELECT state, items, expires_at AS expiresAt,
        expires_at <= UTC_TIMESTAMP(6) AS expired, DATE_ADD(expires_at, INTERVAL 15 MINUTE) <= UTC_TIMESTAMP(6) AS reviewable
        FROM checkout_order_reservations WHERE order_id = ? FOR UPDATE`, [id]);
      if (!order || !reservation || reservation.state !== 'held' || !Number(reservation.expired)) return;
      const monetary = ['approved', 'partially_refunded', 'in_mediation', 'refunded', 'charged_back'];
      if (monetary.includes(order.paymentStatus)) {
        await tx.query("UPDATE checkout_order_reservations SET state = 'consumed', updated_at = UTC_TIMESTAMP(6) WHERE order_id = ?", [id]); return;
      }
      if (order.fulfillmentStatus !== 'not_started' || order.shippingStatus !== 'not_started') return;
      const [start] = await tx.query('SELECT state, preference_id AS preferenceId, seller_id AS sellerId, payment_mode AS mode FROM checkout_payment_starts WHERE order_id = ?', [id]);
      if (start) {
        if (!Number(reservation.reviewable) || start.state !== 'ready' || !start.preferenceId || !this.registry || !isPaymentMode(order.mode) || start.mode !== order.mode || String(start.sellerId) !== order.sellerId) return;
        const provider = this.registry.get(order.mode, order.sellerId);
        await provider.verifySeller();
        if (!await provider.preferenceExpired(start.preferenceId, order, new Date(reservation.expiresAt).getTime())) return;
        const next = await provider.reconcile({ ...order, totalMinor: String(order.totalMinor) });
        if (next && paymentCanAdvance(order.paymentStatus, next)) {
          await tx.query('UPDATE checkout_orders SET payment_status = ?, revision = revision + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?', [next, id]);
          await recordOrderEvent(tx, id, 'mercadopago', 'Mercado Pago', { changes: { paymentStatus: { from: order.paymentStatus, to: next } } });
        }
        if (next !== null && !['rejected', 'cancelled'].includes(next)) return;
      } else if (!['not_started', 'rejected', 'cancelled'].includes(order.paymentStatus)) return;

      const items: ReservedItem[] = JSON.parse(reservation.items);
      if (!Array.isArray(items) || items.length > 100 || items.some(i => !i || typeof i.productId !== 'string' || !/^[\x21-\x7e]{1,36}$/.test(i.productId) || typeof i.variantId !== 'string' || !/^[\x21-\x7e]{1,36}$/.test(i.variantId) || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > 999)
        || new Set(items.map(i => JSON.stringify([i.productId, i.variantId]))).size !== items.length) throw Error('Invalid reservation ledger');
      if (order.mode !== 'production' && items.length) throw Error('Test inventory mismatch');
      for (const productId of [...new Set(items.map(i => i.productId))].sort()) {
        if ((await tx.query('SELECT id FROM products WHERE id = ? FOR UPDATE', [productId])).length !== 1) throw Error('Missing reserved product');
      }
      for (const item of [...items].sort((a, b) => a.productId.localeCompare(b.productId) || a.variantId.localeCompare(b.variantId))) {
        const [variant] = await tx.query('SELECT stock_quantity AS stockQuantity FROM product_variants WHERE id = ? AND product_id = ? FOR UPDATE', [item.variantId, item.productId]);
        if (!variant || !Number.isSafeInteger(variant.stockQuantity) || variant.stockQuantity < 0 || variant.stockQuantity + item.quantity > 1000000) throw Error('Reserved inventory cannot be restored');
        await tx.query('UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ? AND product_id = ?', [item.quantity, item.variantId, item.productId]);
      }
      await tx.query("UPDATE checkout_order_reservations SET state = 'released', updated_at = UTC_TIMESTAMP(6) WHERE order_id = ?", [id]);
      await tx.query("UPDATE checkout_orders SET order_status = 'cancelled', payment_status = 'cancelled', revision = revision + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?", [id]);
      await recordOrderEvent(tx, id, 'reservation', 'Sistema', { reason: 'Reserva vencida sin pago activo; stock restituido.', changes: { orderStatus: { from: order.orderStatus, to: 'cancelled' } } });
    });
  }
}
