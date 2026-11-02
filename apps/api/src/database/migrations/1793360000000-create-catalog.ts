import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalog1793360000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE products (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      status ENUM('draft', 'active') NOT NULL DEFAULT 'draft',
      CONSTRAINT chk_products_name CHECK (CHAR_LENGTH(TRIM(name)) > 0)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await queryRunner.query(`CREATE TABLE product_variants (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      product_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      sku VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
      name VARCHAR(255) NOT NULL,
      price_minor BIGINT UNSIGNED NOT NULL,
      currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      CONSTRAINT uq_variants_sku UNIQUE (sku),
      CONSTRAINT fk_variants_product FOREIGN KEY (product_id) REFERENCES products(id),
      CONSTRAINT chk_variants_sku CHECK (CHAR_LENGTH(TRIM(sku)) > 0),
      CONSTRAINT chk_variants_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
      CONSTRAINT chk_variants_price CHECK (price_minor <= 9007199254740991),
      CONSTRAINT chk_variants_currency CHECK (currency REGEXP BINARY '^[A-Z]{3}$')
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await queryRunner.query(`CREATE TABLE store_settings (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      store_name VARCHAR(255) NOT NULL,
      CONSTRAINT chk_settings_singleton CHECK (id = 1),
      CONSTRAINT chk_settings_name CHECK (CHAR_LENGTH(TRIM(store_name)) > 0)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE store_settings');
    await queryRunner.query('DROP TABLE product_variants');
    await queryRunner.query('DROP TABLE products');
  }
}
