import { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckoutOrders1793360600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE checkout_orders (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      quote_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      idempotency_key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      body_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      created_at DATETIME(6) NOT NULL,
      order_status VARCHAR(32) NOT NULL DEFAULT 'received',
      payment_status VARCHAR(32) NOT NULL DEFAULT 'not_started',
      fulfillment_status VARCHAR(32) NOT NULL DEFAULT 'not_started',
      shipping_status VARCHAR(32) NOT NULL DEFAULT 'not_started',
      currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      total_minor BIGINT UNSIGNED NOT NULL,
      snapshot LONGTEXT NOT NULL,
      CONSTRAINT uq_checkout_order_key UNIQUE (idempotency_key_hash),
      CONSTRAINT uq_checkout_order_quote UNIQUE (quote_id),
      CONSTRAINT fk_checkout_order_quote FOREIGN KEY (quote_id) REFERENCES checkout_quotes(id),
      CONSTRAINT fk_checkout_order_session FOREIGN KEY (session_id) REFERENCES checkout_sessions(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE checkout_orders'); }
}
