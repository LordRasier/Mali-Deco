import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CartPage } from './cart-page';

test('cart renders its recovery surface even when branding is unavailable', async () => {
  const page = new CartPage({ settings: async () => { throw Error('private failure'); } }, 'api');
  const model = await page.read(); assert.equal(model.brand, 'Tienda'); assert.equal(model.mode, 'api');
  assert.doesNotMatch(JSON.stringify(model), /private failure/);
});
test('cart preserves the configured brand in the API catalog', async () => {
  const catalog = { settings: async () => ({ name: 'Configured brand' }) };
  assert.equal((await new CartPage(catalog, 'api').read()).brand, 'Configured brand');
});
