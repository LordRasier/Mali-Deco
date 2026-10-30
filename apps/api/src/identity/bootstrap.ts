import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../database/database-options';
import { hashPassword } from './security';
import { canonicalEmail } from './email';

async function secretPrompt(label: string): Promise<string> {
  if (!stdin.isTTY) throw new Error('Bootstrap requires an interactive terminal');
  stderr.write(`${label} (input hidden): `);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let password = '';
    const finish = (error?: Error) => {
      stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); stderr.write('\n');
      if (error) reject(error); else resolve(password);
    };
    const onData = (data: Buffer) => {
      for (const char of data.toString('utf8')) {
        if (char === '\u0003') return finish(new Error('Cancelled'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') password = password.slice(0, -1);
        else if (char >= ' ' && password.length < 1024) password += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function bootstrap(): Promise<void> {
  if (!stdin.isTTY) throw new Error('Bootstrap requires an interactive terminal');
  const prompt = createInterface({ input: stdin, output: stdout });
  const email = canonicalEmail(await prompt.question('Owner email: '));
  prompt.close();
  if (!email) throw new Error('Invalid email');
  const password = await secretPrompt('Password');
  if (password !== await secretPrompt('Repeat password')) throw new Error('Passwords do not match');
  const passwordHash = await hashPassword(password);
  const db = new DataSource(databaseOptions());
  await db.initialize();
  const runner = db.createQueryRunner();
  await runner.connect();
  let locked = false;
  try {
    const lock: Array<{ acquired: number }> = await runner.query('SELECT GET_LOCK(?, 10) AS acquired', ['store-owner-bootstrap']);
    if (lock[0].acquired !== 1) throw new Error('Could not acquire bootstrap lock');
    locked = true;
    await runner.startTransaction();
    const existing: Array<{ count: number }> = await runner.query('SELECT COUNT(*) AS count FROM admin_users');
    if (Number(existing[0].count) !== 0) throw new Error('Bootstrap refused: administrator already exists');
    await runner.query('INSERT INTO admin_users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', [randomUUID(), email, passwordHash, 'owner']);
    await runner.commitTransaction();
    stdout.write('Owner created.\n');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    if (locked) await runner.query('SELECT RELEASE_LOCK(?)', ['store-owner-bootstrap']);
    await runner.release();
    await db.destroy();
  }
}
void bootstrap().catch(() => { stderr.write('Bootstrap failed; verify terminal, configuration and that no administrator exists.\n'); process.exitCode = 1; });
