import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogCard } from './catalog-card';
import type { Product } from '../../shared/storefront-types';

const product: Product = { id: 'p', slug: 'p', name: 'Pieza', description: '', variantCount: 3,
  variants: [1, 2, 3].map(i => ({ id: `v${i}`, name: `Opción ${i}`, priceMinor: i * 100, currency: i === 3 ? 'USD' : 'ARS' })) };
test('independent cards default to the first option and add the chosen option once during rapid clicks', async () => {
  let finish!: (value: { variant: Product['variants'][number] }) => void; const calls: string[] = [];
  const add = async (p: string, v: string) => { calls.push(`${p}:${v}`); return new Promise<{ variant: Product['variants'][number] }>(accept => { finish = accept; }); };
  const a = createCatalogCard(product, add), b = createCatalogCard(product, add);
  assert.equal(a.snapshot().selected?.id, 'v1'); assert.equal(calls.length, 0);
  a.select('v3'); const pending = a.add(); void a.add(); a.select('v2');
  assert.deepEqual(calls, ['p:v3']); assert.equal(b.snapshot().selected?.id, 'v1');
  assert.equal(a.snapshot().selected?.currency, 'USD'); assert.equal(a.snapshot().pending, true);
  finish({ variant: { ...product.variants[2], priceMinor: 450 } }); await pending;
  assert.equal(a.snapshot().selected?.priceMinor, 450); assert.match(a.snapshot().message, /Agregado/); assert.equal(a.snapshot().pending, false);
});
test('errors are visible and retryable; unloaded or foreign choices cannot be injected', async () => {
  let fail = true; const card = createCatalogCard(product, async () => { if (fail) throw Error('Sin conexión'); return { variant: product.variants[1] }; });
  card.select('invented'); assert.equal(card.snapshot().selected?.id, 'v1');
  card.receive({ ...product, id: 'other' }, 'v2'); assert.equal(card.snapshot().selected?.id, 'v1');
  card.receive({ ...product, variants: [product.variants[1]] }, 'v2');
  await card.add(); assert.equal(card.snapshot().error, 'Sin conexión');
  fail = false; await card.add(); assert.equal(card.snapshot().error, '');
});
test('single variant auto-selects and disposal cancels pending work without a stale confirmation', async () => {
  let signal!: AbortSignal; let finish!: () => void;
  const card = createCatalogCard({ ...product, variantCount: 1, variants: product.variants.slice(0, 1) }, async (_p, _v, s) => {
    signal = s!; await new Promise<void>(accept => { finish = accept; }); return { variant: product.variants[0] };
  });
  const pending = card.add(); card.dispose(); assert.equal(signal.aborted, true); finish(); await pending;
  assert.equal(card.snapshot().message, '');
});

test('returning to the selector placeholder clears the previous purchase choice', async () => {
  let additions = 0;
  const card = createCatalogCard(product, async () => { additions++; return { variant: product.variants[0] }; });
  card.select('v1'); card.select('');
  assert.equal(card.snapshot().selected, undefined);
  await card.add(); assert.equal(additions, 0); assert.match(card.snapshot().error, /Elegí/);
});
