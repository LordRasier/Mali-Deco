import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

const money = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const count = (v: unknown): v is number => money(v) && v <= 1000000;
const storedMoney = (v: unknown): v is string => typeof v === 'string' && /^\d{1,20}$/.test(v);
export function validateInitialPricing(input: { costMinor?: number | null; stockQuantity?: number }) {
  if ((input.costMinor !== undefined && input.costMinor !== null && !money(input.costMinor))
    || (input.stockQuantity !== undefined && !count(input.stockQuantity))) throw new BadRequestException('Invalid cost or stock');
}
type Input = { priceMinor: number; costMinor: number | null; supplyMode: 'stock' | 'made_to_order';
  expectedPriceMinor: string; expectedCostMinor: string | null; expectedCurrency: string; expectedSupplyMode: string | null;
  stockQuantity?: number; expectedStockQuantity?: number };

/** Price/cost/mode commit together. Unedited stock is never restored over a purchase. */
export async function saveVariantPricing(db: DataSource | undefined, productId: string, variantId: string, value: unknown) {
  const allowed = ['priceMinor', 'costMinor', 'supplyMode', 'expectedPriceMinor', 'expectedCostMinor', 'expectedCurrency', 'expectedSupplyMode', 'stockQuantity', 'expectedStockQuantity'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new BadRequestException('Invalid pricing');
  const input = value as Input, stock = 'stockQuantity' in input || 'expectedStockQuantity' in input;
  if (!money(input.priceMinor) || !(input.costMinor === null || money(input.costMinor))
    || !['stock', 'made_to_order'].includes(input.supplyMode) || !storedMoney(input.expectedPriceMinor)
    || !(input.expectedCostMinor === null || storedMoney(input.expectedCostMinor))
    || typeof input.expectedCurrency !== 'string' || !/^[A-Z]{3}$/.test(input.expectedCurrency)
    || !['stock', 'made_to_order', null].includes(input.expectedSupplyMode)
    || (stock && (!count(input.stockQuantity) || !count(input.expectedStockQuantity)))
    || (input.supplyMode !== input.expectedSupplyMode && !stock)) throw new BadRequestException('Invalid pricing');
  if (!db?.isInitialized) throw new ServiceUnavailableException('Catalog database unavailable');
  return db.transaction(async tx => {
    const parents = await tx.query('SELECT id FROM products WHERE id = ? AND archived_at IS NULL FOR UPDATE', [productId]);
    if (parents.length !== 1) throw new NotFoundException('Product not found');
    const rows = await tx.query(`SELECT price_minor AS priceMinor, cost_minor AS costMinor, currency, supply_mode AS supplyMode, stock_quantity AS stockQuantity
      FROM product_variants WHERE id = ? AND product_id = ? AND archived_at IS NULL FOR UPDATE`, [variantId, productId]);
    if (rows.length !== 1) throw new NotFoundException('Variant not found');
    const row = rows[0];
    if (String(row.priceMinor) !== input.expectedPriceMinor || (row.costMinor == null ? null : String(row.costMinor)) !== input.expectedCostMinor
      || row.currency !== input.expectedCurrency || row.supplyMode !== input.expectedSupplyMode
      || (stock && row.stockQuantity !== input.expectedStockQuantity)) throw new ConflictException({ code: 'VARIANT_CHANGED' });
    const costMinor = input.costMinor === null ? null : String(input.costMinor);
    const fields: string[] = [], values: (string | number | null)[] = [];
    if (String(input.priceMinor) !== input.expectedPriceMinor) { fields.push('price_minor = ?'); values.push(String(input.priceMinor)); }
    if (costMinor !== input.expectedCostMinor) { fields.push('cost_minor = ?'); values.push(costMinor); }
    if (input.supplyMode !== row.supplyMode) { fields.push('supply_mode = ?'); values.push(input.supplyMode); }
    if (stock && input.stockQuantity !== row.stockQuantity) { fields.push('stock_quantity = ?'); values.push(input.stockQuantity!); }
    if (fields.length) await tx.query(`UPDATE product_variants SET ${fields.join(', ')} WHERE id = ? AND product_id = ?`, [...values, variantId, productId]);
    return { id: variantId, productId, priceMinor: String(input.priceMinor), costMinor, currency: row.currency, supplyMode: input.supplyMode,
      stockQuantity: stock ? input.stockQuantity! : row.stockQuantity };
  });
}
