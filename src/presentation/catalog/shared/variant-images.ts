/** Prefer the variant photographed on the cover without changing the SKU order. */
export function defaultVariant<T extends { imageId?: string }>(variants: T[], coverId?: string) {
  return (coverId ? variants.find(variant => variant.imageId === coverId) : undefined) ?? variants[0];
}

/** A variant without its own active image returns to the product cover. */
export function variantImageId(product: { primaryImage?: { id: string } | null; images?: { id: string }[] }, variant?: { imageId?: string } | null) {
  const cover = product.images?.[0]?.id ?? product.primaryImage?.id;
  return variant?.imageId && (variant.imageId === cover || product.images?.some(image => image.id === variant.imageId)) ? variant.imageId : cover;
}
