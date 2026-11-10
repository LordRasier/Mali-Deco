import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const name = 'Objeto sintético', slug = 'objeto-sintetico', category = 'Objetos de prueba';
const colors = ['Azul', 'Coral'];
const variantName = color => 'Modelo ' + color;
const fixture = file => fileURLToPath(new URL('../../resources/storefront/' + file, import.meta.url));
const photos = ['florero-ondas.webp', 'maceta-geometrica.webp', 'organizador-arco.webp'];

async function chooseLocalPhotos(page) {
  const input = page.locator('[data-new-photos-file]');
  const rows = page.locator('[data-new-photos-list] li');
  await input.setInputFiles(photos.map(fixture));
  await rows.nth(2).waitFor();
  const previews = rows.locator('img');
  assert.equal(await previews.count(), 3);
  await page.waitForFunction(() => {
    const images = [...globalThis.document.querySelectorAll('[data-new-photos-list] li img')];
    return images.length === 3 && images.every(i => i.complete && i.naturalWidth && i.getBoundingClientRect().width);
  });
  for (const file of photos) await rows.filter({ hasText: file }).waitFor();
  await rows.nth(1).locator('button[data-new-cover]').click();
  return rows;
}

async function assertNothingCreated(db, requests) {
  const [counts] = await db.query('SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM product_images) AS images');
  assert.equal(Number(counts.products), 0);
  assert.equal(Number(counts.images), 0);
  assert.deepEqual(requests, [], 'No draft or upload request may leave the browser before valid Save');
}

async function openEnclosingDetails(control) {
  for (const details of await control.locator('xpath=ancestor::details[not(@open)]').all()) {
    await details.locator(':scope > summary').click();
  }
}
async function inlineTaxonomy(page, kind, value, select) {
  const create = page.locator('[data-taxonomy-create=' + kind + ']:visible');
  await create.click();
  await page.locator('[data-taxonomy-name=' + kind + ']:visible').fill(value);
  await page.locator('[data-taxonomy-confirm=' + kind + ']:visible').click();
  await select.locator('option:checked').filter({ hasText: value }).waitFor({ state: 'attached' });
}
async function variants(page, db) {
  // The standard price is an actual option, not a third orphan when customized.
  await page.locator('[data-simple-price]').fill('900');
  await page.locator('[data-simple-supply]').selectOption('stock');
  await page.locator('[data-simple-save]').click();
  await page.locator('[data-product-action=variant-personalize][data-variant-id]').waitFor();
  const [standard] = await db.query('SELECT id FROM product_variants');
  assert.ok(standard.id);
  await page.locator('[data-simple-price]').fill('950');
  const [priceUpdate] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/variants/' + standard.id + '/price') && r.request().method() === 'PUT'),
    page.locator('[data-simple-save]').click(),
  ]);
  assert.equal(priceUpdate.status(), 200);
  assert.deepEqual(Object.keys(priceUpdate.request().postDataJSON()).sort(), ['currency','priceMinor','supplyMode']);
  assert.equal(Number((await db.query('SELECT price_minor FROM product_variants WHERE id=?', [standard.id]))[0].price_minor), 95000);
  for (const [i, color] of colors.entries()) {
    const create = page.locator(i ? '[data-product-action=variant-create]' : '[data-product-action=variant-personalize]');
    await openEnclosingDetails(create);
    await create.click();
    const form = page.locator('[data-variant-form]:visible');
    await form.waitFor();
    const fill = async (field, value) => {
      const control = form.locator('[name=' + field + ']');
      await openEnclosingDetails(control); await control.fill(value);
    };
    await fill('name', variantName(color));
    await fill('sku', 'QA-' + color);
    await fill('price', i ? '2400' : '1200');
    await form.locator('[name=supplyMode]').selectOption(i ? 'made_to_order' : 'stock');
    await inlineTaxonomy(page, 'colors', color, form.locator('[data-variant-color]'));
    assert.equal(await form.locator('[name=price]').inputValue(), i ? '2400' : '1200');
    const [response] = await Promise.all([
      page.waitForResponse(r => i ? r.url().endsWith('/variants') && r.request().method() === 'POST'
        : r.url().endsWith('/variants/' + standard.id) && r.request().method() === 'PUT'),
      form.locator('[type=submit]').click(),
    ]);
    assert.ok(response.ok(), 'Save variant HTTP ' + response.status() + ': ' + await response.text());
    await form.waitFor({ state: 'hidden' });
  }
}

