import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductMedia, registerProductMedia } from '../../src/presentation/admin/client/browser/products/product-media';

test('same-product refresh retains the exact slot and owner while archive is immediately read-only', () => {
  let mounts = 0, disposed = 0; const flags: boolean[] = [], selectedFile = { name: 'selected.png' };
  const roots: HTMLElement[] = [];
  const unregister = registerProductMedia(root => { mounts++; roots.push(root); return { dispose() { disposed++; }, setReadOnly(value) { flags.push(value); }, selectedFile }; });
  const slot = () => ({ hidden: true, replacement: null as HTMLElement | null, replaceWith(node: HTMLElement) { this.replacement = node; } });
  const first = slot(), second = slot(), third = slot();
  const media = createProductMedia({} as never);
  media.adopt(first as unknown as HTMLElement, 'p1', false);
  media.adopt(second as unknown as HTMLElement, 'p1', false);
  assert.equal(mounts, 1); assert.equal(second.replacement, first); assert.equal(roots[0], first); assert.equal(first.hidden, false);
  media.committed('p1', true); assert.equal(flags.at(-1), true);
  media.adopt(third as unknown as HTMLElement, 'p1', false); assert.equal(flags.at(-1), true); assert.equal(third.replacement, first);
  media.adopt(slot() as unknown as HTMLElement, 'p2', false); assert.equal(mounts, 2); assert.equal(disposed, 1);
  media.adopt(null, null, false); assert.equal(disposed, 2); media.dispose(); assert.equal(disposed, 2); unregister();
});

test('an unavailable media feature leaves the server slot hidden and never invents operational controls', () => {
  const slot = { hidden: true } as HTMLElement, media = createProductMedia({} as never);
  media.adopt(slot, 'p1', false); assert.equal(slot.hidden, true); media.dispose();
});

test('retained slot forwards live media activity but never carries it across owners', () => {
  let state: 'writing' | 'pending' | 'clear' = 'pending';
  const unregister = registerProductMedia(() => ({ activity: () => state, dispose() {}, setReadOnly() {} }));
  const media = createProductMedia({} as never);
  try {
    assert.equal(media.activity(), 'clear'); media.adopt({} as HTMLElement, 'p', false);
    assert.equal(media.activity(), 'pending'); state = 'writing'; assert.equal(media.activity(), 'writing');
    media.dispose(); assert.equal(media.activity(), 'clear');
  } finally { unregister(); }
});
