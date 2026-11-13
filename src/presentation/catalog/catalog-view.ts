import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { formatPrice } from './shared/cart';
import { catalogQueryParams, type CatalogQuery } from './shared/catalog-query';
import type { Product } from './shared/storefront-types';
import { productPresentation } from './shared/editorial-art';
import { catalogColor } from './catalog-color';
import { cardOptions } from './shared/card-options';
import { productSharePath } from './shared/product-sharing';
import { publicVariantName } from '../../shared/public-variant-name';
import { defaultVariant, variantImageId } from './shared/variant-images';

export const catalogPath = '/catalogo';
export function catalogLink(query: CatalogQuery, path = catalogPath) {
  const search = catalogQueryParams(query).toString();
  return path + (search ? `?${search}` : '');
}

/** API DTOs expose matchedVariant/color; presentation uses variants/colorInfo explicitly. */
export function publicProducts(result: Awaited<ReturnType<PublicCatalog['list']>>): Product[] {
  return result.items.map(item => ({
    id: item.id, slug: item.slug, name: item.name, description: item.description,
    bulkWarningThreshold: item.bulkWarningThreshold, bulkWarningMessage: item.bulkWarningMessage,
    productWidthMm: item.productWidthMm, productHeightMm: item.productHeightMm, productLengthMm: item.productLengthMm,
    category: item.category, primaryImage: item.primaryImage, images: item.images, variantCount: item.variantCount, priceRange: item.priceRange,
    variants: (item.matchedVariants ?? (item.matchedVariant ? [item.matchedVariant] : [])).map(variant => ({
      id: variant.id, name: variant.name, ...(variant.imageId ? { imageId: variant.imageId } : {}), priceMinor: variant.priceMinor, currency: variant.currency,
      ...(variant.discountPercent ? { regularPriceMinor: variant.regularPriceMinor, discountPercent: variant.discountPercent } : {}),
      supplyMode: variant.supplyMode ?? undefined, stockQuantity: variant.stockQuantity, material: variant.material,
      colorInfo: variant.color, color: variant.color?.hex ?? undefined, ...(variant.options ? { options: variant.options } : {}),
    })),
  }));
}

export function catalogCards(products: Product[], demo: boolean, productPath = '/productos', fixtureId?: string) {
  return products.map(product => {
    product = { ...product, variants: product.variants.map(variant => ({ ...variant, name: publicVariantName(variant.name, [variant.material?.name ?? '']) })) };
    const data = { id: product.id, slug: product.slug, name: product.name, description: '', variants: product.variants, primaryImage: product.primaryImage, images: product.images,
      variantCount: product.variantCount ?? (demo ? product.variants.length : undefined) };
    const choices = cardOptions(data);
    const variant = choices.selected ?? defaultVariant(product.variants, product.images?.[0]?.id ?? product.primaryImage?.id);
    const selectedImageId = variantImageId(product, variant);
    const variantHex = catalogColor(variant?.colorInfo ? variant.colorInfo.hex : variant?.color);
    const colorName = variant?.colorInfo?.name ?? '';
    const colorMatchesName = !!colorName && colorName.toLocaleLowerCase('es') === variant?.name.toLocaleLowerCase('es');
    const presentation = productPresentation(product, demo ? 'demo' : 'api', fixtureId);
    const coverImage = product.images?.[0] ?? product.primaryImage;
    const image = coverImage ? `/api/v1/catalog/images/${encodeURIComponent(coverImage.id)}?w=320`
      : presentation.image?.startsWith('/storefront/') ? presentation.image : '';
    const hrefFor = (id: string) => `${productPath}/${encodeURIComponent(product.slug)}?variant=${encodeURIComponent(id)}`;
    const zoomImage = coverImage ? `/api/v1/catalog/images/${encodeURIComponent(coverImage.id)}?w=1600` : image;
    const gallery = (product.images ?? []).map((item, index) => ({ id: item.id, url: `/api/v1/catalog/images/${encodeURIComponent(item.id)}?w=320`,
      zoom: `/api/v1/catalog/images/${encodeURIComponent(item.id)}?w=1600`,
      srcset: `/api/v1/catalog/images/${encodeURIComponent(item.id)}?w=320 320w, /api/v1/catalog/images/${encodeURIComponent(item.id)}?w=800 800w`, first: selectedImageId ? item.id === selectedImageId : index === 0 }));
    const carousel = gallery.length > 1;
    const colors = product.variants.map(item => ({ variant: item, hex: catalogColor(item.colorInfo?.hex), color: item.colorInfo?.name ?? '' }));
    const unambiguous = colors.length > 1 && (product.variantCount ?? colors.length) === colors.length && colors.every(item => item.hex && item.color && item.variant.currency === variant?.currency)
      && new Set(colors.map(item => item.hex.toLowerCase())).size === colors.length;
    const colorOptions = unambiguous ? colors.map(item => ({ id: item.variant.id, label: item.color, variantName: item.variant.name, hex: item.hex,
      href: hrefFor(item.variant.id), price: formatPrice(item.variant.priceMinor, item.variant.currency), first: item.variant.id === variant?.id })) : [];
    return {
      productId: product.id, sharePath: demo ? '' : productSharePath(product.id),
      bootstrap: JSON.stringify(data),
      dimensions: ([['Ancho', product.productWidthMm, 'width'], ['Alto', product.productHeightMm, 'height'], ['Largo', product.productLengthMm, 'length']] as const)
        .flatMap(([label, value, axis]) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
          ? [{ label, axis, value: `${(value / 10).toLocaleString('es-AR', { useGrouping: false, maximumFractionDigits: 1 })} cm` }] : []),
      name: product.name, description: product.description.trim(), categoryName: product.category?.name, image, imageId: coverImage?.id, zoomImage: carousel ? (gallery.find(image => image.first) ?? gallery[0]).zoom : zoomImage, illustration: presentation.illustration && !!image,
      gallery, carousel, colorOptions,
      imageSrcset: coverImage ? `${image} 320w, /api/v1/catalog/images/${encodeURIComponent(coverImage.id)}?w=800 800w` : '',
      href: `${productPath}/${encodeURIComponent(product.slug)}${variant ? `?variant=${encodeURIComponent(variant.id)}` : ''}`,
      variant: variant?.name ?? '',
      variantHex, variantLabel: (demo && variantHex) || colorMatchesName ? 'Color' : 'Variante',
      variantColorName: !demo && !colorMatchesName ? colorName : '',
      price: choices.selected ? formatPrice(choices.selected.priceMinor, choices.selected.currency) : choices.kind === 'none' ? 'Sin opciones disponibles' : 'Elegí una opción',
      priceState: choices.selected ? 'price' : 'prompt',
      regularPrice: choices.selected?.regularPriceMinor !== undefined ? formatPrice(choices.selected.regularPriceMinor, choices.selected.currency) : '',
      discountPercent: choices.selected?.discountPercent ?? '',
    };
  });
}
