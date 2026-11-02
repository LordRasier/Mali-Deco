import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, IsNull } from 'typeorm';
import { ProductRow, ProductSchema, VariantSchema } from './catalog.entities';
import { parseCatalogQuery, ProductInput, validateProduct } from './catalog-validation';
import { validateVariant } from './variant';
import { validAssignment, withAssignments } from './catalog-taxonomy';

export interface VariantInput {
  sku: string; name: string; priceMinor: number; currency: string; supplyMode: 'stock' | 'made_to_order';
  materialId?: string | null; colorId?: string | null;
}

export interface CatalogProductInput extends ProductInput { categoryId?: string | null }

export class CatalogAdmin {
  constructor(private readonly db?: DataSource) {}
  private database(): DataSource {
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Catalog database unavailable');
    return this.db;
  }
  async listProducts(query: Record<string, unknown>) {
    const { page, limit, search } = parseCatalogQuery(query);
    const builder = this.database().getRepository(ProductSchema).createQueryBuilder('product');
    if (search) builder.where('LOCATE(:search, product.name) > 0', { search });
    const [items, total] = await builder.orderBy('product.id', 'ASC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, page, limit, total };
  }
  async getProduct(id: string, query: Record<string, unknown> = {}) {
    const { page, limit } = parseCatalogQuery(query);
    const db = this.database();
    const product = await db.getRepository(ProductSchema).findOneBy({ id });
    if (!product) throw new NotFoundException('Product not found');
    const [variants, total] = await db.getRepository(VariantSchema).findAndCount({
      where: { productId: id }, order: { id: 'ASC' }, skip: (page - 1) * limit, take: limit,
    });
    return { ...product, variants, page, limit, total };
  }
  async createProduct(input: CatalogProductInput) {
    validateProduct(input);
    if (!validAssignment(input.categoryId)) throw new BadRequestException('Invalid categoryId');
    const db = this.database();
    return withAssignments(db, [['categories', input.categoryId]], async (manager) => {
      const repo = manager.getRepository(ProductSchema);
      return this.saveUnique(repo.save(repo.create({ id: randomUUID(), archivedAt: null, ...this.productFields(input), categoryId: input.categoryId ?? null })));
    });
  }
  async updateProduct(id: string, input: CatalogProductInput) {
    validateProduct(input);
    if (!validAssignment(input.categoryId)) throw new BadRequestException('Invalid categoryId');
    const db = this.database();
    return withAssignments(db, [['categories', input.categoryId]], async (manager) => {
      const repo = manager.getRepository(ProductSchema);
      const values = { ...this.productFields(input), ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}) };
      const result = await this.saveUnique(repo.update({ id, archivedAt: IsNull() }, values));
      if (!result.affected) throw new NotFoundException('Product not found');
      const product = await repo.findOneBy({ id, archivedAt: IsNull() });
      if (!product) throw new NotFoundException('Product not found');
      return product;
    });
  }
  async archiveProduct(id: string) {
    const repo = this.database().getRepository(ProductSchema);
    const result = await repo.update({ id, archivedAt: IsNull() }, { archivedAt: new Date() });
    if (!result.affected) throw new NotFoundException('Product not found');
  }
  async createVariant(productId: string, input: VariantInput) {
    this.validateVariant(input);
    const db = this.database();
    return withAssignments(db, [['materials', input.materialId], ['colors', input.colorId]], async (manager) => {
      const product = await manager.getRepository(ProductSchema).findOneBy({ id: productId, archivedAt: IsNull() });
      if (!product) throw new NotFoundException('Product not found');
      const repo = manager.getRepository(VariantSchema);
      return this.saveUnique(repo.save(repo.create({ id: randomUUID(), productId, archivedAt: null, ...this.variantFields(input), materialId: input.materialId ?? null, colorId: input.colorId ?? null })));
    });
  }
  async updateVariant(productId: string, id: string, input: VariantInput) {
    this.validateVariant(input);
    const db = this.database();
    return withAssignments(db, [['materials', input.materialId], ['colors', input.colorId]], async (manager) => {
      const parent = await manager.getRepository(ProductSchema).findOneBy({ id: productId, archivedAt: IsNull() });
      if (!parent) throw new NotFoundException('Product not found');
      const repo = manager.getRepository(VariantSchema);
      const values = { ...this.variantFields(input), ...(input.materialId !== undefined ? { materialId: input.materialId } : {}), ...(input.colorId !== undefined ? { colorId: input.colorId } : {}) };
      const result = await this.saveUnique(repo.update({ id, productId, archivedAt: IsNull() }, values));
      if (!result.affected) throw new NotFoundException('Variant not found');
      const variant = await repo.findOneBy({ id, productId, archivedAt: IsNull() });
      if (!variant) throw new NotFoundException('Variant not found');
      return variant;
    });
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
    if (!['stock', 'made_to_order'].includes(input.supplyMode)) throw new BadRequestException('Invalid supply mode');
  }
  private async saveUnique<T>(operation: Promise<T>): Promise<T> {
    try { return await operation; } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') throw new ConflictException('Slug or SKU already exists');
      throw error;
    }
  }
  private variantFields(input: VariantInput) {
    return { sku: input.sku, name: input.name, priceMinor: String(input.priceMinor), currency: input.currency, supplyMode: input.supplyMode };
  }
  private productFields(input: ProductInput): Omit<ProductRow, 'id' | 'archivedAt' | 'categoryId'> {
    return {
      name: input.name, slug: input.slug, description: input.description, status: input.status,
      productWeightG: input.productWeightG ?? null, productWidthMm: input.productWidthMm ?? null,
      productHeightMm: input.productHeightMm ?? null, productLengthMm: input.productLengthMm ?? null,
      packageWeightG: input.packageWeightG ?? null, packageWidthMm: input.packageWidthMm ?? null,
      packageHeightMm: input.packageHeightMm ?? null, packageLengthMm: input.packageLengthMm ?? null,
    };
  }
}
