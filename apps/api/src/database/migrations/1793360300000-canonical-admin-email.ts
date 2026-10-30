import { MigrationInterface, QueryRunner } from 'typeorm';

// Freeze the migration's rule so later application changes cannot alter history.
function isCanonicalEmail(email: string): boolean {
  return email.length <= 255 && /^[\x21-\x7e]+$/.test(email)
    && email === email.toLowerCase() && /^[^@]+@[^@]+\.[^@]+$/.test(email);
}

export class CanonicalAdminEmail1793360300000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    const users: Array<{ email: string }> = await q.query('SELECT email FROM admin_users');
    if (users.some(({ email }) => !isCanonicalEmail(email))) {
      throw new Error('Existing admin emails require explicit canonicalization before migration');
    }
    await q.query('ALTER TABLE admin_users MODIFY email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL');
    await q.query("ALTER TABLE admin_users ADD CONSTRAINT chk_admin_email_canonical CHECK (email = LOWER(email) AND REGEXP_LIKE(email, '^[!-~]+$', 'c'))");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE admin_users DROP CHECK chk_admin_email_canonical');
    await q.query('ALTER TABLE admin_users MODIFY email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL');
  }
}
