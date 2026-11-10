import { EntitySchema } from 'typeorm';

export interface ProductRow {
  id: string; slug: string; name: string; description: string; status: 'draft' | 'active'; archivedAt: Date | null;
  categoryId: string | null;
  bulkWarningThreshold?: number | null; bulkWarningMessage?: string | null;
  productWeightG: number | null; productWidthMm: number | null; productHeightMm: number | null; productLengthMm: number | null;
  packageWeightG: number | null; packageWidthMm: number | null; packageHeightMm: number | null; packageLengthMm: number | null;
}
export interface VariantRow {
  id: string; productId: string; sku: string; name: string; priceMinor: string; currency: string;
  supplyMode: 'stock' | 'made_to_order' | null; archivedAt: Date | null;
  materialId: string | null; colorId: string | null;
  stockQuantity?: number;
  costMinor?: string | null;
  options?: { name: string; value: string }[] | null;
  imageId?: string | null;
  materialName?: string | null; colorName?: string | null;
}
export interface TaxonomyRow { id: string; slug: string; name: string; sortOrder: number; archivedAt: Date | null }
export interface ColorRow extends TaxonomyRow { hex: string | null }
export interface SettingsRow { id: number; storeName: string }

const dimension = (name: string) => ({ name, type: 'int' as const, unsigned: true, nullable: true });
export const ProductSchema = new EntitySchema<ProductRow>({
  name: 'Product', tableName: 'products', columns: {
    id: { type: 'char', length: 36, primary: true }, slug: { type: 'varchar', length: 255 },
    name: { type: 'varchar', length: 255 }, description: { type: 'text' },
    status: { type: 'enum', enum: ['draft', 'active'] }, archivedAt: { name: 'archived_at', type: 'datetime', nullable: true },
    categoryId: { name: 'category_id', type: 'char', length: 36, nullable: true },
    bulkWarningThreshold: dimension('bulk_warning_threshold'),
    bulkWarningMessage: { name: 'bulk_warning_message', type: 'varchar', length: 300, nullable: true },
    productWeightG: dimension('product_weight_g'), productWidthMm: dimension('product_width_mm'),
    productHeightMm: dimension('product_height_mm'), productLengthMm: dimension('product_length_mm'),
    packageWeightG: dimension('package_weight_g'), packageWidthMm: dimension('package_width_mm'),
    packageHeightMm: dimension('package_height_mm'), packageLengthMm: dimension('package_length_mm'),
  },
});
export const VariantSchema = new EntitySchema<VariantRow>({
  name: 'Variant', tableName: 'product_variants', columns: {
    id: { type: 'char', length: 36, primary: true }, productId: { name: 'product_id', type: 'char', length: 36 },
    sku: { type: 'varchar', length: 255 }, name: { type: 'varchar', length: 255 },
    priceMinor: { name: 'price_minor', type: 'bigint', unsigned: true }, currency: { type: 'char', length: 3 },
    costMinor: { name: 'cost_minor', type: 'bigint', unsigned: true, nullable: true },
    options: { name: 'options_json', type: 'json', nullable: true },
    imageId: { name: 'image_id', type: 'char', length: 36, nullable: true },
    materialId: { name: 'material_id', type: 'char', length: 36, nullable: true },
    colorId: { name: 'color_id', type: 'char', length: 36, nullable: true },
    supplyMode: { name: 'supply_mode', type: 'enum', enum: ['stock', 'made_to_order'], nullable: true },
    stockQuantity: { name: 'stock_quantity', type: 'int', unsigned: true, default: 0 },
    archivedAt: { name: 'archived_at', type: 'datetime', nullable: true },
  },
});
export const SettingsSchema = new EntitySchema<SettingsRow>({
  name: 'Settings', tableName: 'store_settings', columns: {
    id: { type: 'tinyint', unsigned: true, primary: true }, storeName: { name: 'store_name', type: 'varchar', length: 255 },
  },
});

const taxonomyColumns = {
  id: { type: 'char' as const, length: 36, primary: true },
  slug: { type: 'varchar' as const, length: 80 },
  name: { type: 'varchar' as const, length: 100 },
  sortOrder: { name: 'sort_order', type: 'int' as const, unsigned: true },
  archivedAt: { name: 'archived_at', type: 'datetime' as const, nullable: true },
};
export const CategorySchema = new EntitySchema<TaxonomyRow>({ name: 'Category', tableName: 'categories', columns: taxonomyColumns });
export const MaterialSchema = new EntitySchema<TaxonomyRow>({ name: 'Material', tableName: 'materials', columns: taxonomyColumns });
export const ColorSchema = new EntitySchema<ColorRow>({ name: 'Color', tableName: 'colors', columns: {
  ...taxonomyColumns, hex: { type: 'char', length: 7, nullable: true },
} });
