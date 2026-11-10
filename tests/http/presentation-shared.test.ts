import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCatalogQuery } from '../../src/presentation/catalog/shared/catalog-query';
import { parseCatalogQuery as webQuery } from '../../src/presentation/shared/catalog/catalog-query';
import { demoCatalog } from '../../src/presentation/catalog/shared/demo-catalog';
import { demoCatalog as webDemo } from '../../src/presentation/shared/catalog/demo-catalog';
import { formatPrice } from '../../src/presentation/catalog/shared/cart';
import { formatPrice as webPrice } from '../../src/presentation/shared/cart/cart';

test('temporary web exports use the same canonical presentation rules and demo data', () => {
  assert.equal(webQuery, parseCatalogQuery); assert.equal(webDemo, demoCatalog); assert.equal(webPrice, formatPrice);
});
