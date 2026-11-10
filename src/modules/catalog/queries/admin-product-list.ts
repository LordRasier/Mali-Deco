import { BadRequestException } from '@nestjs/common';
import { parseCatalogQuery } from '../validation/catalog-validation';
import type { ProductRow } from '../models/catalog.entities';

export type ProductListSummary = {
  variantCount: number; sku: string; stockVariants: number; stockQuantity: string;
  madeToOrder: number; undefinedSupply: number; currencyCount: number;
  currency: string; minPrice: string; maxPrice: string; imageId: string | null;
};
export type AdminProductListRow = ProductRow & { listing?: ProductListSummary };
type Queryable = { query(sql: string, parameters?: unknown[]): Promise<unknown[]> };

export function parseAdminProductListQuery(query: Record<string, unknown>) {
  const parsed = parseCatalogQuery(query), status = query.status ?? 'all', sort = query.sort ?? 'name_asc';
  if (typeof status !== 'string' || !['all', 'active', 'draft', 'archived'].includes(status)) throw new BadRequestException('Invalid product status filter');
  if (typeof sort !== 'string' || !['name_asc', 'name_desc'].includes(sort)) throw new BadRequestException('Invalid product sort');
  return { ...parsed, status, sort };
}

/** Aggregate only the bounded page; never load every variant or image body. */
export async function readAdminProductSummaries(db: Queryable, products: ProductRow[]): Promise<AdminProductListRow[]> {
  if (!products.length) return [];
  const ids = products.map(product => product.id), placeholders = ids.map(() => '?').join(', ');
  const rows = await db.query(`SELECT product_id AS productId, COUNT(*) AS variantCount, MIN(sku) AS sku,
    SUM(supply_mode = 'stock') AS stockVariants,
    COALESCE(SUM(CASE WHEN supply_mode = 'stock' THEN stock_quantity ELSE 0 END), 0) AS stockQuantity,
    SUM(supply_mode = 'made_to_order') AS madeToOrder, SUM(supply_mode IS NULL) AS undefinedSupply,
    COUNT(DISTINCT currency) AS currencyCount, MIN(currency) AS currency,
    MIN(price_minor) AS minPrice, MAX(price_minor) AS maxPrice
    FROM product_variants WHERE archived_at IS NULL AND product_id IN (${placeholders}) GROUP BY product_id`, ids) as (ProductListSummary & { productId: string })[];
  const images = await db.query(`SELECT ranked.productId, ranked.id FROM (
    SELECT product_id AS productId, id, ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY position, id) AS imageRank
    FROM product_images WHERE retired_at IS NULL AND product_id IN (${placeholders})
    ) ranked WHERE ranked.imageRank = 1`, ids) as { productId: string; id: string }[];
  const summaries = new Map(rows.map(row => [row.productId, row])), covers = new Map(images.map(row => [row.productId, row.id]));
  return products.map(product => {
    const row = summaries.get(product.id);
    return { ...product, listing: {
      variantCount: Number(row?.variantCount ?? 0), sku: row?.sku ?? '', stockVariants: Number(row?.stockVariants ?? 0),
      stockQuantity: String(row?.stockQuantity ?? 0), madeToOrder: Number(row?.madeToOrder ?? 0), undefinedSupply: Number(row?.undefinedSupply ?? 0),
      currencyCount: Number(row?.currencyCount ?? 0), currency: row?.currency ?? '',
      minPrice: String(row?.minPrice ?? 0), maxPrice: String(row?.maxPrice ?? 0), imageId: covers.get(product.id) ?? null,
    } };
  });
}
