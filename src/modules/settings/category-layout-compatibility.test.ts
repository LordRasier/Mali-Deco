import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultContentConfig } from './content-config';
import { normalizeSections, parseContentConfig, parseStoredContentConfig } from './content-validation';
import { newBlock } from '../../shared/landing-layout';

test('existing category blocks, including nested ones, retain text, order and visibility when upgraded', () => {
  const config = normalizeSections(defaultContentConfig()), box = newBlock('container', 'box'), category = newBlock('categories', 'cat');
  category.props.title = 'Mis categorías'; category.props.categoryIds = ['two', 'one']; category.enabled = false;
  delete category.props.cardStyle; delete category.props.textPosition; box.columns[1].blocks.push(category); config.landing.blocks.push(box);
  const raw = JSON.stringify(config), upgraded = parseStoredContentConfig(config), actual = upgraded.landing.blocks[3].columns[1].blocks[0];
  assert.equal(actual.props.cardStyle, 'icons'); assert.equal(actual.props.textPosition, 'below');
  assert.equal(actual.props.title, category.props.title); assert.deepEqual(actual.props.categoryIds, ['two', 'one']); assert.equal(actual.enabled, false);
  assert.equal(JSON.stringify(config), raw); assert.deepEqual(upgraded.copy, config.copy);
  actual.props.cardStyle = 'unsupported'; assert.throws(() => parseContentConfig(upgraded));
  assert.throws(() => parseStoredContentConfig(upgraded));
});
