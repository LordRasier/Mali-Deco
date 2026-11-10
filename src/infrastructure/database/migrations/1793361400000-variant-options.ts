import type { MigrationInterface, QueryRunner } from 'typeorm';

export class VariantOptions1793361400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE product_variants ADD options_json JSON NULL,
      ADD image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
      ADD CONSTRAINT fk_variant_image FOREIGN KEY (image_id) REFERENCES product_images(id) ON DELETE RESTRICT`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query('SELECT COUNT(*) AS total FROM product_variants WHERE image_id IS NOT NULL OR options_json IS NOT NULL');
    if (!row || Number(row.total)) throw new Error('Cannot roll back populated variant options');
    await q.query('ALTER TABLE product_variants DROP FOREIGN KEY fk_variant_image, DROP COLUMN image_id, DROP COLUMN options_json');
  }
}
