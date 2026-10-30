import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { ProductSchema, SettingsSchema, VariantSchema } from './catalog.entities';
import { parseCatalogQuery } from './catalog-validation';
import { assertMinorUnits } from './price';
import { listPublicProducts } from './public-listing';

export class PublicCatalog {
  constructor(private readonly db?: DataSource) {}

  private database(): DataSource {
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Catalog database unavailable');
    return this.db;
  }

  async settings() {
    const settings = await this.database().getRepository(SettingsSchema).findOneBy({ id: 1 });
    if (!settings) throw new NotFoundException('Store settings not configured');
    return { name: settings.storeName };
  }

  async list(query: Record<string, unknown>) {
    return listPublicProducts(this.database(), query);
  }

  async detail(slug: string, query: Record<string, unknown> = {}) {
    const { page, limit } = parseCatalogQuery(query);
    const db = this.database();
    const product = await db.getRepository(ProductSchema).findOneBy({ slug, status: 'active', archivedAt: IsNull() });
    if (!product) throw new NotFoundException('Product not found');
    const [variants, total] = await db.getRepository(VariantSchema).findAndCount({
      where: { productId: product.id, archivedAt: IsNull() }, order: { id: 'ASC' }, skip: (page - 1) * limit, take: limit,
    });
    type Lookup = { id: string; slug: string; name: string; hex?: string | null };
    const readLookups = async (table: 'categories' | 'materials' | 'colors', ids: Array<string | null | undefined>): Promise<Map<string, Lookup>> => {
      const unique = [...new Set(ids.filter((id): id is string => !!id))];
      if (!unique.length) return new Map();
      const fields = table === 'colors' ? 'id, slug, name, hex' : 'id, slug, name';
      const rows: Lookup[] = await db.query(`SELECT ${fields} FROM ${table} WHERE archived_at IS NULL AND id IN (${unique.map(() => '?').join(', ')})`, unique);
      return new Map(rows.map(row => [row.id, row]));
    };
    const [categories, materials, colors] = await Promise.all([
      readLookups('categories', [product.categoryId]), readLookups('materials', variants.map(v => v.materialId)), readLookups('colors', variants.map(v => v.colorId)),
    ]);
    return { id: product.id, slug: product.slug, name: product.name, description: product.description,
      category: product.categoryId ? categories.get(product.categoryId) ?? null : null,
      variants: variants.filter(v => v.productId === product.id).map(v => {
        const priceMinor = Number(v.priceMinor); assertMinorUnits(priceMinor);
        return { id: v.id, name: v.name, priceMinor, currency: v.currency, supplyMode: v.supplyMode,
          material: v.materialId ? materials.get(v.materialId) ?? null : null,
          color: v.colorId ? colors.get(v.colorId) ?? null : null };
      }), page, limit, total };
  }
}
