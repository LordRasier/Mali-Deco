import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountCatalogCards } from './catalog-cards';

for (const withDescription of [false, true]) test(`information links share the modal and native fallback (description: ${withDescription})`, () => {
  const focusState: { element?: unknown } = {};
  class Element extends EventTarget {
    textContent = ''; hidden = false; disabled = false; value = ''; open = false; isConnected = true;
    href = 'http://127.0.0.1/productos/p'; className = '';
    dataset: Record<string, string> = {}; style = { overflow: '' }; children: unknown[] = [];
    elements = new Map<string, Element>(); attrs = new Map<string, string>();
    querySelector(selector: string) { return this.elements.get(selector) ?? null; }
    querySelectorAll() { return []; }
    replaceChildren(...children: unknown[]) { this.children = children; this.value = ''; }
    append(...children: unknown[]) { this.children.push(...children); }
    setAttribute(key: string, value: string) { this.attrs.set(key, value); }
    focus() { focusState.element = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
  }
  const dialog = new Element(), card = new Element(), link = new Element(), info = new Element(), more = new Element(), html = new Element();
  for (const key of ['title', 'close', 'loading', 'error', 'retry', 'content', 'general', 'description', 'dimensions', 'options', 'choice', 'count', 'more', 'use']) dialog.elements.set(`[data-info-${key}]`, new Element());
  for (const key of ['options', 'purchase', 'add', 'price', 'status', 'error']) card.elements.set(`[data-card-${key}]`, new Element());
  card.elements.set('[data-card-link]', link); card.elements.set('[data-card-info]', info);
  if (withDescription) card.elements.set('[data-card-more]', more);
  card.dataset.cardBootstrap = JSON.stringify({ id: 'p', slug: 'p', name: 'P',
    variants: [{ id: 'v', name: 'Única', priceMinor: 1000, currency: 'ARS' }], variantCount: 1 });
  const root = { querySelector: (selector: string) => selector === '[data-info-dialog]' ? dialog : null, querySelectorAll: () => [card] } as unknown as ParentNode;
  const originals = new Map(['document', 'window', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: html, createElement: () => new Element(), get activeElement() { return focusState.element; } } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => { throw new Error('Synthetic offline'); } });
  try {
    const cart = { addVerified: async () => { throw new Error('Unexpected add'); }, getSnapshot: () => ({ ready: true }), subscribe: () => () => {} };
    const dispose = mountCatalogCards(cart as unknown as Parameters<typeof mountCatalogCards>[0], root);
    assert.equal(info.attrs.get('aria-haspopup'), 'dialog');
    assert.equal(info.href, link.href);
    assert.equal(info.href, '/productos/p?variant=v');
    assert.equal(card.querySelector('[data-card-price]')?.dataset.priceState, 'price');
    const modified = new Event('click', { cancelable: true }); Object.assign(modified, { ctrlKey: true });
    info.dispatchEvent(modified); assert.equal(modified.defaultPrevented, false); assert.equal(dialog.open, false);
    const click = new Event('click', { cancelable: true }); info.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true); assert.equal(dialog.open, true);
    assert.equal(dialog.querySelector('[data-info-options]')?.hidden, true);
    dialog.close(); assert.equal(focusState.element, info);
    link.dispatchEvent(new Event('click', { cancelable: true })); assert.equal(dialog.open, true);
    dialog.close(); assert.equal(focusState.element, link);
    if (withDescription) {
      assert.equal(more.attrs.get('aria-haspopup'), 'dialog'); assert.equal(more.href, link.href);
      const modifiedMore = new Event('click', { cancelable: true }); Object.assign(modifiedMore, { ctrlKey: true });
      more.dispatchEvent(modifiedMore); assert.equal(modifiedMore.defaultPrevented, false); assert.equal(dialog.open, false);
      const moreClick = new Event('click', { cancelable: true }); more.dispatchEvent(moreClick);
      assert.equal(moreClick.defaultPrevented, true); assert.equal(dialog.open, true);
      assert.equal(dialog.querySelector('[data-info-options]')?.hidden, true);
      dialog.close(); assert.equal(focusState.element, more);
    }
    dispose();
    info.dispatchEvent(new Event('click', { cancelable: true })); assert.equal(dialog.open, false);
    more.dispatchEvent(new Event('click', { cancelable: true })); assert.equal(dialog.open, false);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
