# Checkout state ownership

[createCheckoutStore](checkout-store.ts) owns checkout independently of the DOM adapter. It reuses the existing validated checkout transport and shared shipping destination; it does not own cart resolution, payments, or shipping execution.

## Adapter lifecycle

1. Construct one store per checkout view with the shared shipping session. Construction and `getServerSnapshot()` do not access browser globals.
2. Subscribe to `getSnapshot()`, call `start()` after mounting, then synchronize cart lines, unresolved/ready flags, and a stable totals key with `syncCart(lines, unresolved, ready, totalsKey)`.
3. Bind explicit user actions to the store methods. `placeOrder()` has no DOM event argument; the renderer handles form validation and `preventDefault()`.
4. Use the cleanup returned by `start()` on unmount. It is generation-scoped, so an older cleanup cannot stop a restarted owner. `dispose()` is terminal.

The shipping session supplies destination fields to the renderer. The checkout snapshot supplies contact/address, quote/selection, pending/order state, busy flags, and an incrementing `focusRequest`. Renderers focus the current critical alert when that counter changes. Its server snapshot stays stable and has no browser effects.

## Safety contracts

| Boundary | Behavior |
| --- | --- |
| Persistence | Only the opaque idempotency key is saved in session storage. Contact, address, CSRF, and order payload remain in memory. Storage failure blocks a new attempt. |
| Uncertain result | Explicit retry preserves the original key, input, and CSRF. A retry rejection cannot erase an earlier uncertain attempt. |
| Reload or stop/start | Private retry data is discarded. The retained key can only be checked via resume followed by status lookup; mounting never resends. |
| Confirmed result | Success and first-attempt confirmed rejection clear the pending attempt. Storage cleanup failure cannot undo a confirmed result. |
| Quote | Destination identity, cart lines/coherence/totals, and TTL invalidate eligibility. Late responses cannot change a newer lifecycle or reset its session cache. |
| Session reset | Requires an invalid-session response, recovery support, and no pending attempt. An in-flight reset remains a barrier across stop/start until it settles. |

`runtime` injects storage, clock, timers, and UUID generation; `transport` injects the existing checkout functions. Both default to lazy browser implementations. No transport request starts during construction, subscription, or mounting.

## Verification

From the repository root, run `node --import tsx --test tests/client/checkout-state.check.ts tests/client/checkout-browser.check.ts` and `node --test tests/client/checkout-ui.test.mjs tests/client/checkout-config.test.mjs tests/client/checkout-state.test.mjs tests/client/checkout-browser.test.mjs`. The wrappers include these probes in the client test suite. See the [assertion map](../../../../../docs/checkout-test-retirement.md) for lifecycle and summary coverage. Browser layout and full-stack delivery remain integration checks, not claims made by controlled DOM ports.

