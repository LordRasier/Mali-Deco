import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreBrandAssets1793360800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE store_brand_assets (
      kind VARCHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      data MEDIUMBLOB NOT NULL,
      CONSTRAINT chk_store_brand_asset_kind CHECK (kind IN ('logo', 'icon'))
    ) ENGINE=InnoDB`);
  }
  async down(q: QueryRunner): Promise<void> {
    const rows: Array<{ total: string | number }> = await q.query('SELECT COUNT(*) AS total FROM store_brand_assets');
    if (!rows[0] || Number(rows[0].total) !== 0) throw new Error('Cannot roll back branding while assets exist');
    await q.query('DROP TABLE store_brand_assets');
  }
}
