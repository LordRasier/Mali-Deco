import type { MigrationInterface, QueryRunner } from 'typeorm';
export class StoreContent1793361800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE TABLE store_content_settings (id TINYINT UNSIGNED PRIMARY KEY, config LONGTEXT NOT NULL, revision INT UNSIGNED NOT NULL DEFAULT 0, CONSTRAINT chk_content_singleton CHECK (id = 1)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query('SELECT COUNT(*) AS total FROM store_content_settings');
    if (Number(row.total)) throw Error('Cannot discard configured store content');
    await q.query('DROP TABLE store_content_settings');
  }
}
