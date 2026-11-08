import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountCatalogZoom } from './catalog-zoom';

class Control extends EventTarget {
  hidden = false; disabled = false; open = false; isConnected = true; textContent = ''; href = ''; src = ''; alt = ''; scrollTop = 0; scrollLeft = 0;
  dataset: Record<string, string> = {}; attrs = new Map<string, string>(); focused = false;
  classList = { toggle: () => {} };
  focus() { this.focused = true; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  removeAttribute(name: string) { this.attrs.delete(name); if (name === 'src') this.src = ''; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
}
test('photo zoom opens the active image, toggles zoom, retries errors and restores focus/scroll', () => {
  const nodes = Object.fromEntries(['dialog', 'title', 'close', 'toggle', 'viewport', 'image', 'error', 'retry'].map(name => [name, new Control()]));
  const dialog = Object.assign(nodes.dialog, { querySelector: (selector: string) => nodes[selector.slice(11, -1)] });
  const link = new Control(); link.dataset.zoomName = 'Pieza';
  const card = { querySelector: () => link };
  const root = { querySelector: () => dialog, querySelectorAll: () => [card] } as unknown as ParentNode;
  const original = globalThis.document;
  const doc = { documentElement: { style: { overflow: 'auto' } }, activeElement: null };
  Object.assign(globalThis, { document: doc });
  try {
    const zoom = mountCatalogZoom(root);
    const image = { dataset: { zoomSrc: '/api/v1/catalog/images/second?w=1600' } } as unknown as HTMLImageElement;
    zoom.update(card as unknown as HTMLElement, image);
    const click = new Event('click', { cancelable: true }); link.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true); assert.equal(dialog.open, true);
    assert.equal(nodes.image.src, image.dataset.zoomSrc); assert.equal(nodes.image.alt, 'Pieza');
    assert.equal(nodes.close.focused, true); assert.equal(doc.documentElement.style.overflow, 'hidden');
    nodes.image.dispatchEvent(new Event('load')); nodes.toggle.dispatchEvent(new Event('click'));
    assert.equal(nodes.toggle.attrs.get('aria-pressed'), 'true');
    nodes.image.dispatchEvent(new Event('error')); assert.equal(nodes.error.hidden, false); assert.equal(nodes.toggle.disabled, true);
    nodes.retry.dispatchEvent(new Event('click')); assert.equal(nodes.error.hidden, true); assert.equal(nodes.image.src, image.dataset.zoomSrc);
    dialog.close(); assert.equal(link.focused, true); assert.equal(doc.documentElement.style.overflow, 'auto');
    zoom.update(card as unknown as HTMLElement, null); assert.equal(link.hidden, true);
    zoom.dispose(); link.dispatchEvent(new Event('click')); assert.equal(dialog.open, false);
  } finally { Object.assign(globalThis, { document: original }); }
});
