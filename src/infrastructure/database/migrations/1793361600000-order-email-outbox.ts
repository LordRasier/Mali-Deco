import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderEmailOutbox1793361600000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE order_email_outbox (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      stage VARCHAR(16) NOT NULL, mode VARCHAR(8) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      recipient VARCHAR(254) NOT NULL DEFAULT '', payload MEDIUMTEXT NOT NULL,
      provider_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
      provider_status VARCHAR(32) NULL, error_code VARCHAR(80) NULL,
      created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL,
      accepted_at DATETIME(6) NULL, sent_at DATETIME(6) NULL,
      next_check_at DATETIME(6) NULL, attempts INT UNSIGNED NOT NULL DEFAULT 0,
      UNIQUE KEY uq_order_email_stage (order_id, stage),
      UNIQUE KEY uq_order_email_provider (provider_id),
      INDEX ix_order_email_pending (status, next_check_at, created_at),
      FOREIGN KEY (order_id) REFERENCES checkout_orders(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  async down(q: QueryRunner) {
    const [row] = await q.query('SELECT COUNT(*) AS total FROM order_email_outbox');
    if (Number(row.total)) throw Error('Email delivery evidence must be retained');
    await q.query('DROP TABLE order_email_outbox');
  }
}
