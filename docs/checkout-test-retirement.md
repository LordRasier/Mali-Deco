# Checkout assertions no longer depend on React

The retired React lifecycle and summary probes were run successfully before removal. Their business assertions now run through the shared checkout owner, real shared shipping session/projection, and native DOM adapter. No checkout production behavior changed during this test-only port.

## Assertion map

| Retired assertion | Retained neutral coverage |
| --- | --- |
| Inherited ambiguous postal/candidate selection; no duplicate lookup or cart estimate; suspended estimate not endlessly busy | [checkout-state.check.ts](../tests/client/checkout-state.check.ts): `checkout inherits an ambiguous shared destination...` uses the real `ShippingSession` and `shippingPanelState`, including the original debounce window. |
| Exact quoted cart/destination; stale destination/cart responses ignored | Same inherited-destination test checks transport arguments and stale success; `cart changes and destination changes discard late quotes...` checks stale failure/cache isolation. |
| PII absent from pending persistence; uncertain retry keeps key and original data; retry quote rejection remains pending | `uncertain attempts retain the exact key, original CSRF and frozen input...` now checks name/email/phone/address and focus increments. |
| Reload offers lookup, not resend; resume precedes status lookup; unknown/403 stays pending with no success/reset | `restored attempt only resumes then looks up...`, stopped-resume tests, and [checkout-browser.check.ts](../tests/client/checkout-browser.check.ts) pending recovery/focus tests. |
| First-attempt quote rejection clears pending and quote | `first confirmed rejection clears pending...`. |
| Reset only after verified invalid session, without pending attempt, with browser recovery support | Reset eligibility/barrier tests and `ordinary lookup does not request critical focus...`; DOM recovery test checks unavailable-browser copy. |
| Invalid destination preserves postal but clears selection, does not auto-retry, and is not busy | Real shared-session inherited-destination/eviction test, plus invalid-destination/conflict test. |
| Error/pending focus; ordinary lookup does not steal focus | State focus counters and DOM pending/error/postal tests. |
| Postal input survives a lookup while editing | DOM `postal lookup retains the editor node...`. The old React-only “Usar este destino” collapse button is not asserted: MVC deliberately keeps the native postal editor mounted. |
| Product/variant/subtotal copy; total only for current selected same-currency shipping; disabled otherwise | DOM `summary retains product/variant/subtotal copy...` and `checkout totals/submit require coherent single currency...`, covering missing quote/option, expiry, unresolved cart, mixed currencies and pickup membership. |

Removed only the obsolete `checkout-ui-lifecycle.check.cjs`, `checkout-ui-lifecycle.test.mjs`, `checkout-ui-summary.check.ts`, and `checkout-ui-summary.test.mjs`. Their React hook/SSR mechanism is not a business contract.

## Still required

- [checkout-ui.check.ts](../tests/client/checkout-ui.check.ts) and its [wrapper](../tests/client/checkout-ui.test.mjs): pure transport/session-lock/idempotency/response-validation checks, retained unchanged.
- [checkout-state.test.mjs](../tests/client/checkout-state.test.mjs), [checkout-browser.test.mjs](../tests/client/checkout-browser.test.mjs), and [checkout-config.test.mjs](../tests/client/checkout-config.test.mjs).
- Canonical HTTP boundary tests and the documented synthetic browser evidence. Controlled DOM tests do not prove browser layout, OS interactions, database persistence or actual BFCache restoration.

Run from the repository root: `node --import tsx --test tests/client/checkout-state.check.ts tests/client/checkout-browser.check.ts`, then `node --test tests/client/checkout-ui.test.mjs tests/client/checkout-config.test.mjs tests/client/checkout-state.test.mjs tests/client/checkout-browser.test.mjs`.
