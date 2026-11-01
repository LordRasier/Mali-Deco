import { randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { canonicalEmail } from './email';

/** Caller owns the explicit interactive prompt and supplies only a validated hash. */
export async function createInitialOwner(db: DataSource, email: string, passwordHash: string): Promise<void> {
  if (!email || canonicalEmail(email) !== email || !passwordHash) throw new Error('Invalid owner input');
  await db.initialize();
  let runner: QueryRunner | undefined;
  let locked = false;
  try {
    runner = db.createQueryRunner();
    await runner.connect();
    const lock: Array<{ acquired: number }> = await runner.query('SELECT GET_LOCK(?, 10) AS acquired', ['store-owner-bootstrap']);
    if (lock[0].acquired !== 1) throw new Error('Could not acquire bootstrap lock');
    locked = true;
    await runner.startTransaction();
    const existing: Array<{ count: number }> = await runner.query('SELECT COUNT(*) AS count FROM admin_users');
    if (Number(existing[0].count) !== 0) throw new Error('Bootstrap refused: administrator already exists');
    await runner.query('INSERT INTO admin_users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', [randomUUID(), email, passwordHash, 'owner']);
    await runner.commitTransaction();
  } finally {
    try {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
      if (runner && locked) await runner.query('SELECT RELEASE_LOCK(?)', ['store-owner-bootstrap']);
    } finally {
      try { if (runner) await runner.release(); } finally { await db.destroy(); }
    }
  }
}

/** Never include database errors, entered identities or credentials in CLI output. */
export const bootstrapFailureMessage = 'Bootstrap failed; verify terminal, configuration and that no administrator exists.\n';
