import type { AdminProductListRow } from '../../../modules/catalog/queries/admin-product-list';
import { formatPrice } from '../../catalog/shared/cart';

export function productListItem(product: AdminProductListRow) {
  const summary = product.listing, archived = Boolean(product.archivedAt), active = product.status === 'active' && !archived;
  const stock = BigInt(summary?.stockQuantity ?? '0');
  const stockLabel = !summary ? 'Sin datos' : !summary.variantCount ? 'Sin variantes'
    : summary.stockVariants ? stock.toLocaleString('es-AR') + (stock === 1n ? ' unidad' : ' unidades')
      : summary.madeToOrder ? 'A pedido' : 'Sin definir';
  const availability = summary?.stockVariants && summary.madeToOrder ? 'También a pedido' : summary?.undefinedSupply ? 'Disponibilidad por completar' : '';
  const priceLabel = !summary ? 'Sin datos' : !summary.variantCount ? 'Sin precio'
    : summary.currencyCount > 1 ? 'Varias monedas' : (summary.minPrice !== summary.maxPrice ? 'Desde ' : '') + formatPrice(BigInt(summary.minPrice), summary.currency);
  return { id: product.id, name: product.name, slug: product.slug, archived,
    statusLabel: archived ? 'Archivado' : active ? 'Activo' : 'Borrador', statusKey: archived ? 'archived' : active ? 'active' : 'draft',
    imageUrl: summary?.imageId ? `/api/v1/admin/catalog/products/${encodeURIComponent(product.id)}/images/${encodeURIComponent(summary.imageId)}/content?w=320` : '',
    sku: summary?.variantCount === 1 ? summary.sku : '', variantLabel: summary && summary.variantCount > 1 ? `${summary.variantCount} variantes` : '',
    stockLabel, availability, outOfStock: !!summary?.stockVariants && stock === 0n && !summary.madeToOrder,
    priceLabel, currency: summary?.currencyCount === 1 ? summary.currency : '',
    publicUrl: active ? '/productos/' + encodeURIComponent(product.slug) : '',
  };
}
