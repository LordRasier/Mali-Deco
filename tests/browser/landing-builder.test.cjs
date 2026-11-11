/* Run with PLAYWRIGHT_MODULE_PATH pointing at an installed playwright-core package. No listener or live database. */
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname, window, document, Buffer, URL, getComputedStyle */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright-core');
const { parseContentConfig } = require('../../src/modules/settings/content-validation.ts');
const { ContentSettings } = require('../../src/modules/settings/content-settings.ts');
const { ContentDrafts } = require('../../src/modules/settings/content-drafts.ts');
const { appearanceSheet, appearanceCss, parseAppearanceSheet } = require('../../src/modules/settings/content-appearance.ts');
const { themeCss } = require('../../src/modules/settings/store-theme.ts');
const { contentDatabase } = require('../support/content-database.ts');
const { landingView } = require('../../src/presentation/home/landing-view.ts');
const { contentModel } = require('../../src/presentation/information/content-model.ts');
const { storeInformation } = require('../../src/presentation/information/store-information.ts');
const { createViewEngine } = require('../../src/presentation/view-engine.ts');
const { publicCatalogFixture, publicFacetsFixture } = require('../support/public-storefront.ts');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
test('builder drag docking, nesting, cancellation, undo, draft and mobile use real templates', { timeout: 90000 }, async () => {
  const { db } = contentDatabase(), settings = new ContentSettings(db), drafts = new ContentDrafts(settings, db);
  const initial = await settings.get(); initial.settings.listing.columns = '4'; await settings.set({ settings: initial.settings, revision: initial.revision });
  const catalog = { ...publicCatalogFixture, selected: publicCatalogFixture.list };
  const facets = { get: async () => ({ ...await publicFacetsFixture.get(), categories: [{ id: 'cards', slug: 'cartas', name: 'Cartas', sortOrder: 0,
    presentation: { description: 'Prepará tu próxima partida', icon: 'cards', imageAlt: 'Colección de cartas', image: '/api/v1/catalog/category-images/cards/version' } }] }) };
  const partials = { seo_head: 'seo/views/head.hbs', site_header: 'shell/views/header.hbs', site_footer: 'shell/views/footer.hbs', catalog_card: 'catalog/views/partials/card.hbs', cart_panel: 'cart/views/partials/cart-panel.hbs', catalog_info: 'catalog/views/partials/info.hbs', landing_block: 'home/views/landing-block.hbs' };
  const engine = createViewEngine(Object.fromEntries(Object.entries(partials).map(([key, file]) => [key, read('src/presentation/' + file).toString()])));
  const render = async config => {
    const model = await landingView(config, catalog, facets, '/productos/', true), info = storeInformation({});
    return new Promise((resolve, reject) => {
      engine.__express(path.join(root, 'src/presentation/home/views/home.hbs'), { ...model, ...contentModel(config, info, true), layout: false, visualPreview: true, brand: 'Mali', mode: 'api', routes: { home: '/', catalog: '/catalogo', product: '/productos/', cart: '/carrito' }, storeInfo: info, seo: {} }, (error, html) => error ? reject(error) : resolve(html));
    });
  };
  const bundle = await build({ stdin: { contents: `import { mountContentEditor } from './src/presentation/admin/client/browser/content/content-editor'; window.disposeBuilder = mountContentEditor(document.querySelector('.admin-root'), { getEpoch: () => 1, getSnapshot: () => ({ status: 'authenticated', csrf: 'test', user: { role: 'owner' } }) });`, resolveDir: root }, bundle: true, write: false, platform: 'browser', target: 'es2022' });
  const browser = await chromium.launch({ headless: true, timeout: 15000 });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce', hasTouch: true });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const requestedFonts = new Set();
  page.on('request', request => { if (request.url().endsWith('.woff2')) requestedFonts.add(new URL(request.url()).pathname.split('/').at(-1)); });
  page.on('console', message => { if (message.type() === 'error' && /Content Security Policy|violates.*policy/i.test(message.text())) errors.push(message.text()); });
  await page.route('**/*', route => { errors.push('Unexpected external request: ' + route.request().url()); return route.abort(); });
  await page.route('https://builder.test/**', async route => {
    const url = new URL(route.request().url()), pathname = url.pathname;
    const respond = (body, type = 'application/json', status = 200) => route.fulfill({ status, contentType: type,
      headers: type === 'text/html' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'self'" } : {},
      body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    try {
      if (pathname === '/') return respond(`<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/admin/admin.css"></head><body><div class="admin-root" data-active-section="editor">${read('src/presentation/admin/views/admin-content-editor.hbs')}</div><script src="/test.js"></script></body></html>`, 'text/html');
      if (pathname === '/test.js') return respond(bundle.outputFiles[0].text, 'text/javascript');
      if (pathname.startsWith('/assets/')) {
        const name = pathname.split('/').at(-1), feature = pathname.includes('/admin/') ? 'admin' : pathname.includes('fonts/') ? 'shell' : name === 'landing.css' || name === 'home.css' ? 'home' : name.replace('.css', '');
        const file = `src/presentation/${feature}/public/${pathname.includes('/generated/') ? 'generated/' : pathname.includes('/fonts/') ? 'fonts/' : ''}${name}`;
        return respond(read(file), name.endsWith('.css') ? 'text/css' : 'font/woff2');
      }
      if (pathname.endsWith('appearance.css')) return respond(themeCss('#073dcc') + appearanceCss(parseAppearanceSheet(url.searchParams.get('design'))), 'text/css');
      if (pathname.endsWith('theme.css')) return respond(themeCss('#073dcc') + appearanceCss(appearanceSheet((await settings.get()).settings)), 'text/css');
      if (pathname.includes('/branding/')) return respond(read('src/presentation/home/public/generated/storefront/hero-3d-objects.webp'), 'image/webp');
      if (pathname.includes('/category-images/')) return respond(read('src/presentation/home/public/generated/storefront/florero-ondas.webp'), 'image/webp');
      if (pathname.endsWith('/choices')) return respond({ products: [{ id: 'fixture-product', name: 'Florero Ondas' }], total: 1, categories: (await facets.get()).categories });
      if (pathname.endsWith('/editor')) return respond(await drafts.get());
      const body = route.request().postDataJSON();
      if (pathname.endsWith('/preview')) return respond({ html: await render(parseContentConfig(body.settings)) });
      if (pathname.endsWith('/draft')) return respond(await drafts.write(body, 'draft'));
      if (pathname.endsWith('/publish')) return respond(await drafts.write(body, 'publish'));
      return respond('{}', 'application/json', 404);
    } catch (error) { errors.push(error.message); return respond({ message: error.message }, 'application/json', 500); }
  });
  try {
    await page.goto('https://builder.test/');
    const preview = page.frameLocator('iframe');
    await preview.locator('[data-landing-id="home-hero"]').waitFor();
    const assertBlockWidths = async () => {
      const widths = await preview.locator('[data-landing-id]').evaluateAll(nodes => nodes.map(node => {
        const block = node.getBoundingClientRect(), zone = node.parentElement.getBoundingClientRect();
        return { id: node.dataset.landingId, left: block.left - zone.left, width: block.width - zone.width };
      }));
      for (const block of widths) { assert.ok(Math.abs(block.left) < 1, `Block starts at its row: ${block.id}`); assert.ok(Math.abs(block.width) < 1, `Block fills its row: ${block.id}`); }
    };
    await assertBlockWidths();
    const waitStyle = (selector, property, value) => page.waitForFunction(({ selector, property, value }) => {
      const doc = document.querySelector('iframe')?.contentDocument, node = doc?.querySelector(selector);
      return node && doc.defaultView.getComputedStyle(node)[property] === value;
    }, { selector, property, value });
    await page.getByRole('button', { name: 'Apariencia general', exact: true }).click();
    const fontCatalog = JSON.parse(read('src/presentation/shell/public/fonts/catalog-sources.json'));
    assert.equal(await page.getByLabel('Títulos', { exact: true }).locator('option').count(), 13);
    assert.equal(await page.locator('[data-content-editor] input[type="file"]').count(), 0);
    for (const font of fontCatalog.fonts) assert.ok(font.files.every(file => !requestedFonts.has(file.file)), 'Unselected font binaries are not downloaded');
    for (const font of fontCatalog.fonts) {
      await page.getByLabel('Títulos', { exact: true }).selectOption(font.id);
      await page.waitForFunction(family => {
        const doc = document.querySelector('iframe')?.contentDocument, heading = doc?.querySelector('h1');
        return heading && doc.defaultView.getComputedStyle(heading).fontFamily.replaceAll('"', '').startsWith(family + ',');
      }, font.family);
      const loaded = await preview.locator('body').evaluate(async (_node, family) => {
        const faces = await document.fonts.load(`400 16px "${family}"`, '¡Diseño, áéíóú, ñ, €!');
        return faces.length > 0 && faces.every(face => face.status === 'loaded');
      }, font.family);
      assert.equal(loaded, true, `${font.family} decodes in the sandboxed preview`);
      const sample = page.locator('.content-font-sample').first();
      assert.ok((await sample.evaluate(node => getComputedStyle(node).fontFamily)).includes(font.family));
      assert.equal(await sample.evaluate(async (_node, family) => (await document.fonts.load(`400 22px "${family}"`)).length > 0, font.family), true);
    }
    await page.getByLabel('Fondo general', { exact: true }).fill('#102030');
    await waitStyle('body', 'backgroundColor', 'rgb(16, 32, 48)');
    await waitStyle('[data-landing-id="home-hero"] h1', 'color', 'rgb(17, 18, 23)');
    await page.getByLabel('Fondo general', { exact: true }).fill('#f0e8d8');
    await page.getByLabel('Títulos', { exact: true }).selectOption('lora');
    await page.getByLabel('Texto', { exact: true }).selectOption('manrope');
    await waitStyle('body', 'backgroundColor', 'rgb(240, 232, 216)');
    await waitStyle('h1', 'fontFamily', 'Lora, Georgia, serif');
    await waitStyle('body', 'fontFamily', 'Manrope, Arial, sans-serif');
    await waitStyle('.site-footer-links h2', 'fontFamily', 'Lora, Georgia, serif');
    await page.screenshot({ path: path.join(root, '.local-tools/font-catalog-desktop.png') });
    await page.screenshot({ path: path.join(root, '.local-tools/editor-appearance-global.png') });
    assert.equal((await settings.get()).settings.appearance.backgroundColor, null);
    await preview.locator('[data-landing-id="home-collection"]').click();
    await page.getByLabel('Fondo de la sección', { exact: true }).fill('#102030');
    await page.getByLabel('Texto de la sección', { exact: true }).fill('#f7f7f7');
    await waitStyle('[data-landing-id="home-collection"] > .landing-block-content', 'backgroundColor', 'rgb(16, 32, 48)');
    await waitStyle('[data-landing-id="home-collection"] h2', 'color', 'rgb(247, 247, 247)');
    await waitStyle('[data-landing-id="home-collection"] .home-heading a', 'color', 'rgb(247, 247, 247)');
    await page.getByRole('button', { name: 'Restablecer texto de la sección', exact: true }).click();
    await waitStyle('[data-landing-id="home-collection"] h2', 'color', 'rgb(255, 255, 255)');
    await page.locator('[data-content-command="undo"]').click();
    await waitStyle('[data-landing-id="home-collection"] h2', 'color', 'rgb(247, 247, 247)');
    await page.screenshot({ path: path.join(root, '.local-tools/editor-appearance-section.png') });
    assert.equal(await preview.locator('[data-landing-id="home-collection"] .landing-grid').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 3, 'Block columns are independent of catalog listing columns');
    assert.equal(await page.locator('.content-inspector-dock').count(), 1);
    const dragTo = async (source, target, fraction = .1) => {
      const from = await source.boundingBox(), to = await target.boundingBox(); assert.ok(from && to);
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height * fraction, { steps: 16 });
      await preview.locator('.landing-drop-slot').waitFor(); assert.equal(await preview.locator('.landing-drop-slot').count(), 1);
      await page.mouse.up();
    };
    await dragTo(page.locator('[data-builder-type="categories"]'), preview.locator('[data-landing-id="home-collection"]'));
    await preview.locator('.landing-categories').waitFor();
    const categoryId = await page.locator('[data-block-inspector]').getAttribute('data-block-inspector');
    assert.deepEqual(await preview.locator('.landing-root > [data-landing-id]').evaluateAll(nodes => nodes.map(n => n.dataset.landingId)), ['home-hero', categoryId, 'home-collection', 'home-about']);
    await page.getByLabel('Diseño de las categorías', { exact: true }).selectOption('photo');
    await preview.locator('.landing-categories[data-card-style="photo"] img').waitFor();
    await page.getByLabel('Ubicación del texto', { exact: true }).selectOption('center');
    await preview.locator('.landing-categories[data-text-position="center"]').waitFor();
    assert.equal(await preview.locator('.category-card-media').evaluate(node => getComputedStyle(node).position), 'absolute');
    await page.getByLabel('Diseño de las categorías', { exact: true }).selectOption('circles');
    await preview.locator('.landing-categories[data-card-style="circles"]').waitFor();
    assert.equal(await page.getByLabel('Ubicación del texto', { exact: true }).count(), 0);
    // Insert a container ahead of categories, then move the existing category block into its second column.
    await dragTo(page.locator('[data-builder-type="container"]'), preview.locator(`[data-landing-id="${categoryId}"]`));
    const containerId = await page.locator('[data-block-inspector]').getAttribute('data-block-inspector');
    await preview.locator(`[data-landing-id="${containerId}"] .landing-columns`).waitFor();
    await page.getByLabel('Fondo de la sección', { exact: true }).fill('#223344');
    await waitStyle(`[data-landing-id="${containerId}"] > .landing-block-content`, 'backgroundColor', 'rgb(34, 51, 68)');
    await preview.locator(`[data-landing-id="${containerId}"]`).evaluate(node => node.scrollIntoView({ block: 'start' }));
    const category = preview.locator(`[data-landing-id="${categoryId}"]`); await category.hover();
    await dragTo(category.locator('.landing-handle'), preview.locator(`[data-landing-id="${containerId}"] > .landing-block-content > .landing-columns > .landing-column`).nth(1), .5);
    await preview.locator(`[data-landing-id="${containerId}"] .landing-column:nth-child(2) [data-landing-id="${categoryId}"]`).waitFor();
    assert.equal(await preview.locator(`[data-landing-id="${categoryId}"] > .landing-block-content`).evaluate(node => getComputedStyle(node).getPropertyValue('--section-text').trim()), '', 'Section-specific accents do not leak into nested sections');
    await assertBlockWidths();
    // Escape cancels without inserting or creating an undo entry.
    const before = await preview.locator('[data-landing-id]').count();
    const library = await page.locator('[data-builder-type="promotion"]').boundingBox(), zone = await preview.locator(`[data-landing-id="${containerId}"] .landing-column`).first().boundingBox();
    await page.mouse.move(library.x + 50, library.y + 20); await page.mouse.down(); await page.mouse.move(zone.x + 50, zone.y + 50, { steps: 12 });
    await preview.locator('.landing-drop-slot').waitFor(); await page.keyboard.press('Escape'); await page.mouse.up();
    assert.equal(await preview.locator('[data-landing-id]').count(), before); assert.equal(await preview.locator('.landing-drop-slot').count(), 0);
    await page.locator('[data-content-command="undo"]').click();
    await preview.locator(`.landing-root > [data-landing-id="${categoryId}"]`).waitFor();
    await page.locator('[data-content-command="redo"]').click();
    await preview.locator(`[data-landing-id="${containerId}"] [data-landing-id="${categoryId}"]`).waitFor();
    await page.locator('[data-block-action="duplicate"]').click();
    const duplicateId = await page.locator('[data-block-inspector]').getAttribute('data-block-inspector'); assert.notEqual(duplicateId, categoryId);
    await preview.locator(`[data-landing-id="${duplicateId}"]`).waitFor();
    await page.locator('[data-content-command="undo"]').click(); await preview.locator(`[data-landing-id="${duplicateId}"]`).waitFor({ state: 'detached' });
    await page.locator('[data-builder-type="promotion"]').focus(); await page.keyboard.press('Enter');
    const keyboardId = await page.locator('[data-block-inspector]').getAttribute('data-block-inspector');
    await preview.locator(`[data-landing-id="${keyboardId}"]`).waitFor();
    await page.locator('[data-content-command="undo"]').click(); await preview.locator(`[data-landing-id="${keyboardId}"]`).waitFor({ state: 'detached' });
    await preview.locator(`[data-landing-id="${containerId}"]`).evaluate(node => node.scrollIntoView({ block: 'start' }));
    const fromTouch = await page.locator('[data-builder-type="promotion"]').boundingBox(), toTouch = await preview.locator(`[data-landing-id="${containerId}"] .landing-column`).first().boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromTouch.x + 50, y: fromTouch.y + 20 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: toTouch.x + 50, y: toTouch.y + 50 }] });
    await preview.locator('.landing-drop-slot').waitFor(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const touchId = await page.locator('[data-block-inspector]').getAttribute('data-block-inspector');
    await preview.locator(`[data-landing-id="${containerId}"] .landing-column:first-child [data-landing-id="${touchId}"]`).waitFor();
    await assertBlockWidths();
    await page.locator('[data-content-command="undo"]').click(); await preview.locator(`[data-landing-id="${touchId}"]`).waitFor({ state: 'detached' });
    await preview.locator('[data-landing-id="home-collection"]').click();
    await page.locator('[data-content-path$=".props.mode"]').selectOption('manual');
    await page.locator('[data-block-action="choose"]').filter({ hasText: 'Florero Ondas' }).click();
    await page.locator('[data-picker-chosen]').getByText('Florero Ondas', { exact: true }).waitFor();
    await page.locator('[data-content-command="draft"]').click(); await page.getByText('Borrador guardado. La tienda publicada no cambió.', { exact: true }).waitFor();
    assert.equal((await settings.get()).settings.appearance.backgroundColor, null);
    await page.reload(); await waitStyle('body', 'backgroundColor', 'rgb(240, 232, 216)');
    await waitStyle('[data-landing-id="home-collection"] h2', 'color', 'rgb(247, 247, 247)');
    assert.equal((await settings.get()).settings.landing.blocks.length, 3); assert.equal((await drafts.get()).settings.landing.blocks.length, 4);
    assert.deepEqual((await drafts.get()).settings.landing.blocks.find(block => block.id === 'home-collection').props.productIds, ['fixture-product']);
    await page.locator('[data-content-command="publish"]').click(); await page.getByText('Contenido publicado. Los textos y las rutas ya están actualizados.', { exact: true }).waitFor();
    assert.equal((await settings.get()).settings.landing.blocks.length, 4);
    assert.equal((await settings.get()).settings.appearance.headingFont, 'lora');
    assert.equal((await settings.get()).settings.appearance.bodyFont, 'manrope');
    assert.equal((await settings.get()).settings.landing.blocks.find(b => b.id === 'home-collection').style.backgroundColor, '#102030');
    assert.equal((await settings.get()).settings.landing.blocks.find(b => b.id === containerId).columns[1].blocks[0].props.cardStyle, 'circles');
    await preview.locator('[data-landing-id="home-about"]').click();
    await page.getByLabel('Ancho del contenido', { exact: true }).selectOption('full');
    await preview.locator('[data-landing-id="home-about"] .landing-width-full').waitFor();
    await page.locator('[data-content-viewport]').selectOption('mobile');
    assert.equal(await preview.locator('body').evaluate(() => window.innerWidth), 390);
    assert.equal(await preview.locator('body').evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await assertBlockWidths();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
    await page.getByRole('button', { name: 'Apariencia general', exact: true }).click();
    assert.equal(await page.getByLabel('Fondo general', { exact: true }).inputValue(), '#f0e8d8');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.equal(await page.locator('.content-sidebar').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'Mobile controls must fit inside their own panel');
    await page.screenshot({ path: path.join(root, '.local-tools/editor-appearance-mobile.png') });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.locator('[data-content-viewport]').selectOption('desktop');
    await page.screenshot({ path: path.join(root, '.local-tools/landing-builder-desktop.png') });
    await page.getByRole('button', { name: 'Restablecer fondo general', exact: true }).click();
    await page.getByLabel('Títulos', { exact: true }).selectOption('');
    await waitStyle('body', 'backgroundColor', 'rgb(255, 255, 255)');
    await waitStyle('h1', 'fontFamily', 'Manrope, Arial, sans-serif');
    assert.match(await page.locator('.content-font-sample').first().evaluate(node => getComputedStyle(node).fontFamily), /Manrope/, 'Default heading sample matches the inherited preview font');
    assert.equal((await settings.get()).settings.appearance.backgroundColor, '#f0e8d8', 'Reset preview must not fall back to the published appearance');
    assert.deepEqual(errors, []);
  } catch (error) {
    process.stdout.write(JSON.stringify({ errors, message: error.message }) + '\n');
    await page.screenshot({ path: path.join(root, '.local-tools/landing-builder-failure.png') }); throw error;
  } finally { await browser.close(); }
});
