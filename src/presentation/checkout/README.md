# Local checkout presentation

The `GET /checkout` page binds server-rendered native controls to the renderer-neutral [checkout store](client/state/README.md). It creates no order or checkout session during SSR.

## Integration

- The storefront mounts this controller and the existing checkout API only with explicit development opt-in (`LOCAL_TEST_CHECKOUT_ENABLED=true`). Production/default composition omits them. The [isolated browser harness](../../../tests/browser/checkout-browser-harness.ts) retains its separate synthetic composition.
- Exclude only this GET route from the JSON API prefix. The private template reuses `site_header`, `site_footer`, and `cart_panel`.
- Serve [public/checkout.css](public/checkout.css) as `/assets/checkout/checkout.css` with the fixed GET/HEAD allowlist and no-store/nosniff policy. Copy the checkout view and CSS during asset packaging.
- Include the checkout browser directory in the audited existing cart bundle. After mounting the cart panel, call `mountCheckout(root, { cart: cart.store, shippingSession: cart.shippingSession, closeCart: cart.close, setCartLocked: cart.setLocked })` when `[data-checkout-root]` exists. The required cart-owner callback locks the shared drawer during a pending attempt. No second cart or shipping owner is created.

## Boundaries

| Concern | Contract |
| --- | --- |
| Eligibility | API mode, `NODE_ENV=development`, and exact `LOCAL_TEST_CHECKOUT_ENABLED=true` are required before query validation or reading settings. Other combinations return 404 even though ordinary HTML rendering is permanent. |
| SSR inputs | Only public branding settings are read. No cookie/header/session/CSRF/attempt input is accepted or serialized. Query parameters cannot select a view. |
| Branding outage | Returns 503 and an unavailable message without an operational checkout form. |
| HTML security | Escaped values, private/no-store, noindex, same-origin CSP, no POST HTML handler or API-prefixed alias. Native checkout form uses `method=dialog`, unnamed PII controls, and an initially disabled fieldset. JavaScript handles submission explicitly; header search remains an ordinary GET form. |
| Orders | Existing JSON endpoints retain validation, session locking, and idempotency authority. Shipping execution remains disabled. Optional test payment initiation is a separate explicit action after order registration. |
| Lifecycle | The browser adapter pauses on pagehide and restarts on pageshow without resending an order. A retained opaque pending key only enables explicit recovery. |

The compact visual design uses 44 px form and touch controls, white outlined sections and the storefront theme. Mercado Pago remains disabled by default; the [optional local TEST integration](../../modules/payments/README.md) opens a hosted payment in another tab and verifies its status through explicit authenticated refresh. No payment SDK, public webhook or production payment path is enabled. Payment-enabled orders retain their opaque recovery key, never private contact fields or payment URLs. The short-lived delivery preference stores no prices or contact information and can only select a unique fresh server-quoted service. The existing order/session/recovery owner remains authoritative. Automated model, controller and adapter probes do not prove actual browser/BFCache operation or live provider compatibility.

From the repository root, run `node --import tsx --test src/presentation/checkout/checkout-page.test.ts src/presentation/checkout/checkout-http.test.ts`. Controller rendering follows the official [Nest MVC guidance](https://docs.nestjs.com/techniques/mvc).
