export interface PublicImage { id: string; alt: string; width: number; height: number }
type ImageRow = PublicImage & { productId: string };
type Queryable = { query(sql: string, parameters?: unknown[]): Promise<unknown[]> };

export async function readPublicImages(db: Queryable, productIds: string[]): Promise<Map<string, PublicImage[]>> {
  const ids = [...new Set(productIds)];
  const result = new Map<string, PublicImage[]>();
  if (!ids.length) return result;
  const rows = await db.query(`SELECT ranked.productId, ranked.id, ranked.alt, ranked.width, ranked.height
    FROM (SELECT i.product_id AS productId, i.id, i.alt, i.width, i.height,
      ROW_NUMBER() OVER (PARTITION BY i.product_id ORDER BY i.position ASC, i.id ASC) AS image_rank
      FROM product_images i JOIN products p ON p.id = i.product_id
      WHERE i.retired_at IS NULL AND p.status = 'active' AND p.archived_at IS NULL
        AND i.product_id IN (${ids.map(() => '?').join(', ')})) ranked
    WHERE ranked.image_rank <= 10 ORDER BY ranked.productId ASC, ranked.image_rank ASC`, ids) as ImageRow[];
  for (const row of rows) {
    const images = result.get(row.productId) ?? [];
    if (images.length < 10) images.push({ id: row.id, alt: row.alt, width: row.width, height: row.height });
    result.set(row.productId, images);
  }
  return result;
}
