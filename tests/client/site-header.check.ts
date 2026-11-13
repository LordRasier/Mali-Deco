import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountSiteHeader } from '../../src/presentation/browser/site-header';

class Node extends EventTarget {
  attrs = new Map<string, string>(); hidden = false; disabled = true; textContent = ''; focused = false;
  nodes = new Map<string, Node>();
  querySelector(selector: string) { return this.nodes.get(selector) ?? null; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  removeAttribute(name: string) { this.attrs.delete(name); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  contains(node: unknown) { return Array.from(this.nodes.values()).includes(node as Node); }
  focus() { this.focused = true; }
  click() { this.dispatchEvent(new Event('click')); }
}
function fixture() {
  const root = new Node(), search = new Node(), form = new Node(), input = new Node();
  root.nodes = new Map([['[data-search-toggle]', search], ['#store-search', form]]);
  form.nodes.set('input', input);
  return { root, search, form, input, mount: () => mountSiteHeader(root as unknown as HTMLElement) };
}

test('logo-only keeps the name accessible and restores visible text if the image is missing or fails', () => {
  for (const mode of ['logo', 'logo_text']) {
    const root = new Node(), brand = new Node(), name = new Node();
    const logo = Object.assign(new Node(), { complete: true, naturalWidth: 150 });
    brand.setAttribute('data-brand-display', mode); brand.nodes.set('[data-brand-logo]', logo); brand.nodes.set('[data-brand-name]', name);
    root.nodes.set('[data-brand-display]', brand);
    const stop = mountSiteHeader(root as unknown as HTMLElement);
    assert.equal(logo.hidden, false); assert.equal(name.hidden, mode === 'logo');
    logo.naturalWidth = 1; logo.dispatchEvent(new Event('load')); assert.equal(logo.hidden, true); assert.equal(name.hidden, false);
    logo.naturalWidth = 150; logo.dispatchEvent(new Event('load')); assert.equal(logo.hidden, false); assert.equal(name.hidden, mode === 'logo');
    logo.dispatchEvent(new Event('error')); assert.equal(logo.hidden, true); assert.equal(name.hidden, false);
    stop?.(); logo.dispatchEvent(new Event('load')); assert.equal(logo.hidden, true);
  }
});
test('header without search is valid and does not block other storefront clients', () => {
  const root = new Node();
  assert.equal(mountSiteHeader(root as unknown as HTMLElement), undefined);
});

test('an incomplete search pair remains an error rather than hiding broken markup', () => {
  for (const missing of ['[data-search-toggle]', '#store-search']) {
    const f = fixture(); f.root.nodes.delete(missing);
    assert.throws(f.mount, /Incomplete site header/);
  }
});

test('header search works without a collapsed menu and focuses its input when present', () => {
  const f = fixture(); const dispose = f.mount();
  assert.equal(f.search.disabled, false); assert.equal(f.form.hidden, true);
  f.search.click(); assert.equal(f.search.getAttribute('aria-expanded'), 'true'); assert.equal(f.form.hidden, false); assert.equal(f.input.focused, true);
  f.search.click(); assert.equal(f.form.hidden, true); assert.equal(f.search.getAttribute('aria-expanded'), 'false');
  dispose?.(); f.search.click(); assert.equal(f.form.hidden, true);
});
test('Escape restores the disclosure trigger and leaving the header closes it', () => {
  const f = fixture(); f.mount(); f.search.click();
  const escape = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
  f.root.dispatchEvent(escape); assert.equal(f.search.getAttribute('aria-expanded'), 'false'); assert.equal(f.search.focused, true); assert.equal(escape.defaultPrevented, true);
  f.search.click(); f.root.dispatchEvent(Object.assign(new Event('focusout'), { relatedTarget: null })); assert.equal(f.form.hidden, true);
  f.search.click(); f.root.dispatchEvent(Object.assign(new Event('focusout'), { relatedTarget: f.search })); assert.equal(f.search.getAttribute('aria-expanded'), 'true');
});
