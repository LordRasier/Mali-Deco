import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { MoneyConfig } from './shipping.types';
import { ZipnovaQuoteAdapter, type QuoteIntent, type ShippingOptionsResult, type TrustedResolver } from './zipnova-provider';
import { validateDestination, validateZipnovaConfig, type ZipnovaConfig } from './zipnova';
import { createZipnovaTransport } from './zipnova-transport';
import { isLocalQuoteRequest, localOperatorOrigin } from './local-quote-guard';
import type { IncomingMessage } from 'node:http';
import { PostalCodeResolver } from './postal-code-resolver';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Solicitud de envío inválida');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).length !== allowed.length || allowed.some(key => !Object.hasOwn(value, key))) throw new BadRequestException('Solicitud de envío inválida');
}
export function parseQuoteIntent(value: unknown): QuoteIntent {
  const input = object(value); keys(input, ['lines', 'destination']);
  const destination = object(input.destination); keys(destination, ['country', 'postalCode', 'city', 'state']);
  try { validateDestination(destination as QuoteIntent['destination']); } catch { throw new BadRequestException('Destino inválido'); }
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 100) throw new BadRequestException('Carrito inválido');
  const seen = new Set<string>(); let units = 0;
  const lines = input.lines.map(raw => {
    const line = object(raw); keys(line, ['productId', 'variantId', 'quantity']);
    if (typeof line.productId !== 'string' || !/^[\x21-\x7e]{1,36}$/.test(line.productId) || typeof line.variantId !== 'string' || !/^[\x21-\x7e]{1,36}$/.test(line.variantId) || !Number.isSafeInteger(line.quantity) || (line.quantity as number) < 1 || (line.quantity as number) > 1000) throw new BadRequestException('Carrito inválido');
    const key = JSON.stringify([line.productId, line.variantId]);
    if (seen.has(key)) throw new BadRequestException('Carrito inválido');
    seen.add(key); units += line.quantity as number;
    return { productId: line.productId, variantId: line.variantId, quantity: line.quantity as number };
  });
  if (units > 1000) throw new BadRequestException('Carrito excede el máximo de unidades');
  return { lines, destination: destination as QuoteIntent['destination'] };
}

