/* Isolated browser fixtures: no credentials, external requests or live catalog writes. */
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname, document, window, URL, getComputedStyle */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { build } = require('esbuild'), { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright-core');
const { createViewEngine } = require('../../src/presentation/view-engine.ts');
const { catalogCards } = require('../../src/presentation/catalog/catalog-view.ts');
const { AdminProductsPage } = require('../../src/presentation/admin/products/admin-products-page.ts');
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'artifacts/featured-discounts');
const read = file => fs.readFileSync(path.join(root, file));
const engine = createViewEngine({ admin_product_images: '' });
const render = (file, model) => new Promise((resolve, reject) => engine.__express(path.join(root, file), { layout: false, ...model }, (error, html) => error ? reject(error) : resolve(html)));
const bundle = contents => build({ stdin: { contents, resolveDir: root }, bundle: true, write: false, platform: 'browser', target: 'es2022' });
async function pageFor(browser, body, js, admin = false) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' }); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const css = admin ? [read('src/presentation/admin/public/generated/admin.css'), read('src/presentation/admin/public/admin.css').toString().replace(/^@import.*$/gm, '')]
    : [read('src/presentation/cart/public/cart.css'), read('src/presentation/catalog/public/catalog.css'), read('src/presentation/shell/public/shell.css')];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://promotions.test') { errors.push('Unexpected remote request'); return route.abort(); }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.join('\n')} body{margin:0;padding:16px} main{max-width:1200px;margin:auto}</style><body>${body}<script src="/fixture.js"></script></body></html>` });
    if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: js.outputFiles[0].text });
    if (url.pathname.startsWith('/api/v1/catalog/images/')) return route.fulfill({ contentType: 'image/webp', body: read('src/presentation/home/public/generated/storefront/florero-ondas.webp') });
    if (url.pathname.endsWith('.woff2')) return route.fulfill({ contentType: 'font/woff2', body: read('src/presentation/shell/public/fonts/' + path.basename(url.pathname)) });
    if (url.pathname.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: '' });
    return route.fulfill({ status: 404, body: '' });
  });
  return { page, errors };
}

