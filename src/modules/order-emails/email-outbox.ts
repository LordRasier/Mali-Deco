import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { emailConfig, type EmailConfig } from './email-config';
import { emailStages, type EmailOrder } from './order-email-model';

/** Part of the business transaction. External requests are only made by the worker after commit. */
export async function enqueueOrderEmails(tx: Pick<EntityManager, 'query'>, id: string, detail: object, config: EmailConfig = emailConfig()) {
  if (config.mode === 'disabled') return;
  const stages = emailStages([{ detail: JSON.stringify(detail), createdAt: new Date() }]).filter(s => s.occurredAt);
  if (!stages.length) return;
  const [row] = await tx.query('SELECT snapshot, order_status AS orderStatus, tracking_number AS trackingNumber, tracking_url AS trackingUrl FROM checkout_orders WHERE id = ?', [id]);
  // Late approval after reservation release needs operator review, not a fulfillment promise.
  if (row.orderStatus === 'cancelled') return;
  const saved = JSON.parse(row.snapshot).result;
  // Explicit projection keeps phone, document, payment credentials and internal notes out of the queue and provider.
  const order: EmailOrder = { id: saved.id, createdAt: saved.createdAt, currency: saved.currency, totalMinor: saved.totalMinor,
    contact: { name: saved.contact.name, email: saved.contact.email },
    destination: { street: saved.destination.street, number: saved.destination.number, unit: saved.destination.unit, city: saved.destination.city, state: saved.destination.state, postalCode: saved.destination.postalCode },
    shipping: { carrierName: saved.shipping.carrierName, serviceName: saved.shipping.serviceName, amountMinor: saved.shipping.amountMinor,
      pickupPoint: saved.shipping.pickupPoint ? { description: saved.shipping.pickupPoint.description } : null },
    lines: saved.lines.map((l: EmailOrder['lines'][number]) => ({ name: l.name, variantName: l.variantName, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, lineTotalMinor: l.lineTotalMinor })),
    trackingNumber: row.trackingNumber || '', trackingUrl: row.trackingUrl || '' };
  const skipped = config.mode === 'live' && saved.testLocal === true;
  for (const stage of stages) await tx.query(`INSERT INTO order_email_outbox
    (id, order_id, stage, mode, status, payload, error_code, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE id = id`,
  [randomUUID(), id, stage.kind, config.mode, skipped ? 'skipped' : 'queued', JSON.stringify(order), skipped ? 'test_order_in_live' : null]);
}

export type EmailDelivery = { stage: string; status: string; mode: string; recipient: string; providerId: string | null; providerStatus: string | null;
  errorCode: string | null; createdAt: string | Date; updatedAt: string | Date; acceptedAt: string | Date | null; sentAt: string | Date | null };
export async function readEmailDeliveries(db: Pick<EntityManager, 'query'>, orderId: string) {
  try {
    const items: EmailDelivery[] = await db.query(`SELECT stage, status, mode, recipient, provider_id AS providerId, provider_status AS providerStatus,
      error_code AS errorCode, created_at AS createdAt, updated_at AS updatedAt, accepted_at AS acceptedAt, sent_at AS sentAt
      FROM order_email_outbox WHERE order_id = ? ORDER BY created_at LIMIT 3`, [orderId]);
    return { available: true, items };
  } catch (error) {
    if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error;
    return { available: false, items: [] as EmailDelivery[] };
  }
}
