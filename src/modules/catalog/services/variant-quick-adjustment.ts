import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1000000;
type Input = { priceMinor: number; expectedPriceMinor: string; expectedCurrency: string; expectedSupplyMode: string | null;
  stockQuantity?: number; expectedStockQuantity?: number };

/** One transaction for a quick edit; untouched inventory is never written back. */
export async function adjustVariant(db: DataSource | undefined, productId: string, variantId: string, value: unknown) {
  const allowed = ['priceMinor', 'expectedPriceMinor', 'expectedCurrency', 'expectedSupplyMode', 'stockQuantity', 'expectedStockQuantity'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new BadRequestException('Invalid adjustment');
  const input = value as Input, stock = 'stockQuantity' in input || 'expectedStockQuantity' in input;
  if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 0 || typeof input.expectedPriceMinor !== 'string' || !/^\d{1,20}$/.test(input.expectedPriceMinor)
    || typeof input.expectedCurrency !== 'string' || !/^[A-Z]{3}$/.test(input.expectedCurrency)
    || !['stock', 'made_to_order', null].includes(input.expectedSupplyMode)
    || (stock && (!count(input.stockQuantity) || !count(input.expectedStockQuantity)))) throw new BadRequestException('Invalid adjustment');
  if (!db?.isInitialized) throw new ServiceUnavailableException('Catalog database unavailable');
  return db.transaction(async tx => {
    const parents = await tx.query('SELECT id FROM products WHERE id = ? AND archived_at IS NULL FOR UPDATE', [productId]);
    if (parents.length !== 1) throw new NotFoundException('Product not found');
    const rows = await tx.query(`SELECT price_minor AS priceMinor, currency, supply_mode AS supplyMode, stock_quantity AS stockQuantity
      FROM product_variants WHERE id = ? AND product_id = ? AND archived_at IS NULL FOR UPDATE`, [variantId, productId]);
    if (rows.length !== 1) throw new NotFoundException('Variant not found');
    const row = rows[0];
    if (String(row.priceMinor) !== input.expectedPriceMinor || row.currency !== input.expectedCurrency || row.supplyMode !== input.expectedSupplyMode
      || (stock && (row.supplyMode !== 'stock' || row.stockQuantity !== input.expectedStockQuantity))) throw new ConflictException({ code: 'VARIANT_CHANGED' });
    const fields: string[] = [], values: (number | string)[] = [];
    if (String(input.priceMinor) !== input.expectedPriceMinor) { fields.push('price_minor = ?'); values.push(String(input.priceMinor)); }
    if (stock && input.stockQuantity !== input.expectedStockQuantity) { fields.push('stock_quantity = ?'); values.push(input.stockQuantity!); }
    if (fields.length) await tx.query(`UPDATE product_variants SET ${fields.join(', ')} WHERE id = ? AND product_id = ?`, [...values, variantId, productId]);
    return { id: variantId, productId, priceMinor: String(input.priceMinor), currency: row.currency, supplyMode: row.supplyMode,
      stockQuantity: stock ? input.stockQuantity! : row.stockQuantity };
  });
}
