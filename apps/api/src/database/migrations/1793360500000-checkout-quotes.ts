import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckoutQuotes1793360500000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE checkout_sessions (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
      expires_at DATETIME(6) NOT NULL, created_at DATETIME(6) NOT NULL,
      INDEX idx_checkout_session_expiry (expires_at)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE checkout_quotes (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      snapshot LONGTEXT NOT NULL, expires_at DATETIME(6) NOT NULL, created_at DATETIME(6) NOT NULL,
      CONSTRAINT fk_checkout_quote_session FOREIGN KEY (session_id) REFERENCES checkout_sessions(id),
      INDEX idx_checkout_quote_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE checkout_quotes');
    await q.query('DROP TABLE checkout_sessions');
  }
}
