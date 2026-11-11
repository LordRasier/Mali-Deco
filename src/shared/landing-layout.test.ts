import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultContentConfig } from '../modules/settings/content-config';
import { normalizeSections, parseStoredContentConfig } from '../modules/settings/content-validation';
import { newBlock, parseLanding, flattenBlocks, type LandingLayout } from './landing-layout';
import { dropBlock, duplicateBlock, resizeColumns, locateBlock } from './landing-tree';
import { ContentHistory } from '../presentation/admin/client/browser/content/content-state';
test('stored legacy content becomes blocks without replacing customized text, images or visibility', () => {
  const old: Record<string, unknown> = normalizeSections(defaultContentConfig()); delete old.landing;
  const copy = (old.copy as ReturnType<typeof defaultContentConfig>['copy']); copy.home.title = 'Mi Mali'; copy.home.aboutDescription = 'Mi historia';
  (old.features as { homeAbout: boolean }).homeAbout = false;
  const next = parseStoredContentConfig(old);
  assert.equal(next.landing.blocks[0].props.title, 'Mi Mali'); assert.equal(next.landing.blocks[2].props.description, 'Mi historia');
  assert.equal(next.landing.blocks[2].enabled, false); assert.equal(next.landing.blocks[0].props.image, '/api/v1/catalog/branding/hero');
  assert.deepEqual(next.copy, copy); assert.deepEqual(parseStoredContentConfig(next), next);
});
test('schema rejects unknown fields, duplicate IDs, invalid images, scripts and excessive nesting', () => {
  for (const mutate of [
    (l: LandingLayout) => { l.blocks[0].props.href = 'javascript:alert(1)'; },
    (l: LandingLayout) => { l.blocks[0].props.image = 'https://external.test/image.png'; },
    (l: LandingLayout) => { l.blocks[0].props.title = '<script>'; },
    (l: LandingLayout) => { l.blocks[0].props.extra = 'oops'; },
    (l: LandingLayout) => { l.blocks.push(structuredClone(l.blocks[0])); },
    (l: LandingLayout) => { l.blocks = Array.from({ length: 41 }, (_, n) => newBlock('hero', 'block-' + n)); },
  ]) { const layout = defaultContentConfig().landing; mutate(layout); assert.throws(() => parseLanding(layout)); }
  const layout: LandingLayout = { version: 1, blocks: [newBlock('container', 'root-box')] }; let block = layout.blocks[0];
  for (let i = 0; i < 4; i++) { const child = newBlock('container', 'nested-' + i); block.columns[0].blocks.push(child); block = child; }
  assert.throws(() => parseLanding(layout));
});
test('move, duplicate and resize preserve children and give one reversible history entry per drop', () => {
  let sequence = 0; const id = () => 'new-' + ++sequence;
  const original = defaultContentConfig().landing;
  const inserted = dropBlock(original, { type: 'container' }, 'root', 1, id);
  const container = locateBlock(inserted.layout, inserted.id)!.block;
  const moved = dropBlock(inserted.layout, { id: 'home-collection' }, container.columns[1].id, 0, id);
  assert.equal(original.blocks.length, 3); assert.equal(locateBlock(moved.layout, 'home-collection')!.zone, container.columns[1].id);
  assert.throws(() => dropBlock(moved.layout, { id: container.id }, container.columns[1].id, 1, id));
  const resized = resizeColumns(moved.layout, container.id, 1, id); assert.equal(locateBlock(resized, 'home-collection')!.zone, container.columns[0].id);
  const copied = duplicateBlock(resized, container.id, id); const all = flattenBlocks(copied.layout); assert.equal(new Set(all.map(b => b.id)).size, all.length);
  const history = new ContentHistory(); history.load({ landing: inserted.layout }); history.edit(draft => { draft.landing = moved.layout; });
  history.undo(); assert.deepEqual(history.value.landing, inserted.layout); assert.equal(history.canUndo, false); history.redo(); assert.deepEqual(history.value.landing, moved.layout);
  assert.deepEqual(dropBlock(original, { id: 'home-hero' }, 'root', 1, id).layout, original, 'Adjacent insertion is a no-op');
});
