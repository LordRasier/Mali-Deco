import 'reflect-metadata';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { databaseOptions } from '../../../infrastructure/database/database-options';
import { StrictDataSource } from '../../../infrastructure/database/strict-data-source';
import { hashPassword } from '../security/security';
import { canonicalEmail } from '../security/email';
import { bootstrapFailureMessage, createInitialOwner } from './bootstrap-owner';
import { SecretInput } from './secret-input';

async function secretPrompt(label: string): Promise<string> {
  if (!stdin.isTTY) throw new Error('Bootstrap requires an interactive terminal');
  stderr.write(`${label} (input hidden): `);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    const input = new SecretInput();
    const finish = (error?: Error) => {
      stdin.off('data', onData); stdin.off('end', onEnd); stdin.off('error', onError);
      try { stdin.setRawMode(false); } catch { /* The terminal may already be closed. */ }
      stdin.pause(); stderr.write('\n');
      if (error) reject(error);
    };
    const onData = (data: Buffer) => {
      try {
        const result = input.feed(data);
        if (result.done) { finish(); resolve(result.value); }
      } catch { finish(new Error('Invalid secret input')); }
    };
    const onEnd = () => finish(new Error('Terminal closed'));
    const onError = () => finish(new Error('Terminal unavailable'));
    stdin.on('data', onData);
    stdin.once('end', onEnd);
    stdin.once('error', onError);
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
  await createInitialOwner(new StrictDataSource(databaseOptions()), email, passwordHash);
  stdout.write('Owner created.\n');
}
void bootstrap().catch(() => { stderr.write(bootstrapFailureMessage); process.exitCode = 1; });
