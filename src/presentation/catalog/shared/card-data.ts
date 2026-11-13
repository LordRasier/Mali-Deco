import { parseVariant, parseCatalogImage } from '../../shared/catalog/api-catalog';
import type { Product } from './storefront-types';

/** Only the bounded public summary is embedded in the escaped HTML attribute. */
export function parseCardData(json: string): Product {
  const raw = JSON.parse(json) as Partial<Product>;
  if (!raw || typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string' || !raw.name || typeof raw.slug !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.slug) || !Array.isArray(raw.variants) || raw.variants.length > 10
    || (raw.variantCount !== undefined && (!Number.isSafeInteger(raw.variantCount) || raw.variantCount < 0))) throw new Error('Datos de tarjeta inválidos');
  const variants = raw.variants.map(variant => parseVariant({ ...variant, color: variant.colorInfo ?? null, material: variant.material ?? null, supplyMode: variant.supplyMode ?? null }));
  if (new Set(variants.map(variant => variant.id)).size !== variants.length) throw new Error('Opciones duplicadas');
  if (raw.images !== undefined && (!Array.isArray(raw.images) || raw.images.length > 10)) throw new Error('Galería inválida');
  const images = raw.images?.map(parseCatalogImage);
  if (images?.some(image => !image) || (images && new Set(images.map(image => image!.id)).size !== images.length)) throw new Error('Galería inválida');
  const primaryImage = parseCatalogImage(raw.primaryImage);
  return { id: raw.id, slug: raw.slug, name: raw.name, description: '', variants, variantCount: raw.variantCount,
    ...(images ? { images: images as NonNullable<Product['images']> } : {}), ...(primaryImage ? { primaryImage } : {}) };
}
