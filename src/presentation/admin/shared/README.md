# Shared administrative navigation

[navigation](navigation.ts) is the pure section/role allowlist used by the [HTML provider](../admin-page.ts) and the [native navigation facade](../client/navigation.ts). It preserves the four exact existing hashes, role-specific defaults and unavailable handling for unknown/forbidden hashes. It does not replace the API's server-side guards.

[taxonomy-input](taxonomy-input.ts) owns the pure classification form validator used by the native forms; it is not a replacement for backend validation.

Keep this directory free of browser, React, Nest runtime and database imports; type-only role imports are erased. Return to [the administrative foundation](../README.md).
