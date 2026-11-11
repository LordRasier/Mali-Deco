import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { defaultAppearance, parseAppearance, storeFonts } from '../../shared/store-appearance';
import { defaultContentConfig } from './content-config';
import { appearanceCss, appearanceSheet } from './content-appearance';
import { ContentSettings } from './content-settings';
import { ContentDrafts } from './content-drafts';
import { contentDatabase } from '../../../tests/support/content-database';

const added = ['manrope', 'nunito-sans', 'outfit', 'lora', 'libre-baskerville', 'cormorant-garamond', 'bitter', 'ibm-plex-mono'];
const fontsRoot = resolve(__dirname, '../../presentation/shell/public/fonts');
test('the platform offers twelve fixed font choices and never accepts uploaded files or URLs', () => {
  assert.equal(Object.keys(storeFonts).length, 12);
  for (const id of added) {
    const appearance = parseAppearance({ ...defaultAppearance(), headingFont: id, bodyFont: id });
    const config = defaultContentConfig(); config.appearance = appearance;
    const css = appearanceCss(appearanceSheet(config));
    assert.ok(css.includes(storeFonts[appearance.headingFont!].family));
    assert.doesNotMatch(css, /https?:|url\(/);
  }
  for (const value of ['custom', 'https://fonts.example/font.woff2', '/uploads/font.woff2', 'data:font/woff2;base64,AA', { file: 'font.woff2' }]) {
    assert.throws(() => parseAppearance({ ...defaultAppearance(), bodyFont: value }));
  }
});

test('new font files are unchanged local WOFF2 assets with verified Google Fonts provenance and OFL licenses', () => {
  const manifest = JSON.parse(readFileSync(resolve(fontsRoot, 'catalog-sources.json'), 'utf8')) as {
    fonts: { id: string; family: string; files: { file: string; source: string; sha256: string }[]; license: { file: string; source: string; sha256: string } }[];
  };
  assert.deepEqual(manifest.fonts.map(font => font.id), added);
  const css = readFileSync(resolve(fontsRoot, 'catalog.css'), 'utf8');
  assert.doesNotMatch(css, /https?:|@import|local\(/);
  for (const font of manifest.fonts) {
    assert.ok(css.includes(`font-family: '${font.family}'`));
    for (const asset of [...font.files, font.license]) {
      assert.match(asset.file, /^[a-zA-Z0-9-]+\.(woff2|txt)$/);
      const bytes = readFileSync(resolve(fontsRoot, asset.file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
      if (asset.file.endsWith('.woff2')) {
        assert.equal(bytes.subarray(0, 4).toString(), 'wOF2');
        assert.ok(bytes.length < 100000, 'Latin font subsets stay bounded');
        assert.match(asset.source, /^https:\/\/fonts\.gstatic\.com\//);
        assert.ok(css.includes(`/assets/storefront/fonts/${asset.file}`));
      } else {
        assert.match(bytes.toString(), /SIL OPEN FONT LICENSE Version 1\.1/i);
        assert.match(asset.source, /^https:\/\/raw\.githubusercontent\.com\/google\/fonts\/[a-f0-9]{40}\/ofl\//);
      }
    }
  }
  assert.equal((css.match(/font-display: swap/g) ?? []).length, manifest.fonts.reduce((sum, font) => sum + font.files.length, 0));
});

test('new font choices survive a draft reload but reach public styles only after publication', async () => {
  const { db } = contentDatabase(), published = new ContentSettings(db), drafts = new ContentDrafts(published, db);
  const draft = await drafts.get();
  draft.settings.appearance = parseAppearance({ backgroundColor: null, headingFont: 'lora', bodyFont: 'manrope' });
  await drafts.write({ settings: draft.settings, revision: 0, publishedRevision: 0 }, 'draft');
  assert.equal((await drafts.get()).settings.appearance.headingFont, 'lora');
  assert.equal(appearanceCss(appearanceSheet((await published.get()).settings)), '');
  await drafts.write({ settings: draft.settings, revision: 1, publishedRevision: 0 }, 'publish');
  const css = appearanceCss(appearanceSheet((await published.get()).settings));
  assert.match(css, /Lora/); assert.match(css, /Manrope/);
});