type CatalogRow = { productId: string; variantId: string; name: string; weightGrams: number | null; widthMm: number | null; heightMm: number | null; lengthMm: number | null; priceMinor: string | number; currency: string };
export class CatalogShippingResolver {
  constructor(private readonly db: DataSource | undefined, private readonly money: MoneyConfig) {}
  async resolve(intent: QuoteIntent): ReturnType<TrustedResolver> {
    if (!this.db?.isInitialized) return { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' };
    const pairs = intent.lines.map(() => '(p.id = ? AND v.id = ?)').join(' OR ');
    let rows: CatalogRow[];
    try {
      rows = await this.db.query(`SELECT p.id AS productId, v.id AS variantId, p.name AS name,
        p.product_weight_g AS weightGrams, p.product_width_mm AS widthMm, p.product_height_mm AS heightMm,
        p.product_length_mm AS lengthMm, v.price_minor AS priceMinor, v.currency AS currency
        FROM products p JOIN product_variants v ON v.product_id = p.id
        WHERE p.status = 'active' AND p.archived_at IS NULL AND v.archived_at IS NULL AND (${pairs})`, intent.lines.flatMap(line => [line.productId, line.variantId]));
    } catch { return { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' }; }
    if (rows.length !== intent.lines.length) return { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' };
    const byPair = new Map(rows.map(row => [JSON.stringify([row.productId, row.variantId]), row]));
    if (byPair.size !== rows.length) return { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' };
    let total = 0n;
    const items = [];
    for (const line of intent.lines) {
      const row = byPair.get(JSON.stringify([line.productId, line.variantId]));
      if (!row || row.currency !== this.money.currency || (typeof row.priceMinor === 'number' && !Number.isSafeInteger(row.priceMinor)) || !/^(0|[1-9]\d*)$/.test(String(row.priceMinor))) return { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' };
      if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 255 || ![row.weightGrams, row.widthMm, row.heightMm, row.lengthMm].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n > 0)) return { status: 'unavailable', reason: 'LOGISTICS_UNAVAILABLE' };
      total += BigInt(row.priceMinor) * BigInt(line.quantity);
      if (total > BigInt(Number.MAX_SAFE_INTEGER)) return { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' };
      items.push({ description: row.name, quantity: line.quantity, weightGrams: row.weightGrams!, widthMm: row.widthMm!, heightMm: row.heightMm!, lengthMm: row.lengthMm! });
    }
    if (!Number.isInteger(this.money.exponent) || this.money.exponent < 0 || this.money.exponent > 3) return { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' };
    const scale = 10n ** BigInt(this.money.exponent);
    const fraction = this.money.exponent ? (total % scale).toString().padStart(this.money.exponent, '0').replace(/0+$/, '') : '';
    const decimal = `${total / scale}${fraction ? `.${fraction}` : ''}`;
    const declaredValue = Number(decimal);
    if (!Number.isFinite(declaredValue) || String(declaredValue) !== decimal) return { status: 'unavailable', reason: 'CATALOG_UNAVAILABLE' };
    return { status: 'resolved', value: { destination: intent.destination, items, declaredValue } };
  }
}

/** The provider stays disabled unless explicitly composed with a validated configuration. */
export class ShippingQuoteService {
  constructor(private readonly provider?: (intent: QuoteIntent) => Promise<ShippingOptionsResult>, private readonly enabled = false, private readonly configured = true) {}
  unavailableReason(): 'DISABLED' | 'CONFIG_UNAVAILABLE' | null { return !this.enabled || !this.provider ? 'DISABLED' : !this.configured ? 'CONFIG_UNAVAILABLE' : null; }
  async quote(value: unknown): Promise<ShippingOptionsResult> {
    const intent = parseQuoteIntent(value);
    if (!this.enabled || !this.provider) return { status: 'unavailable', reason: 'DISABLED' };
    return this.provider(intent);
  }
}
/** Compose only after explicit operator activation and confirmation of logistics data. */
export function pendingShippingService(db: DataSource | undefined, env: NodeJS.ProcessEnv, fetcher?: typeof fetch): ShippingQuoteService {
  if (env.NODE_ENV !== 'development' || !env.ZIPNOVA_ENABLED || env.ZIPNOVA_ENABLED === 'false') return new ShippingQuoteService();
  try {
    if (env.ZIPNOVA_ENABLED !== 'true' || !localOperatorOrigin(env) || env.ZIPNOVA_LOGISTICS_VALIDATED !== 'true' || !/^[1-9]\d*$/.test(env.ZIPNOVA_ACCOUNT_ID ?? '') || !/^[1-9]\d*$/.test(env.ZIPNOVA_ORIGIN_ID ?? '') || !/^[0-3]$/.test(env.ZIPNOVA_CURRENCY_EXPONENT ?? '')) throw new Error('Incomplete Zipnova configuration');
    const config: ZipnovaConfig = { accountId: Number(env.ZIPNOVA_ACCOUNT_ID), originId: Number(env.ZIPNOVA_ORIGIN_ID), source: 'storefront', currency: env.ZIPNOVA_CURRENCY ?? '', exponent: Number(env.ZIPNOVA_CURRENCY_EXPONENT) };
    validateZipnovaConfig(config);
    const transport = createZipnovaTransport(env, fetcher);
    if (!transport) throw new Error('Missing Zipnova transport');
    const resolver = new CatalogShippingResolver(db, config);
    const adapter = new ZipnovaQuoteAdapter(config, intent => resolver.resolve(intent), transport);
    return new ShippingQuoteService(intent => adapter.quote(intent), true);
  } catch { return new ShippingQuoteService(async () => ({ status: 'unavailable', reason: 'CONFIG_UNAVAILABLE' }), true, false); }
}
@Controller('shipping')
export class ShippingQuoteController {
  constructor(@Inject(ShippingQuoteService) private readonly service: ShippingQuoteService, @Inject(PostalCodeResolver) private readonly postal: PostalCodeResolver) {}
  @Post('destination') @HttpCode(200)
  destination(@Body() body: unknown, @Req() request: IncomingMessage) {
    if (!isLocalQuoteRequest(request, process.env)) throw new ForbiddenException();
    const input = object(body); keys(input, ['postalCode']);
    if (typeof input.postalCode !== 'string') throw new BadRequestException('Código postal inválido');
    if (this.service.unavailableReason()) return Promise.resolve({status:'unavailable' as const});
    return this.postal.lookup(input.postalCode);
  }
  @Post('quote') @HttpCode(200)
  quote(@Body() body: unknown, @Req() request: IncomingMessage) {
    if (!isLocalQuoteRequest(request, process.env)) throw new ForbiddenException();
    const input = object(body); keys(input, ['lines','destination']);
    const target = object(input.destination); keys(target, ['postalCode','candidateId']);
    if (typeof target.postalCode !== 'string' || typeof target.candidateId !== 'string') throw new BadRequestException('Destino inválido');
    const unavailable = this.service.unavailableReason();
    if (unavailable) return Promise.resolve({status:'unavailable' as const,reason:unavailable});
    const destination = this.postal.resolve(target.postalCode,target.candidateId);
    if (!destination) return Promise.resolve({status:'unavailable' as const,reason:'INVALID_DESTINATION' as const});
    return this.service.quote({lines:input.lines,destination});
  }
}
