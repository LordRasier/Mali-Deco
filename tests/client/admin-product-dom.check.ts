import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAdminProducts } from '../../src/presentation/admin/client/browser/products/product-dom';
import { mountNewProductPhotos } from '../../src/presentation/admin/client/browser/products/new-product-photos';
import { createSessionStore } from '../../src/presentation/admin/client/session-core';
import { ApiError, type RequestOptions } from '../../src/presentation/admin/client/api';
import { readVariantOptions } from '../../src/presentation/admin/client/browser/products/variant-options';

// Explicit DOM ports verify event wiring. Real HTML parsing and browser focus are integration checks.
class Control extends EventTarget {
  value = ''; disabled = false; hidden = false; textContent = ''; name = ''; focused = 0;
  dataset: Record<string, string> = {}; children: Control[] = []; attributes = new Map<string, string>();
  ownerDocument = { createElement: () => new Control(), createElementNS: () => new Control() };
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  append(...nodes: Control[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: Control[]) { this.children = nodes; if (['categoryId', 'materialId', 'colorId'].includes(this.name)) this.value = nodes[0]?.value ?? ''; }
  focus() { this.focused++; }
  closest(selector: string) { return selector === '[data-product-action]' && this.dataset.productAction ? this : null; }
  matches(selector: string) { return (selector === '[data-product-form]' && this.name === 'form') || (selector === '[data-variant-form]' && this.name === 'variant-form'); }
}
function dom(variant = false) {
  const fields = new Map<string, Control>();
  for (const name of variant ? ['sku', 'name', 'price', 'currency', 'supplyMode', 'materialId', 'colorId'] : ['name', 'slug', 'description', 'status', 'categoryId', 'bulkWarningThreshold', 'bulkWarningMessage', 'productWeightG', 'productWidthMm', 'productHeightMm', 'productLengthMm', 'packageWeightG', 'packageWidthMm', 'packageHeightMm', 'packageLengthMm']) {
    const field = new Control(); field.name = name; fields.set(name, field);
  }
  for (const [name, value] of Object.entries(variant ? { sku: 'SKU', name: 'Unsaved variant', price: '12.34', currency: 'ars', supplyMode: 'stock', materialId: 'm1', colorId: 'c1' }
    : { name: 'Unsaved product', slug: 'product', status: 'draft', categoryId: 'existing' })) fields.get(name)!.value = value;
  const form = Object.assign(new Control(), { elements: { namedItem: (name: string) => fields.get(name) }, querySelectorAll: () => [] }); form.name = variant ? 'variant-form' : 'form';
  const nodes = new Map<string, Control>(variant ? [['[data-variant-form]', form], ['[data-variant-material]', fields.get('materialId')!], ['[data-variant-color]', fields.get('colorId')!]]
    : [['[data-product-form]', form], ['[data-product-category]', fields.get('categoryId')!]]);
  for (const name of ['message', 'loading', 'category-message']) nodes.set(`[data-product-${name}]`, new Control());
  for (const name of ['material-message', 'color-message', 'price-help']) nodes.set(`[data-variant-${name}]`, new Control());
  for (const action of ['retry', 'categories', 'materials', 'colors']) { const button = new Control(); button.dataset.productAction = action; nodes.set(`[data-product-action="${action}"]`, button); }
  nodes.set('h1', new Control());
  const root = Object.assign(new Control(), { querySelector: (selector: string) => nodes.get(selector) ?? null,
    querySelectorAll: (selector: string) => ['[data-pricing-fields]', '[data-pricing-form]'].includes(selector) ? [] : [...fields.values(), ...nodes.values()] });
  root.dataset.productView = variant ? 'variant-edit' : 'create';
  if (variant) Object.assign(root.dataset, { productId: 'p1', productVariantId: 'v1', productPage: '1' });
  const send = (type: string, target: Control) => { const event = new Event(type, { cancelable: true }); Object.defineProperty(event, 'target', { value: target }); root.dispatchEvent(event); return event; };
  return { root: root as unknown as HTMLElement, fields, form, nodes, send };
}

test('photos from separate folders with matching metadata both survive the save handoff', () => {
  const selected = ['A', 'B'].map(bytes => new File([bytes], 'foto.jpg', {type:'image/jpeg', lastModified: 5}));
  const input = Object.assign(new Control(), { files: selected }), list = new Control(), note = new Control();
  const nodes = new Map([['[data-new-photos-file]', input], ['[data-new-photos-list]', list], ['[data-new-photos-note]', note]]);
  for (const name of ['editor', 'alt', 'title', 'cancel', 'remove']) nodes.set(`[data-new-photos-${name}]`, new Control());
  const root = Object.assign(new Control(), { querySelector: (key: string) => nodes.get(key) ?? null });
  const staging = mountNewProductPhotos(root as unknown as HTMLElement)!;
  try { input.dispatchEvent(new Event('change')); assert.deepEqual(staging.files(), selected); }
  finally { staging.dispose(); }
});
const settle = async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); };

