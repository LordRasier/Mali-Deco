import type { ProductRow, VariantRow } from '../../../modules/catalog/models/catalog.entities';
import { currencyFractionDigits, minorToDecimal } from '../../catalog/shared/money';
import { formatPrice } from '../../catalog/shared/cart';
import { markupFromAmounts } from '../shared/pricing-calculator';
import { groupProperties } from '../../catalog/shared/variant-properties';

export function variantFormModel(variant?: VariantRow, optionNames: string[] = []) {
  const currency = variant?.currency ?? 'ARS';
  return { editingVariant: Boolean(variant), variant: { id: variant?.id ?? '', sku: variant?.sku ?? '', name: variant?.name ?? '', currency,
    price: variant ? minorToDecimal(variant.priceMinor, currency) : '', materialId: variant?.materialId ?? null, colorId: variant?.colorId ?? null,
    options: variant?.options ?? optionNames.map(name => ({ name, value: '' })) },
    autoVariantName: !variant || variant.name === 'Estándar',
    priceDigits: currencyFractionDigits(currency), supplyUnset: !variant?.supplyMode,
    supplyStock: variant?.supplyMode === 'stock', supplyMadeToOrder: variant?.supplyMode === 'made_to_order' };
}

export function variantListModel(product: ProductRow, variants: VariantRow[] = [], total = 0, page = 1) {
  const pages = Math.max(1, Math.ceil(total / 24));
  const live = variants.filter(v => !v.archivedAt);
  const base = 'MD-' + product.id.toUpperCase(), taken = new Set(variants.map(v => v.sku.toUpperCase()));
  let availableSku = base;
  for (let suffix = 2; taken.has(availableSku); suffix++) availableSku = base + '-' + suffix;
  const first = live[0];
  const standard = total === variants.length && live.length === 1 && first.name === 'Estándar' && !first.colorId && !first.materialId && !first.options?.length ? first : undefined;
  const price = (v: VariantRow) => formatPrice(BigInt(v.priceMinor), v.currency);
  const prices = live.map(v => BigInt(v.priceMinor));
  const lowest = prices.reduce((a, b) => a < b ? a : b, prices[0] ?? 0n);
  const previewPrice = total !== variants.length || new Set(live.map(v => v.currency)).size > 1
    ? 'El precio depende de la opción y la moneda' : live.length
      ? (prices.some(p => p !== lowest) ? 'Desde ' : '') + formatPrice(lowest, live[0].currency) : '';
  const properties = groupProperties(live.flatMap(v => [...(v.materialName ? [{ name: 'Material', value: v.materialName }] : []),
    ...(v.colorName ? [{ name: 'Color', value: v.colorName }] : []), ...(v.options ?? [])]));
  return { ...variantFormModel(), variantPage: page, variantPages: pages, variantTotal: total, variantPagination: pages > 1,
    hasVariants: live.length > 0 && !standard,
    properties,
    archivedVariants: variants.filter(v => v.archivedAt).map(v => ({ name: v.name, priceLabel: price(v) })),
    simpleAvailable: Boolean(standard) || (total === variants.length && !live.length), simpleId: standard?.id ?? '', simpleSku: standard?.sku ?? availableSku,
    simplePrice: standard ? minorToDecimal(standard.priceMinor, standard.currency).replace('.', ',') : '', simpleCurrency: standard?.currency ?? 'ARS',
    simpleStock: standard?.supplyMode === 'stock', simpleOnDemand: standard?.supplyMode === 'made_to_order',
    previewPrice, pricingComplete: total === variants.length, priceCheck: live.length ? 'Precio guardado' : total > variants.length ? 'Se comprobará al publicar' : 'Falta un precio',
    hasPreviousVariants: page > 1, hasNextVariants: page < pages && page < 10000, previousVariantPage: page - 1, nextVariantPage: page + 1,
    variants: variants.map(variant => ({ id: variant.id, sku: variant.sku, name: variant.name, priceMinor: variant.priceMinor, currency: variant.currency, priceLabel: price(variant),
      imageId: variant.imageId ?? '', imageUrl: variant.imageId ? `/api/v1/admin/catalog/products/${encodeURIComponent(product.id)}/images/${encodeURIComponent(variant.imageId)}/content?w=320` : '',
      optionsLabel: (variant.options ?? []).map(option => `${option.name}: ${option.value}`).join(' · '),
      priceDecimal: minorToDecimal(variant.priceMinor, variant.currency).replace('.', ','), costMinor: variant.costMinor ?? '',
      costDecimal: variant.costMinor == null ? '' : minorToDecimal(variant.costMinor, variant.currency).replace('.', ','),
      markup: markupFromAmounts(variant.costMinor, variant.priceMinor), supplyMode: variant.supplyMode ?? '', unlimited: variant.supplyMode === 'made_to_order',
      supplyLabel: variant.supplyMode === 'stock' ? 'Stock' : variant.supplyMode === 'made_to_order' ? 'A pedido' : 'Sin definir',
      stockQuantity: variant.stockQuantity ?? 0, tracksStock: variant.supplyMode === 'stock',
      archived: Boolean(variant.archivedAt), editable: !product.archivedAt && !variant.archivedAt })) };
}
