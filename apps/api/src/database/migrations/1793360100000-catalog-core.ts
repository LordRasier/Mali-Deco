import { MigrationInterface, QueryRunner } from 'typeorm';

export class CatalogCore1793360100000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE products ADD slug VARCHAR(255) NULL, ADD archived_at DATETIME(6) NULL');
    await q.query("UPDATE products SET slug = CONCAT('legacy-', id) WHERE slug IS NULL");
    await q.query('ALTER TABLE products MODIFY slug VARCHAR(255) NOT NULL, ADD CONSTRAINT uq_products_slug UNIQUE (slug)');
    await q.query(`ALTER TABLE products
      ADD product_weight_g INT UNSIGNED NULL, ADD product_width_mm INT UNSIGNED NULL,
      ADD product_height_mm INT UNSIGNED NULL, ADD product_length_mm INT UNSIGNED NULL,
      ADD package_weight_g INT UNSIGNED NULL, ADD package_width_mm INT UNSIGNED NULL,
      ADD package_height_mm INT UNSIGNED NULL, ADD package_length_mm INT UNSIGNED NULL`);
    await q.query("ALTER TABLE product_variants ADD supply_mode ENUM('stock', 'made_to_order') NULL, ADD archived_at DATETIME(6) NULL");
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE product_variants DROP COLUMN archived_at, DROP COLUMN supply_mode');
    await q.query(`ALTER TABLE products DROP COLUMN package_length_mm, DROP COLUMN package_height_mm,
      DROP COLUMN package_width_mm, DROP COLUMN package_weight_g, DROP COLUMN product_length_mm,
      DROP COLUMN product_height_mm, DROP COLUMN product_width_mm, DROP COLUMN product_weight_g`);
    await q.query('ALTER TABLE products DROP INDEX uq_products_slug, DROP COLUMN archived_at, DROP COLUMN slug');
  }
}
