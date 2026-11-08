export type DataMode = 'demo' | 'api';

/** Fixed public source; the suffix preserves real-cart storage without importing synthetic carts. */
export const STOREFRONT_DATA_MODE = 'api' as const;

/** Legacy consumers also use the real catalog; obsolete mode variables have no effect. */
export function selectDataMode(env: { NODE_ENV?: string; STOREFRONT_MODE?: string; API_BASE_URL?: string }): DataMode {
  if (!env.API_BASE_URL) throw new Error('API_BASE_URL is required for the published catalog.');
  return STOREFRONT_DATA_MODE;
}
