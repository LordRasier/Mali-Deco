import type { DataSource } from 'typeorm';
import { PaymentRegistry, isPaymentMode } from './payment-registry';
import { paymentReferenceSql, recordPaymentReference } from './payment-reference';

/** Recover historical IDs without changing orders, creating payments or sending emails. */
export async function syncPaymentReferences(db: DataSource, registry: PaymentRegistry) {
  const totals = { checked: 0, recovered: 0, skipped: 0, failed: 0 };
  let cursor = '';
  while (true) {
    const rows: Array<{ id: string }> = await db.query(`SELECT id FROM checkout_orders
      WHERE id > ? AND payment_status <> 'not_started'
        AND EXISTS(SELECT 1 FROM checkout_payment_starts p WHERE p.order_id = checkout_orders.id)
        AND ${paymentReferenceSql} IS NULL ORDER BY id LIMIT 100`, [cursor]);
    if (!rows.length) break;
    for (const row of rows) {
      cursor = row.id; totals.checked++;
      try {
        const recovered = await db.transaction(async tx => {
          const [order] = await tx.query(`SELECT id, payment_mode AS mode, payment_seller_id AS sellerId,
            payment_status AS paymentStatus, currency, total_minor AS totalMinor FROM checkout_orders WHERE id = ? FOR UPDATE`, [row.id]);
          const [start] = await tx.query('SELECT seller_id AS sellerId, payment_mode AS mode FROM checkout_payment_starts WHERE order_id = ?', [row.id]);
          if (!order || !start || !isPaymentMode(order.mode) || start.mode !== order.mode || String(start.sellerId) !== order.sellerId) return false;
          const [existing] = await tx.query(`SELECT ${paymentReferenceSql} AS paymentId FROM checkout_orders WHERE id = ?`, [row.id]);
          if (existing?.paymentId) return false;
          const provider = registry.get(order.mode, order.sellerId);
          await provider.verifySeller();
          const payment = await provider.reconcileDetails({ ...order, totalMinor: String(order.totalMinor) });
          if (!payment || payment.status !== order.paymentStatus) return false;
          await recordPaymentReference(tx, row.id, payment); return true;
        });
        totals[recovered ? 'recovered' : 'skipped']++;
      } catch { totals.failed++; }
    }
  }
  return totals;
}
