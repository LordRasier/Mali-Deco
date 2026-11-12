import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProduct } from './catalog-validation';
import { parseListingQuery } from '../queries/listing-query';
import { productPredicate } from '../queries/listing-sql';
import { newBlock, parseLanding, legacyLanding } from '../../../shared/landing-layout';

test('featured is a strict opt-in flag and public results still require active nonarchived products', () => {
  const product = { name: 'Vase', slug: 'vase', description: '', status: 'draft' as const };
  for (const featured of [true, false]) assert.doesNotThrow(() => validateProduct({ ...product, featured }));
  for (const featured of ['true', 1, null]) assert.throws(() => validateProduct({ ...product, featured } as never), { status: 400 });
  const query = parseListingQuery({ featured: 'true' });
  assert.equal(query.featured, true);
  assert.match(productPredicate(query).sql, /p.featured = 1/);
  assert.match(productPredicate(query).sql, /p.status = 'active'.*p.archived_at IS NULL/);
  assert.doesNotMatch(productPredicate(parseListingQuery({})).sql, /featured/);
  for (const featured of [true, 'yes', '', ['true']]) assert.throws(() => parseListingQuery({ featured }), { status: 400 });
});

test('landing supports opt-in featured sources without changing legacy layouts', () => {
  const block = newBlock('products', 'featured'); block.props.mode = 'featured';
  assert.equal(parseLanding({ version: 1, blocks: [block] }).blocks[0].props.mode, 'featured');
  assert.equal(legacyLanding({}, true).blocks[1].props.mode, 'category');
});
