import { ConflictException, NotFoundException } from '@nestjs/common';
import { type DataSource, type EntityManager, IsNull } from 'typeorm';
import { ProductSchema, type ProductRow } from '../models/catalog.entities';

async function checkReadiness(manager: EntityManager, product: ProductRow) {
  const missing: string[] = [];
  if (!product.name.trim()) missing.push('name');
  // The first active image is the storefront cover. A later valid photo must
  // not mask a broken cover. Inspect metadata, not the image blobs.
  const [cover] = await manager.query<{ width: number; height: number; ready: number }[]>(`
    SELECT i.width, i.height, (SELECT COUNT(*) = 3 AND SUM(d.byte_length) <= 1048576
      FROM product_image_derivatives d
      WHERE d.image_id = i.id AND d.rendition IN (320, 800, 1600)
        AND d.byte_length BETWEEN 1 AND 393216) AS ready
    FROM product_images i WHERE i.product_id = ? AND i.retired_at IS NULL
    ORDER BY i.position, i.id LIMIT 1`, [product.id]);
  if (!cover || cover.width < 1 || cover.height < 1 || !Number(cover.ready)) missing.push('cover');
  // Variant edits/archives lock their own row. Hold a qualifying row until
  // commit, so the price cannot disappear between validation and activation.
  const variants = await manager.query<unknown[]>(`SELECT id FROM product_variants
    WHERE product_id = ? AND archived_at IS NULL AND price_minor BETWEEN 0 AND 9007199254740991
      AND currency REGEXP BINARY '^[A-Z]{3}$'
    LIMIT 1 FOR UPDATE`, [product.id]);
  if (!variants.length) missing.push('price');
  if (missing.length) throw new ConflictException({ code: 'PUBLICATION_INCOMPLETE', missing });
}

export function changePublication(db: DataSource, id: string, target: ProductRow['status']) {
  return db.transaction(async manager => {
    const repo = manager.getRepository(ProductSchema);
    // Media mutations and product archival share this product lock.
    const product = await repo.findOne({ where: { id, archivedAt: IsNull() }, lock: { mode: 'pessimistic_write' } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.status === target) throw new ConflictException({
      code: target === 'active' ? 'PUBLICATION_REQUIRES_DRAFT' : 'UNPUBLICATION_REQUIRES_ACTIVE',
    });
    if (target === 'active') await checkReadiness(manager, product);
    await repo.update({ id, status: product.status, archivedAt: IsNull() }, { status: target });
    return { ...product, status: target };
  });
}
