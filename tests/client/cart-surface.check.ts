import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountCartSurface } from '../../src/presentation/cart/client/browser/cart-surface';

class Container { children: Container[] = []; parent?: Container; writes = 0; get parentElement() { return this.parent; } append(child: Container) { this.writes++; if (child.parent) child.parent.children = child.parent.children.filter(node => node !== child); this.children.push(child); child.parent = this; } }
class Dialog extends EventTarget { open = false; host = new Container(); append(node: Container) { this.host.append(node); } showModal() { this.open = true; } close() { this.open = false; this.dispatchEvent(new Event('close')); } }
test('cart page and modal share one content tree, restoring it after close without cloning', () => {
  const dialog = new Dialog(), content = new Container(), slot = new Container(); dialog.append(content);
  const surface = mountCartSurface(dialog as unknown as HTMLDialogElement, content as unknown as HTMLElement, slot as unknown as HTMLElement);
  assert.deepEqual(slot.children, [content]); surface.open(); assert.equal(dialog.open, true); assert.deepEqual(slot.children, []); assert.deepEqual(dialog.host.children, [content]);
  dialog.close(); assert.deepEqual(slot.children, [content]); assert.equal(surface.visible(), true);
  surface.open(); surface.close(); assert.deepEqual(slot.children, [content]); surface.dispose();
});
test('panel-only pages keep content inside the closed modal', () => {
  const dialog = new Dialog(), content = new Container(); dialog.append(content);
  const surface = mountCartSurface(dialog as unknown as HTMLDialogElement, content as unknown as HTMLElement, null);
  assert.equal(surface.visible(), false); surface.open(); assert.equal(surface.visible(), true); surface.close(); assert.equal(surface.visible(), false); assert.deepEqual(dialog.host.children, [content]); surface.dispose();
});
test('a queued close event cannot steal content from a reopened modal or reparent twice', () => {
  const dialog = new Dialog(), content = new Container(), slot = new Container();
  dialog.close = () => { dialog.open = false; };
  dialog.append(content);
  const surface = mountCartSurface(dialog as unknown as HTMLDialogElement, content as unknown as HTMLElement, slot as unknown as HTMLElement);
  surface.open(); surface.close(); const writes = slot.writes;
  dialog.dispatchEvent(new Event('close')); assert.equal(slot.writes, writes);
  surface.open(); surface.close(); surface.open(); dialog.dispatchEvent(new Event('close'));
  assert.equal(dialog.open, true); assert.deepEqual(dialog.host.children, [content]); assert.deepEqual(slot.children, []);
  surface.dispose();
});
test('checkout lock closes the modal and rejects reopen until the owner unlocks it', () => {
  const dialog = new Dialog(), content = new Container(); dialog.append(content);
  const surface = mountCartSurface(dialog as unknown as HTMLDialogElement, content as unknown as HTMLElement, null);
  surface.open(); surface.setLocked(true); assert.equal(dialog.open, false); assert.equal(surface.isLocked(), true);
  surface.open(); assert.equal(dialog.open, false); surface.setLocked(false); surface.open(); assert.equal(dialog.open, true);
  surface.dispose();
});
