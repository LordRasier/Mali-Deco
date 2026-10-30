import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { ProductSchema, SettingsSchema, VariantRow, VariantSchema } from './catalog.entities';
import { parseCatalogQuery } from './catalog-validation';
import { assertMinorUnits } from './price';

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
    const { page, limit, search } = parseCatalogQuery(query);
    const db = this.database();
    const builder = db.getRepository(ProductSchema).createQueryBuilder('product')
      .where('product.status = :status', { status: 'active' }).andWhere('product.archived_at IS NULL');
    if (search) builder.andWhere('LOCATE(:search, product.name) > 0', { search });
    const [products, total] = await builder.orderBy('product.id', 'ASC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items: products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, description: p.description })), page, limit, total };
  }

  async detail(slug: string, query: Record<string, unknown> = {}) {
    const { page, limit } = parseCatalogQuery(query);
    const db = this.database();
    const product = await db.getRepository(ProductSchema).findOneBy({ slug, status: 'active', archivedAt: IsNull() });
    if (!product) throw new NotFoundException('Product not found');
    const [variants, total] = await db.getRepository(VariantSchema).findAndCount({
      where: { productId: product.id, archivedAt: IsNull() }, order: { id: 'ASC' }, skip: (page - 1) * limit, take: limit,
    });
    return { ...this.present(product, variants), page, limit, total };
  }

  private present(product: { id: string; slug: string; name: string; description: string }, variants: VariantRow[]) {
    return {
      id: product.id, slug: product.slug, name: product.name, description: product.description,
      variants: variants.filter((v) => v.productId === product.id).map((v) => {
        const priceMinor = Number(v.priceMinor);
        assertMinorUnits(priceMinor);
        return { id: v.id, name: v.name, priceMinor, currency: v.currency, supplyMode: v.supplyMode };
      }),
    };
  }
}
