import type { EntityManager } from 'typeorm';
import { recordOrderEvent } from '../orders/services/order-management';
import type { VerifiedPayment } from './mercadopago';

/** Customer-safe scalar only; never expose the payment response or the event body. */
export const paymentReferenceSql = `(SELECT JSON_UNQUOTE(JSON_EXTRACT(e.detail, '$.paymentId')) FROM order_events e
  WHERE e.order_id = checkout_orders.id AND e.source = 'mercadopago' AND JSON_VALID(e.detail)
    AND JSON_UNQUOTE(JSON_EXTRACT(e.detail, '$.paymentId')) REGEXP '^[1-9][0-9]{0,15}$'
    AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.detail, '$.paymentStatus')),
      JSON_UNQUOTE(JSON_EXTRACT(e.detail, '$.changes.paymentStatus.to'))) = checkout_orders.payment_status
  ORDER BY e.created_at DESC, e.id DESC LIMIT 1)`;

/** Caller holds the order lock. Reference-only events do not trigger confirmation emails. */
export async function recordPaymentReference(tx: Pick<EntityManager, 'query'>, orderId: string, payment: VerifiedPayment) {
  const [existing] = await tx.query(`SELECT ${paymentReferenceSql} AS paymentId FROM checkout_orders WHERE id = ?`, [orderId]);
  if (existing?.paymentId === payment.paymentId) return;
  await recordOrderEvent(tx, orderId, 'mercadopago', 'Mercado Pago', { paymentId: payment.paymentId, paymentStatus: payment.status });
}
