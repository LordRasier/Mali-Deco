import { copyFileSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Explicit allowlist: never copy arbitrary neighboring files into the HTTP asset root.
const assets = [
  'presentation/seo/views/head.hbs', 'presentation/seo/public/analytics.css', 'presentation/seo/public/generated/analytics.js',
  'presentation/cart/views/cart.hbs',
  'presentation/cart/public/cart.css',
  'presentation/cart/public/generated/cart.js',
  'presentation/cart/views/partials/cart-panel.hbs',
  'presentation/catalog/views/catalog.hbs',
  'presentation/catalog/public/catalog.css',
  'presentation/catalog/views/partials/filters.hbs',
  'presentation/catalog/views/partials/card.hbs', 'presentation/catalog/views/partials/info.hbs',
  'presentation/products/views/product.hbs',
  'presentation/products/public/product.css',
  'presentation/home/views/home.hbs', 'presentation/home/public/home.css',
  'presentation/information/views/shipping-returns.hbs', 'presentation/information/views/information-page.hbs', 'presentation/information/public/information.css',
  'presentation/shell/views/header.hbs', 'presentation/shell/views/footer.hbs', 'presentation/shell/public/shell.css',
  ...['figtree-variable.woff2', 'dm-mono-regular.woff2', 'dm-mono-medium.woff2', 'OFL-Figtree.txt', 'OFL-DMMono.txt', 'README.md'].map(file => `presentation/shell/public/fonts/${file}`),
  'presentation/admin/views/admin.hbs', 'presentation/admin/views/admin-section.hbs', 'presentation/admin/public/admin.css',
  'presentation/admin/views/admin-content-editor.hbs', 'presentation/admin/public/content-preview.css', 'presentation/information/views/partials/body.hbs',
  'presentation/admin/public/generated/admin.js', 'presentation/admin/public/generated/admin.css',
  'presentation/checkout/views/checkout.hbs', 'presentation/checkout/public/checkout.css',
  'presentation/admin/views/admin-products-list.hbs', 'presentation/admin/views/admin-product-form.hbs', 'presentation/admin/views/admin-product-detail.hbs',
  'presentation/admin/views/admin-settings.hbs', 'presentation/admin/views/admin-orders-list.hbs', 'presentation/admin/views/admin-order-detail.hbs',
  'presentation/admin/views/admin-product-images.hbs',
  'presentation/admin/views/admin-variant-form.hbs', 'presentation/admin/views/admin-classifications-list.hbs', 'presentation/admin/views/admin-classification-form.hbs',
  ...['florero-ondas.webp', 'hero-3d-objects-960.webp', 'hero-3d-objects.webp', 'maceta-geometrica.webp', 'organizador-arco.webp'].map(file => `presentation/home/public/generated/storefront/${file}`),
];
for (const asset of assets) {
  const source = join(root, 'src', asset);
  const destination = join(root, 'dist', asset);
  if (!lstatSync(source).isFile()) throw new Error(`View asset must be a regular file: ${asset}`);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}
globalThis.console.log(`Copied ${assets.length} presentation assets.`);
