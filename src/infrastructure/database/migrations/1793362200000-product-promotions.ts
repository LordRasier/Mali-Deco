import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductPromotions1793362200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS featured TINYINT(1) NOT NULL DEFAULT 0');
    await q.query('ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sale_price_minor BIGINT UNSIGNED NULL CHECK (sale_price_minor <= 9007199254740991)');
  }
  async down(q: QueryRunner): Promise<void> {
    // MariaDB DDL commits independently; permit a safe retry after a partial rollback.
    const columns = [
      { table: 'product_variants', name: 'sale_price_minor', populated: 'sale_price_minor IS NOT NULL' },
      { table: 'products', name: 'featured', populated: 'featured <> 0' },
    ];
    const existing: typeof columns = [];
    for (const column of columns) {
      if (!await q.hasColumn(column.table, column.name)) continue;
      const [row] = await q.query(`SELECT COUNT(*) AS total FROM ${column.table} WHERE ${column.populated}`);
      if (!row || Number(row.total) !== 0) throw new Error('Cannot roll back populated product promotions');
      existing.push(column);
    }
    for (const column of existing) await q.query(`ALTER TABLE ${column.table} DROP COLUMN ${column.name}`);
  }
}
