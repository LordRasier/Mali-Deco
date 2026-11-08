import { decimalToMinor } from '../../money';
import { stockInput } from './inventory-form';

export type QuickVariant = { id: string; productId: string; name: string; sku: string; priceMinor: string; currency: string;
  supplyMode: 'stock' | 'made_to_order' | null; stockQuantity: number; archivedAt: string | null };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[-\x21-\x7e]{1,36}$/.test(v);
const quantity = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1000000;
const money = (v: unknown): v is string => typeof v === 'string' && /^\d{1,20}$/.test(v);

export function quickVariants(value: unknown, productId: string, page: number) {
  if (!record(value) || value.id !== productId || value.archivedAt !== null || value.page !== page || value.limit !== 24
    || !Number.isSafeInteger(value.total) || Number(value.total) < 0 || !Array.isArray(value.variants) || value.variants.length > 24) throw Error('No se pudieron leer las variantes actuales.');
  const ids = new Set<string>();
  for (const row of value.variants) {
    if (!record(row) || !id(row.id) || ids.has(row.id) || row.productId !== productId || typeof row.name !== 'string' || typeof row.sku !== 'string'
      || !money(row.priceMinor) || typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency)
      || !['stock', 'made_to_order', null].includes(row.supplyMode as string | null) || !quantity(row.stockQuantity)
      || (row.archivedAt !== null && typeof row.archivedAt !== 'string')) throw Error('La variante recibida no es válida.');
    ids.add(row.id);
  }
  return { variants: (value.variants as QuickVariant[]).filter(row => row.archivedAt === null), total: Number(value.total) };
}

export function quickAdjustment(variant: QuickVariant, price: string, stock: string) {
  const priceMinor = decimalToMinor(price, variant.currency);
  const inventory = variant.supplyMode === 'stock' ? stockInput(stock, String(variant.stockQuantity)) : undefined;
  const changedStock = inventory && inventory.stockQuantity !== inventory.expectedStockQuantity;
  if (String(priceMinor) === variant.priceMinor && !changedStock) return null;
  return { priceMinor, expectedPriceMinor: variant.priceMinor, expectedCurrency: variant.currency, expectedSupplyMode: variant.supplyMode,
    ...(changedStock ? inventory : {}) };
}

export function adjustmentReceipt(value: unknown, variant: QuickVariant, input: NonNullable<ReturnType<typeof quickAdjustment>>) {
  if (!record(value) || value.id !== variant.id || value.productId !== variant.productId || value.priceMinor !== String(input.priceMinor)
    || value.currency !== variant.currency || value.supplyMode !== variant.supplyMode || !quantity(value.stockQuantity)
    || (input.stockQuantity !== undefined && value.stockQuantity !== input.stockQuantity)) throw Error('No se pudo confirmar el guardado. Actualizá los valores antes de volver a guardar.');
  return { ...variant, priceMinor: value.priceMinor as string, stockQuantity: value.stockQuantity };
}