test('dynamic variation rows serialize complete values and reject unfinished or duplicate properties', () => {
  const form = (values: [string, string][]) => ({ querySelectorAll: () => values.map(([name, value]) => ({
    querySelector: (selector: string) => ({ value: selector === '[data-variation-name]' ? name : value }),
  })) }) as unknown as HTMLFormElement;
  assert.deepEqual(readVariantOptions(form([[' Tamaño ', ' Grande '], ['', '']])), [{ name: 'Tamaño', value: 'Grande' }]);
  assert.throws(() => readVariantOptions(form([['Tamaño', '']])));
  assert.throws(() => readVariantOptions(form([['Tamaño', 'Grande'], ['TAMAÑO', 'Chico']])));
  assert.throws(() => readVariantOptions(form([['Color', 'Rojo']])));
  const available = { querySelectorAll: () => [{ dataset: { propertyEnabled: 'false' }, querySelector: () => ({ value: 'Tamaño' }) }] } as unknown as HTMLFormElement;
  assert.deepEqual(readVariantOptions(available), [], 'available properties are not submitted until selected');
});

test('saving either of two stock drafts preserves the other draft and general product fields', async () => {
  const d = dom(); Object.assign(d.root.dataset, { productView: 'detail', productId: 'p1' });
  const forms = ['v1', 'v2'].map(id => {
    const input = new Control(); input.name = 'stockQuantity'; input.value = '3';
    const notice = new Control();
    const form = Object.assign(new Control(), { elements: { namedItem: () => input }, querySelector: () => notice });
    form.dataset = { variantId: id, expectedStock: '3' }; form.matches = selector => selector === '[data-stock-form]';
    input.closest = selector => selector === '[data-stock-form]' ? form : null;
    return { form, input, notice };
  });
  const original = d.root.querySelectorAll.bind(d.root);
  d.root.querySelectorAll = ((selector: string) => selector === '[data-stock-form]' ? forms.map(v => v.form)
    : ['[data-pricing-fields]', '[data-pricing-form]'].includes(selector) ? [] : [...Array.from(original(selector)), ...forms.map(v => v.input)]) as unknown as typeof d.root.querySelectorAll;
  const session = createSessionStore(async () => ({ user: { id: 'cat', email: 'cat@example.invalid', role: 'catalog' }, csrf: 'csrf' }) as never); await session.login('email', 'password');
  const previousFetch = globalThis.fetch, writes: unknown[] = [];
  globalThis.fetch = async (url, options) => { const body = JSON.parse(String(options?.body)); writes.push(body); return new Response(JSON.stringify({ id: String(url).includes('/variants/v1/') ? 'v1' : 'v2', productId: 'p1', stockQuantity: body.stockQuantity }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  const stop = mountAdminProducts(d.root, session, { loadCategories: async () => [] });
  try {
    forms[0].input.value = '5'; forms[1].input.value = '7';
    for (const item of forms) d.send('input', item.input);
    d.send('submit', forms[0].form); await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, 1); assert.equal(forms[0].form.dataset.expectedStock, '5'); assert.equal(forms[1].input.value, '7');
    assert.equal(d.fields.get('name')!.value, 'Unsaved product');
    d.send('submit', forms[1].form); await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, 2); assert.equal(forms[1].form.dataset.expectedStock, '7'); assert.equal(d.root.dataset.productView, 'detail');
  } finally { stop(); globalThis.fetch = previousFetch; }
});

test('clearing a product search returns to the first unfiltered page', async () => {
  const d = dom(); Object.assign(d.root.dataset, { productView: 'list', productPage: '3', productSearch: 'jarrón' });
  const session = createSessionStore(async () => ({ user: { id: 'cat', email: 'cat@example.invalid', role: 'catalog' }, csrf: 'csrf' }) as never);
  await session.login('email', 'password');
  const reads: unknown[] = [];
  const stop = mountAdminProducts(d.root, session, { runtime: { read: async route => { reads.push(route); throw Error('synthetic read'); }, confirm: () => true, request: async () => undefined as never }, loadCategories: async () => [] });
  const clear = new Control(); clear.dataset.productAction = 'clear-search';
  try { d.send('click', clear); await settle(); assert.deepEqual(reads, [{ view: 'list', page: 1, search: '' }]); }
  finally { stop(); }
});

test('clearing list filters resets the page, search, publication state and sorting together', async () => {
  const d = dom(); Object.assign(d.root.dataset, { productView: 'list', productPage: '3', productSearch: 'SKU', productStatusFilter: 'draft', productSort: 'name_desc' });
  const session = createSessionStore(async () => ({ user: { id: 'cat', email: 'cat@example.invalid', role: 'catalog' }, csrf: 'csrf' }) as never);
  await session.login('email', 'password');
  const reads: unknown[] = [];
  const stop = mountAdminProducts(d.root, session, { runtime: { read: async route => { reads.push(route); throw Error('synthetic read'); }, confirm: () => true, request: async () => undefined as never }, loadCategories: async () => [] });
  const clear = new Control(); clear.dataset.productAction = 'clear-filters';
  try { d.send('click', clear); await settle(); assert.deepEqual(reads, [{ view: 'list', page: 1, search: '' }]); }
  finally { stop(); }
});

test('native product submit preserves draft and unchanged category on uncertain writes without automatic retry', async () => {
  const d = dom(), calls: [string, RequestOptions | undefined][] = [];
  const session = createSessionStore(async () => ({ user: { id: 'cat', email: 'cat@example.invalid', role: 'catalog' }, csrf: 'csrf' }) as never);
  await session.login('email', 'password');
  const stop = mountAdminProducts(d.root, session, { runtime: { read: async () => { throw Error('unexpected read'); }, confirm: () => true,
    request: async (path, options) => { calls.push([path, options]); throw new ApiError(0, 'Outcome unknown'); } }, loadCategories: async () => [] });
  await settle(); assert.equal(d.fields.get('categoryId')!.value, 'existing');
  assert.equal(d.send('submit', d.form).defaultPrevented, true); await settle();
  assert.equal(calls.length, 1); assert.equal((calls[0][1]?.body as Record<string, unknown>).name, 'Unsaved product');
  assert.equal('categoryId' in (calls[0][1]?.body as object), false);
  assert.equal(d.fields.get('name')!.value, 'Unsaved product'); assert.equal(d.fields.get('name')!.disabled, false);
  assert.match(d.nodes.get('[data-product-message]')!.textContent, /unknown/);
  stop(); d.send('submit', d.form); await settle(); assert.equal(calls.length, 1);
});

test('native variant form normalizes currency and keeps selections/draft on an uncertain update', async () => {
  const d = dom(true), calls: [string, RequestInit | undefined][] = [], original = globalThis.fetch;
  const session = createSessionStore(async () => ({ user: { id: 'cat', email: 'cat@example.invalid', role: 'catalog' }, csrf: 'csrf' }) as never); await session.login('email', 'password');
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    if (options?.method === 'PUT') return new Response('{}', { status: 503 });
    const id = String(url).includes('/materials') ? 'm1' : 'c1';
    return Response.json({ items: [{ id, slug: id, name: id, sortOrder: 0, archivedAt: null }], page: 1, limit: 100, total: 1 });
  };
  const stop = mountAdminProducts(d.root, session);
  try {
    await new Promise(resolve => setImmediate(resolve)); d.send('input', d.fields.get('currency')!);
    assert.equal(d.fields.get('currency')!.value, 'ARS'); assert.equal(d.send('submit', d.form).defaultPrevented, true);
    await new Promise(resolve => setImmediate(resolve)); await settle();
    const writes = calls.filter(([, options]) => options?.method === 'PUT'); assert.equal(writes.length, 1);
    assert.equal(writes[0][0], '/api/v1/admin/catalog/products/p1/variants/v1');
    const body = JSON.parse(String(writes[0][1]?.body)); assert.equal(body.priceMinor, 1234); assert.equal(body.currency, 'ARS');
    assert.equal(body.materialId, 'm1'); assert.equal(body.colorId, 'c1');
    assert.equal(d.fields.get('name')!.value, 'Unsaved variant'); assert.equal(d.fields.get('materialId')!.value, 'm1');
    assert.match(d.nodes.get('[data-product-message]')!.textContent, /completado/);
  } finally { stop(); globalThis.fetch = original; }
});

