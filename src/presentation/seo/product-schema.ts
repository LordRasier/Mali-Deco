import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { minorToDecimal } from '../catalog/shared/money';
import { absoluteUrl } from './urls';
import { publicVariantName } from '../../shared/public-variant-name';

type Product = Awaited<ReturnType<PublicCatalog['detail']>>;
export function productSchema(product: Product, origin: string, brand: string, selectedVariantId?: string) {
  const url = absoluteUrl(origin, `/productos/${encodeURIComponent(product.slug)}`);
  const images = product.images.map(image => absoluteUrl(origin, `/api/v1/catalog/images/${encodeURIComponent(image.id)}?w=1600`));
  const common = { name: product.name, description: product.description, url, image: images, brand: { '@type': 'Brand', name: brand } };
  const variants = product.variants.map(variant => {
    const variantUrl = `${url}?variant=${encodeURIComponent(variant.id)}`;
    const availability = variant.supplyMode === 'stock' ? (variant.stockQuantity > 0 ? 'InStock' : 'OutOfStock') : undefined;
    return { '@type': 'Product', '@id': `${url}#variant-${encodeURIComponent(variant.id)}`, ...common,
      name: `${product.name} - ${publicVariantName(variant.name, [variant.material?.name ?? ''])}`, url: variantUrl,
      ...(variant.color ? { color: variant.color.name } : {}),
      offers: { '@type': 'Offer', url: variantUrl, price: minorToDecimal(String(variant.priceMinor), variant.currency), priceCurrency: variant.currency,
        ...(availability ? { availability: `https://schema.org/${availability}` } : {}) } };
  });
  // No invented reviews, GTIN or made-to-order availability; no AggregateOffer for variants.
  if (product.total === 1 && variants.length === 1) return { ...variants[0], name: product.name, url, '@id': `${url}#product` };
  const variesBy = product.variants.some(v => v.color) ? ['https://schema.org/color'] : [];
  // A group needs actual known variant attributes. Otherwise describe the visible option only.
  if (!variesBy.length || !variants.length) return variants.find((_v, i) => product.variants[i].id === selectedVariantId) ?? variants[0] ?? { '@type': 'Product', '@id': `${url}#product`, ...common };
  return { '@type': 'ProductGroup', '@id': `${url}#product`, ...common, productGroupID: product.id, ...(variesBy.length ? { variesBy } : {}), hasVariant: variants };
}
