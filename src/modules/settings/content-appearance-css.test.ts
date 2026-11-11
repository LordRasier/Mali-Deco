import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultContentConfig } from './content-config';
import { appearanceSheet, appearanceCss, parseAppearanceSheet, previewAppearanceHref } from './content-appearance';

test('neutral appearance emits no overrides and custom styles target only their own section', () => {
  const config = defaultContentConfig();
  assert.equal(appearanceCss(appearanceSheet(config)), '');
  config.appearance = { backgroundColor: '#f0e8d8', headingFont: 'georgia', bodyFont: 'arial' };
  config.landing.blocks[0].style.backgroundColor = '#102030';
  const css = appearanceCss(appearanceSheet(config));
  assert.match(css, /background:#f0e8d8/);
  assert.match(css, /font-family:Georgia,Times New Roman,serif/);
  assert.match(css, /--store-font:Arial,Helvetica,sans-serif/);
  assert.match(css, /data-landing-id="home-hero"/);
  assert.match(css, /--section-text:#ffffff/);
  assert.doesNotMatch(css, /home-about|home-collection|url\(|@import|!important/);
  const url = new URL(previewAppearanceHref(config), 'https://shop.example');
  assert.deepEqual(parseAppearanceSheet(url.searchParams.get('design')), appearanceSheet(config));
  assert.doesNotMatch(url.href, /Tu%20pr|description|title/);
});

test('preview stylesheet payload is bounded and rejects selector, font and declaration injection', () => {
  const sheet = appearanceSheet(defaultContentConfig());
  for (const bad of [null, '{}', 'not-json', JSON.stringify({ ...sheet, extra: true }), JSON.stringify({ ...sheet, sections: [['x"]{body{display:none}', '#ffffff', null]] }),
    JSON.stringify({ ...sheet, sections: [['valid', '#000000;}', null]] }), JSON.stringify({ ...sheet, sections: [['same', null, null], ['same', null, null]] }),
    JSON.stringify({ ...sheet, sections: Array.from({ length: 41 }, (_, n) => ['id-' + n, null, null]) }), ' '.repeat(8001)]) {
    assert.throws(() => parseAppearanceSheet(bad));
  }
});
