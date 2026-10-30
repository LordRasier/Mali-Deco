import { EntitySchema } from 'typeorm';

export interface ProductRow {
  id: string; slug: string; name: string; description: string; status: 'draft' | 'active'; archivedAt: Date | null;
  productWeightG: number | null; productWidthMm: number | null; productHeightMm: number | null; productLengthMm: number | null;
  packageWeightG: number | null; packageWidthMm: number | null; packageHeightMm: number | null; packageLengthMm: number | null;
}
export interface VariantRow {
  id: string; productId: string; sku: string; name: string; priceMinor: string; currency: string;
  supplyMode: 'stock' | 'made_to_order' | null; archivedAt: Date | null;
}
export interface SettingsRow { id: number; storeName: string }

const dimension = (name: string) => ({ name, type: 'int' as const, unsigned: true, nullable: true });
export const ProductSchema = new EntitySchema<ProductRow>({
  name: 'Product', tableName: 'products', columns: {
    id: { type: 'char', length: 36, primary: true }, slug: { type: 'varchar', length: 255 },
    name: { type: 'varchar', length: 255 }, description: { type: 'text' },
    status: { type: 'enum', enum: ['draft', 'active'] }, archivedAt: { name: 'archived_at', type: 'datetime', nullable: true },
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
    supplyMode: { name: 'supply_mode', type: 'enum', enum: ['stock', 'made_to_order'], nullable: true },
    archivedAt: { name: 'archived_at', type: 'datetime', nullable: true },
  },
});
export const SettingsSchema = new EntitySchema<SettingsRow>({
  name: 'Settings', tableName: 'store_settings', columns: {
    id: { type: 'tinyint', unsigned: true, primary: true }, storeName: { name: 'store_name', type: 'varchar', length: 255 },
  },
});
