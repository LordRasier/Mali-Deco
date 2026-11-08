import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IsNull, type DataSource } from 'typeorm';
import { ProductSchema, VariantSchema } from '../models/catalog.entities';
import type { VariantInput } from './catalog-admin';

/** Configured variants have a material and at most one shared secondary property. */
export async function writeConfiguredVariant(db: DataSource, productId: string, input: VariantInput, id?: string) {
  if (!input.materialId) throw new BadRequestException('Elegí el material de impresión.');
  if ((input.options?.length ?? 0) + (input.colorId ? 1 : 0) > 1) throw new BadRequestException('Usá Material y una sola propiedad adicional, con un valor por variante.');
  return db.transaction(async tx => {
    for (const [table, value] of [['materials', input.materialId], ['colors', input.colorId]]) {
      if (value && !(await tx.query(`SELECT id FROM ${table} WHERE id = ? AND archived_at IS NULL FOR UPDATE`, [value])).length) throw new BadRequestException('La clasificación ya no está disponible.');
    }
    const parent = await tx.getRepository(ProductSchema).findOne({ where: { id: productId, archivedAt: IsNull() }, lock: { mode: 'pessimistic_write' } });
    if (!parent) throw new NotFoundException('Product not found');
    const repo = tx.getRepository(VariantSchema);
    const current = id ? await repo.findOneBy({ id, productId, archivedAt: IsNull() }) : null;
    if (id && !current) throw new NotFoundException('Variant not found');
    const property = input.colorId ? 'Color' : input.options?.[0]?.name ?? '';
    const siblings: { name: string | null }[] = await tx.query(`SELECT DISTINCT CASE WHEN color_id IS NOT NULL THEN 'Color'
      ELSE JSON_UNQUOTE(JSON_EXTRACT(options_json, '$[0].name')) END AS name FROM product_variants
      WHERE product_id = ? AND archived_at IS NULL AND id <> ? LIMIT 3`, [productId, id ?? '']);
    const key = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('es');
    if (siblings.some(row => row.name && key(row.name) !== key(property))) throw new ConflictException('Este producto ya tiene otra propiedad. Usá la misma propiedad en todas sus variantes.');
    const duplicates = await tx.query(`SELECT id FROM product_variants WHERE product_id = ? AND archived_at IS NULL AND id <> ?
      AND material_id = ? AND color_id <=> ? AND LOWER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(options_json, '$[0].name')), ''))) = ?
      AND LOWER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(options_json, '$[0].value')), ''))) = ? LIMIT 1`,
    [productId, id ?? '', input.materialId, input.colorId ?? null, key(input.options?.[0]?.name ?? ''), key(input.options?.[0]?.value ?? '')]);
    if (duplicates.length) throw new ConflictException('Ya existe una variante con ese material y valor. Editá la existente.');
    const values = { sku: input.sku, name: input.name, priceMinor: String(input.priceMinor), currency: input.currency,
      supplyMode: input.supplyMode, materialId: input.materialId, colorId: input.colorId ?? null, options: input.options ?? [] };
    if (current) { const result = await repo.update({ id, productId, archivedAt: IsNull() }, values);
      if (!result.affected) throw new NotFoundException('Variant not found');
      return { ...current, ...values }; }
    return repo.save(repo.create({ id: randomUUID(), productId, archivedAt: null, stockQuantity: input.stockQuantity ?? 0,
      costMinor: input.costMinor == null ? null : String(input.costMinor), ...values }));
  });
}
