import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPublicImages } from './public-images';

test('batches active images, limits each product, and projects only public fields', async () => {
  let sql = ''; let params: unknown[] = [];
  const db = { query: async (q: string, p: unknown[]) => { sql = q; params = p; return Array.from({ length: 11 }, (_, i) => ({ productId: 'p1', id: `i${i}`, alt: 'alt', width: 10, height: 20, path: 'private' })); } };
  const images = await readPublicImages(db, ['p1', 'p1', 'p2']);
  assert.deepEqual(params, ['p1', 'p2']);
  assert.match(sql, /retired_at IS NULL/);
  assert.match(sql, /p\.status = 'active' AND p\.archived_at IS NULL/);
  assert.match(sql, /ORDER BY i\.position ASC, i\.id ASC/);
  assert.equal(images.get('p1')?.length, 10);
  assert.deepEqual(images.get('p1')?.[0], { id: 'i0', alt: 'alt', width: 10, height: 20 });
  assert.equal(images.has('p2'), false);
});

test('empty product set avoids a query', async () => {
  const images = await readPublicImages({ query: async () => { throw new Error('unexpected'); } }, []);
  assert.equal(images.size, 0);
});
