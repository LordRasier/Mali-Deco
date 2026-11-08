import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
const assets = [
  'presentation/cart/views/cart.hbs', 'presentation/cart/public/cart.css', 'presentation/cart/public/generated/cart.js',
  'presentation/cart/views/partials/cart-panel.hbs', 'presentation/catalog/views/catalog.hbs', 'presentation/catalog/public/catalog.css',
  'presentation/catalog/views/partials/filters.hbs',
  'presentation/catalog/views/partials/card.hbs', 'presentation/catalog/views/partials/info.hbs',
  'presentation/products/views/product.hbs', 'presentation/products/public/product.css',
  'presentation/home/views/home.hbs', 'presentation/home/public/home.css',
  'presentation/information/views/shipping-returns.hbs', 'presentation/information/views/information-page.hbs', 'presentation/information/public/information.css',
  'presentation/shell/views/header.hbs', 'presentation/shell/views/footer.hbs', 'presentation/shell/public/shell.css',
  ...['figtree-variable.woff2', 'dm-mono-regular.woff2', 'dm-mono-medium.woff2', 'OFL-Figtree.txt', 'OFL-DMMono.txt', 'README.md'].map(file => `presentation/shell/public/fonts/${file}`),
  'presentation/admin/views/admin.hbs', 'presentation/admin/views/admin-section.hbs', 'presentation/admin/public/admin.css',
  'presentation/admin/public/generated/admin.js', 'presentation/admin/public/generated/admin.css',
  'presentation/checkout/views/checkout.hbs', 'presentation/checkout/public/checkout.css',
  'presentation/admin/views/admin-products-list.hbs', 'presentation/admin/views/admin-product-form.hbs', 'presentation/admin/views/admin-product-detail.hbs',
  'presentation/admin/views/admin-settings.hbs', 'presentation/admin/views/admin-orders-list.hbs', 'presentation/admin/views/admin-order-detail.hbs',
  'presentation/admin/views/admin-product-images.hbs',
  'presentation/admin/views/admin-variant-form.hbs', 'presentation/admin/views/admin-classifications-list.hbs', 'presentation/admin/views/admin-classification-form.hbs',
  ...['florero-ondas.webp', 'hero-3d-objects-960.webp', 'hero-3d-objects.webp', 'maceta-geometrica.webp', 'organizador-arco.webp'].map(file => `presentation/home/public/generated/storefront/${file}`),
];
function fixture(run: (root: string) => void, omitted?: string) {
  const root = mkdtempSync(join(tmpdir(), 'mali-view-assets-'));
  try {
    mkdirSync(join(root, 'scripts'));
    copyFileSync(resolve(__dirname, '../../scripts/copy-view-assets.mjs'), join(root, 'scripts/copy-view-assets.mjs'));
    for (const asset of assets) {
      if (asset === omitted) continue;
      const file = join(root, 'src', asset);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `synthetic:${asset}`);
    }
    run(root);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  }
}
test('build copies only declared view assets without packaging adjacent files', () => {
  fixture(root => {
    writeFileSync(join(root, 'src/presentation/cart/public/.env'), 'synthetic-not-a-secret');
    writeFileSync(join(root, 'src/presentation/cart/public/probe.test.ts'), 'synthetic test');
    const result = spawnSync(process.execPath, ['scripts/copy-view-assets.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const files = readdirSync(join(root, 'dist'), { recursive: true })
      .map(String).filter(file => statSync(join(root, 'dist', file)).isFile()).map(file => file.replaceAll('\\', '/')).sort();
    assert.deepEqual(files, [...assets].sort());
    for (const asset of assets) assert.equal(readFileSync(join(root, 'dist', asset), 'utf8'), `synthetic:${asset}`);
    assert.equal(existsSync(join(root, 'dist/presentation/cart/public/.env')), false);
  });
});
test('build fails when a required template is missing', () => {
  fixture(root => {
    const result = spawnSync(process.execPath, ['scripts/copy-view-assets.mjs'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENOENT/);
  }, 'presentation/shell/views/header.hbs');
});
