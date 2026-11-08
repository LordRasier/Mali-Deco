# Classification server views

[ClassificationsPage](classifications-page.ts) renders category, material and color management after [AdminPage](../admin-page.ts) checks the owner/catalog role. It uses the existing taxonomy service; JSON mutations and backend archive/reference rules are unchanged.

The section query accepts a fixed `kind` and `view`: list reads 24 rows from `page`; create needs no read; edit finds `id` only within the specified originating page. A shifted/missing/archived row is rejected rather than scanning the catalog or silently editing another option. Unknown, repeated and cross-view parameters fail closed. Templates are fixed [list](../views/admin-classifications-list.hbs) and [form](../views/admin-classification-form.hbs), with escaped text and immutable edit slugs.

[Shared taxonomy input validation](../shared/taxonomy-input.ts) is reused by the native editors. It preserves integer sort order, trimmed names, create-only slugs and explicit `null` for cleared colors. There is no restoration or inventory feature.

From the repository root, run `node --import tsx --test src/presentation/admin/classifications/classifications-page.test.ts src/presentation/admin/products/admin-products-http.test.ts`. The tests use synthetic services, not a database. Add both templates to the compiled asset allowlist. See [the native client](../client/browser/classifications/README.md).
