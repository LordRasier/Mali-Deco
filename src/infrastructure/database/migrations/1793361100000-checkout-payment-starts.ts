import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckoutPaymentStarts1793361100000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE checkout_payment_starts (
      order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      state VARCHAR(16) NOT NULL,
      seller_id VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      preference_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
      CONSTRAINT uq_checkout_payment_preference UNIQUE (preference_id),
      CONSTRAINT fk_checkout_payment_order FOREIGN KEY (order_id) REFERENCES checkout_orders(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Losing an uncertain claim could authorize a second external preference after re-enabling payments.
    const rows = await q.query('SELECT COUNT(*) AS total FROM checkout_payment_starts');
    if (!Array.isArray(rows) || rows.length !== 1 || ![0, '0'].includes(rows[0]?.total)) throw Error('Payment-start evidence must be retained; rollback refused');
    await q.query('DROP TABLE checkout_payment_starts');
  }
}
