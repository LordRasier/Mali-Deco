# Retained classification editor

[classification-dom](classification-dom.ts) binds native server-rendered forms. [classification-controller](classification-controller.ts) sequences reads and existing JSON mutations; [classification-runtime](classification-runtime.ts) keeps kind/view/page/id explicit and validates server metadata before replacing content.

Drafts survive administrative hash switches. Within this section, changing category/material/color is blocked while editing until save or cancel. Names, integer sort order, immutable edit slugs and optional color clearing use the canonical shared validator. The 100-item/1,000-option selector loader remains separate from these 24-row management lists.

Writes are single-flight, carry the current CSRF, and never automatically retry. Conflicts and uncertain acknowledgements preserve the form. A confirmed mutation removes the editor before reloading page one; a read outage therefore cannot repeat a create. Archive requires explicit confirmation and the canonical empty acknowledgement, respects backend reference conflicts and has no restore action. Cleanup and authentication epoch checks reject late results.

From the repository root, run `node --import tsx --test tests/client/admin-classifications.check.ts tests/client/admin-classifications-dom.check.ts` or `node --test tests/client/admin-catalog-editors.test.mjs`. Controlled DOM tests are not browser verification. See [server views](../../../classifications/README.md) and [workspace lifecycle](../README.md).
