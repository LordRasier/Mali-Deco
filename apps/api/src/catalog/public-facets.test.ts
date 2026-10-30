import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { PublicFacets } from './public-facets';

test('facets reject malformed queries and distinguish unavailable database', async () => {
  const facets = new PublicFacets();
  for (const currency of ['ars', 'AR', 'USDD', ['ARS', 'USD'], '', 3]) {
    await assert.rejects(facets.get({ currency }), { status: 400 });
  }
  await assert.rejects(facets.get({ extra: 'x' }), { status: 400 });
  await assert.rejects(facets.get({ currency: 'ARS' }), { status: 503 });
});

test('empty persisted data does not invent choices or range', async () => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const db = { isInitialized: true, query: async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return sql.includes('MIN(v.price_minor)') ? [{ minMinor: null, maxMinor: null }] : [];
  } } as unknown as DataSource;
  assert.deepEqual(await new PublicFacets(db).get({ currency: 'ARS' }), {
    categories: [], materials: [], colors: [], currencies: [], priceRange: null,
    truncated: { categories: false, materials: false, colors: false },
  });
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map((call) => call.params), [['ARS'], ['ARS'], ['ARS'], undefined, ['ARS']]);
  assert.ok(calls.every((call) => !call.sql.includes("'ARS'")), 'currency is parameterized');
  assert.ok(calls.slice(0, 3).every((call) => call.sql.includes('LIMIT 201')));
});

test('currency range is exact, currencies remain globally switchable and choices are bounded', async () => {
  const choices = Array.from({ length: 201 }, (_, index) => ({ id: `${index}`, slug: `s-${index}`, name: `N${index}`, sortOrder: index }));
  const db = { isInitialized: true, query: async (sql: string) => {
    if (sql.includes('FROM categories')) return choices;
    if (sql.includes('FROM materials')) return [choices[0]];
    if (sql.includes('FROM colors')) return [{ ...choices[0], hex: null }];
    if (sql.includes('SELECT DISTINCT')) return [{ currency: 'ARS' }, { currency: 'USD' }];
    return [{ minMinor: '0', maxMinor: '9007199254740991' }];
  } } as unknown as DataSource;
  const result = await new PublicFacets(db).get({ currency: 'ARS' });
  assert.equal(result.categories.length, 200);
  assert.deepEqual(result.truncated, { categories: true, materials: false, colors: false });
  assert.deepEqual(result.currencies, ['ARS', 'USD']);
  assert.deepEqual(result.priceRange, { currency: 'ARS', minMinor: 0, maxMinor: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(result.colors[0], { ...choices[0], hex: null });
});

test('unscoped facets never compare mixed-currency prices', async () => {
  const calls: string[] = [];
  const db = { isInitialized: true, query: async (sql: string) => { calls.push(sql); return []; } } as unknown as DataSource;
  const result = await new PublicFacets(db).get();
  assert.equal(result.priceRange, null);
  assert.equal(calls.length, 4);
  assert.equal(calls.some((sql) => sql.includes('MIN(v.price_minor)')), false);
});

test('public eligibility and selected currency are applied without filtering global currency choices', async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const db = { isInitialized: true, query: async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return sql.includes('MIN(v.price_minor)') ? [{ minMinor: null, maxMinor: null }] : [];
  } } as unknown as DataSource;
  await new PublicFacets(db).get({ currency: 'USD' });
  for (const call of calls) {
    assert.match(call.sql, /p\.status = 'active'/);
    assert.match(call.sql, /p\.archived_at IS NULL/);
    assert.match(call.sql, /v\.archived_at IS NULL/);
  }
  for (const call of calls.slice(0, 3)) assert.match(call.sql, /\.archived_at IS NULL AND EXISTS/);
  assert.ok(calls.slice(0, 3).every((call) => call.sql.includes('v.currency = ?')));
  assert.ok(!calls[3].sql.includes('v.currency = ?'));
});

test('an out-of-range persisted price is never exposed as a rounded amount', async () => {
  const db = { isInitialized: true, query: async (sql: string) => sql.includes('MIN(v.price_minor)')
    ? [{ minMinor: '0', maxMinor: '9007199254740992' }] : [] } as unknown as DataSource;
  await assert.rejects(new PublicFacets(db).get({ currency: 'ARS' }), RangeError);
});
