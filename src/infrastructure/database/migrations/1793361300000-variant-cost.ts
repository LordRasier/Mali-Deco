import type { MigrationInterface, QueryRunner } from 'typeorm';

export class VariantCost1793361300000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE product_variants ADD cost_minor BIGINT UNSIGNED NULL');
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query('SELECT COUNT(*) AS total FROM product_variants WHERE cost_minor IS NOT NULL');
    if (!row || Number(row.total) !== 0) throw new Error('Cannot roll back populated costs');
    await q.query('ALTER TABLE product_variants DROP COLUMN cost_minor');
  }
}
