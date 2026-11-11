import type { MigrationInterface, QueryRunner } from 'typeorm';
export class ContentMedia1793362000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE store_content_media (id CHAR(36) PRIMARY KEY, data MEDIUMBLOB NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query('SELECT COUNT(*) AS total FROM store_content_media');
    if (Number(row.total)) throw Error('Cannot discard uploaded landing images');
    await q.query('DROP TABLE store_content_media');
  }
}
