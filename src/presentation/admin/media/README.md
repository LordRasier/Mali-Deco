# Private product media structure

Register [admin-product-images.hbs](../views/admin-product-images.hbs) as the fixed `admin_product_images` partial. The authenticated owner/catalog product view embeds it inside a stable `[data-product-media-slot]` **outside other forms**. There is no new HTML endpoint, upload proxy, provider or operational backend.

The parent supplies `product.id` and retains the exact slot across same-product detail/edit/variant refreshes. Initial controls are disabled, content hidden, and the upload form uses `method=dialog`; all writes remain explicit browser calls to the existing authenticated JSON media endpoints. The partial itself reads no session or CSRF and does not authorize access. Existing private product-section authorization remains mandatory before serving it.

The browser hook is `mountAdminMedia(slot, session, productId, readOnly)`, returning `{ dispose(), setReadOnly(value) }`. Preserve both slot and owner when switching admin sections or refreshing the same product. After an archive acknowledgement call `setReadOnly(true)` immediately. Dispose on a different product, list/create navigation, session loss, and parent lifecycle teardown. Reuse existing admin/product-images styles; this slice introduces no new visual design.

The renderer-neutral store drives the retained native widget; see [the browser media contract](../client/browser/media/README.md) for upload intent, reload barriers, and verification. `media-template.test.ts` checks escaping and disabled SSR controls only, not HTTP authorization or real upload storage.
