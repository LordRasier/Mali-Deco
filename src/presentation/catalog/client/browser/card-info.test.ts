import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountCardInfo } from './card-info';
import type { Product } from '../../shared/storefront-types';

const focusState: { element?: unknown } = {};
class Element extends EventTarget {
  textContent = ''; hidden = false; disabled = false; value = ''; open = false; isConnected = true;
  children: Element[] = []; style = { overflow: 'clip' }; parent?: Element;
  elements = new Map<string, Element>(); attrs = new Map<string, string>();
  querySelector(selector: string) { return this.elements.get(selector); }
  querySelectorAll() { return ['close', 'retry', 'choice', 'more', 'use'].map(key => this.elements.get(`[data-info-${key}]`)!).filter(item => !item.disabled); }
  getClientRects(): object[] { return this.hidden || (this.parent && !this.parent.getClientRects().length) ? [] : [{}]; }
  replaceChildren(...children: Element[]) { this.children = []; this.value = ''; this.append(...children); }
  append(...children: Element[]) { for (const child of children) { child.parent = this; this.children.push(child); } }
  add(child: Element) { this.append(child); }
  setAttribute(key: string, value: string) { this.attrs.set(key, value); }
  focus() { if (this.isConnected) focusState.element = this; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
}
const product: Product = { id: 'p', slug: 'p', name: 'Producto', description: '', variants: [] };
function response(page = 1, total = 3) {
  return new Response(JSON.stringify({ ...product, description: 'Información general', category: null, images: [],
    productWidthMm: 120, productHeightMm: null, productLengthMm: null,
    variants: Array.from({ length: Math.min(100, total - (page - 1) * 100) }, (_, i) => ({
      id: `v${(page - 1) * 100 + i}`, name: `Opción ${(page - 1) * 100 + i}`, currency: 'ARS', priceMinor: 100, color: null, material: null, supplyMode: null,
    })), page, limit: 100, total,
  }), { headers: { 'Content-Type': 'application/json' } });
}
async function fixture(run: (context: { modal: ReturnType<typeof mountCardInfo>; dialog: Element; opener: HTMLElement; fallback: HTMLElement; html: Element; get: (key: string) => Element }) => Promise<void>, fetcher: typeof fetch = async () => response()) {
  const dialog = new Element(), opener = new Element(), fallback = new Element(), html = new Element();
  for (const key of ['title', 'close', 'loading', 'error', 'retry', 'content', 'general', 'description', 'dimensions', 'options', 'choice', 'count', 'more', 'use']) dialog.elements.set(`[data-info-${key}]`, new Element());
  const get = (key: string) => dialog.elements.get(`[data-info-${key}]`)!;
  get('content').append(get('general'), get('options')); get('general').append(get('description'), get('dimensions'));
  get('options').append(get('choice'), get('count'), get('more'), get('use'));
  const originals = new Map(['document', 'window', 'fetch', 'Option'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: html, createElement: () => new Element(), get activeElement() { return focusState.element; } } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'http://localhost' } } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetcher });
  Object.defineProperty(globalThis, 'Option', { configurable: true, value: class extends Element { constructor(text: string, value: string) { super(); this.textContent = text; this.value = value; } } });
  const modal = mountCardInfo(dialog as unknown as HTMLDialogElement);
  try { await run({ modal, dialog, opener: opener as unknown as HTMLElement, fallback: fallback as unknown as HTMLElement, html, get }); }
  finally {
    modal.dispose();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
}

test('information displays only general description and dimensions, traps focus and restores scroll and fallback focus', async () => {
  await fixture(async ({ modal, dialog, opener, fallback, html, get }) => {
    await modal.open(product, opener, fallback);
    assert.equal(get('description').textContent, 'Información general');
    assert.deepEqual(get('dimensions').children.map(child => child.textContent), ['Ancho', '120 mm']);
    assert.equal(get('general').hidden, false); assert.equal(get('options').hidden, true); assert.equal(get('choice').children.length, 0);
    assert.equal(html.style.overflow, 'hidden'); assert.equal(get('close').attrs.get('aria-label'), 'Cerrar información');
    for (const shiftKey of [true, false]) {
      const event = new Event('keydown', { cancelable: true }); Object.assign(event, { key: 'Tab', shiftKey });
      dialog.dispatchEvent(event); assert.equal(focusState.element, get('close')); assert.equal(event.defaultPrevented, true);
    }
    (opener as unknown as Element).isConnected = false; dialog.close();
    assert.equal(html.style.overflow, 'clip'); assert.equal(focusState.element, fallback);
  });
});

test('explicit options view pages over 100 variants, returns the selection and does not leak it into information', async () => {
  const pages: number[] = [];
  await fixture(async ({ modal, dialog, opener, fallback, get }) => {
    let received: { product: Product; id: string } | undefined;
    await modal.choose(product, opener, 'v1', (value, id) => { received = { product: value, id }; }, fallback);
    assert.equal(get('general').hidden, true); assert.equal(get('options').hidden, false); assert.equal(get('choice').value, 'v1');
    get('more').dispatchEvent(new Event('click')); await new Promise(resolve => setImmediate(resolve));
    assert.equal(get('count').textContent, '103 de 103 opciones');
    get('choice').value = 'v102'; get('choice').dispatchEvent(new Event('change')); get('use').dispatchEvent(new Event('click'));
    assert.equal(received?.id, 'v102'); assert.equal(received?.product.variants.length, 103); assert.equal(dialog.open, false); assert.equal(focusState.element, opener);
    await modal.open(product, opener);
    assert.equal(get('general').hidden, false); assert.equal(get('options').hidden, true); assert.equal(get('choice').children.length, 0);
    assert.deepEqual(pages, [1, 2, 1]);
  }, async (input) => { const page = Number(new URL(String(input), 'http://localhost').searchParams.get('page')); pages.push(page); return response(page, 103); });
});

test('information retries a network failure without showing variant controls', async () => {
  let fail = true;
  await fixture(async ({ modal, opener, get }) => {
    await modal.open(product, opener); assert.equal(get('error').hidden, false); assert.equal(get('options').hidden, true);
    fail = false; get('retry').dispatchEvent(new Event('click')); await new Promise(resolve => setImmediate(resolve));
    assert.equal(get('error').hidden, true); assert.equal(get('description').textContent, 'Información general'); assert.equal(get('options').hidden, true);
  }, async () => { if (fail) throw new Error('Synthetic offline'); return response(); });
});
