/* Run with the same Playwright environment as landing-builder.test.cjs. No live writes. */
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname, window, document, URL, URLSearchParams */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { build } = require('esbuild'), { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright-core');
const { CatalogPage } = require('../../src/presentation/catalog/catalog-page.ts');
const { defaultContentConfig } = require('../../src/modules/settings/content-config.ts');
const { contentModel } = require('../../src/presentation/information/content-model.ts');
const { storeInformation } = require('../../src/presentation/information/store-information.ts');
const { createViewEngine } = require('../../src/presentation/view-engine.ts');
const { publicCatalogFixture, publicFacetsFixture } = require('../support/public-storefront.ts');
const root = path.resolve(__dirname, '../..'), read = name => fs.readFileSync(path.join(root, name));

test('optional sidebar uses SSR state, native navigation and a cancellable mobile filter draft', { timeout: 60000 }, async () => {
  const config = defaultContentConfig(), queries = [], errors = [];
  const catalog = { ...publicCatalogFixture, list: async query => {
    queries.push(query); const result = await publicCatalogFixture.list();
    return { ...result, items: Array.from({ length: 6 }, (_, i) => ({ ...result.items[0], id: 'product-' + i })), total: 53, page: Number(query.page), limit: Number(query.limit) };
  } };
  const facets = { get: async () => ({ ...await publicFacetsFixture.get(), currencies: ['ARS', 'USD'],
    categories: [{ id: 'deco', slug: 'decoracion', name: 'Decoración', sortOrder: 0 }],
    materials: [{ id: 'pla', slug: 'pla', name: 'PLA', sortOrder: 0 }],
    colors: [{ id: 'blue', slug: 'azul', name: 'Azul', hex: '#123abc', sortOrder: 0 }] }) };
  const listing = new CatalogPage(catalog, facets, 'api', undefined, {}, { get: async () => ({ settings: config }) });
  const partials = { seo_head: 'seo/views/head.hbs', site_header: 'shell/views/header.hbs', site_footer: 'shell/views/footer.hbs',
    catalog_card: 'catalog/views/partials/card.hbs', catalog_filters: 'catalog/views/partials/filters.hbs', cart_panel: 'cart/views/partials/cart-panel.hbs', catalog_info: 'catalog/views/partials/info.hbs' };
  const engine = createViewEngine(Object.fromEntries(Object.entries(partials).map(([key, file]) => [key, read('src/presentation/' + file).toString()])));
  const bundle = await build({ stdin: { contents: `import { mountCatalogFilters } from './src/presentation/catalog/client/browser/catalog-filters'; mountCatalogFilters(); document.body.dataset.ready = 'true';`, resolveDir: root }, bundle: true, write: false, platform: 'browser', target: 'es2022' });
  const browser = await chromium.launch({ headless: true }), page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(7000); page.on('pageerror', error => errors.push(error.message));
  await page.route('https://filters.test/**', async route => {
    const url = new URL(route.request().url()), p = url.pathname;
    const respond = (body, type = 'text/html') => route.fulfill({ status: 200, contentType: type, body });
    if (p === '/catalogo' || p === '/catalogo/' || p.startsWith('/categorias/')) {
      const params = new URLSearchParams(url.searchParams);
      if (p.startsWith('/categorias/')) params.set('category', p.split('/')[2]);
      const { model } = await listing.read(params), info = storeInformation({});
      const html = await new Promise((resolve, reject) => engine.__express(path.join(root, 'src/presentation/catalog/views/catalog.hbs'),
        { ...model, ...contentModel(config, info), storeInfo: info, seo: {}, categoryName: p.startsWith('/categorias/') ? 'Decoración' : '' },
        (error, rendered) => error ? reject(error) : resolve(rendered)));
      return respond(html);
    }
    if (p === '/assets/storefront/generated/cart.js') return respond(bundle.outputFiles[0].text, 'text/javascript');
    const css = { 'cart.css': 'cart', 'catalog.css': 'catalog', 'shell.css': 'shell' }, file = p.split('/').at(-1);
    if (p.startsWith('/assets/storefront/') && css[file]) return respond(read('src/presentation/' + css[file] + '/public/' + file), 'text/css');
    if (p.endsWith('theme.css')) return respond('', 'text/css');
    if (p.includes('/fonts/')) return respond(read('src/presentation/shell/public/fonts/' + file), 'font/woff2');
    if (p.endsWith('/branding/hero')) return respond(read('src/presentation/home/public/generated/storefront/hero-3d-objects.webp'), 'image/webp');
    return route.fulfill({ status: 404, body: '' });
  });
  const goto = async url => { await page.goto('https://filters.test' + url); await page.locator('body[data-ready="true"]').waitFor(); };
  const navigate = async action => { const before = page.url(); await Promise.all([page.waitForURL(url => url.href !== before), action()]); await page.locator('body[data-ready="true"]').waitFor(); };
  const desktop = page.locator('[data-filter-form="desktop"]'), mobile = page.locator('[data-filter-form="mobile"]');
  try {
    await goto('/catalogo'); assert.equal(await page.locator('[data-filter-form]').count(), 0);
    const fullWidth = (await page.locator('.catalog-grid').boundingBox()).width;
    config.listing.filtersEnabled = true;
    await goto('/catalogo/?search=florero&sort=name_desc&page=2');
    assert.equal(await desktop.isVisible(), true); assert.equal(await page.locator('[data-filter-open]').isVisible(), false);
    assert.equal(await desktop.locator('[data-filter-currency]').inputValue(), 'ARS');
    assert.equal(await desktop.locator('[data-filter-min]').isEnabled(), true, 'Default currency reaches browser state');
    assert.ok((await page.locator('.catalog-grid').boundingBox()).width < fullWidth - 200);
    await desktop.locator('summary').filter({ hasText: 'Material' }).click();
    await navigate(() => desktop.getByLabel('PLA', { exact: true }).check());
    assert.equal(new URL(page.url()).searchParams.get('material'), 'pla');
    assert.equal(new URL(page.url()).searchParams.get('search'), 'florero');
    assert.equal(new URL(page.url()).searchParams.get('sort'), 'name_desc');
    assert.equal(new URL(page.url()).searchParams.has('page'), false);
    assert.equal(queries.at(-1).currency, 'ARS'); assert.equal(queries.at(-1).material, 'pla');
    await goto('/categorias/decoracion');
    assert.equal(await desktop.getByLabel('Decoración', { exact: true }).isChecked(), true);
    await desktop.locator('[data-filter-min]').fill('120,50');
    await navigate(() => desktop.getByRole('button', { name: 'Aplicar precio' }).click());
    assert.equal(new URL(page.url()).pathname, '/catalogo');
    assert.equal(queries.at(-1).category, 'decoracion'); assert.equal(queries.at(-1).minPriceMinor, '12050');
    await desktop.locator('[data-filter-max]').fill('10');
    await desktop.getByRole('button', { name: 'Aplicar precio' }).click();
    assert.equal(await desktop.locator('[data-filter-error]').isVisible(), true);
    await navigate(() => desktop.locator('[data-filter-currency]').selectOption('USD'));
    assert.equal(new URL(page.url()).searchParams.get('currency'), 'USD');
    assert.equal(new URL(page.url()).searchParams.has('minPriceMinor'), false);
    await goto('/catalogo');
    for (const width of [1280, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await desktop.isVisible(), width >= 1024);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'No overflow at ' + width);
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({ path: path.join(root, '.local-tools/catalog-filters-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await goto('/categorias/decoracion');
    await page.locator('[data-filter-open]').click();
    assert.equal(await mobile.getByLabel('Decoración', { exact: true }).isChecked(), true);
    await mobile.getByLabel('Azul', { exact: true }).check();
    assert.equal(new URL(page.url()).pathname, '/categorias/decoracion', 'Mobile edits are not applied early');
    await mobile.getByRole('button', { name: 'Cancelar' }).click();
    await page.locator('[data-filter-open]').click();
    assert.equal(await mobile.getByLabel('Azul', { exact: true }).isChecked(), false);
    await mobile.getByLabel('Azul', { exact: true }).check();
    await page.keyboard.press('Escape');
    await page.locator('[data-filter-open]').click();
    assert.equal(await mobile.getByLabel('Azul', { exact: true }).isChecked(), false);
    await mobile.getByLabel('Azul', { exact: true }).check();
    await mobile.locator('[data-filter-max]').fill('500');
    await page.screenshot({ path: path.join(root, '.local-tools/catalog-filters-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await navigate(() => mobile.getByRole('button', { name: 'Ver resultados' }).click());
    assert.equal(queries.at(-1).category, 'decoracion'); assert.equal(queries.at(-1).color, 'azul'); assert.equal(queries.at(-1).maxPriceMinor, '50000');
    await page.locator('[data-filter-open]').click(); await mobile.getByRole('button', { name: 'Limpiar', exact: true }).click();
    await navigate(() => mobile.getByRole('button', { name: 'Ver resultados' }).click());
    assert.equal(new URL(page.url()).search, '?currency=ARS');
    await goto('/catalogo?currency=EUR');
    await page.locator('[data-filter-open]').click(); await mobile.getByRole('button', { name: 'Limpiar', exact: true }).click();
    await navigate(() => mobile.getByRole('button', { name: 'Ver resultados' }).click());
    assert.equal(queries.at(-1).currency, 'ARS', 'Clearing an unavailable currency recovers the catalog on mobile');
    config.listing.filtersEnabled = false;
    await page.setViewportSize({ width: 1280, height: 1000 }); await goto('/catalogo');
    assert.equal(await page.locator('[data-filter-form]').count(), 0);
    assert.equal((await page.locator('.catalog-grid').boundingBox()).width, fullWidth);
    assert.deepEqual(errors, []);
  } catch (error) { await page.screenshot({ path: path.join(root, '.local-tools/catalog-filters-failure.png'), fullPage: true }); throw error; }
  finally { await browser.close(); }
});
