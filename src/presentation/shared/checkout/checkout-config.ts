/** The test flow is intentionally unavailable outside an explicitly enabled local development process. */
export function localCheckoutEnabled(env: { NODE_ENV?: string; LOCAL_TEST_CHECKOUT_ENABLED?: string }): boolean {
  return env.NODE_ENV === 'development' && env.LOCAL_TEST_CHECKOUT_ENABLED === 'true';
}
