import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1000000;

/** Stock is edited separately so stale product/price forms cannot overwrite purchases. */
export async function changeVariantStock(db: DataSource | undefined, productId: string, variantId: string, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'expectedStockQuantity,stockQuantity') throw new BadRequestException('Invalid inventory');
  const input = value as Record<string, unknown>;
  if (!count(input.stockQuantity) || !count(input.expectedStockQuantity)) throw new BadRequestException('Invalid inventory');
  if (!db?.isInitialized) throw new ServiceUnavailableException('Inventory database unavailable');
  return db.transaction(async tx => {
    const parents = await tx.query('SELECT id FROM products WHERE id = ? AND archived_at IS NULL FOR UPDATE', [productId]);
    if (parents.length !== 1) throw new NotFoundException('Product not found');
    const rows = await tx.query('SELECT id, supply_mode AS supplyMode, stock_quantity AS stockQuantity FROM product_variants WHERE id = ? AND product_id = ? AND archived_at IS NULL FOR UPDATE', [variantId, productId]);
    if (rows.length !== 1) throw new NotFoundException('Variant not found');
    if (rows[0].supplyMode !== 'stock') throw new ConflictException({ code: 'STOCK_NOT_TRACKED' });
    if (rows[0].stockQuantity !== input.expectedStockQuantity) throw new ConflictException({ code: 'STOCK_CHANGED' });
    if (input.stockQuantity !== input.expectedStockQuantity) {
      const result = await tx.query('UPDATE product_variants SET stock_quantity = ? WHERE id = ? AND product_id = ? AND stock_quantity = ?', [input.stockQuantity, variantId, productId, input.expectedStockQuantity]);
      if (result.affectedRows !== 1) throw new ConflictException({ code: 'STOCK_CHANGED' });
    }
    return { id: variantId, productId, stockQuantity: input.stockQuantity };
  });
}
