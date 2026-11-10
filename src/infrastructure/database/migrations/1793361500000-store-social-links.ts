import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreSocialLinks1793361500000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE store_settings
      ADD COLUMN whatsapp_number VARCHAR(15) CHARACTER SET ascii COLLATE ascii_bin NULL,
      ADD COLUMN instagram_username VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query('SELECT COUNT(*) AS total FROM store_settings WHERE whatsapp_number IS NOT NULL OR instagram_username IS NOT NULL');
    if (!row || Number(row.total)) throw new Error('Cannot roll back configured social links');
    await q.query('ALTER TABLE store_settings DROP COLUMN whatsapp_number, DROP COLUMN instagram_username');
  }
}
