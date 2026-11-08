import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductImages1793360700000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    const conflicts: Array<{ kind: string }> = await q.query(`SELECT 'table' AS kind FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name IN ('product_images', 'product_image_derivatives', 'product_image_quota')
      UNION ALL SELECT 'column' AS kind FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'media_revision'`);
    if (conflicts.length) throw new Error('Product media schema already exists; resolve conflict before migration');
    await q.query('ALTER TABLE products ADD media_revision INT UNSIGNED NOT NULL DEFAULT 0');
    await q.query(`CREATE TABLE product_images (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      product_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      upload_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      upload_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      alt VARCHAR(300) NOT NULL,
      width INT UNSIGNED NOT NULL, height INT UNSIGNED NOT NULL,
      position INT UNSIGNED NOT NULL, retired_at DATETIME(6) NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
      CONSTRAINT uq_product_images_upload UNIQUE (product_id, upload_key),
      INDEX idx_product_images_order (product_id, retired_at, position, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE product_image_derivatives (
      image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      rendition SMALLINT UNSIGNED NOT NULL, byte_length INT UNSIGNED NOT NULL, data MEDIUMBLOB NOT NULL,
      PRIMARY KEY (image_id, rendition),
      CONSTRAINT fk_derivatives_image FOREIGN KEY (image_id) REFERENCES product_images(id) ON DELETE RESTRICT,
      CONSTRAINT chk_derivative_rendition CHECK (rendition IN (320, 800, 1600)),
      CONSTRAINT chk_derivative_length CHECK (byte_length = OCTET_LENGTH(data))
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE product_image_quota (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      CONSTRAINT chk_product_image_quota_singleton CHECK (id = 1)
    ) ENGINE=InnoDB`);
    await q.query('INSERT INTO product_image_quota (id) VALUES (1)');
  }
  async down(q: QueryRunner): Promise<void> {
    const rows: Array<{ total: string | number }> = await q.query('SELECT COUNT(*) AS total FROM product_images');
    if (!rows[0] || Number(rows[0].total) !== 0) throw new Error('Cannot roll back product media while images exist');
    await q.query('DROP TABLE product_image_quota');
    await q.query('DROP TABLE product_image_derivatives');
    await q.query('DROP TABLE product_images');
    await q.query('ALTER TABLE products DROP COLUMN media_revision');
  }
}
