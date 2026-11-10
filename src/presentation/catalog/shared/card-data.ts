import { parseVariant } from '../../shared/catalog/api-catalog';
import type { Product } from './storefront-types';

/** Only the bounded public summary is embedded in the escaped HTML attribute. */
export function parseCardData(json: string): Product {
  const raw = JSON.parse(json) as Partial<Product>;
  if (!raw || typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string' || !raw.name || typeof raw.slug !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.slug) || !Array.isArray(raw.variants) || raw.variants.length > 10
    || (raw.variantCount !== undefined && (!Number.isSafeInteger(raw.variantCount) || raw.variantCount < 0))) throw new Error('Datos de tarjeta inválidos');
  const variants = raw.variants.map(variant => parseVariant({ ...variant, color: variant.colorInfo ?? null, material: variant.material ?? null, supplyMode: variant.supplyMode ?? null }));
  if (new Set(variants.map(variant => variant.id)).size !== variants.length) throw new Error('Opciones duplicadas');
  return { id: raw.id, slug: raw.slug, name: raw.name, description: '', variants, variantCount: raw.variantCount };
}
