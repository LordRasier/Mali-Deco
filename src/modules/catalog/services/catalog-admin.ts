import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, IsNull, type Repository } from 'typeorm';
import { ProductRow, ProductSchema, type VariantRow, VariantSchema } from '../models/catalog.entities';
import { parseCatalogQuery, ProductInput, validateProduct } from '../validation/catalog-validation';
import { validateVariant, validateVariantPrice } from '../models/variant';
import { validAssignment, withAssignments } from './catalog-taxonomy';
import { changePublication } from './catalog-publication';
import { changeVariantStock } from './variant-stock';
import { adjustVariant } from './variant-quick-adjustment';
import { saveVariantPricing, validateInitialPricing } from './variant-pricing';
import { parseAdminProductListQuery, readAdminProductSummaries } from '../queries/admin-product-list';
import { saveVariantImage, validateVariantOptions, type VariantOption } from './variant-options';
import { writeConfiguredVariant } from './variant-configuration';

export interface VariantInput {
  sku: string; name: string; priceMinor: number; currency: string; supplyMode: 'stock' | 'made_to_order';
  materialId?: string | null; colorId?: string | null;
  costMinor?: number | null; stockQuantity?: number;
  options?: VariantOption[];
}

export interface CatalogProductInput extends ProductInput { categoryId?: string | null }
export type VariantPriceInput = Pick<VariantInput, 'priceMinor' | 'currency' | 'supplyMode' | 'costMinor' | 'stockQuantity'>;

