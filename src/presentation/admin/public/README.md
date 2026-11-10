# Administrative static assets

[admin.css](admin.css) adds shell rules and imports the generated copy of the existing administrative stylesheet. The browser build emits `generated/admin.js` and `generated/admin.css` from [the dedicated entry](../client/browser/browser.ts). Generated output must not include React, source maps, secrets or server dependencies.

The permanent asset allowlist serves only these three files at `/assets/admin/`, for GET/HEAD, with no-store and nosniff. Directory listing, README, dotfiles, source maps and adjacent [views](../views) are not public. Include assets in the compiled artifact. See [integration requirements](../README.md).
