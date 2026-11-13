import { productPrice } from '../../catalog/models/product-price';
import { BadRequestException, ConflictException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type { QuoteSnapshot, QuoteLine } from '../../checkout/services/quote';
import { stockUnavailable, validStock } from '../../catalog/models/inventory';
import { statusColumns, statuses } from './order-state';
import { listOrders, orderDetail } from './orders-query';
import type { PaymentContext } from '../../payments/payment-registry';
import { reserveOrder, type ReservedItem } from '../../checkout/services/order-reservations';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const keyValid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\x21-\x7e]{1,36}$/.test(v);
const object = (v: unknown, keys: string[]): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) throw new BadRequestException('Invalid order');
  return v as Record<string, unknown>;
};
const text = (v: unknown, max: number, empty = false): v is string => typeof v === 'string' && v.length <= max && (empty || !!v.trim()) && ![...v].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
export function parseOrder(value: unknown) {
  const b = object(value, ['quoteId', 'optionId', 'pickupPointId', 'contact', 'address']);
  const hasDocument = !!b.contact && typeof b.contact === 'object' && Object.hasOwn(b.contact, 'document');
  const c = object(b.contact, ['name', 'email', 'phone', ...(hasDocument ? ['document'] : [])]);
  if (hasDocument && (!text(c.document, 32, true) || (c.document.trim() !== '' && !/^(?:[0-9]{7,8}|[0-9]{11})$/.test(c.document.trim())))) throw new BadRequestException('Invalid document');
  const document = hasDocument ? (c.document as string).trim() : '';
  const a = object(b.address, ['street', 'number', 'unit']);
  if (!id(b.quoteId) || !text(b.optionId, 255) || !(b.pickupPointId === null || (typeof b.pickupPointId === 'number' && Number.isSafeInteger(b.pickupPointId) && b.pickupPointId > 0)) ||
      !text(c.name, 255) || !text(c.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) || !text(c.phone, 64) ||
      !text(a.street, 255) || !text(a.number, 64) || !text(a.unit, 255, true)) throw new BadRequestException('Invalid order');
  return { quoteId: b.quoteId, optionId: b.optionId, pickupPointId: b.pickupPointId as number | null,
    contact: { name: c.name, email: c.email, phone: c.phone, ...(document ? { document } : {}) }, address: { street: a.street, number: a.number, unit: a.unit } };
}
const conflict = (): never => { throw new ConflictException({ code: 'QUOTE_CHANGED', message: 'Quote changed or expired; quote again' }); };
const money = (v: unknown): bigint => {
  if (typeof v !== 'string' || !/^(0|[1-9]\d*)$/.test(v)) return conflict();
  const n = BigInt(v); if (n > BigInt(Number.MAX_SAFE_INTEGER)) return conflict(); return n;
};
const validCurrency = (v: unknown) => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
const pair = (v: Pick<QuoteLine, 'productId' | 'variantId'>) => JSON.stringify([v.productId, v.variantId]);
const cartLines = (lines: QuoteLine[]) => lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }));

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
  async create(sessionId: string, idempotencyKey: string, value: unknown, payment?: PaymentContext) {
    if (!id(sessionId) || !keyValid(idempotencyKey)) throw new BadRequestException('Invalid idempotency key');
    const body = parseOrder(value); const bodyHash = hash(JSON.stringify(body)); const keyHash = hash(idempotencyKey);
    return this.safe(() => this.database().transaction(async (tx: EntityManager) => {
      const sessions = await tx.query('SELECT id FROM checkout_sessions WHERE id = ? AND expires_at > UTC_TIMESTAMP(6) FOR UPDATE', [sessionId]);
      if (!sessions.length) throw new ConflictException('Checkout session unavailable');
      const previous = await tx.query(`SELECT body_hash AS bodyHash, snapshot, ${statusColumns} FROM checkout_orders WHERE session_id = ? AND idempotency_key_hash = ?`, [sessionId, keyHash]);
      if (previous.length) {
        if (previous[0].bodyHash !== bodyHash) throw new ConflictException({ code: 'KEY_USED', message: 'Idempotency key already used' });
        const snapshot = JSON.parse(previous[0].snapshot);
        return { ...snapshot.result, cartLines: snapshot.quote?.lines ? cartLines(snapshot.quote.lines) : undefined, ...statuses(previous[0]) };
      }
      if (payment) {
        // Lock the same configuration row as the admin writer. No mixed-mode order may commit.
        const [settings] = await tx.query('SELECT enabled, mode, revision FROM store_payment_settings WHERE id = 1 LOCK IN SHARE MODE');
        if (!settings || !Number(settings.enabled) || settings.mode !== payment.mode || Number(settings.revision) !== payment.revision) return conflict();
      }
      const used = await tx.query('SELECT id FROM checkout_orders WHERE idempotency_key_hash = ?', [keyHash]);
      if (used.length) throw new ConflictException({ code: 'KEY_USED', message: 'Idempotency key already used' });
      const quoteUsed = await tx.query('SELECT id FROM checkout_orders WHERE quote_id = ?', [body.quoteId]);
      if (quoteUsed.length) throw new ConflictException({ code: 'QUOTE_USED', message: 'Quote already used' });
      const quotes = await tx.query('SELECT snapshot FROM checkout_quotes WHERE id = ? AND session_id = ? AND expires_at > UTC_TIMESTAMP(6) FOR UPDATE', [body.quoteId, sessionId]);
      if (quotes.length !== 1) return conflict();
      let q: QuoteSnapshot; try { q = JSON.parse(quotes[0].snapshot); } catch { return conflict(); }
      if (payment && (!q.payment || q.payment.mode !== payment.mode || q.payment.sellerId !== payment.sellerId || q.payment.revision !== payment.revision)) return conflict();
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
      const reserved: ReservedItem[] = [];
      const lines: { name: string; variantName: string; quantity: number; unitPriceMinor: string; lineTotalMinor: string; currency: string }[] = [];
      if (q.lines.some(line => !line || !id(line.productId) || !id(line.variantId))) return conflict();
      const sorted = [...q.lines].sort((a, b) => pair(a) < pair(b) ? -1 : pair(a) > pair(b) ? 1 : 0);
      const products = new Map<string, Record<string, unknown>>();
      // Explicit deterministic parent locks precede every variant lock, including admin inventory writes.
      for (const productId of [...new Set(sorted.map(line => line.productId))].sort()) {
        const rows = await tx.query(`SELECT name, product_weight_g AS weightGrams, product_width_mm AS widthMm,
          product_height_mm AS heightMm, product_length_mm AS lengthMm FROM products
          WHERE id = ? AND status = 'active' AND archived_at IS NULL FOR UPDATE`, [productId]);
        if (rows.length !== 1) return conflict(); products.set(productId, rows[0]);
      }
      for (const line of sorted) {
        if (seen.has(pair(line)) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 999 || !text(line.name,255) || !text(line.variantName,255) || !['stock', 'made_to_order'].includes(line.supplyMode) || line.currency !== option.currency || ![line.weightGrams,line.widthMm,line.heightMm,line.lengthMm].every((n: unknown) => Number.isSafeInteger(n) && (n as number) > 0)) return conflict();
        seen.add(pair(line)); units += line.quantity; if (units > 1000) return conflict();
        const rows = await tx.query(`SELECT name AS variantName, price_minor AS priceMinor, sale_price_minor AS salePriceMinor, currency, supply_mode AS supplyMode, stock_quantity AS stockQuantity
          FROM product_variants WHERE product_id = ? AND id = ? AND archived_at IS NULL FOR UPDATE`, [line.productId, line.variantId]);
        const row = { ...products.get(line.productId), ...rows[0] };
        if (rows.length !== 1 || (['name','variantName','currency','supplyMode','weightGrams','widthMm','heightMm','lengthMm'] as const).some(k => row[k] !== line[k])) return conflict();
        let currentPrice: number;
        try { currentPrice = productPrice(row.priceMinor, row.salePriceMinor).priceMinor; } catch { return conflict(); }
        if (String(currentPrice) !== line.priceMinor) return conflict();
        if (line.supplyMode === 'stock') {
          if (!validStock(row.stockQuantity)) return conflict();
          if (row.stockQuantity < line.quantity) stockUnavailable();
          if (payment?.mode !== 'test') {
          const result = await tx.query(`UPDATE product_variants SET stock_quantity = stock_quantity - ?
            WHERE id = ? AND product_id = ? AND supply_mode = 'stock' AND archived_at IS NULL AND stock_quantity >= ?`, [line.quantity, line.variantId, line.productId, line.quantity]);
          if (result.affectedRows !== 1) stockUnavailable();
          if (payment?.mode === 'production') reserved.push({ productId: line.productId, variantId: line.variantId, quantity: line.quantity });
          }
        }
        const unit = money(line.priceMinor); const lineTotal = unit * BigInt(line.quantity); total += lineTotal;
        if (total > BigInt(Number.MAX_SAFE_INTEGER)) return conflict();
        lines.push({ name: line.name, variantName: line.variantName, quantity: line.quantity, unitPriceMinor: unit.toString(), lineTotalMinor: lineTotal.toString(), currency: line.currency });
      }
      const orderId = randomUUID(); const createdAt = new Date().toISOString();
      if (payment && (total <= 0n || total > 999999999n)) throw new BadRequestException('El total excede el límite admitido por el pago.');
      const result = { id: orderId, createdAt, orderStatus: 'received', paymentStatus: 'not_started', fulfillmentStatus: 'not_started', shippingStatus: 'not_started', testLocal: payment?.mode !== 'production', paymentMode: payment?.mode ?? 'test', currency: option.currency, totalMinor: total.toString(), contact: body.contact,
        destination: { country: q.destination.country, postalCode: q.destination.postalCode, city: q.destination.city, state: q.destination.state, ...body.address },
        shipping: { carrierName: option.carrierName, serviceName: option.serviceName, amountMinor: money(option.amountMinor).toString(), currency: option.currency, pickupPoint }, lines, cartLines: cartLines(q.lines) };
      await tx.query('INSERT INTO checkout_orders (id, session_id, quote_id, idempotency_key_hash, body_hash, created_at, currency, total_minor, snapshot, payment_mode, payment_seller_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [orderId, sessionId, body.quoteId, keyHash, bodyHash, new Date(createdAt), option.currency, total.toString(), JSON.stringify({ result, quote: q, selection: { optionId: body.optionId, pickupPointId: body.pickupPointId } }), payment?.mode ?? 'test', payment?.sellerId ?? null]);
      if (payment) await reserveOrder(tx, orderId, reserved);
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
      const snapshot = JSON.parse(rows[0].snapshot);
      const o = { ...snapshot.result, ...statuses(rows[0]) };
      return { status: 'completed' as const, order: { id: o.id, orderStatus: o.orderStatus, paymentStatus: o.paymentStatus, fulfillmentStatus: o.fulfillmentStatus, shippingStatus: o.shippingStatus, testLocal: o.testLocal, currency: o.currency, totalMinor: o.totalMinor, cartLines: snapshot.quote?.lines ? cartLines(snapshot.quote.lines) : undefined,
        checkout: { contact: o.contact, address: { street: o.destination.street, number: o.destination.number, unit: o.destination.unit }, postalCode: o.destination.postalCode, delivery: o.shipping.carrierName + ' · ' + o.shipping.serviceName, lines: o.lines } } };
    }));
  }
  async list(query: Record<string, unknown>) {
    return this.safe(() => listOrders(this.database(), query));
  }
  async detail(orderId: string) {
    return this.safe(() => orderDetail(this.database(), orderId));
  }
}
