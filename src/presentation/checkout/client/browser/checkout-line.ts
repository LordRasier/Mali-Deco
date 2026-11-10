import type { CartView } from '../../../cart/client/state/cart-snapshot';
import { formatPrice } from '../../../shared/cart/cart';
import { variantLimit } from '../../../shared/cart/inventory';
type Item = CartView['items'][number];
export function checkoutLine(document: Document, change: (item: Item, difference: number | null) => void) {
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const root = element('li'), media = element('div'), image = element('img'), fallback = element('span', 'Sin imagen');
  media.className = 'checkout-line-media'; image.alt = ''; image.width = image.height = 64; image.loading = 'lazy';
  fallback.setAttribute('role', 'img'); fallback.setAttribute('aria-label', 'Imagen no disponible');
  const imageError = () => { image.hidden = true; fallback.hidden = false; }; image.addEventListener('error', imageError);
  media.append(image, fallback);
  const info = element('div'), name = element('strong'), variant = element('small'), price = element('span'); info.className = 'checkout-line-info';
  const actions = element('div'), quantity = element('div'), minus = element('button', '−'), count = element('span'), plus = element('button', '+'), remove = element('button');
  actions.className = 'checkout-line-actions'; quantity.className = 'checkout-quantity'; quantity.setAttribute('role', 'group'); remove.className = 'checkout-remove';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('focusable', 'false');
  path.setAttribute('d', 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7');
  icon.append(path); remove.append(icon);
  for (const button of [minus, plus, remove]) button.type = 'button';
  let current: Item, source: string | null | undefined;
  const subtract = () => { if (!minus.disabled) change(current, -1); }, add = () => { if (!plus.disabled) change(current, 1); }, erase = () => { if (!remove.disabled) change(current, null); };
  minus.addEventListener('click', subtract); plus.addEventListener('click', add); remove.addEventListener('click', erase);
  quantity.append(minus, count, plus); actions.append(quantity, remove); info.append(name, variant, price, actions); root.append(media, info);
  function update(item: Item, locked: boolean, unresolved: boolean) {
    current = item; name.textContent = item.product?.name ?? 'Artículo pendiente';
    variant.textContent = item.variant?.name ?? 'Variante pendiente';
    price.textContent = item.variant ? formatPrice(BigInt(item.variant.priceMinor) * BigInt(item.quantity), item.variant.currency) : 'Precio pendiente';
    count.textContent = String(item.quantity); count.setAttribute('aria-live', 'polite');
    quantity.setAttribute('aria-label', `Cantidad de ${name.textContent}, ${item.variant?.name ?? ''}`);
    minus.setAttribute('aria-label', `Quitar una unidad de ${name.textContent}`); plus.setAttribute('aria-label', `Agregar una unidad de ${name.textContent}`); remove.setAttribute('aria-label', `Eliminar ${name.textContent} del carrito`);
    minus.disabled = locked || item.quantity <= 1; plus.disabled = locked || unresolved || item.quantity >= variantLimit(item.variant); remove.disabled = locked;
    const primary = item.product?.primaryImage ?? item.product?.images?.[0];
    const next = primary && /^[a-zA-Z0-9-]{1,128}$/.test(primary.id) ? primary.id : null;
    if (source !== next) { source = next; image.hidden = !next; fallback.hidden = !!next; if (next) image.src = `/api/v1/catalog/images/${next}?w=320`; else image.removeAttribute('src'); }
  }
  return { root, update, focus: () => remove.focus(), dispose() { image.removeEventListener('error', imageError); minus.removeEventListener('click', subtract); plus.removeEventListener('click', add); remove.removeEventListener('click', erase); } };
}
