import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, options, (error, key) => error ? reject(error) : resolve(key as Buffer));
  });
}
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 1024) throw new Error('Invalid password length');
  const salt = randomBytes(16);
  return `scrypt-v1:${salt.toString('hex')}:${(await derive(password, salt)).toString('hex')}`;
}
export async function checkPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split(':');
  if (typeof password !== 'string' || Buffer.byteLength(password) > 1024 || parts.length !== 3 || parts[0] !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  const actual = await derive(password, Buffer.from(parts[1], 'hex'));
  return timingSafeEqual(actual, Buffer.from(parts[2], 'hex'));
}
export function secretHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function issueSecret(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: secretHash(token) };
}
export function matchesSecret(token: string, hash: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(secretHash(token), 'hex'), Buffer.from(hash, 'hex'));
}
