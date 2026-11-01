import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cartCountLabel } from '../src/lib/cart';
import { Header } from '../src/components/Header';
import { CartItemRow } from '../src/components/CartItemRow';
import { CartItems } from '../src/components/CartItems';
import { CartSummary } from '../src/components/CartSummary';
import { ShippingEstimate } from '../src/components/ShippingEstimate';
import type { CartState } from '../src/hooks/useCart';

const header = renderToStaticMarkup(createElement(Header, { brand: 'Tienda', demo: false, count: 2, onCartOpen: () => {} }));
assert.match(header, /Abrir carrito, 2 unidades/);
const longBrand = 'Identidad configurable extensa para una tienda de objetos';
const longHeader = renderToStaticMarkup(createElement(Header, { brand: longBrand, demo: false, count: 0, onCartOpen: () => {} }));
assert.ok(longHeader.includes(`aria-label="${longBrand}"`));
assert.ok(longHeader.includes(`title="${longBrand}"`));
assert.equal(cartCountLabel(1, 1), '1 artículo · 1 unidad');
assert.equal(cartCountLabel(2, 3), '2 artículos · 3 unidades');
const item = {
  productId: 'p1', variantId: 'coral', quantity: 2,
  product: { id: 'p1', slug: 'florero', name: 'Florero', description: '', variants: [] },
  variant: { id: 'coral', name: 'Coral', priceMinor: 2450000, currency: 'ARS' },
};
const row = renderToStaticMarkup(createElement(CartItemRow, { item, position: 1, demo: true, onAdjust: () => {}, onRemove: () => {} }));
assert.match(row, /href="\/productos\/florero\?variant=coral"/);
assert.match(row, /24\.500,00/); assert.match(row, /49\.000,00/);
assert.match(row, /c\/u/); assert.match(row, /Eliminar Florero, Coral del carrito/);
assert.match(row, /Imagen no disponible/);
const colored = { ...item, product: { ...item.product, image: '/demo.webp' }, variant: { ...item.variant, name: 'Grande', colorInfo: { id: 'v', slug: 'verde', name: 'Verde', hex: '#00aa00' } } };
const coloredRow = renderToStaticMarkup(createElement(CartItemRow, { item: colored, position: 1, demo: true, onAdjust: () => {}, onRemove: () => {} }));
assert.match(coloredRow, /Color: Verde/); assert.match(coloredRow, /Imagen de ejemplo/);
const unresolved = { ...item, product: null, variant: null };
const unresolvedRow = renderToStaticMarkup(createElement(CartItemRow, { item: unresolved, position: 2, demo: false, onAdjust: () => {}, onRemove: () => {} }));
assert.match(unresolvedRow, /Artículo 2 pendiente de verificación/); assert.match(unresolvedRow, /Precio pendiente/);
const summary = renderToStaticMarkup(createElement(CartSummary, { totals: { ARS: 100n, USD: 200n }, unresolved: true }));
assert.match(summary, /Subtotal ARS/); assert.match(summary, /Subtotal USD/);
assert.match(summary, /Subtotal parcial/); assert.match(summary, /A calcular/);
const selectedSummary = renderToStaticMarkup(createElement(CartSummary, { totals: { ARS: 2000n }, unresolved: false, shipping: { amountMinor: '500', currency: 'ARS' } }));
assert.match(selectedSummary, /Total estimado/); assert.match(selectedSummary, /25,00/);
const mixedSummary = renderToStaticMarkup(createElement(CartSummary, { totals: { ARS: 2000n, USD: 100n }, unresolved: false, shipping: { amountMinor: '500', currency: 'ARS' } }));
assert.doesNotMatch(mixedSummary, /Total estimado<\/dt>/); assert.match(mixedSummary, /monedas diferentes/);
const shipping = renderToStaticMarkup(createElement(ShippingEstimate, { mode: 'demo', lines: [{ productId: 'p1', variantId: 'coral', quantity: 2 }], unresolved: false, destination: { country: 'AR', city: '', state: '', postalCode: '' }, onDestinationChange: () => {} }));
assert.match(shipping, /Código postal/); assert.match(shipping, /modo de demostración/);
assert.match(shipping, /disabled/); assert.doesNotMatch(shipping, /gratis|Andreani/i);
const invalidShipping = renderToStaticMarkup(createElement(ShippingEstimate, { mode: 'api', lines: [{ productId: 'p1', variantId: 'coral', quantity: 2 }], unresolved: false, destination: { country: 'AR', city: '   ', state: ' ', postalCode: ' ' }, onDestinationChange: () => {} }));
assert.match(invalidShipping, /Ingresá una provincia válida/); assert.match(invalidShipping, /aria-invalid="true"/); assert.match(invalidShipping, /disabled/);
const emptyCart = { ready: true, items: [] } as unknown as CartState;
const empty = renderToStaticMarkup(createElement(CartItems, { cart: emptyCart, demo: true }));
assert.match(empty, /Tu carrito está vacío/); assert.match(empty, /href="\/catalogo"/);
console.log('cart rows, summary, empty state and shipping boundary OK');
