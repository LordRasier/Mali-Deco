import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderTracking1793362800000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE checkout_orders ADD tracking_email VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
      GENERATED ALWAYS AS (LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(snapshot, '$.result.contact.email'))))) STORED,
      ADD INDEX ix_order_tracking_email (tracking_email, created_at, id)`);
    await q.query(`CREATE TABLE order_tracking_access (
      token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      email VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      allow_test TINYINT NOT NULL DEFAULT 0, created_at DATETIME(6) NOT NULL, expires_at DATETIME(6) NOT NULL,
      INDEX ix_tracking_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE order_tracking_requests (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      email VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      mode VARCHAR(8) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'queued',
      provider_id VARCHAR(128) NULL, error_code VARCHAR(80) NULL,
      created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL,
      INDEX ix_tracking_request_email (email, created_at), INDEX ix_tracking_request_queue (status, created_at),
      INDEX ix_tracking_request_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    // Serialize quota checks across processes without trusting forwarded client IP headers.
    await q.query('CREATE TABLE order_tracking_lock (id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB');
    await q.query('INSERT INTO order_tracking_lock (id) VALUES (1)');
  }
  async down(q: QueryRunner) {
    const [row] = await q.query('SELECT (SELECT COUNT(*) FROM order_tracking_access) + (SELECT COUNT(*) FROM order_tracking_requests) AS total');
    if (Number(row.total)) throw Error('Tracking access and delivery evidence must be retained');
    await q.query('DROP TABLE order_tracking_lock');
    await q.query('DROP TABLE order_tracking_requests');
    await q.query('DROP TABLE order_tracking_access');
    await q.query('ALTER TABLE checkout_orders DROP INDEX ix_order_tracking_email, DROP COLUMN tracking_email');
  }
}
