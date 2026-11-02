import { BadRequestException, ConflictException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type { QuoteSnapshot, QuoteLine } from '../checkout/quote';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const keyValid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const statusColumns = 'order_status AS orderStatus, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, shipping_status AS shippingStatus';
function statuses(row: { orderStatus: string; paymentStatus: string; fulfillmentStatus: string; shippingStatus: string }) {
  if (row.orderStatus !== 'received' || row.paymentStatus !== 'not_started' || row.fulfillmentStatus !== 'not_started' || row.shippingStatus !== 'not_started') throw new ServiceUnavailableException('Invalid stored order status');
  return { orderStatus: row.orderStatus, paymentStatus: row.paymentStatus, fulfillmentStatus: row.fulfillmentStatus, shippingStatus: row.shippingStatus };
}
const id = (v: unknown): v is string => typeof v === 'string' && /^[\x21-\x7e]{1,36}$/.test(v);
const object = (v: unknown, keys: string[]): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) throw new BadRequestException('Invalid order');
  return v as Record<string, unknown>;
};
const text = (v: unknown, max: number, empty = false): v is string => typeof v === 'string' && v.length <= max && (empty || !!v.trim()) && ![...v].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
export function parseOrder(value: unknown) {
  const b = object(value, ['quoteId', 'optionId', 'pickupPointId', 'contact', 'address']);
  const c = object(b.contact, ['name', 'email', 'phone']);
  const a = object(b.address, ['street', 'number', 'unit']);
  if (!id(b.quoteId) || !text(b.optionId, 255) || !(b.pickupPointId === null || (typeof b.pickupPointId === 'number' && Number.isSafeInteger(b.pickupPointId) && b.pickupPointId > 0)) ||
      !text(c.name, 255) || !text(c.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) || !text(c.phone, 64) ||
      !text(a.street, 255) || !text(a.number, 64) || !text(a.unit, 255, true)) throw new BadRequestException('Invalid order');
  return { quoteId: b.quoteId, optionId: b.optionId, pickupPointId: b.pickupPointId as number | null,
    contact: { name: c.name, email: c.email, phone: c.phone }, address: { street: a.street, number: a.number, unit: a.unit } };
}
const conflict = (): never => { throw new ConflictException({ code: 'QUOTE_CHANGED', message: 'Quote changed or expired; quote again' }); };
const money = (v: unknown): bigint => {
  if (typeof v !== 'string' || !/^(0|[1-9]\d*)$/.test(v)) return conflict();
  const n = BigInt(v); if (n > BigInt(Number.MAX_SAFE_INTEGER)) return conflict(); return n;
};
const validCurrency = (v: unknown) => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
const pair = (v: Pick<QuoteLine, 'productId' | 'variantId'>) => JSON.stringify([v.productId, v.variantId]);

