import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommerceAnalytics1793363000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE checkout_analytics_grants (
      revocation_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      revoked_at DATETIME(6) NULL, updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX ix_analytics_grant_age (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE checkout_analytics_context (
      order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      checkout_session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      measurement_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
      client_id VARCHAR(48) CHARACTER SET ascii NULL, analytics_session_id VARCHAR(20) CHARACTER SET ascii NULL,
      revocation_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      consent_at DATETIME(6) NOT NULL, expires_at DATETIME(6) NOT NULL, revoked_at DATETIME(6) NULL,
      INDEX ix_analytics_checkout_session (checkout_session_id), INDEX ix_analytics_expiry (expires_at), INDEX ix_analytics_revocation (revocation_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE commerce_analytics_outbox (
      order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      event_name VARCHAR(16) CHARACTER SET ascii NOT NULL, event_at DATETIME(6) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'queued', error_code VARCHAR(64) NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (order_id, event_name), INDEX ix_commerce_analytics_queue (status, event_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  async down(q: QueryRunner) {
    const [row] = await q.query('SELECT (SELECT COUNT(*) FROM checkout_analytics_context) + (SELECT COUNT(*) FROM commerce_analytics_outbox) + (SELECT COUNT(*) FROM checkout_analytics_grants) AS total');
    if (Number(row.total)) throw Error('Retain analytics consent and delivery evidence; do not discard the deduplication ledger');
    await q.query('DROP TABLE commerce_analytics_outbox');
    await q.query('DROP TABLE checkout_analytics_context');
    await q.query('DROP TABLE checkout_analytics_grants');
  }
}
