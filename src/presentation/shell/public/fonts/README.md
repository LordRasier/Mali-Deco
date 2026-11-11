# Storefront typefaces

Figtree is the default primary sans-serif; DM Mono is reserved for prices, controls and small labels. Both use SIL OFL 1.1. The commercial Ginto and Moderat files are not used.

## Platform-managed editor catalog

The editor also offers eight locally hosted Google Fonts families, added on 2026-11-11:

| Family | Normal weights | Style |
| --- | --- | --- |
| Manrope | 200–800 variable | Sans serif |
| Nunito Sans | 200–1000 variable | Sans serif |
| Outfit | 100–900 variable | Sans serif |
| Lora | 400–700 variable | Serif |
| Libre Baskerville | 400–700 variable | Serif |
| Cormorant Garamond | 300–700 variable | Serif |
| Bitter | 100–900 variable | Slab serif |
| IBM Plex Mono | 400, 500, 600, 700 | Monospace |

These are unchanged Latin WOFF2 subsets from the [official Google Fonts CSS API](https://developers.google.com/fonts/docs/css2), including precomposed Spanish accents, ñ and euro symbols. Unsupported scripts and italic styles use browser fallback behavior. `catalog-sources.json` records every original URL, SHA-256 and the pinned Google Fonts repository revision for licenses. Each family includes its original copyright and SIL OFL 1.1 license. The eleven new binaries total 291,396 bytes; browsers request only the faces used by the selected design, not the entire catalog.

`catalog.css` declares local faces and is shared by storefront and editor samples. No external CSS/font requests or downloads occur during builds or at runtime. Georgia and Arial remain system-font choices for compatibility, for twelve selector options in total. Null choices retain the original storefront design. Selections stay in content drafts until publication.

This is a closed platform catalog. Store users cannot upload font files, provide font URLs, or enter CSS. Adding a family requires a reviewed code change, license/provenance checks, an explicit static/build allowlist entry, sample styles and tests. Do not replace these lists with directory scanning or public uploads. The source manifest and this README ship with build artifacts but are not exposed by HTTP.

Files are vendored unchanged from the sources below, loaded from the same origin with font-display: swap, and included with their copyright and licenses in build output. No third-party font request is made by visitors.

Figtree is a normal variable face (300-900). DM Mono includes the normal Latin 400 and 500 subsets delivered by the official Google Fonts CSS API; Spanish accents and euro/dollar symbols are included. Unsupported scripts fall back to the configured local fonts.

## Original default pairing: sources and SHA-256

Retrieved: 2026-11-06.

- File: dm-mono-medium.woff2
  Source: https://fonts.gstatic.com/s/dmmono/v16/aFTR7PB1QTsUX8KYvumzEYOtbQ.woff2
  SHA-256: 9964608a849396bd00c4bfd7034afe03486469dcf20b4f6b8cbdfdd310369951

- File: dm-mono-regular.woff2
  Source: https://fonts.gstatic.com/s/dmmono/v16/aFTU7PB1QTsUX8KYthqQBA.woff2
  SHA-256: e1896b13b2b1bb112fac2f9571bd6c40e118746e77a4511edbf43fbb41bf3e1e

- File: figtree-variable.woff2
  Source: https://raw.githubusercontent.com/erikdkennedy/figtree/032dfa7fe219ef3a02890d6d3add84eacc9aebfe/fonts/webfonts/Figtree%5Bwght%5D.woff2
  SHA-256: 6b96ce6d4783658f09e2b92d468da8e542d57aa6e4bc461ab2e7ae71565fdc64

- File: OFL-DMMono.txt
  Source: https://raw.githubusercontent.com/google/fonts/86aced91de05cd4f96a06838124cca45be337b2b/ofl/dmmono/OFL.txt
  SHA-256: 2bada5ea45c3c63b7f1ea1f88ce9672c9e4f0c42b2c3b7378949084fe55a3066

- File: OFL-Figtree.txt
  Source: https://raw.githubusercontent.com/erikdkennedy/figtree/032dfa7fe219ef3a02890d6d3add84eacc9aebfe/OFL.txt
  SHA-256: 140d37233e7f3ce7313798befa9600893bcceaf41a55fa0fa5ad52f7f657a268
