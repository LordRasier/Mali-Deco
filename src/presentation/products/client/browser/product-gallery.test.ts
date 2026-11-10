import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountProductGallery } from './product-gallery';

class ElementStub extends EventTarget {
  hidden = false; disabled = true; complete = true; naturalWidth = 100; textContent = '';
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
}

test('thumbnails select the same image as keyboard and previous/next controls', () => {
  const images = [new ElementStub(), new ElementStub(), new ElementStub()];
  const thumbs = images.map(() => new ElementStub());
  const previous = new ElementStub(), next = new ElementStub(), placeholder = new ElementStub(), label = new ElementStub();
  const gallery = new ElementStub() as ElementStub & { querySelector: (s: string) => unknown; querySelectorAll: (s: string) => unknown[] };
  gallery.querySelector = s => ({ '[data-gallery-placeholder]': placeholder, '[data-gallery-position]': label, '[data-gallery-previous]': previous, '[data-gallery-next]': next } as Record<string, unknown>)[s] ?? null;
  gallery.querySelectorAll = s => s === '[data-product-image]' ? images : s === '[data-gallery-thumb]' ? thumbs : [];
  const root = { querySelector: () => gallery } as unknown as ParentNode;
  const dispose = mountProductGallery(root);
  assert.equal(thumbs[0].attributes.get('aria-pressed'), 'true');
  thumbs[2].dispatchEvent(new Event('click'));
  assert.equal(images[2].hidden, false); assert.equal(images[0].hidden, true);
  assert.equal(thumbs[2].attributes.get('aria-pressed'), 'true'); assert.equal(label.textContent, 'Imagen 3 de 3');
  previous.dispatchEvent(new Event('click'));
  assert.equal(images[1].hidden, false); assert.equal(thumbs[1].attributes.get('aria-pressed'), 'true');
  const arrow = new Event('keydown', { cancelable: true }); Object.defineProperty(arrow, 'key', { value: 'ArrowRight' });
  gallery.dispatchEvent(arrow); assert.equal(images[2].hidden, false); assert.equal(arrow.defaultPrevented, true);
  previous.dispatchEvent(new Event('click'));
  images[1].dispatchEvent(new Event('error')); assert.equal(placeholder.hidden, false);
  dispose(); thumbs[0].dispatchEvent(new Event('click')); assert.equal(images[0].hidden, true);
});
