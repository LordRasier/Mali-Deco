/** Total retained derivative bytes, including retired images; invalid configuration fails closed. */
export function mediaQuota(env: NodeJS.ProcessEnv): number {
  const raw = env.MEDIA_STORAGE_QUOTA_BYTES;
  if (raw === undefined) return 128 * 1024 * 1024;
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error('Invalid MEDIA_STORAGE_QUOTA_BYTES');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 1024 * 1024 * 1024) throw new Error('Invalid MEDIA_STORAGE_QUOTA_BYTES');
  return value;
}
