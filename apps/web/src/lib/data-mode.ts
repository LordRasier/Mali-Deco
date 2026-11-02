export type DataMode = 'demo' | 'api';

/** Never turn a configuration error or failed API request into a demo catalog. */
export function selectDataMode(env: { NODE_ENV?: string; STOREFRONT_MODE?: string; API_BASE_URL?: string }): DataMode {
  if (env.STOREFRONT_MODE === 'demo') {
    if (env.NODE_ENV !== 'development') throw new Error('Demo storefront is available only in development.');
    return 'demo';
  }
  if (env.STOREFRONT_MODE && env.STOREFRONT_MODE !== 'api') throw new Error('Invalid STOREFRONT_MODE.');
  if (!env.API_BASE_URL) throw new Error('API_BASE_URL is required for the published catalog.');
  return 'api';
}
