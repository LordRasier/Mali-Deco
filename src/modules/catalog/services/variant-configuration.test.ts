import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataSource } from 'typeorm';
import { writeConfiguredVariant } from './variant-configuration';
import { validateVariantOptions } from './variant-options';

const input = { sku: 'S', name: 'PLA / Navidad', materialId: 'm', priceMinor: 100, currency: 'ARS', supplyMode: 'stock' as const, options: [{ name: 'Diseño', value: 'Navidad' }] };
test('configured variants require material and exactly one secondary value', async () => {
  const db = {} as DataSource;
  await assert.rejects(writeConfiguredVariant(db, 'p', { ...input, materialId: null }), { status: 400 });
  await assert.rejects(writeConfiguredVariant(db, 'p', { ...input, colorId: 'c' }), { status: 400 });
  assert.throws(() => validateVariantOptions([{ name: 'Diseño', value: 'Navidad' }, { name: 'Diseño', value: 'Año Nuevo' }]), { status: 400 });
  assert.throws(() => validateVariantOptions([{ name: 'Diseño', value: 'Navidad' }, { name: 'Tamaño', value: 'Grande' }]), { status: 400 });
});
test('product lock protects a consistent property and duplicate combinations before saving', async () => {
  let sibling = 'Diseño', duplicate = false, saved = 0, locked = false;
  const tx = { query: async (sql: string) => sql.includes('FROM materials') ? [{ id: 'm' }]
    : sql.includes('SELECT DISTINCT') ? [{ name: sibling }] : duplicate ? [{ id: 'existing' }] : [],
  getRepository: () => ({ findOne: async (q: { lock?: unknown }) => { locked = !!q.lock; return { id: 'p' }; }, create: (x: unknown) => x,
    save: async (x: unknown) => { assert.equal(locked, true); saved++; return x; } }) };
  const db = { transaction: (fn: (tx: unknown) => unknown) => fn(tx) } as unknown as DataSource;
  await writeConfiguredVariant(db, 'p', input); assert.equal(saved, 1);
  duplicate = true; await assert.rejects(writeConfiguredVariant(db, 'p', input), { status: 409 });
  duplicate = false; sibling = 'Tamaño'; await assert.rejects(writeConfiguredVariant(db, 'p', input), { status: 409 });
  assert.equal(saved, 1);
});
