/* Isolated browser verification: no social accounts, external requests or live data. */
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname, document, window, navigator, URL, URLSearchParams, DOMException */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { build } = require('esbuild'), { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright-core');
const { CatalogPage } = require('../../src/presentation/catalog/catalog-page.ts');
const { createViewEngine } = require('../../src/presentation/view-engine.ts');
const { defaultContentConfig } = require('../../src/modules/settings/content-config.ts');
const { defaultSiteConfig } = require('../../src/modules/settings/site-config.ts');
const { pageMetadata } = require('../../src/presentation/seo/metadata.ts');
const root = path.resolve(__dirname, '../..'), read = file => fs.readFileSync(path.join(root, file));

test('sharing focuses the product, offers WhatsApp and handles Instagram, copying, cancellation and denied clipboard', { timeout: 60000 }, async () => {
  const output = path.join(root, 'artifacts/product-sharing'); fs.mkdirSync(output, { recursive: true });
  const photo = { id: 'photo', alt: 'Florero', width: 800, height: 800 };
  const product = { id: 'shared', slug: 'florero', name: 'Florero Ondas', description: 'Una pieza para tu casa.', images: [photo], primaryImage: photo,
    category: null, variantCount: 1, priceRange: null, matchedVariant: { id: 'v', name: 'Azul', priceMinor: 5000, currency: 'ARS', material: null, color: null } };
  const listing = items => ({ items, page: 1, limit: 24, total: items.length });
  const pageModel = new CatalogPage({ settings: async () => ({ name: 'Mali' }), list: async () => listing([{ ...product, id: 'other', slug: 'otro' }]), selected: async () => listing([product]) },
    { get: async () => ({ categories: [], materials: [], colors: [], currencies: ['ARS'], priceRange: null, truncated: {} }) }, 'api');
  const content = defaultContentConfig(), { model } = await pageModel.read(new URLSearchParams('articulo=shared'));
  const seo = pageMetadata('catalog', model, '/catalogo', new URLSearchParams('articulo=shared'), 200, { ...defaultSiteConfig(), publicSiteUrl: 'https://share.test' }, { NODE_ENV: 'production' });
  const engine = createViewEngine({ seo_head: read('src/presentation/seo/views/head.hbs').toString(), site_header: '', site_footer: '', cart_panel: '', catalog_filters: '',
    catalog_card: read('src/presentation/catalog/views/partials/card.hbs').toString(), catalog_info: read('src/presentation/catalog/views/partials/info.hbs').toString() });
  const html = await new Promise((resolve, reject) => engine.__express(path.join(root, 'src/presentation/catalog/views/catalog.hbs'), { ...model, layout: false, copy: content.copy, listing: content.listing, seo }, (error, html) => error ? reject(error) : resolve(html)));
  const bundle = await build({ stdin: { contents: `import { mountCatalogSharing } from './src/presentation/catalog/client/browser/catalog-sharing'; import { mountCatalogGalleries } from './src/presentation/catalog/client/browser/catalog-gallery'; import { mountCatalogZoom } from './src/presentation/catalog/client/browser/catalog-zoom'; const zoom = mountCatalogZoom(); mountCatalogGalleries(document, zoom.update); mountCatalogSharing();`, resolveDir: root }, bundle: true, write: false, platform: 'browser', target: 'es2022' });
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }); page.setDefaultTimeout(7000);
    const errors = [], external = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.copied = []; window.shared = []; window.copyDenied = false; window.shareCancelled = false; window.shareFailed = false;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { if (window.copyDenied) throw Error('Denied'); window.copied.push(text); } } });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { if (window.shareCancelled) throw new DOMException('Cancelled', 'AbortError'); if (window.shareFailed) throw new DOMException('Denied', 'NotAllowedError'); window.shared.push(data); } });
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url()), p = url.pathname;
      if (url.origin !== 'https://share.test') { external.push(url.href); return route.abort(); }
      const send = (body, contentType) => route.fulfill({ status: 200, body, contentType });
      if (p === '/catalogo') return send(html, 'text/html');
      if (p === '/assets/storefront/generated/cart.js') return send(bundle.outputFiles[0].text, 'text/javascript');
      const css = { '/assets/storefront/cart.css': 'cart', '/assets/storefront/catalog.css': 'catalog', '/assets/storefront/shell.css': 'shell' }[p];
      if (css) return send(read(`src/presentation/${css}/public/${css}.css`), 'text/css');
      if (p.startsWith('/assets/storefront/fonts/')) return send(read('src/presentation/shell/public/fonts/' + path.basename(p)), p.endsWith('.css') ? 'text/css' : 'font/woff2');
      if (p.startsWith('/api/v1/catalog/images/') || p.startsWith('/api/v1/catalog/branding/')) return send(read('src/presentation/home/public/generated/storefront/florero-ondas.webp'), 'image/webp');
      if (p === '/api/v1/catalog/theme.css') return send('', 'text/css');
      return route.fulfill({ status: 404, body: '' });
    });
    const expected = 'https://share.test/catalogo?articulo=shared#producto-shared';
    for (const width of [1280, 390, 320]) {
      // A fragment URL can reuse the document; each viewport needs fresh capability mocks.
      await page.goto('about:blank');
      await page.setViewportSize({ width, height: 900 }); await page.goto(expected);
      const card = page.locator('[data-shared-product]'), menu = card.locator('[data-product-share]');
      assert.equal(await card.evaluate(card => document.activeElement === card), true);
      assert.equal(await page.locator('dialog[open]').count(), 0);
      const box = await card.boundingBox(); assert.ok(box.y >= 0 && box.y < 150, 'The product is in focus below the header');
      assert.equal(await menu.evaluate(menu => menu.open), false);
      await menu.locator('summary').click();
      assert.equal(await menu.evaluate(menu => menu.open), true);
      await page.screenshot({ path: path.join(output, `menu-${width}.png`), fullPage: true });
      assert.equal(await page.locator('[data-zoom-dialog]').evaluate(dialog => dialog.open), false, 'Sharing never opens the photo zoom');
      const href = new URL(await menu.locator('[data-share-whatsapp]').getAttribute('href'));
      assert.equal(href.origin, 'https://wa.me'); assert.equal(href.searchParams.get('text'), product.name + '\n' + expected);
      await menu.locator('[data-share-copy]').click(); assert.equal(await page.evaluate(() => window.copied.at(-1)), expected);
      await menu.locator('[data-share-instagram]').click(); assert.equal(await page.evaluate(() => window.shared.at(-1).url), expected);
      await page.evaluate(() => { window.shareCancelled = true; }); await menu.locator('[data-share-instagram]').click();
      assert.equal(await menu.locator('[data-share-fallback]').isVisible(), false, 'Cancel is not an error or an unsolicited copy');
      await page.evaluate(() => { window.shareCancelled = false; window.shareFailed = true; }); await menu.locator('[data-share-instagram]').click();
      assert.equal(await menu.locator('[data-share-url]').inputValue(), expected);
      assert.equal(await menu.locator('[data-share-url]').evaluate(input => document.activeElement === input && input.selectionEnd === input.value.length), true);
      await page.keyboard.press('Escape'); assert.equal(await menu.evaluate(menu => menu.open), false);
      assert.equal(await menu.locator('summary').evaluate(summary => document.activeElement === summary), true);
      await menu.locator('summary').click();
      await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); });
      await menu.locator('[data-share-instagram]').click(); assert.match(await menu.locator('[data-share-status]').textContent(), /Enlace copiado/);
      await page.evaluate(() => { window.copyDenied = true; }); await menu.locator('[data-share-copy]').click();
      assert.equal(await menu.locator('[data-share-url]').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.screenshot({ path: path.join(output, `share-${width}.png`), fullPage: true });
    }
    await page.goto('https://share.test/catalogo?articulo=shared');
    assert.equal(await page.locator('[data-shared-product]').evaluate(card => document.activeElement === card), true, 'Fragment stripping does not lose the target');
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } catch (error) {
    if (page) {
      const state = await page.locator('[data-product-share]').evaluateAll(menus => menus.map(menu => ({
        open: menu.open, actionsHidden: menu.querySelector('[data-share-actions]').hidden,
        menu: menu.getBoundingClientRect().toJSON(), panel: menu.querySelector('.catalog-share-panel').getBoundingClientRect().toJSON(),
      })));
      fs.writeFileSync(path.join(output, 'failure-state.json'), JSON.stringify(state, null, 2));
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    }
    throw error;
  } finally { await browser.close(); }
});
