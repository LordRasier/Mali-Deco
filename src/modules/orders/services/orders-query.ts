import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { orderId, orderStates, statusColumns, statuses, type OrderState } from './order-state';
import { readEmailDeliveries } from '../../order-emails/email-outbox';
import { publicEmailConfig } from '../../order-emails/email-config';

export function orderFilters(query: Record<string, unknown>) {
  if (!query || Object.keys(query).some(k => !['page', 'limit', 'search', 'orderStatus', 'paymentStatus', 'shippingStatus'].includes(k))) throw new BadRequestException('Invalid filters');
  const number = (v: unknown, fallback: number, max: number) => {
    if (v === undefined) return fallback;
    if (typeof v !== 'string' || !/^[1-9]\d*$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) > max) throw new BadRequestException('Invalid pagination');
    return Number(v);
  };
  const page = number(query.page, 1, 1000000), limit = number(query.limit, 20, 100);
  const clauses: string[] = [], params: string[] = [];
  const columns = { orderStatus: 'order_status', paymentStatus: 'payment_status', shippingStatus: 'shipping_status' };
  for (const key of Object.keys(columns) as (keyof typeof columns)[]) {
    if (query[key] === undefined || query[key] === '') continue;
    if (typeof query[key] !== 'string' || !(orderStates[key] as readonly string[]).includes(query[key])) throw new BadRequestException('Invalid status filter');
    clauses.push(`${columns[key]} = ?`); params.push(query[key]);
  }
  if (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 120 || [...query.search].some(c => c.charCodeAt(0) < 32))) throw new BadRequestException('Invalid search');
  if (typeof query.search === 'string' && query.search.trim()) {
    clauses.push("LOCATE(LOWER(?), LOWER(CONCAT_WS(' ', id, JSON_UNQUOTE(JSON_EXTRACT(snapshot, '$.result.contact.name')), JSON_UNQUOTE(JSON_EXTRACT(snapshot, '$.result.contact.email')), JSON_UNQUOTE(JSON_EXTRACT(snapshot, '$.result.contact.phone'))))) > 0");
    params.push(query.search.trim());
  }
  return { page, limit, where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}
export async function listOrders(db: DataSource, query: Record<string, unknown>) {
  const { page, limit, where, params } = orderFilters(query);
  const [counts] = await db.query(`SELECT COUNT(*) AS total,
    COALESCE(SUM(payment_status IN ('pending', 'not_started') AND order_status <> 'cancelled'), 0) AS awaitingPayment,
    COALESCE(SUM(payment_status = 'approved' AND shipping_status IN ('not_started', 'ready_to_ship') AND order_status <> 'cancelled'), 0) AS toPrepare,
    COALESCE(SUM(shipping_status = 'shipped'), 0) AS inTransit FROM checkout_orders${where}`, params);
  const rows = await db.query(`SELECT id, created_at AS createdAt, currency, total_minor AS totalMinor, snapshot, ${statusColumns}
    FROM checkout_orders${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  return { items: rows.map((r: OrderState & { id: string; createdAt: Date; currency: string; totalMinor: string; snapshot: string }) => {
    const saved = JSON.parse(r.snapshot).result;
    return { id: r.id, createdAt: new Date(r.createdAt).toISOString(), ...statuses(r), testLocal: saved.testLocal === true, currency: r.currency,
      totalMinor: String(r.totalMinor), contact: { name: saved.contact?.name, email: saved.contact?.email }, destination: { city: saved.destination?.city, state: saved.destination?.state },
      itemCount: (saved.lines ?? []).reduce((sum: number, line: { quantity: number }) => sum + line.quantity, 0) };
  }), page, limit, total: Number(counts.total), stats: { awaitingPayment: Number(counts.awaitingPayment ?? 0), toPrepare: Number(counts.toPrepare ?? 0), inTransit: Number(counts.inTransit ?? 0) } };
}
export async function orderDetail(db: DataSource, id: string) {
  orderId(id);
  let row, managementAvailable = true;
  try { [row] = await db.query(`SELECT snapshot, ${statusColumns}, revision, tracking_number AS trackingNumber,
    tracking_url AS trackingUrl, internal_note AS internalNote, updated_at AS updatedAt,
    EXISTS(SELECT 1 FROM checkout_payment_starts p WHERE p.order_id = checkout_orders.id) AS managedPayment
    FROM checkout_orders WHERE id = ?`, [id]); }
  catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || !['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(String(error.code))) throw error;
    // Read access survives a deployment where the additive migrations are still pending.
    managementAvailable = false;
    [row] = await db.query(`SELECT snapshot, ${statusColumns} FROM checkout_orders WHERE id = ?`, [id]);
  }
  if (!row) throw new NotFoundException('Order not found');
  const state = statuses(row);
  if (!managementAvailable) return { ...JSON.parse(row.snapshot).result, ...state, managementAvailable: false, revision: 0, managedPayment: true, attachments: [], events: [] };
  const attachments = await db.query('SELECT id, name, mime, size, actor, created_at AS createdAt FROM order_attachments WHERE order_id = ? ORDER BY created_at DESC, id DESC', [id]);
  const events = await db.query('SELECT id, source, actor, detail, created_at AS createdAt FROM order_events WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 100', [id]);
  const emails = await readEmailDeliveries(db, id);
  const emailSettings = publicEmailConfig();
  if (!emails.available) emailSettings.notice = 'Falta aplicar la actualización de base de datos para registrar los envíos.';
  return { ...JSON.parse(row.snapshot).result, ...state, managementAvailable: true, revision: Number(row.revision ?? 1), trackingNumber: row.trackingNumber ?? '',
    trackingUrl: row.trackingUrl ?? '', internalNote: row.internalNote ?? '', managedPayment: !!row.managedPayment,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null, attachments, events, emails: emails.items, emailSettings };
}
