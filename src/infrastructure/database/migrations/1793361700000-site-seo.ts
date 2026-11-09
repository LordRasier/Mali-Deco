import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SiteSeo1793361700000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE store_site_settings (
      id TINYINT UNSIGNED PRIMARY KEY, config LONGTEXT NOT NULL, revision INT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE product_slug_redirects (
      slug VARCHAR(255) NOT NULL PRIMARY KEY, product_id CHAR(36) NOT NULL,
      INDEX idx_slug_redirect_product (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [settings] = await q.query('SELECT COUNT(*) AS total FROM store_site_settings');
    const [redirects] = await q.query('SELECT COUNT(*) AS total FROM product_slug_redirects');
    if (Number(settings?.total) || Number(redirects?.total)) throw Error('Cannot discard configured SEO settings or URL history');
    await q.query('DROP TABLE product_slug_redirects');
    await q.query('DROP TABLE store_site_settings');
  }
}
