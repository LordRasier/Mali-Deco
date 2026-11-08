import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCardChoices, updateCardChoices } from './card-choices';
import type { Product } from '../../shared/storefront-types';

class Element extends EventTarget {
  textContent = ''; className = ''; type = ''; title = ''; hidden = false; disabled = false;
  dataset: Record<string, string> = {}; style: Record<string, string> = {};
  children: Element[] = []; attrs = new Map<string, string>();
  constructor(readonly tag = 'div') { super(); }
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  querySelectorAll(selector: string) { return this.children.filter(child => selector === 'button' && child.tag === 'button'); }
  querySelector(selector: string) { return this.children.find(child => selector === '[data-card-selected]' && 'cardSelected' in child.dataset) ?? null; }
}

test('card options label real colors and preserve six swatches, overflow access and selection', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (tag: string) => new Element(tag) } });
  try {
    const product: Product = { id: 'p', slug: 'p', name: 'P', description: '', variantCount: 8,
      variants: Array.from({ length: 8 }, (_, i) => ({ id: `v${i}`, name: `Variante ${i}`, priceMinor: 100, currency: 'ARS',
        colorInfo: { id: `c${i}`, slug: `color-${i}`, name: `Color ${i}`, hex: `#${String(i).repeat(6)}` } })) };
    const root = new Element(); let selected = '', opened: unknown;
    renderCardChoices(root as unknown as HTMLElement, product, id => { selected = id; }, button => { opened = button; });
    assert.equal(root.dataset.cardOptionKind, 'colors');
    const buttons = root.querySelectorAll('button');
    assert.equal(buttons.length, 7); assert.equal(buttons[6].textContent, '+2 colores');
    assert.equal(buttons[0].attrs.get('aria-label'), 'Color 0');
    buttons[0].dispatchEvent(new Event('click')); assert.equal(selected, 'v0');
    buttons[6].dispatchEvent(new Event('click')); assert.equal(opened, buttons[6]);
    updateCardChoices(root as unknown as HTMLElement, product.variants[0], false);
    assert.equal(root.children[0].textContent, 'Color: Color 0');
    assert.equal(buttons[0].attrs.get('aria-pressed'), 'true');
    updateCardChoices(root as unknown as HTMLElement, product.variants[0], true);
    assert.ok(buttons.every(button => button.disabled));
    const generic = { ...product, variantCount: 3, variants: product.variants.slice(0, 3).map(option => ({ ...option, colorInfo: null })) };
    renderCardChoices(root as unknown as HTMLElement, generic, () => {}, () => {});
    updateCardChoices(root as unknown as HTMLElement, generic.variants[0], false);
    assert.equal(root.children[0].textContent, 'Opciones');
    assert.equal(root.querySelectorAll('button').length, 3);
    renderCardChoices(root as unknown as HTMLElement, { ...generic, variantCount: 101 }, () => {}, () => {});
    assert.equal(root.querySelectorAll('button')[0].textContent, 'Ver opciones');
    renderCardChoices(root as unknown as HTMLElement, { ...generic, variantCount: 1, variants: generic.variants.slice(0, 1) }, () => {}, () => {});
    assert.equal(root.hidden, true);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original); else Reflect.deleteProperty(globalThis, 'document');
  }
});
