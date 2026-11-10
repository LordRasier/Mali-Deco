import { BadRequestException, ConflictException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { orderId, orderStates, statusColumns, statuses, type OrderState } from './order-state';
import { enqueueOrderEmails } from '../../order-emails/email-outbox';

export async function recordOrderEvent(tx: Pick<EntityManager, 'query'>, id: string, source: string, actor: string, detail: object) {
  await tx.query('INSERT INTO order_events (id, order_id, source, actor, detail) VALUES (?, ?, ?, ?, ?)', [randomUUID(), id, source, actor, JSON.stringify(detail)]);
  await enqueueOrderEmails(tx, id, detail);
}
const bounded = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && ![...value].some(c => (c.charCodeAt(0) < 32 && !['\n', '\t'].includes(c)) || c.charCodeAt(0) === 127);
export function parseUpdate(value: unknown) {
  const keys = ['revision', ...Object.keys(orderStates), 'trackingNumber', 'trackingUrl', 'internalNote', 'reason'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw new BadRequestException('Invalid order update');
  const b = value as OrderState & { revision: number; trackingNumber: string; trackingUrl: string; internalNote: string; reason: string };
  if (!Number.isSafeInteger(b.revision) || b.revision < 1) throw new BadRequestException('Invalid revision');
  for (const key of Object.keys(orderStates) as (keyof OrderState)[]) if (!(orderStates[key] as readonly string[]).includes(b[key])) throw new BadRequestException('Invalid status');
  if (!bounded(b.trackingNumber, 160) || !bounded(b.trackingUrl, 1000) || !bounded(b.internalNote, 4000) || !bounded(b.reason, 1000) || !b.reason.trim()) throw new BadRequestException('A reason is required');
  if (b.trackingUrl) {
    try { const url = new URL(b.trackingUrl); if (url.protocol !== 'https:' || url.username || url.password) throw Error(); }
    catch { throw new BadRequestException('Invalid tracking URL'); }
  }
  return b;
}
export function validateTransition(previous: OrderState, next: OrderState) {
  if (previous.shippingStatus !== next.shippingStatus && ['shipped', 'delivered'].includes(next.shippingStatus) && (next.paymentStatus !== 'approved' || next.fulfillmentStatus !== 'ready' || next.orderStatus === 'cancelled')) throw new BadRequestException('Dispatch requires approved payment and prepared order');
  if (previous.orderStatus !== next.orderStatus && next.orderStatus === 'completed' && (next.shippingStatus !== 'delivered' || next.paymentStatus !== 'approved')) throw new BadRequestException('Completion requires delivery and payment');
}
type Upload = { buffer: Buffer; size: number; originalname: string };
export function receiptFile(file: Upload) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length || file.size < 8 || file.size > 2 * 1024 * 1024) throw new BadRequestException('Invalid attachment (maximum 2 MB)');
  const b = file.buffer;
  const mime = b.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf'
    : b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : b[0] === 255 && b[1] === 216 && b[2] === 255 ? 'image/jpeg' : '';
  if (!mime) throw new BadRequestException('Only PDF, PNG and JPEG attachments are accepted');
  const extension = mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg';
  const name = [...String(file.originalname || 'comprobante')].map(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || '/\\<>:"|?*'.includes(c) ? '_' : c).join('').replace(/\.[^.]*$/, '').slice(0, 170) + extension;
  return { name, mime, digest: createHash('sha256').update(b).digest('hex') };
}
export class OrderManagement {
  constructor(private readonly db?: DataSource) {}
  private database() { if (!this.db?.isInitialized) throw new ServiceUnavailableException('Orders unavailable'); return this.db; }
  private async safe<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); } catch (error) { if (error instanceof HttpException) throw error; throw new ServiceUnavailableException('Order operation unavailable'); }
  }
  async update(id: string, value: unknown, actor: string) {
    orderId(id); const b = parseUpdate(value);
    return this.safe(() => this.database().transaction(async tx => {
      const [row] = await tx.query(`SELECT ${statusColumns}, revision, tracking_number AS trackingNumber, tracking_url AS trackingUrl, internal_note AS internalNote FROM checkout_orders WHERE id = ? FOR UPDATE`, [id]);
      if (!row) throw new NotFoundException('Order not found');
      if (Number(row.revision) !== b.revision) throw new ConflictException({ code: 'ORDER_CHANGED', message: 'Order changed; reload before saving' });
      const previous = statuses(row);
      validateTransition(previous, b);
      if (b.paymentStatus !== previous.paymentStatus) {
        const payment = await tx.query('SELECT order_id FROM checkout_payment_starts WHERE order_id = ?', [id]);
        if (payment.length) throw new ConflictException({ code: 'PAYMENT_MANAGED', message: 'Mercado Pago manages this payment' });
      }
      const changes: Record<string, { from: string; to: string }> = {};
      for (const key of [...Object.keys(orderStates), 'trackingNumber', 'trackingUrl', 'internalNote'] as (keyof typeof b)[]) {
        if (String(row[key] ?? '') !== String(b[key])) changes[key] = { from: String(row[key] ?? ''), to: String(b[key]) };
      }
      if (!Object.keys(changes).length) return { ok: true, revision: b.revision };
      await tx.query(`UPDATE checkout_orders SET order_status = ?, payment_status = ?, fulfillment_status = ?, shipping_status = ?,
        tracking_number = ?, tracking_url = ?, internal_note = ?, revision = revision + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
      [b.orderStatus, b.paymentStatus, b.fulfillmentStatus, b.shippingStatus, b.trackingNumber.trim(), b.trackingUrl.trim(), b.internalNote.trim(), id]);
      await recordOrderEvent(tx, id, 'manual', actor, { changes, reason: b.reason.trim() });
      return { ok: true, revision: b.revision + 1 };
    }));
  }
  async attach(id: string, file: Upload, actor: string) {
    orderId(id); const meta = receiptFile(file);
    return this.safe(() => this.database().transaction(async tx => {
      const rows = await tx.query('SELECT id FROM checkout_orders WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) throw new NotFoundException('Order not found');
      const existing = await tx.query('SELECT id FROM order_attachments WHERE order_id = ? AND digest = ?', [id, meta.digest]);
      if (existing.length) return { ok: true, id: existing[0].id };
      const [count] = await tx.query('SELECT COUNT(*) AS total FROM order_attachments WHERE order_id = ?', [id]);
      if (Number(count.total) >= 20) throw new ConflictException('Maximum 20 attachments per order');
      const attachmentId = randomUUID();
      await tx.query('INSERT INTO order_attachments (id, order_id, name, mime, size, digest, content, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [attachmentId, id, meta.name, meta.mime, file.size, meta.digest, file.buffer, actor]);
      await recordOrderEvent(tx, id, 'attachment', actor, { name: meta.name });
      return { ok: true, id: attachmentId };
    }));
  }
  async download(id: string, attachmentId: string) {
    orderId(id); orderId(attachmentId);
    return this.safe(async () => {
      const [file] = await this.database().query('SELECT name, mime, content FROM order_attachments WHERE order_id = ? AND id = ?', [id, attachmentId]);
      if (!file) throw new NotFoundException('Attachment not found');
      return file as { name: string; mime: string; content: Buffer };
    });
  }
}
