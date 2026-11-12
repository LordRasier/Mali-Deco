import { BadRequestException, ForbiddenException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { parseQuoteIntent } from '../../shipping/quotes/catalog-quote';
import { PostalCodeResolver } from '../../shipping/postal/postal-code-resolver';
import { ZipnovaQuoteAdapter, type ShippingOptionsResult } from '../../shipping/providers/zipnova/zipnova-provider';
import { createZipnovaTransport } from '../../shipping/providers/zipnova/zipnova-transport';
import { validateZipnovaConfig, type Destination, type DeliveryOption, type ZipnovaConfig } from '../../shipping/providers/zipnova/zipnova';
import { localOperatorOrigin } from '../../shipping/quotes/local-quote-guard';
import type { CheckoutSession } from '../sessions/session';
import { stockUnavailable, validStock } from '../../catalog/models/inventory';
import { productPrice } from '../../catalog/models/product-price';
import { publicPaymentOrigin, type PaymentContext } from '../../payments/payment-registry';

export type QuoteLine = { productId: string; variantId: string; name: string; variantName: string; quantity: number; priceMinor: string; currency: string; supplyMode: 'stock' | 'made_to_order'; stockQuantity?: number; weightGrams: number; widthMm: number; heightMm: number; lengthMm: number };
export type QuoteInputSnapshot = { destination: Destination; lines: QuoteLine[] };
export type QuoteSnapshot = QuoteInputSnapshot & { options: (DeliveryOption & { id: string })[]; quotedAt: number; validUntil: number; packageCount: number; payment?: PaymentContext };
/** Receives the only catalog snapshot read for this quote; must never re-resolve IDs. */
export type QuoteProvider = (snapshot: QuoteInputSnapshot) => Promise<ShippingOptionsResult>;
const unavailable = () => new ServiceUnavailableException('Checkout quote unavailable');
const maxMinor = BigInt(Number.MAX_SAFE_INTEGER);
const minor = (value: unknown): value is string => typeof value === 'string' && value.length <= 16 && /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= maxMinor;
const label = (value: unknown, max = 150): value is string => typeof value === 'string' && !!value.trim() && value.length <= max && ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
export class CheckoutQuoteService {
  constructor(private readonly db: DataSource | undefined, private readonly postal: Pick<PostalCodeResolver, 'resolve'>, private readonly provider?: QuoteProvider, private readonly env: NodeJS.ProcessEnv = process.env, private readonly now = Date.now) {}
  async quote(session: CheckoutSession, body: unknown, payment?: PaymentContext) {
    try { return await this.createQuote(session, body, payment); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      throw unavailable();
    }
  }
  private async createQuote(session: CheckoutSession, body: unknown, payment?: PaymentContext) {
    if ((!payment && (this.env.NODE_ENV !== 'development' || this.env.LOCAL_TEST_CHECKOUT_ENABLED !== 'true')) || !this.provider || !this.db?.isInitialized) throw unavailable();
    if (session.expiresAt <= this.now()) throw new ForbiddenException();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'destination,lines') throw new BadRequestException();
    const input = body as { lines: unknown; destination: unknown }, target = input.destination;
    if (!target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).sort().join(',') !== 'candidateId,postalCode') throw new BadRequestException();
    const { postalCode, candidateId } = target as Record<string, unknown>;
    if (typeof postalCode !== 'string' || typeof candidateId !== 'string') throw new BadRequestException();
    const destination = this.postal.resolve(postalCode, candidateId);
    if (!destination) throw new BadRequestException({ code: 'INVALID_DESTINATION' });
    const intent = parseQuoteIntent({ lines: input.lines, destination });
    // One statement captures every price, name, supply mode and dimension used by the provider.
    // No transaction spans the external request and no before/after comparison can hide ABA.
    const rows: (QuoteLine & { salePriceMinor?: string | null })[] = await this.db.query(`SELECT p.id AS productId, v.id AS variantId, p.name AS name,
      v.name AS variantName, v.price_minor AS priceMinor, v.sale_price_minor AS salePriceMinor, v.currency AS currency, v.supply_mode AS supplyMode, v.stock_quantity AS stockQuantity,
      p.product_weight_g AS weightGrams, p.product_width_mm AS widthMm, p.product_height_mm AS heightMm,
      p.product_length_mm AS lengthMm FROM products p JOIN product_variants v ON v.product_id = p.id
      WHERE p.status = 'active' AND p.archived_at IS NULL AND v.archived_at IS NULL AND
      (${intent.lines.map(() => '(p.id = ? AND v.id = ?)').join(' OR ')})`, intent.lines.flatMap(line => [line.productId, line.variantId]));
    const key = (line: { productId: string; variantId: string }) => JSON.stringify([line.productId, line.variantId]);
    const byPair = new Map(rows.map(row => [key(row), row]));
    if (rows.length !== intent.lines.length || byPair.size !== rows.length) throw unavailable();
    const lines = intent.lines.map(line => {
      const row = byPair.get(key(line));
      if (!row || !['stock', 'made_to_order'].includes(row.supplyMode) || (row.supplyMode === 'stock' && !validStock(row.stockQuantity)) || !/^[A-Z]{3}$/.test(row.currency) ||
          ![row.name, row.variantName].every(name => label(name, 255)) || !minor(String(row.priceMinor)) ||
          !Number.isSafeInteger(row.weightGrams) || row.weightGrams < 10 || row.weightGrams > 10000000 ||
          ![row.widthMm, row.heightMm, row.lengthMm].every(n => Number.isSafeInteger(n) && n > 0 && n <= 50000)) throw unavailable();
      if (row.supplyMode === 'stock' && line.quantity > row.stockQuantity!) stockUnavailable();
      const { salePriceMinor, ...snapshot } = row;
      return { ...snapshot, priceMinor: String(productPrice(row.priceMinor, salePriceMinor).priceMinor), quantity: line.quantity };
    });
    const subtotal = lines.reduce((sum, line) => sum + BigInt(line.priceMinor) * BigInt(line.quantity), 0n);
    if (subtotal > maxMinor || lines.some(line => line.currency !== lines[0].currency)) throw unavailable();
    const captured: QuoteInputSnapshot = { destination: { ...destination }, lines };
    const result = await this.provider(structuredClone(captured));
    if (!result || result.status !== 'quoted' || !Array.isArray(result.options) || !result.options.length || result.options.length > 100 ||
        !Number.isSafeInteger(result.packageCount) || result.packageCount! < 1 || result.packageCount! > 1000 ||
        !Number.isSafeInteger(result.validUntil) || !Number.isSafeInteger(result.quotedAt) || result.quotedAt < 0 || result.validUntil <= result.quotedAt) throw unavailable();
    const quotedAt = this.now(), validUntil = Math.min(quotedAt + 300000, result.validUntil, session.expiresAt);
    if (!Number.isSafeInteger(validUntil) || validUntil <= quotedAt) throw unavailable();
    const options = result.options.map(option => {
      if (!option || !minor(option.amountMinor) || subtotal + BigInt(option.amountMinor) > maxMinor || option.currency !== lines[0].currency || !Number.isSafeInteger(option.carrierId) || option.carrierId < 1 ||
          ![option.carrierName, option.serviceName, option.serviceCode, option.logisticType].every(s => label(s)) ||
          (option.serviceCode === 'pickup_point' && !option.pickupPoints?.length)) throw unavailable();
      if (option.pickupPoints !== undefined && (!Array.isArray(option.pickupPoints) || !option.pickupPoints.length || option.pickupPoints.length > 1000 ||
          option.pickupPoints.some(p => !p || !Number.isSafeInteger(p.id) || p.id < 1 || !label(p.description)) ||
          new Set(option.pickupPoints.map(p => p.id)).size !== option.pickupPoints.length)) throw unavailable();
      const { carrierId, carrierName, serviceCode, serviceName, logisticType, amountMinor, currency, pickupPoints } = option;
      return { id: randomUUID(), carrierId, carrierName, serviceCode, serviceName, logisticType, amountMinor, currency,
        ...(pickupPoints ? { pickupPoints: pickupPoints.map(({ id, description }) => ({ id, description })) } : {}) };
    });
    const quoteId = randomUUID(), snapshot: QuoteSnapshot = { ...captured, options, quotedAt, validUntil, packageCount: result.packageCount!, ...(payment ? { payment } : {}) };
    await this.db.query('INSERT INTO checkout_quotes (id, session_id, snapshot, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', [quoteId, session.id, JSON.stringify(snapshot), new Date(validUntil), new Date(quotedAt)]);
    return { quoteId, validUntil, options: options.map(({ id, carrierName, serviceName, serviceCode, amountMinor, currency, pickupPoints }) => ({ id, carrierName, serviceName, serviceCode, amountMinor, currency, ...(pickupPoints ? { pickupPoints } : {}) })) };
  }
}