export async function exerciseEditor({ context, db, email, password }) {
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  await page.goto('/admin');
  await page.locator('[data-admin-email]').fill(email);
  await page.locator('[data-admin-password]').fill(password);
  await page.locator('[data-admin-login-submit]').click();
  await page.locator('[data-product-action=create]').click();
  await page.locator('[data-product-view=create]').waitFor();
  assert.equal(await page.locator('[data-product-save]').count(), 1, 'New product editor must offer an explicit draft save');
  assert.equal(await page.locator('[data-new-photos-file]:visible').count(), 1,
    'Local photos can be selected before entering a name or creating a draft');
  const mediaWrites = [];
  page.on('request', req => {
    const path = new URL(req.url()).pathname;
    if (req.method() === 'POST' && /^\/api\/v1\/admin\/catalog\/products(?:\/[^/]+\/images)?$/.test(path)) mediaWrites.push(path);
  });
  const product = page.locator('[data-product-form]');
  await chooseLocalPhotos(page);
  await assertNothingCreated(db, mediaWrites);
  const discard = dialog => dialog.accept();
  page.on('dialog', discard);
  await page.locator('[data-product-action=list]').click();
  await page.locator('[data-product-view=list]').waitFor();
  page.off('dialog', discard);
  await assertNothingCreated(db, mediaWrites);
  await page.locator('[data-product-action=create]').click();
  await page.locator('[data-new-photos-file]').waitFor();
  assert.equal(await page.locator('[data-new-photos-list] li').count(), 0, 'Cancelled selection must not appear in the next editor');
  const localRows = await chooseLocalPhotos(page);
  await page.locator('[data-product-save]').click();
  await page.locator('[data-product-message]:visible').waitFor();
  assert.equal(await localRows.count(), 3, 'Name validation must preserve the local selection');
  await assertNothingCreated(db, mediaWrites);
  await product.locator('[name=name]').fill(name);
  await product.locator('[name=description]').fill('Descripción de la pieza de prueba.');
  await inlineTaxonomy(page, 'categories', category, product.locator('[name=categoryId]'));
  assert.equal(await product.locator('[name=name]').inputValue(), name);
  await assertNothingCreated(db, mediaWrites);
  // Lose the first metadata read (not the draft write). An explicit read retry
  // must be enough for the original save intent to finish; no second Save.
  const gallery = /\/api\/v1\/admin\/catalog\/products\/[^/]+\/images$/;
  let reads = 0;
  const failFirstRead = async route => {
    if (route.request().method() === 'GET' && ++reads === 1) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Temporary test failure"}' });
    }
    return route.fallback();
  };
  await page.route(gallery, failFirstRead);
  await page.locator('[data-product-save]').click();
  await page.locator('[data-media-reload]').waitFor();
  assert.equal(reads, 1);
  assert.deepEqual(mediaWrites, ['/api/v1/admin/catalog/products']);
  const savedRows = await db.query('SELECT id, slug, status FROM products');
  assert.equal(savedRows.length, 1);
  const [saved] = savedRows;
  assert.equal(saved.status, 'draft'); assert.equal(saved.slug, slug);
  assert.equal((await db.query('SELECT id FROM product_images')).length, 0);
  await page.locator('[data-media-reload]').click();
  const images = page.locator('[data-media-active] .image-row');
  await images.nth(2).waitFor();
  await page.unroute(gallery, failFirstRead);
  assert.equal(reads, 2, 'Only the failed read and explicit read retry are needed');
  assert.deepEqual(mediaWrites, ['/api/v1/admin/catalog/products', ...photos.map(() => '/api/v1/admin/catalog/products/' + saved.id + '/images')]);
  const stored = await db.query('SELECT id,upload_digest,alt FROM product_images ORDER BY position,id');
  assert.equal(stored.length, 3);
  for (const [index, filename] of [photos[1], photos[0], photos[2]].entries()) {
    const digest = createHash('sha256').update(readFileSync(fixture(filename))).update('\0').update(stored[index].alt).digest('hex');
    assert.equal(stored[index].upload_digest, digest, 'Stored original bytes must match intended image at position ' + index);
  }
  const [second, first, third] = stored;
  await images.first().locator('img[src*="' + second.id + '"]').waitFor();
  await images.first().locator('[data-media-cover]').waitFor();
  const publicPage = await context.browser().newPage({ baseURL: new URL(page.url()).origin });
  await publicPage.route('**/*', route => new URL(route.request().url()).origin === new URL(page.url()).origin
    ? route.continue() : route.abort());
  await publicPage.goto('/catalogo');
  assert.equal(await publicPage.locator('.catalog-card').count(), 0, 'Draft not publicly listed');

  const files = page.locator('[data-media-file]');
  await openEnclosingDetails(files);
  await files.setInputFiles(fixture(photos[0]));
  const attempted = [];
  const recordPublication = req => { if (req.method() === 'POST' && req.url().endsWith('/publish')) attempted.push(req.url()); };
  page.on('request', recordPublication);
  await page.locator('[data-product-publish]').click();
  await page.locator('[data-product-message]').filter({hasText:'fotos pendientes'}).waitFor();
  assert.equal(attempted.length, 0, 'Publication cannot race an unfinished gallery');
  page.off('request', recordPublication);
  await page.locator('[data-media-discard]').click();
  assert.equal((await db.query('SELECT id FROM product_images')).length, 3, 'Discarding an extra pending upload does not persist it');
  await variants(page, db);
  const preview = page.locator('[data-product-preview]');
  await preview.locator('[data-preview-cover][src*="' + second.id + '"]').waitFor();
  assert.equal(await preview.locator('[data-preview-name]').innerText(), name);
  const previewPrice = await preview.locator('p').innerText();
  const desktop = page.viewportSize();
  await page.setViewportSize({width: 1400, height: 900});
  const bounds = async locator => { const box = await locator.boundingBox(); assert.ok(box); return box; };
  const titleField = await bounds(product.locator('[name=name]')), categoryField = await bounds(product.locator('[name=categoryId]'));
  assert.equal(titleField.y, categoryField.y, 'Desktop name and category controls share a baseline');
  assert.equal(titleField.height, categoryField.height);
  await page.setViewportSize({width: 390, height: 844});
  assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), 'Mobile editor has no horizontal overflow');
  const save = await bounds(page.locator('[data-product-save]'));
  assert.ok(save.x >= 0 && save.x + save.width <= 390 && save.y >= 0 && save.y + save.height <= 844, 'Mobile save stays on screen');
  if (desktop) await page.setViewportSize(desktop);
  const [published] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/publish') && r.request().method() === 'POST'),
    page.locator('[data-product-publish]').click(),
  ]);
  assert.equal(published.status(), 200, await published.text());
  await publicPage.reload();
  const card = publicPage.locator('.catalog-card').filter({ hasText: name });
  await card.waitFor();
  assert.ok((await card.locator('img').getAttribute('src')).includes(second.id));
  assert.equal(await card.locator('.catalog-price').innerText(), previewPrice, 'Preview must represent the public card price');
  const publicListing = (await (await publicPage.request.get('/api/v1/catalog/products?currency=ARS')).json()).items;
  assert.equal(publicListing.length, 1); assert.equal(publicListing[0].category.name, category);
  assert.deepEqual(publicListing[0].priceRange, { currency: 'ARS', minMinor: 120000, maxMinor: 240000 });
  await card.locator('a').click();
  assert.equal(await publicPage.locator('[data-product-image]').count(), 3);
  assert.equal(await publicPage.locator('[data-product-variant]').count(), 2);
  const detail = await (await publicPage.request.get('/api/v1/catalog/products/' + slug)).json();
  assert.deepEqual(detail.images.map(i => i.id), [second.id, first.id, third.id]);
  assert.deepEqual(detail.variants.map(v => [v.name,v.color.name,v.priceMinor,v.supplyMode]).sort(),
    [['Modelo Azul','Azul',120000,'stock'], ['Modelo Coral','Coral',240000,'made_to_order']]);

  await page.reload();
  const openProduct = () => page.locator('[data-product-action=detail][data-product-id="' + saved.id + '"]').click();
  await openProduct();
  await product.waitFor();
  assert.equal(await product.locator('[name=name]').inputValue(), name);
  await product.locator('select[name=categoryId] option:checked').filter({ hasText: category }).waitFor({ state: 'attached' });
  await images.nth(2).waitFor({ state: 'attached' });
  assert.ok((await images.first().locator('img').getAttribute('src')).includes(second.id));
  const writes = [];
  page.on('request', request => { if (!['HEAD', 'GET', 'OPTIONS'].includes(request.method())) writes.push(request.method()); });
  await product.locator('[name=name]').fill('Cambio sin guardar');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('[data-product-action=list]').click();
  assert.equal(await product.locator('[name=name]').inputValue(), 'Cambio sin guardar', 'Cancel close retains unsaved input');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-product-action=list]').click();
  await page.locator('[data-product-view=list]').waitFor();
  assert.deepEqual(writes, [], 'Closing a saved editor must never archive or mutate the record');
  assert.deepEqual((await db.query('SELECT id,name,status,archived_at FROM products')).map(p => [p.id,p.name,p.status,p.archived_at]), [[saved.id,name,'active',null]]);
  for (const [table, expected] of [['product_variants',2],['product_images',3],['categories',1],['colors',2]]) {
    assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM ' + table))[0].n), expected, 'Persisted ' + table);
  }
  // Separate archived fixture: inspecting a retired item must not expose publishing.
  const archivedId = randomUUID();
  await db.query("INSERT INTO products(id,name,slug,description,status,archived_at) VALUES(?,?,?,'','draft',NOW())",
    [archivedId,'Archivado de prueba','archivado-de-prueba']);
  await page.reload();
  await page.locator('[data-product-action=detail][data-product-id="' + archivedId + '"]').click();
  await page.locator('[data-product-archived=true]').waitFor();
  assert.equal(await page.locator('[data-product-publish]:visible:enabled').count(), 0);
  const headers = { origin: new URL(page.url()).origin };
  const csrf = await page.request.post('/api/v1/auth/csrf', { headers });
  assert.ok(csrf.ok());
  const denied = await page.request.post('/api/v1/admin/catalog/products/' + archivedId + '/publish',
    { headers: { ...headers, 'x-csrf-token': (await csrf.json()).csrf } });
  assert.equal(denied.status(), 404, 'Archive is also read-only at the publish endpoint');
  await publicPage.close();
}