test('taxonomy refresh adds options without losing assignments and remains disabled during writes', async () => {
  const d = dom(), category = d.fields.get('categoryId')!, refresh = d.nodes.get('[data-product-action="categories"]')!;
  const session = createSessionStore(async () => ({ user: { id: 'cat', email: 'cat@example.test', role: 'catalog' }, csrf: 'synthetic' }) as never); await session.login('synthetic', 'synthetic');
  let reads = 0, finish!: (value: unknown) => void;
  const existing = { id: 'existing', slug: 'existing', name: 'Existing', sortOrder: 0, archivedAt: null };
  const stop = mountAdminProducts(d.root, session, { loadCategories: async () => {
    reads++; if (reads === 3) throw Error('Synthetic options outage');
    return reads === 1 ? [existing] : [existing, { ...existing, id: 'new', slug: 'new', name: 'New' }];
  }, runtime: { read: async () => { throw Error('Unexpected read'); }, confirm: () => true, request: () => new Promise(resolve => { finish = resolve; }) as never } });
  try {
    await settle(); assert.equal(category.value, 'existing'); assert.equal(category.children.some(option => option.value === 'new'), false);
    d.send('click', refresh); await settle(); assert.equal(category.value, 'existing'); assert.equal(category.children.some(option => option.value === 'new'), true);
    d.send('click', refresh); await settle(); assert.equal(category.value, 'existing'); assert.match(d.nodes.get('[data-product-category-message]')!.textContent, /conservar/);
    d.send('click', refresh); await settle(); d.send('submit', d.form); await settle();
    assert.equal(refresh.disabled, true); assert.equal(category.disabled, true); assert.equal(d.fields.get('name')!.disabled, true);
    finish({}); await settle(); assert.equal(category.value, 'existing'); assert.equal(refresh.disabled, false);
  } finally { stop(); }
});
