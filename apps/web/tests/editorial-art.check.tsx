import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Hero } from '../src/components/Hero';
import { ProductCard } from '../src/components/ProductCard';
import { fixtureImageId, productPresentation } from '../src/lib/editorial-art';

const hero = renderToStaticMarkup(createElement(Hero, {}));
assert.match(hero, /hero-3d-objects\.webp/);
assert.match(hero, /hero-3d-objects-960\.webp/);

const product = { id: 'fixture-123', slug: 'florero-ondas', name: 'Florero Ondas', description: '', variants: [] };
assert.equal(fixtureImageId({ NODE_ENV: 'production', DEV_FIXTURE_PRODUCT_ID: product.id }), undefined);
assert.equal(fixtureImageId({ NODE_ENV: 'development', DEV_FIXTURE_PRODUCT_ID: product.id }), product.id);
assert.equal(productPresentation(product, 'api').image, undefined);
assert.equal(productPresentation({ ...product, id: 'real-product' }, 'api', product.id).image, undefined);
const illustration = productPresentation(product, 'api', product.id);
assert.equal(illustration.image, '/storefront/florero-ondas.webp');
assert.equal(illustration.illustration, true);
const html = renderToStaticMarkup(createElement(ProductCard, { product, demo: false, fixtureImageId: product.id }));
assert.match(html, /florero-ondas\.webp/);
assert.match(html, /Imagen ilustrativa/);
const neutral = renderToStaticMarkup(createElement(ProductCard, { product, demo: false }));
assert.match(neutral, /image-placeholder/);
assert.doesNotMatch(neutral, /florero-ondas\.webp/);
const real = productPresentation({ ...product, image: '/real.webp' }, 'api', product.id);
assert.equal(real.image, '/real.webp');
assert.equal(real.illustration, false);
