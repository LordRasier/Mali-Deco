import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreAppearance1793360900000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE store_settings ADD COLUMN primary_color CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '#073dcc'");
    await q.query("ALTER TABLE store_brand_assets DROP CONSTRAINT chk_store_brand_asset_kind, MODIFY kind VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, ADD CONSTRAINT chk_store_brand_asset_kind CHECK (kind IN ('logo', 'icon', 'hero', 'about'))");
  }
  async down(q: QueryRunner): Promise<void> {
    const rows: Array<{ total: string | number }> = await q.query("SELECT (SELECT COUNT(*) FROM store_brand_assets WHERE kind IN ('hero', 'about')) + (SELECT COUNT(*) FROM store_settings WHERE primary_color <> '#073dcc') AS total");
    if (!rows[0] || Number(rows[0].total) !== 0) throw new Error('Cannot roll back appearance while customizations exist');
    await q.query("ALTER TABLE store_brand_assets DROP CONSTRAINT chk_store_brand_asset_kind, MODIFY kind VARCHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, ADD CONSTRAINT chk_store_brand_asset_kind CHECK (kind IN ('logo', 'icon'))");
    await q.query('ALTER TABLE store_settings DROP COLUMN primary_color');
  }
}
