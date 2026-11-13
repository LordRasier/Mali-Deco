import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { EmailConfig } from '../order-emails/email-config';
import { trackingDays, trackingDigest, trackingEmail } from './tracking-security';

/** Issue only to the recorded owner. Redirected test emails must never grant access. */
export async function orderEmailLink(db: DataSource, config: EmailConfig, orderId: string, recipient: string) {
  const [order] = await db.query('SELECT tracking_email AS email, payment_mode AS paymentMode FROM checkout_orders WHERE id = ?', [orderId]);
  if (!order?.email || trackingEmail(recipient) !== order.email) return undefined;
  const allowTest = order.email === config.testTo.trim().toLowerCase();
  if ((config.mode === 'test' || order.paymentMode !== 'production') && !allowTest) return undefined;
  const token = randomBytes(32).toString('hex');
  const url = new URL('/seguimiento', config.siteUrl); url.hash = token;
  await db.query(`INSERT INTO order_tracking_access (token_hash, email, allow_test, created_at, expires_at)
    VALUES (?, ?, ?, UTC_TIMESTAMP(6), DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ${trackingDays} DAY))`,
  [trackingDigest(token), order.email, allowTest ? 1 : 0]);
  return url.href;
}