export function pendingCheckoutQuoteService(db: DataSource | undefined, postal: PostalCodeResolver, env: NodeJS.ProcessEnv, fetcher?: typeof fetch): CheckoutQuoteService {
  const disabled = () => new CheckoutQuoteService(db, postal, undefined, env);
  // This opt-in only records local test orders. Numeric catalog validation below is
  // not a declaration that packaging is ready for dispatch; no shipment is created.
  const local = env.NODE_ENV === 'development' && env.LOCAL_TEST_CHECKOUT_ENABLED === 'true' && localOperatorOrigin(env);
  if ((!publicPaymentOrigin(env) && !local) || env.ZIPNOVA_ENABLED !== 'true') return disabled();
  try {
    if (!/^[1-9]\d*$/.test(env.ZIPNOVA_ACCOUNT_ID ?? '') || !/^[1-9]\d*$/.test(env.ZIPNOVA_ORIGIN_ID ?? '') || !/^[0-3]$/.test(env.ZIPNOVA_CURRENCY_EXPONENT ?? '')) return disabled();
    const config: ZipnovaConfig = { accountId: Number(env.ZIPNOVA_ACCOUNT_ID), originId: Number(env.ZIPNOVA_ORIGIN_ID), currency: env.ZIPNOVA_CURRENCY ?? '', exponent: Number(env.ZIPNOVA_CURRENCY_EXPONENT), source: 'storefront' };
    validateZipnovaConfig(config);
    const transport = createZipnovaTransport(env, fetcher);
    if (!transport) return disabled();
    const provider: QuoteProvider = async snapshot => {
      const total = snapshot.lines.reduce((sum, line) => sum + BigInt(line.priceMinor) * BigInt(line.quantity), 0n);
      const scale = 10n ** BigInt(config.exponent), fraction = config.exponent ? (total % scale).toString().padStart(config.exponent, '0').replace(/0+$/, '') : '';
      const decimal = `${total / scale}${fraction ? `.${fraction}` : ''}`, declaredValue = Number(decimal);
      if (snapshot.lines.some(line => line.currency !== config.currency) || String(declaredValue) !== decimal) return { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' };
      const adapter = new ZipnovaQuoteAdapter(config, async () => ({ status: 'resolved', value: { destination: snapshot.destination, declaredValue, items: snapshot.lines.map(line => ({ description: line.name, quantity: line.quantity, weightGrams: line.weightGrams, widthMm: line.widthMm, heightMm: line.heightMm, lengthMm: line.lengthMm })) } }), transport);
      return adapter.quote(snapshot);
    };
    return new CheckoutQuoteService(db, postal, provider, env);
  } catch { return disabled(); }
}
