import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CategoryPresentation1793362100000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE category_presentations (
      category_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      description VARCHAR(300) NOT NULL DEFAULT '', icon VARCHAR(24) NOT NULL DEFAULT 'grid',
      image_alt VARCHAR(150) NOT NULL DEFAULT '', image_version CHAR(36) NULL, image_data MEDIUMBLOB NULL,
      CONSTRAINT fk_category_presentation FOREIGN KEY (category_id) REFERENCES categories(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query('SELECT COUNT(*) AS total FROM category_presentations');
    if (Number(row.total)) throw Error('Cannot discard category images or descriptions');
    await q.query('DROP TABLE category_presentations');
  }
}
