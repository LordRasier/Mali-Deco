import { MigrationInterface, QueryRunner } from 'typeorm';

export class Identity1793360200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE admin_users (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(200) NOT NULL,
      role ENUM('owner', 'catalog', 'operations') NOT NULL,
      disabled_at DATETIME(6) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE admin_sessions (
      token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      csrf_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      expires_at DATETIME(6) NOT NULL, revoked_at DATETIME(6) NULL,
      CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES admin_users(id),
      INDEX idx_session_expiry (expires_at)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE login_attempt_windows (
      attempt_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      window_start DATETIME(6) NOT NULL, attempts INT UNSIGNED NOT NULL,
      INDEX idx_attempt_window (window_start)
    ) ENGINE=InnoDB`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE login_attempt_windows');
    await q.query('DROP TABLE admin_sessions');
    await q.query('DROP TABLE admin_users');
  }
}
