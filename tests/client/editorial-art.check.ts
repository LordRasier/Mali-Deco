import assert from 'node:assert/strict';
import { renderCards, renderStorefront } from './support/storefront-view';
import { fixtureImageId, productPresentation } from '../../src/presentation/shared/catalog/editorial-art';

async function main() {
const hero = await renderStorefront('home', { brand: 'Synthetic', mode: 'api', cards: [] });
assert.match(hero, /src="\/api\/v1\/catalog\/branding\/hero"/);
assert.match(hero, /src="\/api\/v1\/catalog\/branding\/about"/);

const product = { id: 'fixture-123', slug: 'florero-ondas', name: 'Florero Ondas', description: '', variants: [] };
assert.equal(fixtureImageId({ NODE_ENV: 'production', DEV_FIXTURE_PRODUCT_ID: product.id }), undefined);
assert.equal(fixtureImageId({ NODE_ENV: 'development', DEV_FIXTURE_PRODUCT_ID: product.id }), product.id);
assert.equal(productPresentation(product, 'api').image, undefined);
assert.equal(productPresentation({ ...product, id: 'real-product' }, 'api', product.id).image, undefined);
const illustration = productPresentation(product, 'api', product.id);
assert.equal(illustration.image, '/storefront/florero-ondas.webp');
assert.equal(illustration.illustration, true);
const html = await renderCards([product], false, product.id);
assert.match(html, /florero-ondas\.webp/);
assert.match(html, /Imagen ilustrativa/);
const neutral = await renderCards([product], false);
assert.match(neutral, /Imagen no disponible/);
assert.doesNotMatch(neutral, /florero-ondas\.webp/);
const real = productPresentation({ ...product, primaryImage: { id: '12345678-1234-4123-8123-123456789abc', alt: 'Real', width: 800, height: 800 } }, 'api', product.id);
assert.equal(real.image, '/api/v1/catalog/images/12345678-1234-4123-8123-123456789abc?w=320');
assert.equal(real.illustration, false);

}
main().catch(error => { globalThis.console.error(error); globalThis.process.exitCode = 1; });