export class CatalogAdmin {
  constructor(private readonly db?: DataSource) {}
  private database(): DataSource {
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Catalog database unavailable');
    return this.db;
  }
  async listProducts(query: Record<string, unknown>) {
    const { page, limit, search, status, sort } = parseAdminProductListQuery(query), db = this.database();
    const builder = db.getRepository(ProductSchema).createQueryBuilder('product');
    if (search) builder.andWhere('(LOCATE(:search, product.name) > 0 OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = product.id AND v.archived_at IS NULL AND LOCATE(:search, v.sku) > 0))', { search });
    if (status === 'archived') builder.andWhere('product.archivedAt IS NOT NULL');
    else if (status !== 'all') builder.andWhere('product.archivedAt IS NULL AND product.status = :status', { status });
    const [items, total] = await builder.orderBy('product.name', sort === 'name_desc' ? 'DESC' : 'ASC').addOrderBy('product.id', 'ASC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items: await readAdminProductSummaries(db, items), page, limit, total };
  }
  async getProduct(id: string, query: Record<string, unknown> = {}): Promise<ProductRow & { variants: VariantRow[]; page: number; limit: number; total: number; propertyCatalog?: { name: string; value: string }[] }> {
    const { page, limit } = parseCatalogQuery(query);
    const db = this.database();
    const product = await db.getRepository(ProductSchema).findOneBy({ id });
    if (!product) throw new NotFoundException('Product not found');
    const [variants, total] = await db.getRepository(VariantSchema).findAndCount({
      where: { productId: id }, order: { id: 'ASC' }, skip: (page - 1) * limit, take: limit,
    });
    const ids = [...new Set(variants.flatMap(v => [v.materialId, v.colorId]).filter((id): id is string => !!id))];
    const names = ids.length ? await db.query(`SELECT id, name FROM materials WHERE id IN (${ids.map(() => '?').join(',')})
      UNION ALL SELECT id, name FROM colors WHERE id IN (${ids.map(() => '?').join(',')})`, [...ids, ...ids]) as { id: string; name: string }[] : [];
    const labels = new Map(names.map(row => [row.id, row.name]));
    const propertyCatalog = await db.query(`SELECT DISTINCT 'Color' AS name, c.name AS value FROM product_variants v JOIN colors c ON c.id = v.color_id
      WHERE v.product_id = ? AND v.archived_at IS NULL AND c.archived_at IS NULL
      UNION SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(options_json, '$[0].name')) AS name,
      JSON_UNQUOTE(JSON_EXTRACT(options_json, '$[0].value')) AS value FROM product_variants
      WHERE product_id = ? AND archived_at IS NULL AND JSON_LENGTH(options_json) > 0 LIMIT 501`, [id, id]);
    return { ...product, propertyCatalog, variants: variants.map(v => ({ ...v, materialName: labels.get(v.materialId ?? '') ?? null, colorName: labels.get(v.colorId ?? '') ?? null })), page, limit, total };
  }
  async createProduct(input: CatalogProductInput) {
    validateProduct(input);
    if (input.status !== 'draft') throw new ConflictException({ code: 'USE_PUBLICATION_ACTION' });
    if (!validAssignment(input.categoryId)) throw new BadRequestException('Invalid categoryId');
    const db = this.database();
    return withAssignments(db, [['categories', input.categoryId]], async (manager) => {
      const repo = manager.getRepository(ProductSchema);
      return this.saveUnique(repo.save(repo.create({ id: randomUUID(), archivedAt: null, ...this.productFields(input), categoryId: input.categoryId ?? null })));
    });
  }
  async createProductWithPrice(input: CatalogProductInput, price: VariantPriceInput) {
    validateInitialPricing(price);
    validateProduct(input);
    if (input.status !== 'draft') throw new ConflictException({ code: 'USE_PUBLICATION_ACTION' });
    if (!validAssignment(input.categoryId)) throw new BadRequestException('Invalid categoryId');
    try { validateVariantPrice(price); } catch { throw new BadRequestException('Invalid variant price'); }
    this.validateSupply(price.supplyMode);
    const db = this.database();
    return db.transaction(async manager => {
      if (input.categoryId) {
        const rows: unknown[] = await manager.query('SELECT id FROM categories WHERE id = ? AND archived_at IS NULL FOR UPDATE', [input.categoryId]);
        if (!rows.length) throw new BadRequestException('Unknown or archived categories');
      }
      const products = manager.getRepository(ProductSchema);
      const product = await this.saveUnique(products.save(products.create({ id: randomUUID(), archivedAt: null, ...this.productFields(input), categoryId: input.categoryId ?? null })));
      const variants = manager.getRepository(VariantSchema);
      const variant = { sku: `MD-${randomUUID()}`, name: 'Estándar', ...price };
      await this.saveUnique(variants.save(variants.create({ id: randomUUID(), productId: product.id, archivedAt: null, ...this.variantFields(variant), stockQuantity: price.stockQuantity ?? 0, materialId: null, colorId: null })));
      return product;
    });
  }
  async updateProduct(id: string, input: CatalogProductInput) {
    validateProduct(input);
    if (!validAssignment(input.categoryId)) throw new BadRequestException('Invalid categoryId');
    const db = this.database();
    return withAssignments(db, [['categories', input.categoryId]], async (manager) => {
      const repo = manager.getRepository(ProductSchema);
      const values = { ...this.productFields(input), ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}) };
      const result = await this.saveUnique(repo.update({ id, archivedAt: IsNull(), status: input.status }, values));
      const product = await repo.findOneBy({ id, archivedAt: IsNull() });
      if (!product) throw new NotFoundException('Product not found');
      if (!result.affected) throw new ConflictException({
        code: input.status === 'active' ? 'USE_PUBLICATION_ACTION' : 'PRODUCT_STATUS_CHANGED',
      });
      return product;
    });
  }
  async publishProduct(id: string) { return changePublication(this.database(), id, 'active'); }
  async unpublishProduct(id: string) { return changePublication(this.database(), id, 'draft'); }
  async archiveProduct(id: string) {
    const repo = this.database().getRepository(ProductSchema);
    const result = await repo.update({ id, archivedAt: IsNull() }, { archivedAt: new Date() });
    if (!result.affected) throw new NotFoundException('Product not found');
  }
  async createVariant(productId: string, input: VariantInput) {
    validateInitialPricing(input);
    this.validateVariant(input);
    const db = this.database();
    if (input.options !== undefined) return this.saveUnique(writeConfiguredVariant(db, productId, { ...input, options: validateVariantOptions(input.options) }));
    return withAssignments(db, [['materials', input.materialId], ['colors', input.colorId]], async (manager) => {
      const product = await manager.getRepository(ProductSchema).findOneBy({ id: productId, archivedAt: IsNull() });
      if (!product) throw new NotFoundException('Product not found');
      const repo = manager.getRepository(VariantSchema);
      return this.saveUnique(repo.save(repo.create({ id: randomUUID(), productId, archivedAt: null, ...this.variantFields(input), stockQuantity: input.stockQuantity ?? 0, materialId: input.materialId ?? null, colorId: input.colorId ?? null })));
    });
  }
  async updateVariant(productId: string, id: string, input: VariantInput) {
    this.validateVariant(input);
    const db = this.database();
    if (input.options !== undefined) return this.saveUnique(writeConfiguredVariant(db, productId, { ...input, options: validateVariantOptions(input.options) }, id));
    return withAssignments(db, [['materials', input.materialId], ['colors', input.colorId]], async (manager) => {
      const parent = await manager.getRepository(ProductSchema).findOneBy({ id: productId, archivedAt: IsNull() });
      if (!parent) throw new NotFoundException('Product not found');
      const repo = manager.getRepository(VariantSchema);
      const values = { ...this.variantFields(input), ...(input.materialId !== undefined ? { materialId: input.materialId } : {}), ...(input.colorId !== undefined ? { colorId: input.colorId } : {}) };
      return this.writeVariant(repo, productId, id, values);
    });
  }
  async updateVariantPrice(productId: string, id: string, input: VariantPriceInput) {
    try { validateVariantPrice(input); } catch { throw new BadRequestException('Invalid variant price'); }
    this.validateSupply(input.supplyMode);
    return this.database().transaction(async manager => {
      const parent = await manager.getRepository(ProductSchema).findOne({
        select: { id: true }, where: { id: productId, archivedAt: IsNull() }, lock: { mode: 'pessimistic_write' },
      });
      if (!parent) throw new NotFoundException('Product not found');
      return this.writeVariant(manager.getRepository(VariantSchema), productId, id, {
        priceMinor: String(input.priceMinor), currency: input.currency, supplyMode: input.supplyMode,
      });
    });
  }
  updateVariantStock(productId: string, id: string, input: unknown) {
    return changeVariantStock(this.database(), productId, id, input);
  }
  adjustVariant(productId: string, id: string, input: unknown) {
    return adjustVariant(this.database(), productId, id, input);
  }
  saveVariantPricing(productId: string, id: string, input: unknown) {
    return saveVariantPricing(this.database(), productId, id, input);
  }
  saveVariantImage(productId: string, id: string, input: unknown) {
    return saveVariantImage(this.database(), productId, id, input);
  }
  private async writeVariant(repo: Repository<VariantRow>, productId: string, id: string, values: Partial<VariantRow>) {
    const where = { id, productId, archivedAt: IsNull() };
    const result = await this.saveUnique(repo.update(where, values));
    if (!result.affected) throw new NotFoundException('Variant not found');
    const variant = await repo.findOneBy(where);
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }
  async archiveVariant(productId: string, id: string) {
    const db = this.database();
    if (!await db.getRepository(ProductSchema).findOneBy({ id: productId, archivedAt: IsNull() })) throw new NotFoundException('Product not found');
    const result = await db.getRepository(VariantSchema).update({ id, productId, archivedAt: IsNull() }, { archivedAt: new Date() });
    if (!result.affected) throw new NotFoundException('Variant not found');
  }
  private validateVariant(input: VariantInput) {
    if (!input || typeof input.sku !== 'string' || typeof input.name !== 'string' || typeof input.currency !== 'string') throw new BadRequestException('Invalid variant');
    try { validateVariant(input); } catch { throw new BadRequestException('Invalid variant'); }
    if (!validAssignment(input.materialId) || !validAssignment(input.colorId)) throw new BadRequestException('Invalid variant taxonomy');
    this.validateSupply(input.supplyMode);
    validateVariantOptions(input.options);
  }
  private validateSupply(supplyMode: VariantInput['supplyMode']) {
    if (!['stock', 'made_to_order'].includes(supplyMode)) throw new BadRequestException('Invalid supply mode');
  }
  private async saveUnique<T>(operation: Promise<T>): Promise<T> {
    try { return await operation; } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') throw new ConflictException('Slug or SKU already exists');
      throw error;
    }
  }
  private variantFields(input: VariantInput) {
    return { sku: input.sku, name: input.name, priceMinor: String(input.priceMinor), currency: input.currency, supplyMode: input.supplyMode,
      ...(input.options !== undefined ? { options: validateVariantOptions(input.options) } : {}),
      ...(input.costMinor !== undefined ? { costMinor: input.costMinor === null ? null : String(input.costMinor) } : {}) };
  }
  private productFields(input: ProductInput): Omit<ProductRow, 'id' | 'archivedAt' | 'categoryId'> {
    return {
      name: input.name, slug: input.slug, description: input.description, status: input.status,
      ...(input.bulkWarningThreshold !== undefined ? { bulkWarningThreshold: input.bulkWarningThreshold, bulkWarningMessage: input.bulkWarningMessage?.trim() ?? null } : {}),
      productWeightG: input.productWeightG ?? null, productWidthMm: input.productWidthMm ?? null,
      productHeightMm: input.productHeightMm ?? null, productLengthMm: input.productLengthMm ?? null,
      packageWeightG: input.packageWeightG ?? null, packageWidthMm: input.packageWidthMm ?? null,
      packageHeightMm: input.packageHeightMm ?? null, packageLengthMm: input.packageLengthMm ?? null,
    };
  }
}
