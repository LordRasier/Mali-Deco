import assert from 'node:assert/strict';
import { taxonomyInput } from '../src/admin/TaxonomyManager';
import { loadTaxonomy } from '../src/admin/TaxonomySelect';
import { apiRequest } from '../src/admin/api';
import { assignmentPatch } from '../src/admin/form-validation';
import { isTaxonomyItem, isTaxonomyPage } from '../src/admin/taxonomy-data';

assert.deepEqual(assignmentPatch('categoryId', false, null), {});
assert.deepEqual(assignmentPatch('materialId', true, null), { materialId: null });
assert.deepEqual(assignmentPatch('colorId', true, 'abc'), { colorId: 'abc' });

const draft = { name: '  Coral  ', slug: 'coral', sortOrder: '2', hex: '#f47b6b' };
assert.deepEqual(taxonomyInput('colors', draft, true), { name: 'Coral', slug: 'coral', sortOrder: 2, hex: '#f47b6b' });
assert.deepEqual(taxonomyInput('colors', { ...draft, hex: '' }, false), { name: 'Coral', sortOrder: 2, hex: null });
assert.deepEqual(taxonomyInput('materials', draft, false), { name: 'Coral', sortOrder: 2 });
assert.throws(() => taxonomyInput('categories', { ...draft, slug: 'Coral' }, true));
assert.throws(() => taxonomyInput('colors', { ...draft, hex: '#abc' }, true));
assert.throws(() => taxonomyInput('colors', { ...draft, sortOrder: '-1' }, true));
assert.throws(() => taxonomyInput('colors', { ...draft, sortOrder: '4294967296' }, true));
assert.throws(() => taxonomyInput('materials', { ...draft, name: ' ' }, true));

const item = (id: number) => ({ id: String(id), slug: `s-${id}`, name: `N${id}`, sortOrder: id, archivedAt: null });
async function checkRequests() {
assert.equal(isTaxonomyItem(item(1)), true);
assert.equal(isTaxonomyItem({ id: '1' }), false);
assert.equal(isTaxonomyPage({ items: [item(1), item(1)], page: 1, limit: 24, total: 2 }, 1, 24), false);
const originalFetch = globalThis.fetch;
try {
  const calls: string[] = [];
  globalThis.fetch = async input => {
    calls.push(String(input));
    const page = Number(new URL(String(input), 'http://localhost').searchParams.get('page'));
    return Response.json({ items: page === 1 ? Array.from({ length: 100 }, (_, i) => item(i)) : [item(100)], page, limit: 100, total: 101 });
  };
  assert.equal((await loadTaxonomy('categories')).length, 101);
  assert.equal(calls.length, 2);
  globalThis.fetch = async () => Response.json({ items: [], page: 1, limit: 100, total: 2 });
  await assert.rejects(loadTaxonomy('colors'), /incompleta/);
  globalThis.fetch = async () => Response.json({ items: [], page: 1, limit: 100, total: 1001 });
  await assert.rejects(loadTaxonomy('colors'), /completa/);
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await apiRequest('/admin/catalog/categories/123', { method: 'DELETE', csrf: 'token' }), undefined);
  globalThis.fetch = async () => new Response(null, { status: 409 });
  await assert.rejects(apiRequest('/admin/catalog/materials/123', { method: 'DELETE', csrf: 'token' }), /conflicto/);
  globalThis.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(apiRequest('/admin/catalog/colors/123', { method: 'PUT', body: {}, csrf: 'token' }), /podría haberse completado/);
  await assert.rejects(loadTaxonomy('colors'), /conectar/);
} finally { globalThis.fetch = originalFetch; }
}
checkRequests().catch(error => { console.error(error); process.exitCode = 1; });
