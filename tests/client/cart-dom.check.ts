import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cartRow } from '../../src/presentation/cart/client/browser/cart-row';
import { browserCartRuntime } from '../../src/presentation/cart/client/state/cart-runtime';
import { cartChangedEvent } from '../../src/presentation/shared/cart/cart-storage';

// Controlled node ports cover text/attribute/event contracts; browser runs cover native focus/layout.
class NodePort extends EventTarget {
  children: NodePort[] = []; attributes = new Map<string, string>();
  hidden = false; disabled = false; textContent = ''; className = ''; tabIndex = 0; focused = false; type = ''; loading = ''; alt = '';
  constructor(readonly tagName: string) { super(); }
  set href(value: string) { this.setAttribute('href', value); } get href() { return this.getAttribute('href') ?? ''; }
  set src(value: string) { this.setAttribute('src', value); } get src() { return this.getAttribute('src') ?? ''; }
  set innerHTML(_value: string) { throw Error('Untrusted HTML injection'); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  append(...children: NodePort[]) { this.children.push(...children); }
  focus() { this.focused = true; }
}
const walk = (node: NodePort): NodePort[] => [node, ...node.children.flatMap(walk)];
const text = (node: NodePort) => walk(node).map(child => child.textContent).join(' ');
function globals(run: () => void) {
  const doc = Object.getOwnPropertyDescriptor(globalThis, 'document'), win = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (tag: string) => new NodePort(tag) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { location: { href: 'http://127.0.0.1:3000/carrito', origin: 'http://127.0.0.1:3000' } }) });
  try { run(); } finally {
    if (doc) Object.defineProperty(globalThis, 'document', doc); else Reflect.deleteProperty(globalThis, 'document');
    if (win) Object.defineProperty(globalThis, 'window', win); else Reflect.deleteProperty(globalThis, 'window');
  }
}
test('native cart rows preserve links, exact amounts, stable controls and untrusted text', () => globals(() => {
  const item = { productId: 'p1', variantId: 'v1', quantity: 2, product: { id: 'p1', slug: 'florero', name: '<img onerror=bad>', description: '', variants: [] }, variant: { id: 'v1', name: 'Coral', priceMinor: 2450000, currency: 'ARS' } };
  const actions: unknown[] = [], row = cartRow(item, true, (difference, current) => actions.push([difference, current.quantity]));
  row.update(item, 0); const root = row.root as unknown as NodePort, nodes = walk(root);
  const link = nodes.find(node => node.tagName === 'a')!, plus = nodes.find(node => node.getAttribute('aria-label')?.startsWith('Agregar una unidad'))!;
  assert.equal(link.getAttribute('href'), '/productos/florero?variant=v1'); assert.equal(link.textContent, '<img onerror=bad>');
  assert.match(text(root), /24\.500,00/); assert.match(text(root), /49\.000,00/); assert.match(text(root), /c\/u/);
  assert.ok(nodes.some(node => node.getAttribute('aria-label') === 'Eliminar <img onerror=bad>, Coral del carrito'));
  assert.ok(nodes.some(node => node.getAttribute('aria-label') === 'Imagen no disponible'));
  const info = nodes.find(node => node.className === 'cart-item-info')!;
  const quantity = nodes.find(node => node.className === 'cart-quantity')!;
  assert.ok(info.children.some(node => node.className === 'cart-total'));
  assert.equal(quantity.children.length, 3);
  assert.equal(quantity.children.some(node => node.className === 'cart-remove'), false);
  row.update({ ...item, quantity: 3 }, 0); plus.dispatchEvent(new Event('click')); assert.deepEqual(actions, [[1, 3]]);
  assert.ok(walk(root).includes(plus)); row.update({ ...item, quantity: 999 }, 0); assert.equal(plus.disabled, true);
  row.update({ ...item, product: null, variant: null }, 1); assert.equal(link.getAttribute('href'), null);
  assert.match(text(root), /Artículo 2 pendiente de verificación/); assert.match(text(root), /Precio pendiente/);
}));
test('cart color labels and image fallbacks never accept an external image source', () => globals(() => {
  const item = { productId: 'p1', variantId: 'v1', quantity: 1, product: { id: 'p1', slug: 'p1', name: 'Product', description: '', variants: [], image: '/storefront/synthetic.webp' }, variant: { id: 'v1', name: 'Grande', priceMinor: 100, currency: 'ARS', colorInfo: { id: 'green', slug: 'green', name: 'Verde', hex: '#00aa00' } } };
  const row = cartRow(item, true, () => {}); row.update(item, 0); const root = row.root as unknown as NodePort;
  assert.match(text(root), /Color: Verde/); const image = walk(root).find(node => node.tagName === 'img')!;
  assert.equal(image.src, 'http://127.0.0.1:3000/storefront/synthetic.webp'); assert.equal(image.hidden, false);
  image.dispatchEvent(new Event('error')); assert.equal(image.hidden, true);
  assert.equal(walk(root).find(node => node.getAttribute('aria-label') === 'Imagen no disponible')!.hidden, false);
  row.update({ ...item, product: { ...item.product, image: 'https://external.invalid/image.webp' } }, 0);
  assert.equal(image.getAttribute('src'), null); assert.equal(image.hidden, true);
}));
test('browser cart runtime wires storage/pageshow/local notifications and removes all listeners', () => globals(() => {
  let calls = 0; const stop = browserCartRuntime.listen(() => { calls++; });
  for (const event of ['storage', 'pageshow', cartChangedEvent]) window.dispatchEvent(new Event(event));
  browserCartRuntime.notify(); assert.equal(calls, 4); stop();
  for (const event of ['storage', 'pageshow', cartChangedEvent]) window.dispatchEvent(new Event(event));
  assert.equal(calls, 4);
}));
