import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, EntitySchema, IsNull } from 'typeorm';
import { CategorySchema, ColorSchema, MaterialSchema, TaxonomyRow } from './catalog.entities';
import { parseCatalogQuery } from './catalog-validation';

export type TaxonomyGroup = 'categories' | 'materials' | 'colors';
export interface TaxonomyInput { slug?: string; name: string; sortOrder?: number; hex?: string | null }
const groups: Record<TaxonomyGroup, { schema: EntitySchema<TaxonomyRow>; referenceTable: string; referenceColumn: string }> = {
  categories: { schema: CategorySchema, referenceTable: 'products', referenceColumn: 'category_id' },
  materials: { schema: MaterialSchema, referenceTable: 'product_variants', referenceColumn: 'material_id' },
  colors: { schema: ColorSchema, referenceTable: 'product_variants', referenceColumn: 'color_id' },
};
export function taxonomyGroup(value: string): TaxonomyGroup {
  if (!Object.hasOwn(groups, value)) throw new NotFoundException('Taxonomy not found');
  return value as TaxonomyGroup;
}
export function validAssignment(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}
export type CatalogDatabase = DataSource | EntityManager;
// Lock each selected taxonomy row until the product/variant write completes. This
// serializes assignment with archive and avoids attaching an already archived row.
export async function withAssignments<T>(db: DataSource, assignments: Array<[TaxonomyGroup, string | null | undefined]>, work: (manager: CatalogDatabase) => Promise<T>): Promise<T> {
  const selected = assignments.filter((entry): entry is [TaxonomyGroup, string] => !!entry[1]);
  if (!selected.length) return work(db);
  return db.transaction(async (manager) => {
    for (const [group, id] of selected) {
      const rows: unknown[] = await manager.query(`SELECT id FROM ${group} WHERE id = ? AND archived_at IS NULL FOR UPDATE`, [id]);
      if (!rows.length) throw new BadRequestException(`Unknown or archived ${group}`);
    }
    return work(manager);
  });
}
function fields(group: TaxonomyGroup, input: TaxonomyInput, create: boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid taxonomy');
  const allowed = create ? ['name', 'slug', 'sortOrder'] : ['name', 'sortOrder'];
  if (group === 'colors') allowed.push('hex');
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new BadRequestException('Invalid taxonomy fields');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100) throw new BadRequestException('Invalid taxonomy name');
  if (create && (typeof input.slug !== 'string' || input.slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug))) throw new BadRequestException('Invalid taxonomy slug');
  if (input.sortOrder !== undefined && (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 4294967295)) throw new BadRequestException('Invalid sort order');
  if (input.hex !== undefined && input.hex !== null && (typeof input.hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(input.hex))) throw new BadRequestException('Invalid color hex');
  return { name: input.name.trim(), ...(create ? { slug: input.slug } : {}),
    ...(create || input.sortOrder !== undefined ? { sortOrder: input.sortOrder ?? 0 } : {}),
    ...(group === 'colors' && (create || input.hex !== undefined) ? { hex: input.hex?.toUpperCase() ?? null } : {}) };
}
export class CatalogTaxonomy {
  constructor(private readonly db?: DataSource) {}
  private database(): DataSource {
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Catalog database unavailable');
    return this.db;
  }
  async list(group: TaxonomyGroup, query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => !['page', 'limit'].includes(key))) throw new BadRequestException('Invalid taxonomy query');
    const { page, limit } = parseCatalogQuery(query);
    const [items, total] = await this.database().getRepository(groups[group].schema).findAndCount({
      where: { archivedAt: IsNull() }, order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' }, skip: (page - 1) * limit, take: limit,
    });
    return { items, page, limit, total };
  }
  async create(group: TaxonomyGroup, input: TaxonomyInput) {
    const values = fields(group, input, true);
    const repo = this.database().getRepository(groups[group].schema);
    try { return await repo.save(repo.create({ id: randomUUID(), archivedAt: null, ...values })); }
    catch (error) { return this.unique(error); }
  }
  async update(group: TaxonomyGroup, id: string, input: TaxonomyInput) {
    const values = fields(group, input, false);
    const repo = this.database().getRepository(groups[group].schema);
    try {
      const result = await repo.update({ id, archivedAt: IsNull() }, values);
      if (!result.affected) throw new NotFoundException('Taxonomy item not found');
      const item = await repo.findOneBy({ id, archivedAt: IsNull() });
      if (!item) throw new NotFoundException('Taxonomy item not found');
      return item;
    } catch (error) { return this.unique(error); }
  }
  async archive(group: TaxonomyGroup, id: string) {
    const db = this.database();
    const { referenceTable, referenceColumn } = groups[group];
    // Assignment uses the same row lock. Check references only after taking it,
    // so an in-flight assignment cannot be missed by a conditional UPDATE.
    await db.transaction(async (manager) => {
      const existing: unknown[] = await manager.query(`SELECT id FROM ${group} WHERE id = ? AND archived_at IS NULL FOR UPDATE`, [id]);
      if (!existing.length) throw new NotFoundException('Taxonomy item not found');
      const references: unknown[] = await manager.query(`SELECT id FROM ${referenceTable} WHERE ${referenceColumn} = ? LIMIT 1 FOR UPDATE`, [id]);
      if (references.length) throw new ConflictException('Taxonomy item is referenced');
      await manager.query(`UPDATE ${group} SET archived_at = CURRENT_TIMESTAMP(6) WHERE id = ?`, [id]);
    });
  }
  private unique(error: unknown): never {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') throw new ConflictException('Taxonomy slug already exists');
    throw error;
  }
}
