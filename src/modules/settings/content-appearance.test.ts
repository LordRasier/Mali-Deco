import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultContentConfig } from './content-config';
import { normalizeSections, parseContentConfig, parseStoredContentConfig } from './content-validation';
import { ContentSettings } from './content-settings';
import { ContentDrafts } from './content-drafts';
import { contentDatabase } from '../../../tests/support/content-database';
import { flattenBlocks, newBlock } from '../../shared/landing-layout';

const neutral = { backgroundColor: null, headingFont: null, bodyFont: null };
test('stored appearance upgrades are neutral, recursive and do not alter existing content', () => {
  const old = normalizeSections(defaultContentConfig());
  const container = newBlock('container', 'nested'); container.columns[0].blocks.push(newBlock('hero', 'nested-hero')); old.landing.blocks.push(container);
  const raw = JSON.parse(JSON.stringify(old)); delete raw.appearance;
  for (const block of flattenBlocks(raw.landing)) { Reflect.deleteProperty(block.style, 'backgroundColor'); Reflect.deleteProperty(block.style, 'textColor'); }
  raw.copy.home.title = 'Existing title';
  const upgraded = parseStoredContentConfig(raw);
  assert.deepEqual(upgraded.appearance, neutral);
  assert.equal(upgraded.landing.blocks[0].style.backgroundColor, null);
  assert.equal(upgraded.landing.blocks[3].columns[0].blocks[0].style.textColor, null);
  assert.equal(upgraded.copy.home.title, 'Existing title');
  assert.deepEqual(parseStoredContentConfig(upgraded), upgraded);
  assert.throws(() => parseContentConfig(raw), 'New writes must include the exact current schema');
});

test('appearance accepts only six-digit colors and known fonts, never arbitrary CSS', () => {
  const config = normalizeSections(defaultContentConfig());
  config.appearance = { backgroundColor: '#F0E8D8', headingFont: 'georgia', bodyFont: 'figtree' };
  config.landing.blocks[0].style.backgroundColor = '#102030';
  config.landing.blocks[0].style.textColor = '#ffffff';
  config.landing.blocks[0].style.backgroundColor = '#ABCDEF';
  assert.equal(parseContentConfig(config).appearance.backgroundColor, '#f0e8d8');
  assert.equal(parseContentConfig(config).landing.blocks[0].style.backgroundColor, '#abcdef');
  assert.equal(config.landing.blocks[0].style.backgroundColor, '#ABCDEF', 'Validation must not mutate editor history');
  for (const bad of ['red', '#fff', '#ffffff;display:none', 'url(https://example.test)', '</style>', 123]) {
    const raw = JSON.parse(JSON.stringify(config)); raw.appearance.backgroundColor = bad;
    assert.throws(() => parseContentConfig(raw));
    raw.appearance.backgroundColor = null; raw.landing.blocks[0].style.textColor = bad;
    assert.throws(() => parseContentConfig(raw));
  }
  for (const font of ['unknown', 'Georgia; color:red', 'https://example.test/font.woff2']) {
    assert.throws(() => parseContentConfig({ ...config, appearance: { ...config.appearance, bodyFont: font } }));
  }
});

test('appearance saves and reloads only in drafts, publishes atomically, and restores published values', async () => {
  const database = contentDatabase(), published = new ContentSettings(database.db), drafts = new ContentDrafts(published, database.db);
  const initial = await drafts.get(), config = initial.settings;
  config.appearance = { backgroundColor: '#f0e8d8', headingFont: 'georgia', bodyFont: 'arial' };
  config.landing.blocks[0].style.backgroundColor = '#102030';
  config.landing.blocks[0].style.textColor = '#ffffff';
  await drafts.write({ settings: config, revision: 0, publishedRevision: 0 }, 'draft');
  assert.deepEqual((await published.get()).settings.appearance, neutral);
  assert.deepEqual((await drafts.get()).settings.appearance, config.appearance);
  assert.equal((await published.get()).settings.landing.blocks[0].style.backgroundColor, null);
  database.failDraftWrite(true);
  await assert.rejects(drafts.write({ settings: config, revision: 1, publishedRevision: 0 }, 'publish'));
  assert.deepEqual((await published.get()).settings.appearance, neutral);
  database.failDraftWrite(false);
  await drafts.write({ settings: config, revision: 1, publishedRevision: 0 }, 'publish');
  assert.deepEqual((await published.get()).settings.appearance, config.appearance);
  assert.equal((await published.get()).settings.landing.blocks[0].style.textColor, '#ffffff');
  config.appearance.backgroundColor = '#abcdef';
  await drafts.write({ settings: config, revision: 2, publishedRevision: 1 }, 'draft');
  const restored = await drafts.write({ revision: 3, publishedRevision: 1 }, 'restore');
  assert.equal(restored.settings.appearance.backgroundColor, '#f0e8d8');
});
