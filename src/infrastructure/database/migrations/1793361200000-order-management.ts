import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderManagement1793361200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE checkout_orders
      ADD revision INT UNSIGNED NOT NULL DEFAULT 1,
      ADD updated_at DATETIME(6) NULL,
      ADD tracking_number VARCHAR(160) NOT NULL DEFAULT '',
      ADD tracking_url VARCHAR(1000) NOT NULL DEFAULT '',
      ADD internal_note TEXT NULL,
      ADD INDEX ix_orders_created (created_at, id),
      ADD INDEX ix_orders_payment (payment_status, created_at)`);
    await q.query(`CREATE TABLE order_events (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      source VARCHAR(32) NOT NULL,
      actor VARCHAR(255) NOT NULL,
      detail TEXT NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX ix_order_events (order_id, created_at),
      FOREIGN KEY (order_id) REFERENCES checkout_orders(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE order_attachments (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      name VARCHAR(180) NOT NULL, mime VARCHAR(80) NOT NULL, size INT UNSIGNED NOT NULL,
      digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      content MEDIUMBLOB NOT NULL, actor VARCHAR(255) NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_order_attachment (order_id, digest),
      FOREIGN KEY (order_id) REFERENCES checkout_orders(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query('SELECT (SELECT COUNT(*) FROM order_events) + (SELECT COUNT(*) FROM order_attachments) AS total');
    if (Number(row.total)) throw Error('Order management evidence must be retained');
    await q.query('DROP TABLE order_attachments');
    await q.query('DROP TABLE order_events');
    await q.query('ALTER TABLE checkout_orders DROP INDEX ix_orders_created, DROP INDEX ix_orders_payment, DROP revision, DROP updated_at, DROP tracking_number, DROP tracking_url, DROP internal_note');
  }
}
