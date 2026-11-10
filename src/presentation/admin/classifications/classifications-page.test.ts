import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClassificationsPage } from './classifications-page';
import { taxonomyInput } from '../shared/taxonomy-input';
import { AdminPage } from '../admin-page';
import { createViewEngine } from '../../view-engine';
import { join } from 'node:path';

function fixture() {
  const calls: unknown[] = [];
  const service = { list: async (kind: 'categories' | 'materials' | 'colors', query: Record<string, unknown>) => {
    calls.push([kind, query]); return { page: Number(query.page), limit: 24, total: 25,
      items: [{ id: 'c1', name: '<b>Coral</b>', slug: 'coral', sortOrder: 2, archivedAt: null, ...(kind === 'colors' ? { hex: '#F47B6B' } : {}) }] };
  } };
  return { calls, service, page: new ClassificationsPage(service) };
}

test('classification reads keep bounded pages and select edit identity only from its originating page', async () => {
  const f = fixture(), list = await f.page.read({ kind: 'colors', page: '2' });
  assert.equal(list.view, 'admin-classifications-list'); assert.deepEqual(f.calls, [['colors', { page: '2', limit: '24' }]]);
  assert.equal(list.model.items[0].hex, '#F47B6B'); assert.equal(list.model.hasPrevious, true);
  const edit = await f.page.read({ view: 'edit', kind: 'colors', page: '2', id: 'c1' });
  assert.equal(edit.view, 'admin-classification-form'); assert.equal(edit.model.editing, true); assert.equal(edit.model.item.slug, 'coral');
  await assert.rejects(f.page.read({ view: 'edit', kind: 'colors', page: '2', id: 'off-page' }), NotFoundException);
  assert.equal(f.calls.length, 3, 'never scans other pages');
});

test('create has no database read; unknown/repeated/cross-view query fields fail closed', async () => {
  const f = fixture(), create = await f.page.read({ view: 'create', kind: 'materials' });
  assert.equal(create.model.item.sortOrder, '0'); assert.equal(create.model.editing, false); assert.deepEqual(f.calls, []);
  for (const query of [{ kind: 'unknown' }, { kind: ['colors'] }, { layout: 'secret' }, { page: '0' }, { view: 'create', id: 'c1' }, { view: 'edit' }, { view: 'edit', id: ['c1'] }]) {
    await assert.rejects(f.page.read(query), BadRequestException);
  }
  assert.deepEqual(f.calls, []);
});

test('classification role checks happen before any service reads', async () => {
  const f = fixture(), page = new AdminPage({ me: async () => ({ user: { id: 'ops', email: 'ops@example.invalid', role: 'operations' } }) }, { classifications: f.page });
  assert.equal((await page.section('token', 'classifications', {})).status, 403); assert.deepEqual(f.calls, []);
});

test('shared classification validation preserves immutable slug, integer order and explicit color clearing', () => {
  const draft = { name: ' Coral ', slug: 'coral', sortOrder: '2', hex: '#f47b6b' };
  assert.deepEqual(taxonomyInput('colors', draft, true), { name: 'Coral', slug: 'coral', sortOrder: 2, hex: '#f47b6b' });
  assert.deepEqual(taxonomyInput('colors', { ...draft, hex: '' }, false), { name: 'Coral', sortOrder: 2, hex: null });
  assert.equal('slug' in taxonomyInput('materials', draft, false), false);
  for (const value of [{ ...draft, sortOrder: '-1' }, { ...draft, sortOrder: '4294967296' }, { ...draft, hex: '#abc' }, { ...draft, slug: 'Invalid' }]) assert.throws(() => taxonomyInput('colors', value, true));
});

test('classification templates escape names, retain immutable slugs and use safe native form fallback', async () => {
  const f = fixture(), engine = createViewEngine({});
  const render = async (query: Record<string, unknown>) => { const result = await f.page.read(query);
    return new Promise<string>((resolve, reject) => engine.__express(join(__dirname, '..', 'views', `${result.view}.hbs`), result.model, (error, html) => error ? reject(error) : resolve(html!))); };
  const list = await render({ kind: 'colors' }); assert.match(list, /&lt;b&gt;Coral/); assert.doesNotMatch(list, /<b>Coral/);
  const edit = await render({ kind: 'colors', view: 'edit', id: 'c1', page: '2' });
  assert.match(edit, /data-classification-form[^>]*method="post"/); assert.match(edit, /name="slug"[^>]*disabled/); assert.match(edit, /name="hex"/);
  assert.doesNotMatch(edit, /data-classification-action="kind"|Restaurar/);
  assert.doesNotMatch(await render({ kind: 'materials', view: 'create' }), /name="hex"/);
});
