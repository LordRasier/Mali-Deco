# Checkout browser adapter

[mountCheckout](checkout-browser.ts) receives the existing cart store and shipping session, creates one checkout owner, and binds the stable server form through [createCheckoutView](checkout-view.ts). It owns only its checkout subscriptions and pagehide/pageshow listeners; disposing it does not dispose the shared cart or shipping owner.

```ts
const root = document.querySelector<HTMLElement>('[data-checkout-root]');
if (root) mountCheckout(root, {
  cart: cartPanel.store,
  shippingSession: cartPanel.shippingSession,
  closeCart: cartPanel.close,
  setCartLocked: cartPanel.setLocked,
});
```

Contact/address inputs, postal input, selects, and form nodes remain mounted. Only read-only summary rows and changed option memberships are replaced. All remote strings enter through `textContent`; no HTML injection is used. Rendering changes native text values only when the corresponding model field changes; unrelated cart/shipping publications do not erase autofill that emitted no input event. Submit snapshots both native contact and address values before either store setter can publish. An unreported postal change is captured before lookup, quote or submit, so the store invalidates the prior destination/quote. Native `reportValidity()` and `preventDefault()` precede order creation. Pagehide/disposal explicitly clear private contact/address drafts; the shared shipping destination survives.

The required `setCartLocked` callback delegates drawer locking to the cart owner, including its opener and later renders. The drawer opens only when unlocked; this is UI coordination, not a new order-security boundary. Cart changes elsewhere do not mutate an uncertain attempt's retained payload/key/CSRF; the checkout form remains locked. The adapter does not override another component's DOM-owned button state directly.

The injectable `store`, `lifecycle`, cart/session ports and controlled DOM probes support offline tests. They do not simulate a real browser's focus, autofill, parsing, or BFCache implementation. Run `node --import tsx --test tests/client/checkout-browser.check.ts` from the repository root; see the [state contract](../state/README.md) for transport and pending-attempt guarantees.

## Synthetic browser verification — 2026-11-03

A parent-run browser check passed against an isolated loopback Nest fixture serving the real checkout controller/template/CSS and a fresh audited 38-module browser bundle (68,885 bytes). All catalog, session, quote and order responses were synthetic; no database, provider, real credentials or real orders were used.

- No-JavaScript SSR: HTTP 200, disabled native fieldset, hidden form, zero API calls.
- Eventless postal/contact/address autofill survived intervening publications; cart and checkout shared the destination, without duplicate lookups or cart estimates.
- Quote expiry and cart/destination changes invalidated checkout eligibility.
- An uncertain order followed by explicit retry produced exactly two identical input/key/CSRF records. Pending state closed and gated the cart drawer; session storage contained no contact/address data.
- Reload used only explicit resume/status recovery, with no automatic resend. Synthetic persisted pagehide/pageshow events passed. Real back navigation also did not resend, but the browser reloaded: **actual BFCache restoration was not exercised**.
- Zero page errors and zero outward network attempts; every fresh browser context closed in `finally`.

Harness limitations were corrected before the passing run: this browser bridge did not support `context.request` or context route continuation, so same-origin control-page fetches replaced them. `locator.isDisabled()` did not report the fieldset's own disabled property; the SSR assertion instead read the native DOM property. These were harness/tool limitations, not application defects. Both owned loopback processes were stopped and confirmed absent. Temporary fixture files remain because the validated, scoped cleanup command was rejected by execution policy; no alternative deletion mechanism was attempted.
