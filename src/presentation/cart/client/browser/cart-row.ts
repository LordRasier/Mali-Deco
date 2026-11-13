import { formatPrice } from '../../../shared/cart/cart';
import { productPresentation } from '../../../shared/catalog/editorial-art';
import type { CartView } from '../state/cart-snapshot';
import { variantLimit } from '../../../shared/cart/inventory';
import { publicVariantName } from '../../../../shared/public-variant-name';

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') {
  const node = document.createElement(tag); node.textContent = text; return node;
}
type Item = CartView['items'][number];

/** Keep controls stable while prices refresh; product strings only enter text nodes. */
export function cartRow(item: Item, demo: boolean, act: (difference: number | null, item: Item) => void, productBase = '/productos') {
  let current = item, imageSource: string | undefined;
  const root = element('li'); root.className = 'cart-row';
  const media = element('div'), image = element('img'), placeholder = element('div'); media.className = 'cart-item-media';
  image.alt = ''; image.loading = 'lazy'; image.hidden = true;
  placeholder.className = 'image-placeholder'; placeholder.setAttribute('role', 'img'); placeholder.setAttribute('aria-label', 'Imagen no disponible');
  const note = element('small', 'Imagen de ejemplo'); note.hidden = true;
  image.addEventListener('error', () => { image.hidden = true; placeholder.hidden = false; note.hidden = true; });
  media.append(image, placeholder, note);
  const info = element('div'), heading = element('h3'), link = element('a'); info.className = 'cart-item-info';
  link.tabIndex = -1; heading.append(link);
  const variant = element('p'), price = element('p'), actions = element('div'); actions.className = 'cart-actions';
  variant.className = 'cart-variant'; price.className = 'cart-unit-price';
  const quantity = element('div'); quantity.className = 'cart-quantity';
  const minus = element('button', '−'), count = element('span'), plus = element('button', '+'), remove = element('button', 'Eliminar');
  for (const button of [minus, plus, remove]) button.type = 'button';
  minus.addEventListener('click', () => act(-1, current)); plus.addEventListener('click', () => act(1, current));
  remove.addEventListener('click', () => act(null, current));
  remove.className = 'cart-remove'; quantity.append(minus, count, plus); actions.append(quantity, remove);
  const total = element('p'); total.className = 'cart-total';
  info.append(heading, total, variant, price, actions); root.append(media, info);

  const update = (item: Item, index: number) => {
    current = item;
    const name = item.product?.name ?? `Artículo ${index + 1} pendiente de verificación`, variantName = item.variant ? publicVariantName(item.variant.name, [item.variant.material?.name ?? '']) : 'Variante pendiente';
    link.textContent = name;
    if (item.product && item.variant) { link.href = `${productBase}/${encodeURIComponent(item.product.slug)}?variant=${encodeURIComponent(item.variant.id)}`; link.removeAttribute('tabindex'); }
    else { link.removeAttribute('href'); link.tabIndex = -1; }
    const color = item.variant?.colorInfo?.name;
    const extraColor = color && !variantName.toLocaleLowerCase('es').includes(color.replace(/\s*\(ejemplo\)$/i, '').toLocaleLowerCase('es')) ? ` · Color: ${color}` : '';
    variant.textContent = variantName + extraColor;
    price.textContent = item.variant ? `${formatPrice(item.variant.priceMinor, item.variant.currency)} c/u${demo ? ' · ejemplo' : ''}` : 'Precio pendiente';
    count.textContent = String(item.quantity); count.setAttribute('aria-label', `${item.quantity} ${item.quantity === 1 ? 'unidad' : 'unidades'}`);
    quantity.setAttribute('role', 'group'); quantity.setAttribute('aria-label', `Cantidad de ${name}, ${variantName}`);
    minus.setAttribute('aria-label', `Quitar una unidad de ${name}, ${variantName}`);
    plus.setAttribute('aria-label', `Agregar una unidad de ${name}, ${variantName}`); plus.disabled = item.quantity >= variantLimit(item.variant);
    remove.setAttribute('aria-label', `Eliminar ${name}, ${variantName} del carrito`);
    total.textContent = item.variant ? `Total: ${formatPrice(BigInt(item.quantity) * BigInt(item.variant.priceMinor), item.variant.currency)}` : 'Total pendiente';
    const candidate = item.product ? productPresentation(item.product, demo ? 'demo' : 'api').image : undefined;
    // Only known image routes on this browser origin are accepted, never arbitrary URLs.
    let safe: string | undefined;
    if (candidate) {
      const url = new URL(candidate, window.location.href);
      if (url.origin === window.location.origin && /^\/(storefront\/|api\/v1\/catalog\/images\/)/.test(url.pathname)) safe = url.href;
    }
    if (safe !== imageSource) {
      imageSource = safe; image.hidden = !safe; placeholder.hidden = !!safe; note.hidden = !safe || !demo;
      if (safe) image.src = safe; else image.removeAttribute('src');
    }
  };
  return { root, focus: () => link.focus(), update };
}
