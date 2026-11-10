# Administrative DOM client

[browser](browser.ts) binds the Nest-rendered shell without React. [admin-workspace](admin-workspace.ts) reuses the existing session owner and navigation rules; [admin-dom](admin-dom.ts) binds native forms and retains visited section nodes. [admin-runtime](admin-runtime.ts) reads authorized server HTML only; all authentication and operational mutations continue through the existing same-origin JSON transport. [The feature registry](admin-features.ts) mounts one explicit section owner and disposes it on replacement/session loss, never on hash hiding. [Product administration](products/README.md) uses this boundary.

## State and security contracts

- Constructing the workspace does not touch the browser. `start()` subscribes once and returns generation-scoped cleanup. Auth commands, navigation and late responses cannot revive a stopped owner.
- Drafts and pending section state survive hash changes, not reload, session expiry, changed user/role/authentication epoch or cleanup. No draft, password, CSRF or upload file is written to storage.
- Uncertain logout keeps the authenticated workspace and its drafts. Successful logout/401 clears it. Login/logout remain serialized by the existing session core; old 401 responses cannot expire newer authentication. A newer authentication also releases an obsolete action's busy state.
- HTML partials are requested without CSRF or mutation headers. The server rechecks the role on every request; client-side hidden navigation is not authorization. Only the fixed same-origin, escaped section boundary accepts HTML; account/error values use text content.
- [Page lifecycle](admin-lifecycle.ts) clears section DOM on pagehide. BFCache restoration starts one session revalidation before remounting; bootstrap deduplication prevents duplicate CSRF rotation. Several tabs can invalidate each other's CSRF as before: 403 is not silently retried.

The four existing hashes retain their semantics, including invalid/forbidden links and role-specific defaults. The skip link moves focus without replacing the current section hash. Feature controllers register explicitly; no client-side router replaces the server-rendered sections.

## Checks

From the repository root, run `node --import tsx --test tests/client/admin-browser.check.ts tests/client/admin-runtime.check.ts tests/client/admin-dom.check.ts tests/client/admin-lifecycle.check.ts`, the existing admin session/navigation/workspace tests, and `npm run typecheck`. The DOM double proves binding/retention logic, not browser parsing, layout, keyboard behavior or BFCache eligibility. Independently verify those after [host integration](../../README.md).