export class OrdersService {
  constructor(private readonly db?: DataSource) {}
  private database(): DataSource { if (!this.db?.isInitialized) throw new ServiceUnavailableException('Orders database unavailable'); return this.db; }
  private async safe<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); } catch (error) {
      if (error instanceof HttpException) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') throw new ConflictException('Idempotency key or quote already used');
      throw new ServiceUnavailableException('Orders database unavailable');
    }
  }
  async create(sessionId: string, idempotencyKey: string, value: unknown) {
    if (!id(sessionId) || !keyValid(idempotencyKey)) throw new BadRequestException('Invalid idempotency key');
    const body = parseOrder(value); const bodyHash = hash(JSON.stringify(body)); const keyHash = hash(idempotencyKey);
    return this.safe(() => this.database().transaction(async (tx: EntityManager) => {
      const sessions = await tx.query('SELECT id FROM checkout_sessions WHERE id = ? AND expires_at > UTC_TIMESTAMP(6) FOR UPDATE', [sessionId]);
      if (!sessions.length) throw new ConflictException('Checkout session unavailable');
      const previous = await tx.query('SELECT body_hash AS bodyHash, snapshot FROM checkout_orders WHERE session_id = ? AND idempotency_key_hash = ?', [sessionId, keyHash]);
      if (previous.length) {
        if (previous[0].bodyHash !== bodyHash) throw new ConflictException({ code: 'KEY_USED', message: 'Idempotency key already used' });
        return JSON.parse(previous[0].snapshot).result;
      }
      const used = await tx.query('SELECT id FROM checkout_orders WHERE idempotency_key_hash = ?', [keyHash]);
      if (used.length) throw new ConflictException({ code: 'KEY_USED', message: 'Idempotency key already used' });
      const quoteUsed = await tx.query('SELECT id FROM checkout_orders WHERE quote_id = ?', [body.quoteId]);
      if (quoteUsed.length) throw new ConflictException({ code: 'QUOTE_USED', message: 'Quote already used' });
      const quotes = await tx.query('SELECT snapshot FROM checkout_quotes WHERE id = ? AND session_id = ? AND expires_at > UTC_TIMESTAMP(6) FOR UPDATE', [body.quoteId, sessionId]);
      if (quotes.length !== 1) return conflict();
      let q: QuoteSnapshot; try { q = JSON.parse(quotes[0].snapshot); } catch { return conflict(); }
      if (!q || !q.destination || !Array.isArray(q.lines) || !q.lines.length || q.lines.length > 100 || !Array.isArray(q.options) || !q.options.length || !Number.isSafeInteger(q.validUntil) || q.validUntil <= Date.now()) return conflict();
      const options = q.options.filter((o) => o && o.id === body.optionId);
      if (options.length !== 1) return conflict();
      const option = options[0];
      if (!text(option.carrierName, 255) || !text(option.serviceName, 255) || !validCurrency(option.currency)) return conflict();
      let pickupPoint: {id: number; description: string} | null = null;
      if (option.pickupPoints !== undefined) {
        if (!Array.isArray(option.pickupPoints) || !option.pickupPoints.length) return conflict();
        const matches = option.pickupPoints.filter((p) => p && p.id === body.pickupPointId && Number.isSafeInteger(p.id) && p.id > 0 && text(p.description, 255));
        if (matches.length !== 1) return conflict(); pickupPoint = { id: matches[0].id, description: matches[0].description };
      } else if (body.pickupPointId !== null) return conflict();
      if (!(['country','postalCode','city','state'] as const).every(k => text(q.destination[k], 255))) return conflict();
      const seen = new Set<string>(); let total = money(option.amountMinor); let units = 0;
      const lines: { name: string; variantName: string; quantity: number; unitPriceMinor: string; lineTotalMinor: string; currency: string }[] = [];
      const sorted = [...q.lines].sort((a, b) => pair(a).localeCompare(pair(b), 'en'));
      for (const line of sorted) {
        if (!line || !id(line.productId) || !id(line.variantId) || seen.has(pair(line)) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000 || !text(line.name,255) || !text(line.variantName,255) || line.supplyMode !== 'made_to_order' || line.currency !== option.currency || ![line.weightGrams,line.widthMm,line.heightMm,line.lengthMm].every((n: unknown) => Number.isSafeInteger(n) && (n as number) > 0)) return conflict();
        seen.add(pair(line)); units += line.quantity; if (units > 1000) return conflict();
        const rows = await tx.query(`SELECT p.name, v.name AS variantName, v.price_minor AS priceMinor, v.currency, v.supply_mode AS supplyMode,
          p.product_weight_g AS weightGrams, p.product_width_mm AS widthMm, p.product_height_mm AS heightMm, p.product_length_mm AS lengthMm
          FROM products p JOIN product_variants v ON v.product_id = p.id WHERE p.id = ? AND v.id = ? AND p.status = 'active' AND p.archived_at IS NULL AND v.archived_at IS NULL FOR UPDATE`, [line.productId, line.variantId]);
        const row = rows[0];
        if (rows.length !== 1 || (['name','variantName','currency','supplyMode','weightGrams','widthMm','heightMm','lengthMm'] as const).some(k => row[k] !== line[k]) || String(row.priceMinor) !== line.priceMinor) return conflict();
        const unit = money(line.priceMinor); const lineTotal = unit * BigInt(line.quantity); total += lineTotal;
        if (total > BigInt(Number.MAX_SAFE_INTEGER)) return conflict();
        lines.push({ name: line.name, variantName: line.variantName, quantity: line.quantity, unitPriceMinor: unit.toString(), lineTotalMinor: lineTotal.toString(), currency: line.currency });
      }
      const orderId = randomUUID(); const createdAt = new Date().toISOString();
      const result = { id: orderId, createdAt, orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started', testLocal: true, currency: option.currency, totalMinor: total.toString(), contact: body.contact,
        destination: { country: q.destination.country, postalCode: q.destination.postalCode, city: q.destination.city, state: q.destination.state, ...body.address },
        shipping: { carrierName: option.carrierName, serviceName: option.serviceName, amountMinor: money(option.amountMinor).toString(), currency: option.currency, pickupPoint }, lines };
      await tx.query('INSERT INTO checkout_orders (id, session_id, quote_id, idempotency_key_hash, body_hash, created_at, currency, total_minor, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [orderId, sessionId, body.quoteId, keyHash, bodyHash, new Date(createdAt), option.currency, total.toString(), JSON.stringify({ result, quote: q, selection: { optionId: body.optionId, pickupPointId: body.pickupPointId } })]);
      return result;
    }));
  }
  async findAttempt(sessionId: string, idempotencyKey: string) {
    if (!id(sessionId) || !keyValid(idempotencyKey)) throw new BadRequestException('Invalid idempotency key');
    return this.safe(() => this.database().transaction(async (tx: EntityManager) => {
      const sessions = await tx.query('SELECT id FROM checkout_sessions WHERE id = ? AND expires_at > UTC_TIMESTAMP(6) FOR UPDATE', [sessionId]);
      if (!sessions.length) throw new ConflictException('Checkout session unavailable');
      const rows = await tx.query(`SELECT snapshot, ${statusColumns} FROM checkout_orders WHERE session_id = ? AND idempotency_key_hash = ?`, [sessionId, hash(idempotencyKey)]);
      if (!rows.length) return { status: 'unknown' as const };
      const o = { ...JSON.parse(rows[0].snapshot).result, ...statuses(rows[0]) };
      return { status: 'completed' as const, order: { id: o.id, orderStatus: o.orderStatus, paymentStatus: o.paymentStatus, fulfillmentStatus: o.fulfillmentStatus, shippingStatus: o.shippingStatus, testLocal: o.testLocal, currency: o.currency, totalMinor: o.totalMinor } };
    }));
  }
  async list(query: Record<string, unknown>) {
    if (!query || Object.keys(query).some(k => !['page','limit'].includes(k))) throw new BadRequestException('Invalid pagination');
    const parse = (v: unknown, fallback: number, max: number) => { if (v === undefined) return fallback; if (typeof v !== 'string' || !/^[1-9]\d*$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) > max) throw new BadRequestException('Invalid pagination'); return Number(v); };
    const page = parse(query.page, 1, 1000000), limit = parse(query.limit, 20, 100);
    return this.safe(async () => {
    const db = this.database();
    const counts = await db.query('SELECT COUNT(*) AS total FROM checkout_orders');
    const rows = await db.query(`SELECT id, created_at AS createdAt, currency, total_minor AS totalMinor, ${statusColumns} FROM checkout_orders ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [limit, (page - 1) * limit]);
    return { items: rows.map((r: { id: string; createdAt: Date; currency: string; totalMinor: string; orderStatus: string; paymentStatus: string; fulfillmentStatus: string; shippingStatus: string }) => ({ id: r.id, createdAt: new Date(r.createdAt).toISOString(), ...statuses(r), testLocal: true, currency: r.currency, totalMinor: String(r.totalMinor) })), page, limit, total: Number(counts[0].total) };
    });
  }
  async detail(orderId: string) {
    if (!id(orderId)) throw new BadRequestException('Invalid order id');
    return this.safe(async () => {
    const rows = await this.database().query(`SELECT snapshot, ${statusColumns} FROM checkout_orders WHERE id = ?`, [orderId]);
    if (!rows.length) throw new NotFoundException('Order not found');
    return { ...JSON.parse(rows[0].snapshot).result, ...statuses(rows[0]) };
    });
  }
}
