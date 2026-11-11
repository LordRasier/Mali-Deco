/* Run with the same Playwright environment as landing-builder.test.cjs. No live data or writes. */
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname, document, URL */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { build } = require('esbuild'), { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright-core');
const { catalogCards } = require('../../src/presentation/catalog/catalog-view.ts');
const { createViewEngine } = require('../../src/presentation/view-engine.ts');
const { defaultContentConfig } = require('../../src/modules/settings/content-config.ts');
const root = path.resolve(__dirname, '../..'), read = name => fs.readFileSync(path.join(root, name));

test('single-variant product photos cycle and zoom on desktop and mobile without changing the variant', { timeout: 60000 }, async () => {
  const artifacts = path.join(root, 'artifacts/carousel-fix'); fs.mkdirSync(artifacts, { recursive: true });
  const images = ['front', 'back'].map(id => ({ id, alt: id, width: 800, height: 800 }));
  const product = { id: 'p', slug: 'piece', name: 'Piece', description: '', images, primaryImage: images[0], variantCount: 1,
    variants: [{ id: 'v1', name: 'Standard', priceMinor: 100, currency: 'ARS' }] };
  const cards = catalogCards([product, { ...product, id: 'single', slug: 'single', images: images.slice(0, 1) }], false);
  const engine = createViewEngine({ seo_head: '', site_header: '', site_footer: '', cart_panel: '', catalog_filters: '',
    catalog_card: read('src/presentation/catalog/views/partials/card.hbs').toString(),
    catalog_info: read('src/presentation/catalog/views/partials/info.hbs').toString() });
  const config = defaultContentConfig();
  const html = await new Promise((resolve, reject) => engine.__express(path.join(root, 'src/presentation/catalog/views/catalog.hbs'), {
    layout: false, brand: 'Test', mode: 'api', cards, copy: config.copy, listing: config.listing,
    resultLabel: '2 objetos', page: 1, pages: 1, routes: { home: '/', catalog: '/catalogo', product: '/productos', cart: '/carrito' },
  }, (error, body) => error ? reject(error) : resolve(body)));
  const bundle = await build({ stdin: { contents: `
    import { mountCatalogGalleries } from './src/presentation/catalog/client/browser/catalog-gallery';
    import { mountCatalogZoom } from './src/presentation/catalog/client/browser/catalog-zoom';
    const zoom = mountCatalogZoom(); mountCatalogGalleries(document, zoom.update);
  `, resolveDir: root }, bundle: true, write: false, platform: 'browser', target: 'es2022' });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(5000);
    const errors = [], external = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url()), p = url.pathname;
      if (url.origin !== 'https://gallery.test') { external.push(url.href); return route.abort(); }
      const respond = (body, contentType) => route.fulfill({ status: 200, body, contentType });
      if (p === '/catalogo') return respond(html, 'text/html');
      if (p === '/assets/storefront/generated/cart.js') return respond(bundle.outputFiles[0].text, 'text/javascript');
      const css = { '/assets/storefront/cart.css': 'cart', '/assets/storefront/catalog.css': 'catalog', '/assets/storefront/shell.css': 'shell' }[p];
      if (css) return respond(read(`src/presentation/${css}/public/${css}.css`), 'text/css');
      if (p.startsWith('/assets/storefront/fonts/')) return respond(read('src/presentation/shell/public/fonts/' + path.basename(p)), p.endsWith('.css') ? 'text/css' : 'font/woff2');
      if (p.startsWith('/api/v1/catalog/images/') || p.startsWith('/api/v1/catalog/branding/')) return respond(read('src/presentation/home/public/generated/storefront/' + (p.includes('/back') ? 'organizador-arco' : 'florero-ondas') + '.webp'), 'image/webp');
      if (p === '/api/v1/catalog/theme.css') return respond('', 'text/css');
      return route.fulfill({ status: 404, body: '' });
    });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('https://gallery.test/catalogo');
      const card = page.locator('[data-catalog-card]').first(), photos = card.locator('[data-card-image]');
      assert.equal(await photos.count(), 2, 'Both photos are rendered for a single variant');
      const selectedLink = await card.locator('[data-card-link]').getAttribute('href');
      const show = async (index) => {
        try {
          await photos.nth(index).waitFor({ state: 'visible' });
          await photos.nth(1 - index).waitFor({ state: 'hidden' });
        } catch (error) {
          error.message += '\nGallery state: ' + JSON.stringify(await card.evaluate(card => ({
            position: card.querySelector('[data-card-position]').textContent,
            images: [...card.querySelectorAll('[data-card-image]')].map(image => ({ src: image.currentSrc, hidden: image.hidden, loaded: image.complete, width: image.naturalWidth })),
          })));
          await page.screenshot({ path: path.join(artifacts, `failure-${width}.png`), fullPage: true }); throw error;
        }
        await page.waitForFunction(() => [...document.querySelectorAll('[data-card-image]:not([hidden])')].every(image => image.complete && image.naturalWidth > 0));
        assert.equal(await card.locator('[data-card-position]').textContent(), `Imagen ${index + 1} de 2`);
        assert.equal(await card.locator('[data-card-zoom]').getAttribute('href'), `/api/v1/catalog/images/${images[index].id}?w=1600`);
      };
      await show(0);
      await card.locator('[data-card-next]').click(); await show(1);
      await card.locator('[data-card-zoom]').click();
      await page.locator('[data-zoom-dialog]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-zoom-image]').getAttribute('src'), 'https://gallery.test/api/v1/catalog/images/back?w=1600');
      await page.locator('[data-zoom-close]').click();
      await page.locator('[data-zoom-dialog]').waitFor({ state: 'hidden' });
      await card.locator('[data-card-next]').click(); await show(0);
      await card.locator('[data-card-previous]').focus(); await page.keyboard.press('Enter'); await show(1);
      assert.equal(await card.locator('[data-card-link]').getAttribute('href'), selectedLink);
      assert.equal(await page.locator('[data-catalog-card]').nth(1).locator('[data-card-controls]').count(), 0);
      await page.screenshot({ path: path.join(artifacts, `gallery-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser.close(); }
});
