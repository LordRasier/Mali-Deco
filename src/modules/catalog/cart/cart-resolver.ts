import { BadRequestException, Body, Controller, HttpCode, Inject, Post, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { assertMinorUnits } from '../models/price';
import { readPublicImages } from '../queries/public-images';
import { publicVariantOptions } from '../queries/public-variant-options';

export interface CartPair { productId: string; variantId: string }
interface ResolvedRow {
  optionsJson?: unknown;
  productId: string; productSlug: string; productName: string; productDescription: string;
  variantId: string; variantName: string; priceMinor: string | number; currency: string;
  stockQuantity?: number; bulkWarningThreshold?: number | null; bulkWarningMessage?: string | null;
  supplyMode: 'stock' | 'made_to_order' | null;
  materialId: string | null; materialSlug: string | null; materialName: string | null;
  colorId: string | null; colorSlug: string | null; colorName: string | null; colorHex: string | null;
}
const pairKey = ({ productId, variantId }: CartPair) => JSON.stringify([productId, variantId]);
const connectionErrorCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR']);
const validId = (value: unknown): value is string => typeof value === 'string' && /^[\x21-\x7e]{1,36}$/.test(value);

/** The caller validates a successful complete partition before treating any missing line as removed. */
export function parseCartResolution(body: unknown): CartPair[] {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !('lines' in body) || !Array.isArray(body.lines) || body.lines.length > 100) {
    throw new BadRequestException('Invalid cart resolution request');
  }
  const seen = new Set<string>();
  return body.lines.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== 2 || !('productId' in value) || !('variantId' in value) ||
        !validId(value.productId) || !validId(value.variantId)) {
      throw new BadRequestException('Invalid cart line');
    }
    const pair = { productId: value.productId, variantId: value.variantId };
    const key = pairKey(pair);
    if (seen.has(key)) throw new BadRequestException('Duplicate cart line');
    seen.add(key);
    return pair;
  });
}

export class PublicCartResolver {
  constructor(private readonly db?: DataSource) {}

  async resolve(body: unknown) {
    const lines = parseCartResolution(body);
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Catalog database unavailable');
    if (!lines.length) return { resolved: [], missing: [] };
    // Both IDs are matched together: a valid variant ID belonging to another product is missing.
    // SQL structure is bounded and all caller-provided values are passed as parameters.
    const pairs = lines.map(() => '(p.id = ? AND v.id = ?)').join(' OR ');
    const parameters = lines.flatMap(({ productId, variantId }) => [productId, variantId]);
    let rows: ResolvedRow[];
    let images: Awaited<ReturnType<typeof readPublicImages>>;
    try {
      rows = await this.db.query(`SELECT
      p.id AS productId, p.slug AS productSlug, p.name AS productName, p.description AS productDescription,
      v.id AS variantId, v.name AS variantName, v.price_minor AS priceMinor, v.currency AS currency,
      v.supply_mode AS supplyMode, v.stock_quantity AS stockQuantity, v.options_json AS optionsJson,
      p.bulk_warning_threshold AS bulkWarningThreshold, p.bulk_warning_message AS bulkWarningMessage,
      m.id AS materialId, m.slug AS materialSlug, m.name AS materialName,
      c.id AS colorId, c.slug AS colorSlug, c.name AS colorName, c.hex AS colorHex
      FROM products p JOIN product_variants v ON v.product_id = p.id
      LEFT JOIN materials m ON m.id = v.material_id AND m.archived_at IS NULL
      LEFT JOIN colors c ON c.id = v.color_id AND c.archived_at IS NULL
      WHERE p.status = 'active' AND p.archived_at IS NULL AND v.archived_at IS NULL
      AND (${pairs})`, parameters);
      images = await readPublicImages(this.db, rows.map(row => row.productId));
    } catch (error) {
      // A lost connection is an unavailable catalog, not an authoritative missing line.
      if (typeof error === 'object' && error !== null && 'code' in error &&
          typeof error.code === 'string' && connectionErrorCodes.has(error.code)) {
        throw new ServiceUnavailableException('Catalog database unavailable');
      }
      throw error;
    }
    const byPair = new Map(rows.map((row) => [pairKey(row), row]));
    const resolved = [];
    const missing: CartPair[] = [];
    // Preserve request order. No listing state, selected currency or supply-mode stock inference is used.
    for (const line of lines) {
      const row = byPair.get(pairKey(line));
      if (!row) { missing.push(line); continue; }
      const priceMinor = Number(row.priceMinor);
      assertMinorUnits(priceMinor);
      resolved.push({
        ...line,
        product: { id: row.productId, slug: row.productSlug, name: row.productName, description: row.productDescription, bulkWarningThreshold: row.bulkWarningThreshold ?? null, bulkWarningMessage: row.bulkWarningMessage ?? null, primaryImage: images.get(row.productId)?.[0] ?? null },
        variant: {
          id: row.variantId, name: row.variantName, priceMinor, currency: row.currency, supplyMode: row.supplyMode, stockQuantity: row.stockQuantity ?? 0, ...publicVariantOptions(row.optionsJson),
          material: row.materialId === null ? null : { id: row.materialId, slug: row.materialSlug, name: row.materialName },
          color: row.colorId === null ? null : { id: row.colorId, slug: row.colorSlug, name: row.colorName, hex: row.colorHex },
        },
      });
    }
    return { resolved, missing };
  }
}

@Controller('catalog/cart')
export class PublicCartController {
  constructor(@Inject(PublicCartResolver) private readonly cart: PublicCartResolver) {}
  @Post('resolve') @HttpCode(200)
  resolve(@Body() body: unknown) { return this.cart.resolve(body); }
}
