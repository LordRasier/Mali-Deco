import { decimalToMinor } from './money';
import type { ProductInput, VariantInput } from './types';

export const dimensionFields = [
  ['productWeightG', 'Peso (g)'], ['productWidthMm', 'Ancho (mm)'],
  ['productHeightMm', 'Alto (mm)'], ['productLengthMm', 'Largo (mm)'],
  ['packageWeightG', 'Peso (g)'], ['packageWidthMm', 'Ancho (mm)'],
  ['packageHeightMm', 'Alto (mm)'], ['packageLengthMm', 'Largo (mm)'],
] as const;
export type DimensionKey = (typeof dimensionFields)[number][0];
export type ProductDraft = {
  name: string; slug: string; description: string; status: 'draft' | 'active';
} & Record<DimensionKey, string>;
export type VariantDraft = { sku: string; name: string; price: string; currency: string; supplyMode: '' | 'stock' | 'made_to_order' };

export function productInput(draft: ProductDraft): ProductInput {
  if (!draft.name.trim() || draft.name.length > 255) throw new Error('El nombre debe tener entre 1 y 255 caracteres.');
  if (draft.slug.length > 255 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) throw new Error('El identificador debe usar minúsculas, números y guiones.');
  if (new TextEncoder().encode(draft.description).length > 65535) throw new Error('La descripción es demasiado larga.');
  const dimensions = {} as Record<DimensionKey, number | null>;
  for (const [key] of dimensionFields) {
    const value = draft[key].trim();
    if (!value) { dimensions[key] = null; continue; }
    if (!/^\d+$/.test(value)) throw new Error('Las medidas deben ser números enteros positivos.');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1 || n > 4294967295) throw new Error('Las medidas deben estar entre 1 y 4294967295.');
    dimensions[key] = n;
  }
  return { name: draft.name, slug: draft.slug, description: draft.description, status: draft.status, ...dimensions };
}

export function variantInput(draft: VariantDraft): VariantInput {
  if (!draft.sku.trim() || draft.sku.length > 255 || !draft.name.trim() || draft.name.length > 255) throw new Error('SKU y nombre deben tener entre 1 y 255 caracteres.');
  if (!draft.supplyMode) throw new Error('Elegí el modo de suministro.');
  return { sku: draft.sku, name: draft.name, currency: draft.currency, supplyMode: draft.supplyMode, priceMinor: decimalToMinor(draft.price, draft.currency) };
}

/** Leave unchanged classifications out of updates; explicit null removes one. */
export function assignmentPatch<K extends 'categoryId' | 'materialId' | 'colorId'>(key: K, changed: boolean, value: string | null): Partial<Record<K, string | null>> {
  return changed ? { [key]: value } as Record<K, string | null> : {};
}
