import { DataSource, EntityManager } from 'typeorm';
import { assertMinorUnits } from './price';
import { ListingQuery, parseListingQuery } from './listing-query';
import { productOrder, productPredicate, variantPredicate } from './listing-sql';

type Lookup = { id: string; slug: string; name: string };
type Variant = { productId: string; id: string; name: string; priceMinor: string; currency: string; supplyMode: 'stock' | 'made_to_order' | null;
  materialId: string | null; materialSlug: string | null; materialName: string | null;
  colorId: string | null; colorSlug: string | null; colorName: string | null; colorHex: string | null };
type Product = { id: string; slug: string; name: string; description: string; categoryId: string | null; categorySlug: string | null; categoryName: string | null; minPrice: string | null; maxPrice: string | null };

export function priceNumber(value: string | number): number {
  const price = Number(value); assertMinorUnits(price); return price;
}
function lookup(id: string | null, slug: string | null, name: string | null): Lookup | null {
  return id && slug && name ? { id, slug, name } : null;
}
export function publicVariant(row: Variant) {
  const color = lookup(row.colorId, row.colorSlug, row.colorName);
  return { id: row.id, name: row.name, priceMinor: priceNumber(row.priceMinor), currency: row.currency, supplyMode: row.supplyMode,
    material: lookup(row.materialId, row.materialSlug, row.materialName), color: color ? { ...color, hex: row.colorHex } : null };
}

const variantJoins = `LEFT JOIN materials m ON m.id = v.material_id AND m.archived_at IS NULL
  LEFT JOIN colors co ON co.id = v.color_id AND co.archived_at IS NULL`;

/** Bounded product page; the aggregate and representative use the identical variant predicate. */
export async function listPublicProducts(db: DataSource, input: Record<string, unknown>) {
  const query = parseListingQuery(input);
  // One repeatable-read snapshot keeps the count, page and representative coherent.
  return db.transaction('REPEATABLE READ', manager => listSnapshot(manager, query));
}

async function listSnapshot(db: EntityManager, query: ListingQuery) {
  const variant = variantPredicate(query);
  const product = productPredicate(query);
  // Never even aggregate prices across currencies: an unscoped page has no price range.
  const prices = query.currency ? 'MIN(v.price_minor) AS min_price, MAX(v.price_minor) AS max_price' : 'NULL AS min_price, NULL AS max_price';
  const from = `FROM products p
    LEFT JOIN categories c ON c.id = p.category_id AND c.archived_at IS NULL
    LEFT JOIN (SELECT v.product_id, ${prices}
      FROM product_variants v ${variantJoins} WHERE ${variant.sql} GROUP BY v.product_id) matched ON matched.product_id = p.id
    WHERE ${product.sql}`;
  const parameters = [...variant.params, ...product.params];
  const counts: Array<{ total: string | number }> = await db.query(`SELECT COUNT(*) AS total ${from}`, parameters);
  const total = Number(counts[0]?.total);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid catalog count');
  const rows: Product[] = await db.query(`SELECT p.id, p.slug, p.name, p.description,
    c.id AS categoryId, c.slug AS categorySlug, c.name AS categoryName,
    matched.min_price AS minPrice, matched.max_price AS maxPrice ${from}
    ORDER BY ${productOrder(query.sort)} LIMIT ? OFFSET ?`, [...parameters, query.limit, (query.page - 1) * query.limit]);
  let representatives: Variant[] = [];
  if (rows.length) {
    const order = query.currency ? 'v.price_minor ASC, v.id ASC' : 'v.id ASC';
    representatives = await db.query(`SELECT * FROM (SELECT v.product_id AS productId, v.id, v.name,
      v.price_minor AS priceMinor, v.currency, v.supply_mode AS supplyMode,
      m.id AS materialId, m.slug AS materialSlug, m.name AS materialName,
      co.id AS colorId, co.slug AS colorSlug, co.name AS colorName, co.hex AS colorHex,
      ROW_NUMBER() OVER (PARTITION BY v.product_id ORDER BY ${order}) AS row_rank
      FROM product_variants v ${variantJoins}
      WHERE ${variant.sql} AND v.product_id IN (${rows.map(() => '?').join(', ')})) ranked WHERE ranked.row_rank = 1`,
    [...variant.params, ...rows.map(row => row.id)]);
  }
  const byProduct = new Map(representatives.map(row => [row.productId, publicVariant(row)]));
  return { items: rows.map(row => ({ id: row.id, slug: row.slug, name: row.name, description: row.description,
    category: lookup(row.categoryId, row.categorySlug, row.categoryName), matchedVariant: byProduct.get(row.id) ?? null,
    priceRange: query.currency && row.minPrice !== null && row.maxPrice !== null
      ? { currency: query.currency, minMinor: priceNumber(row.minPrice), maxMinor: priceNumber(row.maxPrice) } : null,
  })), page: query.page, limit: query.limit, total };
}
