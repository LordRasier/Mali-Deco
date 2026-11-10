# Variant inventory and checkout quantities

## Administration

- A variant in **Stock** mode has an integer `stockQuantity` (0–1,000,000). New and migrated variants default to zero; no inventory is invented.
- **A pedido** variants have no physical-inventory cap. The operational checkout limit remains 999 units per line and 1,000 total.
- Each variant has compact cost, markup, sale price and stock inputs. **Ilimitado** selects the existing `made_to_order` mode and disables the quantity input; turning it off requires an explicit nonnegative integer. Changing the mode preserves the stored quantity.
- Cost and sale price are persisted as minor currency units; the displayed markup is derived as `(sale / cost - 1) * 100`, rounded to two decimals. Editing cost/markup calculates sale, editing sale calculates markup when cost is available, and sale plus markup can calculate a missing cost. Blank/partial inputs are not zero. A zero cost cannot define an inverse markup, so that percentage stays blank.
- `PUT /api/v1/admin/catalog/products/:id/variants/:variantId/pricing` atomically saves cost, sale price, mode and changed stock. It compares the displayed price/cost/currency/mode and, only when changing inventory or mode, the displayed stock. A concurrent purchase rejects stale stock edits, while a cost/price-only update preserves the purchase decrement. The application user retains its existing privileges.
- Each pricing row saves independently and retains neighboring drafts. Unknown outcomes or conflicts keep the draft and require reviewing the product before another write; writes are never retried automatically. The original stock and quick-adjustment endpoints remain compatible.

## Variant table and properties

- Adding or editing a variant opens a right-side modal drawer: choose a property, enter its value, then continue to price/details. Back preserves the draft; Escape, backdrop and close protect unsaved changes with an inline discard prompt. The drawer contains keyboard focus and becomes full-width on mobile.
- **Agregar variantes** switches the simple price panel to a compact list, reusing the standard variant for its first customization. Rows show a gallery image, variant, stock, sale price and actions; **Costo** expands cost/markup without losing the existing pricing calculation or stock concurrency checks.
- Configured variants require **Material** (PLA, PETG, etc.) and allow one secondary property for the product: **Color** or a custom property such as **Diseño**. Each SKU has one value per property; PLA / Navidad and PLA / Año Nuevo are separate SKUs. A bounded cross-page property/value catalog groups names case-insensitively and excludes archived variants. The drawer reuses that property and offers its existing values or a new value; it does not add a second Diseño row.
- Writes carrying `options` enforce material, one secondary property, product-wide property consistency and unique material/value combinations under the product lock. Legacy simple-price writes without `options` remain compatible; existing products are not automatically reclassified. Stock and cost are preserved when editing properties.
- Public detail, listing and cart resolution expose only name/value properties. Landing/catalog cards and product detail show Material separately and secondary values in selectable lozenges; each click selects an existing SKU and its price. Legacy/ambiguous combinations retain the ordinary variant selector. Partial listing samples retain the existing “Ver opciones” flow.
- Clicking the thumbnail chooses an active image from that product's existing gallery. `PUT /api/v1/admin/catalog/products/:id/variants/:variantId/image` compares `expectedImageId`, validates ownership under the product lock and only updates `image_id`. Retiring a gallery image clears its variant assignments in the same transaction.
- Migration `VariantOptions1793361400000` adds nullable image/property fields without altering existing prices, stock or taxonomy. Controls retain the 32 px Porto proportions; the table adapts to two fields per row on mobile.
- Product information includes an optional bulk-order threshold (1–1,000) and a plain-text message (up to 300 characters). Both blank disables it. The warning activates inclusively, summing variants of the same product, and appears once in cart/checkout. Omitted API fields preserve existing settings.

## Purchase boundary

Cart additions and increases refresh availability and serialize writes, including the in-tab fallback without Web Locks. Shortages preserve lines so customers can decrease or remove them. Any pending mutation makes checkout unresolved before asynchronous stock checks begin.

Shipping/checkout quotes validate availability but do not reserve inventory. Checkout quantity controls invalidate totals and re-quote; delivery preference is restored only when the fresh response still contains the same service and pickup point. No old shipping price is reused.

Orders lock the session, handle idempotent replay, lock product rows in deterministic order, then lock variant rows and decrement stock within the same transaction as the order insert. Shortages reject the order; insertion errors roll back decrements. A replay never consumes inventory twice. A first definitive stock rejection unlocks editing; a previously uncertain attempt remains protected for recovery.

**Local test orders consume configured stock too.** Payments remain disabled and no shipments are created. There is no new cancellation/restoration or reservation lifecycle in this change. Do not treat a manual stock correction as a refund or cancellation.

## Migration and verification

Migration `1793361000000` adds stock and warning columns/check constraints. Its rollback refuses to discard populated stock or warnings. Deploy schema before the updated application. Existing sample product modes, counts and orders are preserved.

Migration `1793361300000` adds nullable `cost_minor`; it refuses rollback when costs have been populated. Costs are private admin data and are omitted from public catalog responses. Applied to the authorized local `mali_catalog_pruebas` database on 2026-11-08; deployment must apply it before starting the updated application.

Isolated MariaDB tests cover competing sessions, stale admin edits, replay, downstream rollback, and reversed multi-variant order. UI/state tests cover stock boundaries, quantities, warning aggregation, safe text, pending mutations, drawer/checkout ownership and no-Web-Locks serialization. Evidence is in `artifacts/stock-checkout/`.
