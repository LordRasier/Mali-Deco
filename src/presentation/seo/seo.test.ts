import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultSiteConfig } from '../../modules/settings/site-config';
import { pageMetadata, publicCsp } from './metadata';
import { serializedJson, xmlText, publicOrigin } from './urls';
import { productSchema } from './product-schema';
import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { measurementLocation } from './client/measurement-location';
import { analyticsConsent } from './client/consent';

const config = { ...defaultSiteConfig(), publicSiteUrl: 'https://shop.example', analyticsMode: 'ga4' as const, ga4Id: 'G-TEST12345' };
test('SEO excludes filtered, unavailable, private and demo pages and keeps clean pagination', () => {
  const metadata = (view: string, model = {}, params = '', status = 200, env = { NODE_ENV: 'production' }) => pageMetadata(view, model, '/catalogo', new URLSearchParams(params), status, config, env);
  assert.equal(metadata('catalog', { defaultCurrency: 'ARS' }, 'page=3&currency=ARS&utm_source=instagram').canonical, 'https://shop.example/catalogo?page=3');
  assert.equal(metadata('catalog', { defaultCurrency: 'ARS' }, 'currency=USD').canonical, 'https://shop.example/catalogo?currency=USD');
  for (const params of ['search=florero', 'category=deco', 'sort=name_desc', 'color=rojo', 'material=pla']) { assert.equal(metadata('catalog', {}, params).noindex, true); assert.equal(metadata('catalog', {}, params).canonical, ''); }
  for (const view of ['admin', 'cart', 'checkout']) { assert.equal(metadata(view).analyticsId, ''); assert.equal(metadata(view).jsonLd, ''); assert.equal(metadata(view).noindex, true); }
  assert.equal(metadata('home', {}, '', 503).analyticsId, ''); assert.equal(metadata('home', { demo: true }).analyticsId, '');
  assert.equal(metadata('home', {}, '', 200, { NODE_ENV: 'development' }).analyticsId, '');
  assert.equal(metadata('home').analyticsId, 'G-TEST12345');
  assert.match(metadata('product', { ready: true, name: 'Florero', description: '  ' }).description, /Florero/);
  assert.equal(metadata('product', { ready: true, name: 'Florero', description: 'Descripción propia.' }).description, 'Descripción propia.');
  assert.equal(metadata('product', { ready: false, name: 'Ausente' }, '', 404).description, '');
  for (const model of [{ empty: true }, { currencyUnavailable: true }, { unpublished: true }, { noindex: true }]) assert.equal(metadata('catalog', model).noindex, true);
  assert.equal(publicOrigin('http://evil.example'), ''); assert.equal(publicOrigin('https://evil.example/path'), '');
});

test('JSON-LD remains non-executable and CSP permits only the configured measurement destinations', () => {
  const value = { name: '</script><script>alert(1)</script>&\u2028' }, json = serializedJson(value);
  assert.doesNotMatch(json, /<|>|&|\u2028/); assert.deepEqual(JSON.parse(json), value);
  assert.equal(xmlText('a&<"\'>'), 'a&amp;&lt;&quot;&apos;&gt;');
  assert.doesNotMatch(publicCsp('test', false), /google|unsafe/); assert.match(publicCsp('test', true), /nonce-test/); assert.doesNotMatch(publicCsp('test', true), /unsafe-inline|unsafe-eval/);
});

test('structured offers use exact minor units, real inventory and no fabricated reviews', () => {
  const product = { id: 'p', slug: 'florero', name: 'Florero', description: 'Real', images: [], total: 2, variants: [
    { id: 'v1', name: 'Rojo', priceMinor: 12345, currency: 'ARS', supplyMode: 'stock', stockQuantity: 0, material: null, color: { id: 'c1', name: 'Rojo', slug: 'rojo', hex: '#ff0000' } },
    { id: 'v2', name: 'Azul', priceMinor: 99999, currency: 'ARS', supplyMode: 'made_to_order', stockQuantity: 0, material: null, color: { id: 'c2', name: 'Azul', slug: 'azul', hex: '#0000ff' } },
  ] } as unknown as Awaited<ReturnType<PublicCatalog['detail']>>;
  const json = JSON.stringify(productSchema(product, 'https://shop.example', 'Mali'));
  assert.match(json, /ProductGroup/); assert.match(json, /"price":"123.45"/); assert.match(json, /OutOfStock/);
  assert.doesNotMatch(json, /PreOrder|InStock|AggregateOffer|aggregateRating|review|gtin/);
  const generic = { ...product, variants: product.variants.map(v => ({ ...v, color: null })) };
  const selected = JSON.stringify(productSchema(generic, 'https://shop.example', 'Mali', 'v2'));
  assert.doesNotMatch(selected, /ProductGroup|123.45/); assert.match(selected, /999.99/);
});

test('consent expires and storage failure is safe; measurement keeps only non-sensitive campaign labels', () => {
  let raw: string | null = null, now = 1;
  const consent = analyticsConsent({ getItem: () => raw, setItem: (_k, value) => { raw = value; } }, 'test', () => now);
  assert.equal(consent.read(), null); consent.save('accepted'); assert.equal(consent.read(), 'accepted'); now += 181 * 86400000; assert.equal(consent.read(), null);
  raw = 'bad json'; assert.equal(consent.read(), null);
  const broken = analyticsConsent({ getItem() { throw Error(); }, setItem() { throw Error(); } }, 'test'); assert.equal(broken.read(), null); broken.save('rejected');
  assert.equal(measurementLocation('https://shop.example/catalogo?utm_source=instagram&utm_campaign=verano-2026&search=private&email=private&gclid=id#secret'), 'https://shop.example/catalogo?utm_source=instagram&utm_campaign=verano-2026');
  assert.equal(measurementLocation('https://shop.example/?utm_term=person%40example.com&utm_source=a&utm_source=b'), 'https://shop.example/');
});
