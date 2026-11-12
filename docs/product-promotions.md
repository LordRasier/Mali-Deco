# Featured products and discounted prices

## Store administration

- In a product, **Organización → Destacado** marks it as eligible for featured landing blocks. Save the product normally. Draft or archived products never become public because of this flag.
- In the home editor, select a product block and choose **Origen de los productos → Productos destacados**. Save the draft and publish when ready. Existing category/manual sources are not replaced automatically. Featured results use alphabetical order and the block's existing limit; use manual selection for a custom order.
- **Precio en descuento** is a separate optional amount alongside the regular selling price, including each variant. Empty clears it. A nonnegative amount below the regular price activates the discount; equal/higher amounts are stored but inactive.
- Saving catalog fields follows existing catalog behavior: changes to a published product are immediate. Selecting/changing the landing block source remains subject to the editor's separate draft/publish workflow.

## Price contract

Storage/admin `priceMinor` remains the regular amount; `salePriceMinor` is nullable. Public `priceMinor` is the effective payable amount, with `regularPriceMinor` and `discountPercent` only for active discounts. The ribbon and crossed-out price follow the selected variant; incomplete samples never claim a product-wide discount.

Percentages use exact integer arithmetic and are rounded down, with `<1%` for smaller savings. Zero is valid under the existing money contract; a 100% discount is possible. This does not add support for zero-total Mercado Pago payments: the existing payment provider requires a positive order total.

Listing ranges, filters, representative ordering, detail, cart, shipping declared value and checkout quotes use effective prices. Orders recheck the current effective price under existing locks and require a new quote if it changed. Existing order/payment snapshots are never repriced.

Pricing saves compare the previously read discount as well as price/cost/currency/supply mode. Omitted API discount fields preserve the amount; explicit null clears it. A currency change without an explicit replacement clears the old discount instead of silently reinterpreting its denomination.

## Deployment and rollback

Migration: `ProductPromotions1793362200000` adds `products.featured` (false by default) and nullable `product_variants.sale_price_minor` with a safe-integer constraint. It does not change existing prices or select/publish landing blocks.

Apply the migration with an authorized maintenance account **before starting the new application version**. The application account intentionally lacks ALTER privileges. Do not grant it schema permissions or enable automatic synchronization.

The targeted command is `npm run migration:promotions`; it does not run unrelated pending migrations. `npm run migration:promotions:local-root` is only for explicitly authorized passwordless-root maintenance of the local development database. Do not use that command in production.

MariaDB DDL is independently committed. Up uses `ADD COLUMN IF NOT EXISTS`; down checks remaining columns and refuses to discard populated promotions. Stop writers before rollback. A partial empty rollback can be retried. Back up before production maintenance; ALTER may wait for metadata locks. [MariaDB ALTER TABLE reference](https://mariadb.com/docs/server/reference/sql-statements/data-definition/alter/alter-table).

Local activation completed with explicit authorization on 2026-11-12 in `mali_catalog_pruebas`. A verified SQL backup preceded the targeted migration; all preexisting values across 26 data tables were unchanged, and the migration ledger gained only this migration. The application account retains SELECT/INSERT/UPDATE/DELETE without ALTER. This does not establish production migration status.

## Verification

Evidence is kept locally in `artifacts/featured-discounts`: failing-first core, pricing, order/quote, validation, migration, locking and acknowledgement regressions; full checks; isolated browser fixtures at 320/390/768/1280 px. Browser fixtures exercise variant changes, ribbon removal, exact discount saves, explicit clearing and stale-edit preservation without accounts or live writes.

Independent backend review found and resolved a missing transaction on unconfigured variant edits and an interrupted-rollback recovery issue. After local migration, the normal application account successfully read the 58-product list and rendered the editor; the running home and catalog returned HTTP 200. Concurrent database transactions and a production deployment have not been exercised by these checks.

Final checks: server 564/564, client 66/66, architecture 10/10; five browser fixtures passed with no omissions. Typecheck, lint and build passed. Public browser bundle: 106,562 bytes, audited against a 108,000-byte bound; only the pure shared percentage helper was added to the permitted dependency graph. The admin CSS bound increased by 2 KB to cover the new responsive controls.
