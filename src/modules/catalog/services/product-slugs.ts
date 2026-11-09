import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { IsNull, type EntityManager } from 'typeorm';
import { ProductSchema, type ProductRow } from '../models/catalog.entities';

export async function availableProductSlug(manager: Pick<EntityManager, 'query'>, slug: string, productId?: string) {
  try {
    const rows: { product_id: string }[] = await manager.query('SELECT product_id FROM product_slug_redirects WHERE slug = ? FOR UPDATE', [slug]);
    if (rows.some(row => row.product_id !== productId)) throw new ConflictException('La URL pertenece al historial de otro producto.');
  } catch (e) {
    // Existing installations can create products before applying SEO migration; renames still fail closed below.
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ER_NO_SUCH_TABLE') return;
    throw e;
  }
}

export async function saveProductWithHistory(manager: EntityManager, id: string, values: Partial<ProductRow> & { slug: string; status: 'draft' | 'active' }) {
  const repo = manager.getRepository(ProductSchema);
  const previous = await repo.findOne({ where: { id, archivedAt: IsNull() }, lock: { mode: 'pessimistic_write' } });
  if (!previous) throw new NotFoundException('Product not found');
  if (previous.status !== values.status) throw new ConflictException({ code: values.status === 'active' ? 'USE_PUBLICATION_ACTION' : 'PRODUCT_STATUS_CHANGED' });
  if (previous.slug !== values.slug) {
    await availableProductSlug(manager, values.slug, id);
    try {
      await manager.query('INSERT INTO product_slug_redirects (slug, product_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE product_id = product_id', [previous.slug, id]);
      const rows: { product_id: string }[] = await manager.query('SELECT product_id FROM product_slug_redirects WHERE slug = ?', [previous.slug]);
      if (rows[0]?.product_id !== id) throw new ConflictException('La URL anterior pertenece a otro producto.');
    } catch (e) { if (e && typeof e === 'object' && 'code' in e && e.code === 'ER_NO_SUCH_TABLE') throw new ServiceUnavailableException('Aplicá la actualización SEO antes de cambiar una URL.'); throw e; }
  }
  const saved = await repo.update({ id, archivedAt: IsNull() }, values);
  if (!saved.affected) throw new NotFoundException('Product not found');
  return { ...previous, ...values };
}
