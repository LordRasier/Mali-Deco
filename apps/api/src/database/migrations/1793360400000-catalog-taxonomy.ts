import { MigrationInterface, QueryRunner } from 'typeorm';

// All assignments are optional so existing products and variants remain valid.
export class CatalogTaxonomy1793360400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    for (const table of ['categories', 'materials', 'colors']) {
      const hex = table === 'colors' ? ', hex CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NULL' : '';
      await q.query(`CREATE TABLE ${table} (
        id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
        slug VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        name VARCHAR(100) NOT NULL,
        sort_order INT UNSIGNED NOT NULL DEFAULT 0,
        archived_at DATETIME(6) NULL${hex},
        CONSTRAINT uq_${table}_slug UNIQUE (slug),
        CONSTRAINT chk_${table}_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
        CONSTRAINT chk_${table}_slug CHECK (REGEXP_LIKE(slug, '^[a-z0-9]+(-[a-z0-9]+)*$', 'c'))
        ${table === 'colors' ? ", CONSTRAINT chk_colors_hex CHECK (hex IS NULL OR REGEXP_LIKE(hex, '^#[0-9A-F]{6}$', 'c'))" : ''}
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    }
    await q.query(`ALTER TABLE products ADD category_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
      ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id),
      ADD INDEX idx_products_category (category_id), ADD INDEX idx_products_public (status, archived_at, id)`);
    await q.query(`ALTER TABLE product_variants ADD material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
      ADD color_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
      ADD CONSTRAINT fk_variants_material FOREIGN KEY (material_id) REFERENCES materials(id),
      ADD CONSTRAINT fk_variants_color FOREIGN KEY (color_id) REFERENCES colors(id),
      ADD INDEX idx_variants_material (material_id), ADD INDEX idx_variants_color (color_id),
      ADD INDEX idx_variants_public (product_id, archived_at, currency, price_minor, id)`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE product_variants DROP FOREIGN KEY fk_variants_color, DROP FOREIGN KEY fk_variants_material,
      DROP INDEX idx_variants_public, DROP INDEX idx_variants_color, DROP INDEX idx_variants_material,
      DROP COLUMN color_id, DROP COLUMN material_id`);
    await q.query(`ALTER TABLE products DROP FOREIGN KEY fk_products_category, DROP INDEX idx_products_public,
      DROP INDEX idx_products_category, DROP COLUMN category_id`);
    for (const table of ['colors', 'materials', 'categories']) await q.query(`DROP TABLE ${table}`);
  }
}
