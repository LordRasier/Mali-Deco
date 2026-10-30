import { DataSource, EntityManager } from 'typeorm';
import { ServiceUnavailableException } from '@nestjs/common';
import { AdminRole, SessionAccess } from './access';

export interface AdminUser { id: string; email: string; passwordHash: string; role: AdminRole; disabledAt: Date | null }
export interface StoredSession extends SessionAccess { userId: string; email: string; csrfHash: string }
export interface IdentityStore {
  limit(keys: string[]): Promise<boolean>;
  user(email: string): Promise<AdminUser | null>;
  createSession(tokenHash: string, userId: string, csrfHash: string, expires: Date, previousHash?: string): Promise<void>;
  session(tokenHash: string): Promise<StoredSession | null>;
  rotateCsrf(tokenHash: string, csrfHash: string): Promise<void>;
  revoke(tokenHash: string): Promise<void>;
}
export class MysqlIdentityStore implements IdentityStore {
  constructor(private readonly db?: DataSource) {}
  private database(): DataSource {
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Identity database unavailable');
    return this.db;
  }
  async limit(keys: string[]): Promise<boolean> {
    return this.database().transaction(async (tx: EntityManager) => {
      let allowed = true;
      for (const key of [...keys].sort()) {
        await tx.query(`INSERT INTO login_attempt_windows (attempt_key, window_start, attempts) VALUES (?, UTC_TIMESTAMP(6), 1)
          ON DUPLICATE KEY UPDATE attempts = IF(window_start < UTC_TIMESTAMP(6) - INTERVAL 15 MINUTE, 1, attempts + 1),
          window_start = IF(window_start < UTC_TIMESTAMP(6) - INTERVAL 15 MINUTE, UTC_TIMESTAMP(6), window_start)`, [key]);
        const rows: Array<{ attempts: number }> = await tx.query('SELECT attempts FROM login_attempt_windows WHERE attempt_key = ?', [key]);
        if (rows[0].attempts > 10) allowed = false;
      }
      return allowed;
    });
  }
  async user(email: string): Promise<AdminUser | null> {
    const rows: AdminUser[] = await this.database().query('SELECT id, email, password_hash AS passwordHash, role, disabled_at AS disabledAt FROM admin_users WHERE email COLLATE utf8mb4_0900_bin = ? LIMIT 1', [email]);
    return rows[0] ?? null;
  }
  async createSession(hash: string, userId: string, csrfHash: string, expires: Date, previousHash?: string): Promise<void> {
    await this.database().transaction(async (tx) => {
      if (previousHash) await tx.query('UPDATE admin_sessions SET revoked_at = UTC_TIMESTAMP(6) WHERE token_hash = ? AND revoked_at IS NULL', [previousHash]);
      await tx.query('INSERT INTO admin_sessions (token_hash, user_id, csrf_hash, expires_at) VALUES (?, ?, ?, ?)', [hash, userId, csrfHash, expires]);
    });
  }
  async session(hash: string): Promise<StoredSession | null> {
    const rows: StoredSession[] = await this.database().query(`SELECT u.id AS userId, u.email, u.role, u.disabled_at AS disabledAt,
      s.csrf_hash AS csrfHash, s.expires_at AS expiresAt, s.revoked_at AS revokedAt
      FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id WHERE s.token_hash = ? LIMIT 1`, [hash]);
    return rows[0] ?? null;
  }
  async rotateCsrf(hash: string, csrfHash: string): Promise<void> {
    await this.database().query('UPDATE admin_sessions SET csrf_hash = ? WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(6)', [csrfHash, hash]);
  }
  async revoke(hash: string): Promise<void> {
    await this.database().query('UPDATE admin_sessions SET revoked_at = UTC_TIMESTAMP(6) WHERE token_hash = ? AND revoked_at IS NULL', [hash]);
  }
}
