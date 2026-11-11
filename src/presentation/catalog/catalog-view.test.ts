import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogCards } from './catalog-view';

test('card summaries preserve the real description without duplicating it in the interactive bootstrap', () => {
  const product = { id: 'p', slug: 'p', name: 'P', description: '  A useful description.\nWith dimensions.  ', variants: [] };
  const card = catalogCards([product], false)[0];
  assert.equal(card.description, 'A useful description.\nWith dimensions.');
  assert.equal(JSON.parse(card.bootstrap).description, '');
  assert.equal(catalogCards([{ ...product, description: ' \n ' }], false)[0].description, '');
});
test('API cards preserve the explicitly identified fixture artwork without inventing images for other products', () => {
  const product = { id: 'fixture', slug: 'fixture', name: 'Fixture', description: '', variants: [] };
  const cards = catalogCards([product, { ...product, id: 'other' }], false, '/productos', 'fixture');
  assert.equal(cards[0].image, '/storefront/florero-ondas.webp'); assert.equal(cards[0].illustration, true);
  assert.equal(cards[1].image, ''); assert.equal(cards[1].illustration, false);
  const real = catalogCards([{ ...product, primaryImage: { id: '00000000-0000-4000-8000-000000000001', alt: '', width: 320, height: 320 } }], false, '/productos', 'fixture');
  assert.match(real[0].image, /^\/api\/v1\/catalog\/images\//); assert.equal(real[0].illustration, false);
});

test('variant metadata uses known color information without renaming a size or guessing a color', () => {
  const product = { id: 'p', slug: 'p', name: 'P', description: '', variants: [
    { id: 'large', name: 'Grande', priceMinor: 100, currency: 'ARS', colorInfo: { id: 'blue', slug: 'azul', name: 'Azul', hex: '#073cce' } },
  ] };
  const card = catalogCards([product], false)[0];
  assert.equal(card.variant, 'Grande'); assert.equal(card.variantLabel, 'Variante');
  assert.equal(card.variantHex, '#073cce'); assert.equal(card.variantColorName, 'Azul');
  const namedColor = catalogCards([{ ...product, variants: [{ ...product.variants[0], name: 'Azul' }] }], false)[0];
  assert.equal(namedColor.variantLabel, 'Color'); assert.equal(namedColor.variantColorName, '');
  const noColor = catalogCards([{ ...product, variants: [{ ...product.variants[0], colorInfo: null }] }], false)[0];
  assert.equal(noColor.variantHex, ''); assert.equal(noColor.variantLabel, 'Variante');
});

test('larger cards request only existing same-origin image widths and encode the identifier', () => {
  const product = { id: 'p', slug: 'p', name: 'P', description: '', variants: [],
    primaryImage: { id: 'unsafe/id?', alt: '', width: 800, height: 800 } };
  const card = catalogCards([product], false)[0];
  assert.equal(card.image, '/api/v1/catalog/images/unsafe%2Fid%3F?w=320');
  assert.equal(card.imageSrcset, '/api/v1/catalog/images/unsafe%2Fid%3F?w=320 320w, /api/v1/catalog/images/unsafe%2Fid%3F?w=800 800w');
  assert.equal(catalogCards([{ ...product, primaryImage: undefined }], false)[0].imageSrcset, '');
});

test('card carousel uses multiple photos independently of variant count and keeps the initial zoom aligned', () => {
  const images = [{ id: 'front', alt: 'Front', width: 800, height: 800 }, { id: 'back', alt: 'Back', width: 800, height: 800 }];
  const variant = { id: 'v1', name: 'Standard', priceMinor: 100, currency: 'ARS' };
  for (const variantCount of [0, 1, undefined]) {
    const product = { id: 'p', slug: 'p', name: 'P', description: '', images, primaryImage: images[1],
      variants: variantCount === 0 ? [] : [variant], variantCount };
    const card = catalogCards([product], false)[0];
    assert.equal(card.carousel, true, `Multiple photos with variantCount=${variantCount}`);
    assert.equal(card.gallery.length, 2);
    assert.equal(card.zoomImage, '/api/v1/catalog/images/front?w=1600');
    assert.equal(card.colorOptions.length, 0);
    for (const photos of [undefined, [], images.slice(0, 1)]) {
      assert.equal(catalogCards([{ ...product, images: photos }], false)[0].carousel, false);
    }
  }
});

test('multiple-variant cards retain their gallery and real colors map to real variants', () => {
  const product = { id: 'p', slug: 'p', name: 'P', description: '', variantCount: 2,
    images: [{ id: 'i1', alt: 'Front', width: 800, height: 800 }, { id: 'i2', alt: 'Back', width: 800, height: 800 }],
    primaryImage: { id: 'i1', alt: 'Front', width: 800, height: 800 }, variants: [
      { id: 'v1', name: 'Azul', priceMinor: 100, currency: 'ARS', colorInfo: { id: 'c1', slug: 'azul', name: 'Azul', hex: '#123456' } },
      { id: 'v2', name: 'Rojo', priceMinor: 200, currency: 'ARS', colorInfo: { id: 'c2', slug: 'rojo', name: 'Rojo', hex: '#ff0000' } },
    ] };
  const card = catalogCards([product], false)[0];
  assert.equal(card.carousel, true); assert.equal(card.gallery.length, 2);
  assert.deepEqual(card.colorOptions.map(option => option.href), ['/productos/p?variant=v1', '/productos/p?variant=v2']);
  assert.match(card.colorOptions[1].price, /2,00/);
  assert.equal(catalogCards([{ ...product, images: product.images.slice(0, 1) }], false)[0].carousel, false);
  const ambiguous = { ...product, variants: [product.variants[0], { ...product.variants[1], colorInfo: product.variants[0].colorInfo }] };
  assert.equal(catalogCards([ambiguous], false)[0].colorOptions.length, 0);
  assert.equal(catalogCards([{ ...product, variantCount: 3 }], false)[0].colorOptions.length, 0);
});