test('discount ribbons and old prices follow the selected variant without covering standard controls', { timeout: 60000 }, async () => {
  const variants = [{ id: 'sale', name: 'Pequeño', priceMinor: 7500, regularPriceMinor: 10000, discountPercent: '25', currency: 'ARS' },
    { id: 'normal', name: 'Grande', priceMinor: 15000, currency: 'ARS' }];
  const product = { id: 'p', slug: 'florero', name: 'Florero Ondas', description: 'Una pieza para tu casa.', variants, variantCount: 2,
    primaryImage: { id: 'photo', width: 800, height: 800, alt: '' } };
  const cards = catalogCards([product, { ...product, id: 'sample', variantCount: 20 }, { ...product, id: 'standard', variants: [variants[1]], variantCount: 1 }], false);
  const body = `<main class="catalog-grid">${(await Promise.all(cards.map(card => render('src/presentation/catalog/views/partials/card.hbs', card)))).join('')}</main>${read('src/presentation/catalog/views/partials/info.hbs')}`;
  const js = await bundle(`import { mountCatalogCards } from './src/presentation/catalog/client/browser/catalog-cards';
    const variants = ${JSON.stringify(variants)}; window.added=[];
    mountCatalogCards({getSnapshot:()=>({ready:true}),subscribe:()=>()=>{},addVerified:async(p,id)=>{window.added.push(id);return {variant:variants.find(v=>v.id===id)}}});`);
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, errors } = await pageFor(browser, body, js);
    for (const width of [1280, 768, 390, 320]) {
      await page.goto('about:blank'); await page.setViewportSize({ width, height: 1000 }); await page.goto('https://promotions.test/');
      const card = page.locator('[data-catalog-card]').first(), ribbon = card.locator('[data-card-discount]');
      assert.equal(await ribbon.innerText(), '25% OFF'); assert.equal(await ribbon.isVisible(), true);
      assert.match(await card.locator('[data-card-price] del').innerText(), /100/);
      assert.equal(await page.locator('[data-catalog-card]').nth(1).locator('[data-card-discount]').isVisible(), false);
      assert.equal(await page.locator('[data-catalog-card]').nth(2).locator('[data-card-discount]').isVisible(), false);
      assert.notEqual(await ribbon.evaluate(el => getComputedStyle(el).transform), 'none');
      for (const selector of ['[data-product-share] > summary', '[data-card-info]', '[data-card-zoom] > span']) {
        const box = await card.locator(selector).boundingBox(); assert.equal(box.width, 30); assert.equal(box.height, 30);
      }
      await card.locator('[data-card-choice="normal"]').click();
      assert.equal(await ribbon.isVisible(), false); assert.equal(await card.locator('[data-card-price] del').count(), 0);
      await card.locator('[data-card-choice="sale"]').click(); await card.locator('[data-card-add]').click();
      await page.waitForFunction(() => window.added.length === 1);
      assert.equal(await ribbon.isVisible(), true); assert.equal(await page.evaluate(() => window.added[0]), 'sale');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.screenshot({ path: path.join(output, `catalog-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('discounted and regular cards align purchase rows and keep the top-right ribbon clear of controls', { timeout: 60000 }, async () => {
  fs.mkdirSync(path.join(root, 'artifacts/card-promotion-layout'), { recursive: true });
  const variants = [{ id: 'sale', name: 'Año Nuevo', priceMinor: 1500000, regularPriceMinor: 1800000, discountPercent: '16', currency: 'ARS' },
    { id: 'normal', name: 'Navidad', priceMinor: 1800000, currency: 'ARS' }];
  const product = { id: 'sale-card', slug: 'florero', name: 'Ejemplo · Florero Ondas', description: 'Producto de ejemplo para pruebas visuales. Imagen y precio ilustrativos; no representan inventario real.',
    primaryImage: { id: 'photo', width: 800, height: 800, alt: '' }, variants, variantCount: 2 };
  const cards = catalogCards([product, { ...product, id: 'regular-card', name: 'Ejemplo · Maceta Geométrica',
    variants: [{ ...variants[1], priceMinor: 1200000 }], variantCount: 1 }], false);
  const body = `<main class="catalog-grid">${(await Promise.all(cards.map(card => render('src/presentation/catalog/views/partials/card.hbs', card)))).join('')}</main>${read('src/presentation/catalog/views/partials/info.hbs')}`;
  const js = await bundle(`import { mountCatalogCards } from './src/presentation/catalog/client/browser/catalog-cards';
    mountCatalogCards({getSnapshot:()=>({ready:true}),subscribe:()=>()=>{},addVerified:async()=>{}});`);
  const browser = await chromium.launch({ headless: true }), failures = [];
  try {
    const { page, errors } = await pageFor(browser, body, js);
    for (const width of [1280, 1024, 768, 600, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto('https://promotions.test/');
      await page.evaluate(() => document.fonts.ready);
      const card = page.locator('[data-catalog-card]').first();
      for (const choice of ['sale', 'normal', 'sale']) {
        await card.locator(`[data-card-choice="${choice}"]`).click();
        const metrics = await page.locator('[data-catalog-card]').evaluateAll(cards => cards.map(card => {
          const rect = el => { const { x, y, width, height } = el.getBoundingClientRect(); return { x, y, width, height }; };
          const price = card.querySelector('[data-card-price]'), range = document.createRange(); range.selectNodeContents(price.lastChild);
          return { image: rect(card.querySelector('.catalog-image')), ribbon: rect(card.querySelector('[data-card-discount]')),
            controls: ['[data-product-share] > summary', '[data-card-info]', '[data-card-zoom] > span'].map(selector => rect(card.querySelector(selector))),
            button: rect(card.querySelector('[data-card-add]')), price: rect(range) };
        }));
        const [sale, regular] = metrics;
        if (width >= 600) {
          if (Math.abs(sale.button.y - regular.button.y) > 1) failures.push(`${width}/${choice}: buttons are not aligned`);
          if (Math.abs(sale.price.y - regular.price.y) > 1) failures.push(`${width}/${choice}: payable prices are not aligned`);
        }
        if (choice === 'sale') {
          const { image, ribbon } = sale;
          if (ribbon.x + ribbon.width / 2 < image.x + image.width - 80 || ribbon.y + ribbon.height / 2 > image.y + 80) failures.push(`${width}: ribbon is not in the top-right corner`);
          for (const control of sale.controls) {
            const overlap = control.x < ribbon.x + ribbon.width && control.x + control.width > ribbon.x && control.y < ribbon.y + ribbon.height && control.y + control.height > ribbon.y;
            if (overlap) failures.push(`${width}: ribbon overlaps a photo control`);
          }
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      }
      await page.screenshot({ path: path.join(root, `artifacts/card-promotion-layout/cards-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  } finally { await browser.close(); }
});

test('admin discount drafts save exact amounts, clear explicitly and preserve stale edits', { timeout: 60000 }, async () => {
  const product = { id: 'p', name: 'Florero Ondas', slug: 'florero', description: '', status: 'active', categoryId: null, featured: true, archivedAt: null };
  const variants = ['v1', 'v2'].map((id, index) => ({ id, productId: 'p', sku: id, name: index ? 'Grande' : 'Pequeño', currency: 'ARS', priceMinor: '10000', salePriceMinor: index ? null : '7500', costMinor: null,
    supplyMode: 'made_to_order', stockQuantity: 0, archivedAt: null, materialId: null, colorId: null, options: [] }));
  const pageModel = new AdminProductsPage({ getProduct: async () => ({ ...product, variants, total: 2, page: 1 }), listProducts: async () => ({ items: [], total: 0, page: 1 }) });
  const { model } = await pageModel.read({ view: 'detail', id: 'p' });
  const body = `<main class="admin-root">${await render('src/presentation/admin/views/admin-product-form.hbs', model)}<div id="landing-controls"></div></main>`;
  const js = await bundle(`import { mountProductPricing } from './src/presentation/admin/client/browser/products/product-pricing';
    import { ApiError } from './src/presentation/admin/client/api';
    import { landingControls } from './src/presentation/admin/client/browser/content/landing-controls';
    import { newBlock } from './src/shared/landing-layout';
    const session={getEpoch:()=>1,getSnapshot:()=>({status:'authenticated',user:{role:'owner'},csrf:'test'}),expire:()=>{}};
    window.saved=[];window.conflict=false;
    const root=document.querySelector('[data-product-view]');
    mountProductPricing(root,session,{request:async(path,{body})=>{window.saved.push(body);if(window.conflict)throw new ApiError(409,'Changed');
      return {id:path.split('/').at(-2),productId:'p',priceMinor:String(body.priceMinor),salePriceMinor:body.salePriceMinor===null?null:String(body.salePriceMinor),costMinor:null,currency:'ARS',supplyMode:'made_to_order',stockQuantity:0}}},
      {reserve:()=>({current:()=>true,release:()=>{}}),busy:()=>{},changed:()=>{},canCreate:()=>true,created:()=>{}});
    const block=newBlock('products','products');block.props.mode='featured';document.querySelector('#landing-controls').append(landingControls(block,'landing.blocks.0'));
    document.addEventListener('click',e=>{const b=e.target.closest('[data-variant-cost-toggle]');if(b)b.closest('form').classList.toggle('show-variant-costs')});`);
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, errors } = await pageFor(browser, body, js, true);
    for (const width of [1280, 768, 390, 320]) {
      await page.goto('about:blank'); await page.setViewportSize({ width, height: 1000 }); await page.goto('https://promotions.test/');
      assert.equal(await page.locator('[name="featured"]').isChecked(), true);
      assert.equal(await page.getByRole('combobox', { name: 'Origen de los productos' }).inputValue(), 'featured');
      const form = page.locator('[data-pricing-form]').first(), discount = form.locator('[data-pricing-discount]'), save = form.locator('[data-pricing-save]');
      assert.equal(await discount.inputValue(), '75,00'); await discount.fill('65,50'); assert.equal(await save.isVisible(), true); await save.click();
      await page.waitForFunction(() => window.saved.length === 1 && document.querySelector('[data-pricing-note]').textContent === 'Cambios guardados.');
      assert.equal(await page.evaluate(() => window.saved[0].salePriceMinor), 6550);
      assert.equal(await page.evaluate(() => window.saved[0].expectedSalePriceMinor), '7500');
      assert.equal(await save.isVisible(), false, JSON.stringify(await save.evaluate(el => ({ hidden: el.hidden, display: getComputedStyle(el).display }))));
      await discount.fill(''); await save.click(); await page.waitForFunction(() => window.saved.length === 2);
      assert.equal(await page.evaluate(() => window.saved[1].salePriceMinor), null);
      await page.evaluate(() => { window.conflict = true; }); await discount.fill('60'); await save.click();
      await page.waitForFunction(() => document.querySelector('[data-pricing-save]').disabled);
      assert.equal(await discount.inputValue(), '60'); assert.match(await form.locator('[data-pricing-note]').innerText(), /Conservamos tus cambios/);
      await form.locator('[data-variant-cost-toggle]').click();
      const bounds = await Promise.all(['[data-pricing-sale]', '[data-pricing-discount]', '[data-pricing-cost]', '[data-pricing-markup]'].map(selector => form.locator(selector).boundingBox()));
      await page.screenshot({ path: path.join(output, `admin-${width}.png`), fullPage: true });
      assert.ok(bounds.every(Boolean));
      for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i], b = bounds[j]; assert.ok(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1, `pricing controls must not overlap: ${JSON.stringify({width,i,j,bounds})}`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.screenshot({ path: path.join(output, `admin-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
