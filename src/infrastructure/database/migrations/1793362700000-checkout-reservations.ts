import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckoutReservations1793362700000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Only newly created orders have a reliable reservation ledger. Never infer historical stock movements.
    await q.query(`CREATE TABLE checkout_order_reservations (
      order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      state VARCHAR(16) NOT NULL DEFAULT 'held', items LONGTEXT NOT NULL,
      expires_at DATETIME(6) NOT NULL, review_after DATETIME(6) NOT NULL,
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX idx_checkout_reservation_review (state, review_after)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
  async down(): Promise<void> { throw Error('Reservation evidence must be retained; rollback refused'); }
}
