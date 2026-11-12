import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataSource } from 'typeorm';
import { parseCartResolution, PublicCartResolver } from './cart-resolver';

const row = {
  stockQuantity: 0, bulkWarningThreshold: 3, bulkWarningMessage: 'Large order',
  productId: 'p1', productSlug: 'pieza', productName: 'Pieza', productDescription: '',
  variantId: 'v1', variantName: 'Rojo', priceMinor: '12300', currency: 'ARS', supplyMode: 'stock',
  materialId: null, materialSlug: null, materialName: null,
  colorId: 'c1', colorSlug: 'rojo', colorName: 'Rojo', colorHex: '#ff0000',
  sku: 'PRIVATE-SKU', internalNote: 'PRIVATE-NOTE',
};

test('cart resolution returns the active sale price and regular price without trusting client prices', async () => {
  const db = { isInitialized: true, query: async (sql: string) => sql.includes('FROM product_images') ? [] : [{ ...row, salePriceMinor: '9840' }] } as unknown as DataSource;
  const result = await new PublicCartResolver(db).resolve({ lines: [{ productId: 'p1', variantId: 'v1' }] });
  assert.equal(result.resolved[0].variant.priceMinor, 9840);
  assert.equal(result.resolved[0].variant.regularPriceMinor, 12300);
  assert.equal(result.resolved[0].variant.discountPercent, '20');
});

test('resolver partitions requested pairs independently of page and hides private columns', async () => {
  let sql = ''; let params: unknown[] = [];
  const db = { isInitialized: true, query: async (q: string, p: unknown[]) => { if (q.includes('FROM product_images')) return []; sql = q; params = p; return [row]; } } as unknown as DataSource;
  const lines = [{ productId: 'p1', variantId: 'v1' }, { productId: 'p2', variantId: 'v1' }, { productId: 'p1', variantId: 'gone' }];
  const result = await new PublicCartResolver(db).resolve({ lines });
  assert.deepEqual(result.missing, lines.slice(1));
  assert.deepEqual(result.resolved, [{
    ...lines[0], product: { id: 'p1', slug: 'pieza', name: 'Pieza', description: '', primaryImage: null, bulkWarningThreshold: 3, bulkWarningMessage: 'Large order' },
    variant: { id: 'v1', name: 'Rojo', priceMinor: 12300, currency: 'ARS', supplyMode: 'stock', stockQuantity: 0, material: null,
      color: { id: 'c1', slug: 'rojo', name: 'Rojo', hex: '#ff0000' } },
  }]);
  assert.deepEqual(params, ['p1', 'v1', 'p2', 'v1', 'p1', 'gone']);
  assert.match(sql, /v\.product_id = p\.id/);
  assert.match(sql, /p\.status = 'active'/);
  assert.match(sql, /p\.archived_at IS NULL AND v\.archived_at IS NULL/);
  assert.equal(sql.includes('PRIVATE'), false);
});

test('empty and null taxonomy resolve safely, but database failure is never a missing result', async () => {
  await assert.rejects(new PublicCartResolver().resolve({ lines: [{ productId: 'p1', variantId: 'v1' }] }), { status: 503 });
  await assert.rejects(new PublicCartResolver().resolve({ lines: [] }), { status: 503 });
  const db = { isInitialized: true, query: async () => { throw new Error('connection failed'); } } as unknown as DataSource;
  await assert.rejects(new PublicCartResolver(db).resolve({ lines: [{ productId: 'p', variantId: 'v' }] }), /connection failed/);
  assert.deepEqual(await new PublicCartResolver(db).resolve({ lines: [] }), { resolved: [], missing: [] });
  const disconnected = { isInitialized: true, query: async () => { throw Object.assign(new Error('lost'), { code: 'ECONNRESET' }); } } as unknown as DataSource;
  await assert.rejects(new PublicCartResolver(disconnected).resolve({ lines: [{ productId: 'p', variantId: 'v' }] }), { status: 503 });
});

test('resolver rejects malformed, duplicate, oversized and unbounded requests', () => {
  const pair = { productId: 'p', variantId: 'v' };
  const invalid: unknown[] = [null, [], {}, { lines: 'no' }, { lines: [], extra: 1 },
    { lines: [{ ...pair, quantity: 1 }] }, { lines: [pair, pair] },
    { lines: [{ productId: '', variantId: 'v' }] }, { lines: [{ productId: 'x'.repeat(37), variantId: 'v' }] },
    { lines: [{ productId: 'p\u0000', variantId: 'v' }] }, { lines: Array.from({ length: 101 }, (_, i) => ({ productId: 'p', variantId: `v${i}` })) }];
  for (const body of invalid) assert.throws(() => parseCartResolution(body), { status: 400 });
  assert.equal(parseCartResolution({ lines: Array.from({ length: 100 }, (_, i) => ({ productId: 'p', variantId: `v${i}` })) }).length, 100);
});

test('unsafe prices fail the whole resolution instead of producing an authoritative partial result', async () => {
  const db = { isInitialized: true, query: async () => [{ ...row, priceMinor: '9007199254740992' }] } as unknown as DataSource;
  await assert.rejects(new PublicCartResolver(db).resolve({ lines: [{ productId: 'p1', variantId: 'v1' }] }), /Price/);
});
