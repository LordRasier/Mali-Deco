import type { Variant } from '../../shared/storefront-types';
import { formatPrice } from '../../shared/cart';

/** Rebuild from the selected authoritative variant, including removal of a previous discount. */
export function renderDiscountPrice(price: HTMLElement, variant: Variant | null | undefined, fallback: string, ribbon: HTMLElement | null = null) {
  price.textContent = variant ? formatPrice(variant.priceMinor, variant.currency) : fallback;
  if (variant?.discountPercent && variant.regularPriceMinor !== undefined) {
    const before = document.createElement('del'); before.className = 'product-regular-price';
    before.textContent = formatPrice(variant.regularPriceMinor, variant.currency);
    before.setAttribute('aria-label', `Precio habitual: ${before.textContent}`);
    const current = document.createElement('span'); current.textContent = formatPrice(variant.priceMinor, variant.currency);
    current.setAttribute('aria-label', `Precio en descuento: ${current.textContent}`);
    price.replaceChildren(before, document.createTextNode(' '), current);
  }
  if (ribbon) {
    ribbon.hidden = !variant?.discountPercent;
    ribbon.textContent = variant?.discountPercent ? `${variant.discountPercent}% OFF` : '';
    ribbon.setAttribute('aria-label', variant?.discountPercent ? `${variant.discountPercent}% de descuento en la opción seleccionada` : '');
  }
}
