# Renderer-neutral product state

[createProductStore](product-store.ts) owns variant selection and pagination for the native DOM client. Construction and snapshot reads have no browser or network effects.

## Lifecycle

Create one store per product view, subscribe to changes, render `getSnapshot()`, then call `start()`. On teardown, invoke its returned cleanup and unsubscribe. Recreate the store when the initial product, total or mode changes. A stopped store can restart with retained pages; concurrent starts are rejected. Commands before start or after cleanup do nothing.

The cached snapshot exposes `variants`, `selected`, `status`, `warning`, `hasMore`, `loadingMore`, `pageError` and `pageConflict`. Commands are `choose(id)`, `retry()` (selection) and `loadMore()` (including page retry). Consumers treat snapshots and their nested values as read-only. `getServerSnapshot()` always returns the initial loading state.

## Boundaries and guarantees

- [ProductRuntime](product-runtime.ts) isolates URL reads, history writes and popstate subscription. Optional `runtime`, `resolve` and `fetchPage` dependencies support deterministic tests; defaults reuse the existing browser/API helpers.
- Selection uses [the canonical parser and resolver](../../../shared/products/product-selection.ts): absent query selects the first variant; invalid, duplicate or unavailable links leave no selection and a warning. Off-page IDs resolve exactly one product/variant pair, never a catalog scan.
- Off-page selection stays separate from paginated membership. Pages contain up to 100 variants; identity, total, cursor, size or overlap failures never advance the cursor. Successful page loads preserve the selection.
- Selection changes abort pending pages and resolution. Lifecycle generations and selection revisions also reject late completions from dependencies that ignore abort. Queued events from old subscriptions and synchronous subscriber cleanup cannot initiate stale work.

The [DOM adapter](../browser/README.md) owns subscription and cleanup. The server bootstrap is validated before constructing the store; neither construction nor snapshot reads start requests.

## Verify

From the repository root, run `node --import tsx --test tests/client/product-state.check.ts`. Controlled state probes are not browser verification; history navigation, keyboard interaction and BFCache still require browser checks at integration time.
