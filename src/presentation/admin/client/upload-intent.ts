/** Holds only an opaque key for the current in-memory upload intent. */
export function createUploadIntent(makeKey: () => string = () => crypto.randomUUID()) {
  let current: string | undefined;
  return {
    key: () => current ??= makeKey(),
    reset: () => { current = undefined; },
  };
}
