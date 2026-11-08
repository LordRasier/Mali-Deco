# Administrative HTML foundation

[AdminPresentationModule](admin.module.ts) supplies authentication, retained hash navigation and explicit section providers on canonical `/admin`. [Product administration](products/README.md) includes variants; [classification management](classifications/README.md), orders and settings have their own providers. Media uses a retained widget and fixed private partial. An unregistered authorized section is unavailable, not a fake operational screen.

## Request path

- `GET /admin`: [controller](admin.controller.ts) → [AdminPage](admin-page.ts) → existing `IdentityService.me` → [login/shell template](views/admin.hbs). Anonymous sessions receive login; identity outages remain 503, not anonymous success.
- `GET /admin/sections/:section`: rechecks the session and [shared section permissions](shared/navigation.ts) on every request, then dispatches the explicit `AdminSectionRenderer` map. Each renderer owns its strict query whitelist and fixed template names. Unregistered sections use [the placeholder](views/admin-section.hbs).
- Login, logout and CSRF rotation stay on the unchanged same-origin JSON endpoints. HTML GET never issues CSRF or changes cookies. The existing admin cookie already covers `/`; no scope widening is needed.

Responses are private/no-store, noindex and guarded by a self-only CSP. User text is escaped; providers, never request parameters, choose view names. The shell rejects query parameters; each registered section validates its own query. No session token, CSRF or password is serialized into HTML.

## Host integration

The permanent [presentation module](../presentation.module.ts) imports this module. Exclude **only GET** `admin` and `admin/sections/:section` from the API prefix. [Views](views) are private; only the three declared [public assets](public) are served under `/assets/admin/`. Never broadly exclude `admin/*`: that would also unprefix existing API controllers.

Build the separate [browser entry](client/browser/browser.ts) to `public/generated/admin.js` and `public/generated/admin.css`. Its CSS import reuses the current admin stylesheet. Audit the graph to allow only the admin browser/pure session/API/navigation modules, shared navigation and the existing stylesheet; no React or server runtime imports. Copy these view/static assets into the compiled artifact. HTML, assets and JSON requests use the same origin.

[Shared navigation](shared/navigation.ts) preserves `/admin#products`, `#classifications`, `#orders` and `#settings`. Internal HTML reads use `/admin/sections/:section`; this is not a new section deep-link scheme. Native Node tests import the canonical `.ts` file or use the existing tsx loader.

## Verification

From the repository root: `node --import tsx --test src/presentation/admin/admin-page.test.ts src/presentation/admin/admin-http.test.ts`, the registered feature tests, and `npm run typecheck`. HTTP tests use in-memory identity/catalog doubles, not credentials or a database. See [browser contracts and checks](client/browser/README.md). Central route/build integration and real browser parity require independent verification; implementation alone does not approve migration checkpoints.

Template rendering follows [Nest MVC](https://docs.nestjs.com/techniques/mvc). Hash interpretation remains client-side because [fragments are not sent to the server](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment).
