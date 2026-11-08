import { localCheckoutEnabled } from './shared/checkout/checkout-config';

/** Rendering is permanent; the local-test checkout capability remains independently restricted. */
export function localCheckoutPageEnabled(env: { NODE_ENV?: string; LOCAL_TEST_CHECKOUT_ENABLED?: string }, mode: 'api' | 'demo'): boolean {
  return mode === 'api' && localCheckoutEnabled(env);
}

/** Published API pages remain indexable; illustrative or failed pages never inherit that permission. */
export function publicPageNoindex(status: number, demo: boolean): boolean { return demo || status >= 400; }
