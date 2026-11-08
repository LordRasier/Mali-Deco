# Administrative client contracts

[Return to administration](../README.md) · [Native browser adapter](browser/README.md)

[api](api.ts) owns same-origin JSON requests and CSRF transport. [session-core](session-core.ts) and [session-store](session-store.ts) expose the session lifecycle; [navigation](navigation.ts) reuses the canonical hash policy. [form-validation](form-validation.ts), [taxonomy-data](taxonomy-data.ts) and [types](types.ts) are shared by the native feature editors.

The browser layer owns DOM retention, subscriptions and cleanup. The server remains the authority for roles and mutations. A failed or uncertain response never establishes success, refreshes permissions optimistically, or triggers an automatic write retry. No credentials, session cookies or private server configuration belong in a bundle.

Run `npm run test:client` from the repository root; controlled ports do not prove browser layout or real storage/provider behavior.
