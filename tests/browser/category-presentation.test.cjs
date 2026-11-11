/* Run with the same Playwright environment as landing-builder.test.cjs. No live writes. */
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname, window, document, Buffer, URL, Request */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { build } = require('esbuild'), { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright-core');
const { ClassificationsPage } = require('../../src/presentation/admin/classifications/classifications-page.ts');
const { defaultContentConfig } = require('../../src/modules/settings/content-config.ts');
const { newBlock } = require('../../src/shared/landing-layout.ts');
const { parseCategoryPresentation } = require('../../src/shared/category-presentation.ts');
const { landingView } = require('../../src/presentation/home/landing-view.ts');
const { createViewEngine } = require('../../src/presentation/view-engine.ts');
const { publicCatalogFixture, publicFacetsFixture } = require('../support/public-storefront.ts');
const root = path.resolve(__dirname, '../..'), read = name => fs.readFileSync(path.join(root, name));
const id = '12345678-1234-1234-1234-123456789012', version = 'abcdefab-1234-1234-1234-123456789012';

test('category image editor persists metadata and removal; three styles render without overflow', { timeout: 60000 }, async () => {
  let presentation = { description: '', imageAlt: '', icon: 'grid', image: '' }, writes = 0;
  const taxonomy = { list: async () => ({ items: [{ id, name: 'Floreros', slug: 'floreros', sortOrder: 0, archivedAt: null, presentation },
    ...[['macetas', 'Macetas', 'leaf'], ['organizacion', 'Organización', 'box'], ['regalos', 'Regalos y detalles para ocasiones especiales', 'gift']].map(([slug, name, icon], index) => ({
      id: 'fixture-' + slug, name, slug, sortOrder: index + 1, archivedAt: null,
      presentation: { description: '', imageAlt: '', icon, image: slug === 'macetas' ? `/api/v1/catalog/category-images/${id}/${version}` : '' },
    }))], page: 1, limit: 24, total: 4 }) };
  const engine = createViewEngine({ landing_block: read('src/presentation/home/views/landing-block.hbs').toString() });
  const render = (file, model) => new Promise((resolve, reject) => engine.__express(path.join(root, file), { ...model, layout: false }, (error, html) => error ? reject(error) : resolve(html)));
  const bundle = await build({ stdin: { contents: `import { mountClassifications } from './src/presentation/admin/client/browser/classifications/classification-dom'; mountClassifications(document.querySelector('[data-admin-section]'), { getEpoch: () => 1, getSnapshot: () => ({ status: 'authenticated', csrf: 'test', user: { role: 'catalog' } }), expire: () => {} });`, resolveDir: root }, bundle: true, write: false, platform: 'browser', target: 'es2022' });
  const browser = await chromium.launch({ headless: true }), page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(7000); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://categories.test/**', async route => {
    const url = new URL(route.request().url()), p = url.pathname;
    const respond = (body, type = 'text/html', status = 200) => route.fulfill({ status, contentType: type, body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    if (p === '/admin') {
      const result = await new ClassificationsPage(taxonomy).read({ kind: 'categories', view: 'list', page: '1' });
      return respond(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/admin.css"><body class="admin-root">${await render('src/presentation/admin/views/' + result.view + '.hbs', result.model)}<script src="/test.js"></script></body></html>`);
    }
    if (p === '/admin/sections/classifications') {
      const result = await new ClassificationsPage(taxonomy).read(Object.fromEntries(url.searchParams));
      return respond(await render('src/presentation/admin/views/' + result.view + '.hbs', result.model));
    }
    if (p === '/test.js') return respond(bundle.outputFiles[0].text, 'text/javascript');
    if (p === '/admin.css') return respond(read('src/presentation/cart/public/cart.css') + '\n' + read('src/presentation/admin/public/generated/admin.css'), 'text/css');
    if (p === '/api/v1/admin/catalog/categories/' + id + '/presentation') {
      assert.equal(route.request().headers()['x-csrf-token'], 'test');
      const request = new Request(url, { method: 'PUT', headers: { 'content-type': route.request().headers()['content-type'] }, body: route.request().postDataBuffer() });
      const data = await request.formData(), fields = parseCategoryPresentation(JSON.parse(data.get('presentation')));
      const file = data.get('file');
      // CDP omits multipart file bytes in intercepted postData; the selected File is checked in the page below.
      if (file) assert.equal(file.name, 'florero-ondas.webp');
      presentation = { description: fields.description, imageAlt: fields.imageAlt, icon: fields.icon, image: fields.removeImage ? '' : file ? `/api/v1/catalog/category-images/${id}/${version}` : presentation.image }; writes++;
      return respond({ id, presentation }, 'application/json');
    }
    if (p === '/styles') {
      const config = defaultContentConfig();
      config.landing.blocks = [['icons', 'below', 'Tarjetas con iconos'], ['photo', 'below', 'Imagen con texto debajo'], ['photo', 'center', 'Texto sobre la imagen'], ['circles', 'below', 'Colecciones circulares']].map(([style, position, title], i) => {
        const b = newBlock('categories', 'style-' + i); Object.assign(b.props, { cardStyle: style, textPosition: position, title }); return b;
      });
      const categories = [
        ['floreros', 'Floreros', 'Formas que transforman tus espacios', 'leaf', 'florero-ondas'],
        ['organizacion', 'Organización', 'Cada cosa en su lugar', 'box', 'organizador-arco'],
        ['macetas', 'Macetas', 'Un rincón para lo que crece', 'home', 'maceta-geometrica'],
        ['regalos', 'Regalos', 'Pequeños detalles para compartir', 'gift', ''],
      ].map(([id, name, description, icon, asset]) => ({ id, slug: id, name, sortOrder: 0, presentation: { description, icon, imageAlt: name, image: asset ? '/image/' + asset : '' } }));
      const facets = { get: async () => ({ ...await publicFacetsFixture.get(), categories }) };
      const model = await landingView(config, publicCatalogFixture, facets, '/productos/', false);
      const html = (await Promise.all(model.landingBlocks.map(block => render('src/presentation/home/views/landing-block.hbs', block)))).join('');
      return respond(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"><body><main class="home-layout">${html}</main></body></html>`);
    }
    if (p === '/styles.css') return respond(['cart/public/cart.css', 'shell/public/shell.css', 'catalog/public/catalog.css', 'home/public/home.css', 'home/public/landing.css'].map(file => read('src/presentation/' + file)).join('\n'), 'text/css');
    if (p.includes('/image/') || p.includes('/category-images/')) return respond(read('src/presentation/home/public/generated/storefront/' + (p.startsWith('/image/') ? p.split('/').at(-1) : 'florero-ondas') + '.webp'), 'image/webp');
    if (p.includes('/fonts/')) return respond(read('src/presentation/shell/public/fonts/' + p.split('/').at(-1)), 'font/woff2');
    return respond('', 'text/plain', 404);
  });
  try {
    await page.goto('https://categories.test/admin');
    await page.screenshot({ path: path.join(root, '.local-tools/category-list-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, '.local-tools/category-list-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.screenshot({ path: path.join(root, '.local-tools/category-list-narrow.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.getByRole('button', { name: 'Editar Floreros', exact: true }).click();
    await page.locator('[name="categoryDescription"]').fill('Objetos para tu próxima historia');
    await page.locator('[name="categoryImageAlt"]').fill('Florero con textura de ondas');
    await page.locator('[name="categoryIcon"][value="leaf"]').check();
    await page.locator('[name="imageFile"]').setInputFiles(path.join(root, 'src/presentation/home/public/generated/storefront/florero-ondas.webp'));
    assert.ok(await page.locator('[name="imageFile"]').evaluate(input => input.files[0].size > 0));
    await page.getByRole('button', { name: 'Guardar diseño de categoría' }).click();
    await page.locator('[data-category-saved]').waitFor({ state: 'visible' });
    assert.equal(writes, 1); assert.equal(presentation.icon, 'leaf'); assert.ok(presentation.image);
    assert.ok(await page.locator('[data-category-image]').evaluate(img => img.complete && img.naturalWidth > 0));
    await page.reload(); await page.getByRole('button', { name: 'Editar Floreros', exact: true }).click();
    assert.equal(await page.locator('[name="categoryDescription"]').inputValue(), 'Objetos para tu próxima historia');
    assert.equal(await page.locator('[name="categoryIcon"][value="leaf"]').isChecked(), true);
    await page.screenshot({ path: path.join(root, '.local-tools/category-editor-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, '.local-tools/category-editor-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Admin fits mobile');
    await page.locator('[name="removeImage"]').check(); await page.getByRole('button', { name: 'Guardar diseño de categoría' }).click();
    await page.locator('[data-category-saved]').waitFor({ state: 'visible' }); assert.equal(presentation.image, ''); assert.equal(presentation.icon, 'leaf');
    await page.goto('https://categories.test/styles');
    assert.equal(await page.locator('.category-card').count(), 16);
    assert.equal(await page.locator('[data-card-style="icons"] img').count(), 0);
    assert.equal(await page.locator('[data-card-style="photo"] img').count(), 6);
    assert.equal(await page.locator('[data-card-style="circles"] svg').count(), 1, 'Missing photo uses selected icon');
    for (const width of [390, 320, 768, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth,
        nodes: [...document.querySelectorAll('body *')].filter(n => n.getBoundingClientRect().right > window.innerWidth + 1).map(n => ({ tag: n.tagName, class: n.className, width: n.getBoundingClientRect().width, right: n.getBoundingClientRect().right })) }));
      assert.equal(overflow.overflow, false, 'Storefront fits ' + width + ': ' + JSON.stringify(overflow.nodes));
      const overflows = await page.locator('.category-card').evaluateAll(cards => cards.filter(c => c.scrollWidth > c.clientWidth + 1).length);
      assert.equal(overflows, 0, 'Captions fit ' + width);
    }
    await page.screenshot({ path: path.join(root, '.local-tools/category-styles-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, '.local-tools/category-styles-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } catch (error) { await page.screenshot({ path: path.join(root, '.local-tools/category-failure.png'), fullPage: true }); throw error; }
  finally { await browser.close(); }
});
