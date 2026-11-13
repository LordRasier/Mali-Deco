import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountCatalogGalleries } from './catalog-gallery';

class Stub extends EventTarget {
  hidden = false; complete = true; naturalWidth = 100; textContent = ''; dataset: Record<string, string> = {};
  attrs = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
}

test('variant selection moves to its assigned photo, updates zoom and preserves manual navigation until selection changes', () => {
  const images = [new Stub(), new Stub(), new Stub()];
  images.forEach((image, i) => { image.setAttribute('data-image-id', `image-${i}`); image.hidden = i !== 1; });
  const next = new Stub(), previous = new Stub(), controls = new Stub(), label = new Stub(), placeholder = new Stub();
  const values: Record<string, unknown> = { '[data-card-controls]': controls, '[data-card-previous]': previous, '[data-card-next]': next,
    '[data-card-position]': label, '[data-card-placeholder]': placeholder };
  const card = { querySelector: (s: string) => values[s] ?? null, querySelectorAll: () => images } as unknown as HTMLElement;
  let zoom: HTMLImageElement | null = null;
  const galleries = mountCatalogGalleries({ querySelectorAll: () => [card] } as unknown as ParentNode, (_card, image) => { zoom = image; });
  assert.equal(label.textContent, 'Imagen 2 de 3'); assert.equal(zoom, images[1]);
  galleries.select(card, 'image-2'); assert.equal(images[2].hidden, false); assert.equal(zoom, images[2]);
  previous.dispatchEvent(new Event('click')); assert.equal(images[1].hidden, false);
  galleries.select(card, 'image-0'); assert.equal(images[0].hidden, false);
  galleries.select(card, 'not-public'); assert.equal(images[0].hidden, false);
  galleries.select(card, 'image-2'); images[2].dispatchEvent(new Event('error'));
  assert.equal(zoom, null); assert.equal(placeholder.hidden, false);
  galleries(); galleries.select(card, 'image-0'); assert.equal(images[0].hidden, true);
});
test('gallery controls change photos and retain an unavailable-image fallback', () => {
  const imgs = [new Stub(), new Stub()], previous = new Stub(), next = new Stub(), controls = new Stub(), position = new Stub(), placeholder = new Stub();
  const colors = [new Stub(), new Stub()], group = new Stub(), link = new Stub(), price = new Stub(), row = new Stub(), label = new Stub();
  colors[0].dataset = { href: '/productos/p?variant=a', price: '$1', name: 'Azul', variant: 'Azul' };
  colors[1].dataset = { href: '/productos/p?variant=b', price: '$2', name: 'Coral', variant: 'Coral' };
  const values: Record<string, unknown> = { '[data-card-controls]': controls, '[data-card-previous]': previous, '[data-card-next]': next,
    '[data-card-position]': position, '[data-card-placeholder]': placeholder, '[data-card-colors]': group,
    '[data-card-link]': link, '[data-card-price]': price, '[data-card-variant-row]': row, '[data-card-color-label]': label };
  const card = { querySelector: (s: string) => values[s] ?? null, querySelectorAll: (s: string) => s === '[data-card-image]' ? imgs : s === '[data-card-color]' ? colors : [] };
  const root = { querySelectorAll: () => [card] } as unknown as ParentNode;
  const dispose = mountCatalogGalleries(root);
  next.dispatchEvent(new Event('click')); assert.equal(imgs[0].hidden, true); assert.equal(imgs[1].hidden, false); assert.equal(position.textContent, 'Imagen 2 de 2');
  imgs[1].dispatchEvent(new Event('error')); assert.equal(placeholder.hidden, false);
  dispose();
});

test('gallery slides in the requested direction and safely interrupts an in-flight transition', () => {
  class Animated extends Stub {
    animations: { frames: Keyframe[]; cancelled: boolean; onfinish: (() => void) | null; cancel: () => void }[] = [];
    animate(frames: Keyframe[]) {
      const animation = { frames, cancelled: false, onfinish: null as (() => void) | null, cancel() { this.cancelled = true; } };
      this.animations.push(animation); return animation;
    }
  }
  const images = [new Animated(), new Animated(), new Animated()], prev = new Stub(), next = new Stub(), controls = new Stub(), position = new Stub();
  const values: Record<string, unknown> = { '[data-card-controls]': controls, '[data-card-previous]': prev, '[data-card-next]': next, '[data-card-position]': position };
  const card = { querySelector: (s: string) => values[s] ?? null, querySelectorAll: (s: string) => s === '[data-card-image]' ? images : [] };
  let active: unknown;
  const dispose = mountCatalogGalleries({ querySelectorAll: () => [card] } as unknown as ParentNode, (_card, image) => { active = image; });
  assert.equal(active, images[0]);
  next.dispatchEvent(new Event('click'));
  assert.equal(active, images[1]);
  assert.equal(images[0].animations[0].frames[1].transform, 'translateX(-100%)');
  assert.equal(images[1].animations[0].frames[0].transform, 'translateX(100%)');
  prev.dispatchEvent(new Event('click'));
  assert.equal(images[0].animations[0].cancelled, true); assert.equal(images[1].animations[0].cancelled, true);
  assert.equal(images[0].animations[1].frames[0].transform, 'translateX(-100%)');
  images[0].animations[1].onfinish?.(); assert.equal(images[0].hidden, false); assert.equal(images[1].hidden, true);
  assert.equal(position.textContent, 'Imagen 1 de 3'); dispose();
});

test('reduced-motion preference switches images without animation', () => {
  class Animated extends Stub { animate() { throw new Error('Animation must not run'); } }
  const images = [new Animated(), new Animated()], controls = new Stub(), prev = new Stub(), next = new Stub();
  const values: Record<string, unknown> = { '[data-card-controls]': controls, '[data-card-previous]': prev, '[data-card-next]': next };
  const card = { querySelector: (s: string) => values[s] ?? null, querySelectorAll: (s: string) => s === '[data-card-image]' ? images : [] };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
  try {
    const dispose = mountCatalogGalleries({ querySelectorAll: () => [card] } as unknown as ParentNode);
    next.dispatchEvent(new Event('click')); assert.equal(images[0].hidden, true); assert.equal(images[1].hidden, false); dispose();
  } finally {
    if (original) Object.defineProperty(globalThis, 'matchMedia', original); else Reflect.deleteProperty(globalThis, 'matchMedia');
  }
});

test('single images also expose a truthful placeholder on load failure', () => {
  const img = new Stub(), placeholder = new Stub(); placeholder.hidden = true;
  const card = { querySelector: (s: string) => s === '[data-card-placeholder]' ? placeholder : null,
    querySelectorAll: (s: string) => s === '[data-card-image]' ? [img] : [] };
  const dispose = mountCatalogGalleries({ querySelectorAll: () => [card] } as unknown as ParentNode);
  img.dispatchEvent(new Event('error')); assert.equal(placeholder.hidden, false); assert.equal(img.hidden, true); dispose();
});
