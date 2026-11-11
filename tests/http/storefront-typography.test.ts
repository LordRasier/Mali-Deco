import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

test('public storefront retains a readable sans fallback without serif overrides', () => {
  const read = (path: string) => readFileSync(resolve(__dirname, '../../src/presentation', path), 'utf8');
  const shared = read('cart/public/cart.css');
  assert.match(shared, /--store-font:\s*"Helvetica Neue",\s*Helvetica,\s*Arial,\s*sans-serif/);
  assert.match(shared, /body\s*\{[^}]*font:\s*1rem\/1\.6\s+var\(--store-font\)/);
  for (const file of ['home/public/home.css', 'catalog/public/catalog.css', 'products/public/product.css', 'shell/public/shell.css']) {
    const css = read(file); assert.doesNotMatch(css, /Georgia|Times New Roman|font-family:\s*system-ui/i, file);
  }
});

test('storefront pairs locally hosted Figtree and DM Mono without external font requests', () => {
  const css = readFileSync(resolve(__dirname, '../../src/presentation/shell/public/shell.css'), 'utf8');
  const faces = css.match(/@font-face\s*\{[^}]+\}/g) ?? [];
  assert.equal(faces.length, 3);
  assert.match(faces[0], /font-family: 'Figtree'/);
  assert.match(faces[0], /font-weight: 300 900/);
  assert.match(faces[1], /font-family: 'DM Mono'/);
  assert.match(faces[2], /font-family: 'DM Mono'/);
  for (const face of faces) {
    assert.match(face, /font-display: swap/);
    assert.match(face, /url\('\/assets\/storefront\/fonts\/[a-z0-9-]+\.woff2'\) format\('woff2'\)/);
  }
  assert.match(css, /--font-primary:\s*'Figtree'/);
  assert.match(css, /--font-mono:\s*'DM Mono'/);
  assert.match(css, /--store-font:\s*var\(--font-primary\)/);
  assert.match(css, /\.catalog-price[^}]+font-family: var\(--font-mono\)/);
  assert.ok(css.startsWith("@import url('/assets/storefront/fonts/catalog.css');"));
  assert.equal((css.match(/@import/g) ?? []).length, 1);
  assert.doesNotMatch(css, /https?:\/\//);
  const admin = readFileSync(resolve(__dirname, '../../src/presentation/admin/public/admin.css'), 'utf8');
  assert.ok(admin.includes("@import url('/assets/storefront/fonts/catalog.css');"), 'Editor samples share the public local font definitions');
});
