import type { MigrationInterface, QueryRunner } from 'typeorm';

export class HeaderBrandMode1793362900000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE store_settings ADD COLUMN header_brand_mode ENUM('logo', 'logo_text', 'text') NOT NULL DEFAULT 'logo_text'");
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query("SELECT COUNT(*) AS total FROM store_settings WHERE header_brand_mode <> 'logo_text'");
    if (!row || Number(row.total)) throw Error('Cannot roll back a customized header brand');
    await q.query('ALTER TABLE store_settings DROP COLUMN header_brand_mode');
  }
}
