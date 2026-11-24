# Kage world, vendored

Source: ThreeUI `KageLandingPage`, bundle `https://threeui.com/source-code/kage-landing-page.json`,
canonical page `public/landing-pages/kage.html` (SHA-256 `c8e06b90397a...`), read 2026-11-24.

| File | From | Changes |
|---|---|---|
| `three.min.js` | `secret-pathways-assets/three.min.js` | none, SHA-256 `8a5f7249...2a2271` matches |
| `kage-world.js` | the page's inline `<script>` | 6 edits, below |
| `kage.css` | the page's inline `<style>` | 4 image URLs point at `/landing-pages/secret-pathways-assets/generated/` instead of ThreeUI storage |

The 14 images in `web/public/landing-pages/secret-pathways-assets/` are byte-for-byte copies;
each SHA-256 matches the bundle's asset table.

Edits to `kage-world.js`:

1. `new __threeuiStorageImage()` to `new Image()`: that helper is injected by threeui.com's server
   and is not part of the page.
2. The 3-D wordmark spells `KODO`, not `KAGE`.
3. and 4. The wordmark and its font preload use `Onest` instead of ThreeUI's private `Wordmark`
   face (the served `fonts.css` only links to ThreeUI storage, so it is not copied).
5. The rail labels name Kodo's chapters.
6. The boot error log prefix reads `[kodo]`.

This folder is excluded from the board's dash lint (`scripts/board.mjs`), because the authored
comments use em dashes. Kodo's own copy lives in `web/index.html`, which is linted.
