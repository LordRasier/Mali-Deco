import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');
test('every public page loads safe external theme CSS and home uses configurable art', () => {
  for (const path of ['home/views/home.hbs', 'catalog/views/catalog.hbs', 'products/views/product.hbs', 'cart/views/cart.hbs', 'checkout/views/checkout.hbs']) {
    assert.match(read(path), /href="\/api\/v1\/catalog\/theme.css"/);
  }
  const home = read('home/views/home.hbs');
  assert.match(home, /src="\/api\/v1\/catalog\/branding\/hero"/);
  assert.match(home, /src="\/api\/v1\/catalog\/branding\/about"/);
  assert.doesNotMatch(home, /srcset="\/storefront\/hero/);
});
test('admin offers primary color and landing uploads and drawer omits the cart-page CTA', () => {
  const admin = read('admin/views/admin-settings.hbs');
  assert.match(admin, /type="color"[^>]*data-settings-color/);
  for (const kind of ['hero', 'about']) assert.ok(admin.includes(`data-brand-form="${kind}"`));
  assert.doesNotMatch(read('cart/views/partials/cart-panel.hbs'), /data-cart-view|Ver carrito/);
});

test('photo dialog overrides the shared drawer geometry and supports keyboard panning', () => {
  const css = read('catalog/public/catalog.css');
  assert.match(css, /\.catalog-zoom-dialog\s*\{[^}]*margin: auto;[^}]*height: fit-content;/);
  assert.match(read('catalog/views/partials/info.hbs'), /data-zoom-viewport tabindex="0"/);
});

test('the optional checkout uses the same primary tokens without enabling it', () => {
  const css = read('checkout/public/checkout.css');
  assert.match(css, /--checkout-blue: var\(--primary-ink/);
  assert.match(css, /background: var\(--blue\); color: var\(--on-primary\)/);
});
