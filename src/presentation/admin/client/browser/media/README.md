# Shared product media owner

[createAdminMedia](media-state.ts) is the single state owner used by [mountAdminMedia](media-browser.ts). It reads and mutates through the existing same-origin admin API; it adds no backend or automatic write retry.

## Mount and retain

```ts
const media = mountAdminMedia(slot, session, productId, archived);
// Preserve this exact slot and owner for same-product reads and hidden admin sections.
media.setReadOnly(true); // Immediately after archive acknowledgement.
media.dispose(); // Different product/list/create, session loss or lifecycle teardown.
```

The slot must contain the registered private `admin_product_images` partial and remain outside product/variant forms. File controls, upload drafts and keyed image-row editors stay mounted through list reloads and section hiding. Disposal clears the native file control and in-memory draft. A role, user, CSRF or authentication-epoch change revokes the old owner and clears private state; a new identity requires a new owner.

## Write guarantees

| Boundary | Behavior |
| --- | --- |
| Upload intent | File and alt text are retained in memory. An explicit retry keeps the opaque idempotency key across uncertain results and list reloads. Only actual File/alt changes, successful upload or private-owner teardown reset it. |
| Concurrency | Every mutation sends the current list revision as `If-Match`. After reloading an uncertain upload, the revision can change while its input/key remain unchanged. |
| Reload barrier | 412/428, network failures, 5xx and malformed successful responses block all writes until a successful list reload. Reload never sends a write. |
| Limits | Client checks JPG/PNG/WebP and nonempty files up to 5 MiB, and caps active images at ten. Existing server image validation enforces 16 MP/8000-pixel bounds, animation rejection, derivative limits and quota. Existing help/error mappings remain unchanged. |
| Lifecycle | Stop invalidates late effects and preserves drafts; stopping an in-flight write requires reload. Disposal/session revocation clears drafts. Lifecycle cleanup remains valid after read-only or request-generation changes. |
| Native UI | Stable file/editor nodes; API strings use text content, private image URLs use encoded identifiers and width 320. Hidden sections do not steal focus. |

No upload bytes, intent keys, CSRF or drafts are persisted to storage. API authorization, CSRF, idempotency, concurrency and storage remain authoritative.

Selecting multiple images builds an ordered in-memory queue. The upload endpoint still receives exactly one file per request. A validation/size rejection leaves its row available for retry while other selected files proceed; an unknown or conflicting outcome pauses the queue until a successful metadata read. A retry sends only the selected failed row, with its original key. A fresh selection explicitly replaces the queue. The cover is the first active image; “Usar como portada” moves an existing image to position zero with the revision-checked reorder endpoint.

On confirmed lists, the widget dispatches a bubbling `product-media-updated` event from its root with `{ coverUrl: string | null, count: number }`. Consumers must scope it to the current product slot; draft edits and stale responses never dispatch it.

## Verification

From the repository root, run `node --test tests/client/admin-images.test.mjs tests/client/admin-media.test.mjs`, or run the two `admin-media-*.check.ts` probes directly with `node --import tsx --test`. These use synthetic File objects and controlled DOM ports; they are not real decoding/storage, browser-layout, or authenticated HTTP integration evidence. The API partial test validates escaped, disabled structure only.

### Synthetic browser verification — 2026-11-03

A parent-run browser check passed against an isolated loopback Nest fixture using the real media controller, catalog guard, multipart interceptor, private partial, media widget and retained product-slot helper. Media storage and identity authorization were synthetic in-memory doubles; no database, provider, real user credentials or filesystem upload storage was involved. The fixture used a fresh audited 11-module, 17,725-byte browser bundle.

- No-JavaScript SSR returned 200 with disabled file/submit controls, hidden content and zero API calls.
- The exact native input, selected File and alt draft survived same-product detail/edit fragment replacement and hash-based section hiding with only one metadata read.
- A synthetic commit followed by 503 blocked all writes until successful list reload. Explicit retry sent identical file bytes/name, key, alt and CSRF with `If-Match` changing from 1 to 2; exactly one image was added, with no automatic upload.
- Reorder, alt edit, retire and restore used revisions 2, 3, 4 and 5. Archive state remained read-only across a stale editable fragment; identity expiry cleared native File/alt and hid content.
- Zero page errors/outward requests; all fresh browser contexts closed in `finally`.

The runner had no Node `Buffer`, so file setup used browser-native `File`/`FileList` through `DataTransfer` and a change event: **the OS file picker was not exercised**. This fixture proves the real retained-slot helper/widget and multipart protocol, not the full product/variant router, image decoding/derivative limits, persistent storage or production identity service. Both owned fixture processes were confirmed stopped. The scoped temporary-directory deletion was rejected by execution policy; files remain and no alternative deletion mechanism was attempted.
