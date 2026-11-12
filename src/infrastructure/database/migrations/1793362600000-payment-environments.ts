import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentEnvironments1793362600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE store_payment_settings (
      id TINYINT UNSIGNED PRIMARY KEY, enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
      mode VARCHAR(16) NOT NULL DEFAULT 'test', revision INT UNSIGNED NOT NULL DEFAULT 0,
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query("INSERT INTO store_payment_settings (id) VALUES (1)");
    await q.query(`CREATE TABLE payment_settings_events (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      actor VARCHAR(255) NOT NULL, detail LONGTEXT NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    // All orders created before this migration were explicitly local tests.
    await q.query("ALTER TABLE checkout_orders ADD COLUMN payment_mode VARCHAR(16) NOT NULL DEFAULT 'test', ADD COLUMN payment_seller_id VARCHAR(16) NULL, ADD INDEX idx_order_payment_mode (payment_mode, created_at)");
    await q.query('UPDATE checkout_orders o JOIN checkout_payment_starts p ON p.order_id = o.id SET o.payment_seller_id = p.seller_id');
    await q.query("ALTER TABLE checkout_payment_starts ADD COLUMN payment_mode VARCHAR(16) NOT NULL DEFAULT 'test'");
  }
  async down(): Promise<void> { throw Error('Payment environment and audit evidence must be retained; rollback refused'); }
}
