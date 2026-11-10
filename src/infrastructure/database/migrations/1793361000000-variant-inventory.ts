import type { MigrationInterface, QueryRunner } from 'typeorm';

export class VariantInventory1793361000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE product_variants ADD stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
      ADD CONSTRAINT chk_variant_stock_quantity CHECK (stock_quantity <= 1000000)`);
    await q.query(`ALTER TABLE products ADD bulk_warning_threshold INT UNSIGNED NULL,
      ADD bulk_warning_message VARCHAR(300) NULL,
      ADD CONSTRAINT chk_product_bulk_warning CHECK (
        (bulk_warning_threshold IS NULL AND bulk_warning_message IS NULL) OR
        (bulk_warning_threshold IS NOT NULL AND bulk_warning_threshold BETWEEN 1 AND 1000
          AND bulk_warning_message IS NOT NULL AND CHAR_LENGTH(TRIM(bulk_warning_message)) BETWEEN 1 AND 300))`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query(`SELECT (SELECT COUNT(*) FROM product_variants WHERE stock_quantity <> 0)
      + (SELECT COUNT(*) FROM products WHERE bulk_warning_threshold IS NOT NULL OR bulk_warning_message IS NOT NULL) AS total`);
    if (!row || Number(row.total) !== 0) throw new Error('Cannot roll back populated inventory or warnings');
    await q.query('ALTER TABLE products DROP CONSTRAINT chk_product_bulk_warning, DROP COLUMN bulk_warning_threshold, DROP COLUMN bulk_warning_message');
    await q.query('ALTER TABLE product_variants DROP CONSTRAINT chk_variant_stock_quantity, DROP COLUMN stock_quantity');
  }
}
