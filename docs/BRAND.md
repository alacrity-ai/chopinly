# Brand — the Chopinly mark and wordmark (WSHED-97, 2026-09-06)

**The mark** is five piano keys — C, C♯, D, D♯, E — on a rounded ebony tile, with
**C in brass**: C for Chopin, and the key every pianist finds first. Because C♯ sits
on its shoulder the brass key has the real L-shape of a C key. Three white keys and
two black in a square read cleanly down to a 16 px favicon.

**The wordmark** is *Chopinly* in Fraunces 550 (optical size auto, letter-spacing
−0.01em). Its one brand detail: **the dot of the i is a small brass key**. That detail
lives only in image assets (SVG/PNG, the OG cards). Live HTML text stays a plain
`Chopinly` so screen readers, search snippets and copy-paste never see a dotless ı.

Palette: ebony `#191410` · ivory `#eee5d3` · brass `#c9a35c` (bright `#e3c284`).
In the app the navbar mark uses the skin's tokens (`currentColor`, `--accent`, `--bg`)
so it follows every skin.

## Assets (`brand/`)

| file | what |
|---|---|
| `chopinly-mark.svg` / `.png` | the tile, dark (default) |
| `chopinly-mark-light.svg` / `.png` | ivory tile, ebony keys |
| `chopinly-mark-bare.svg`, `-bare-light.svg` | keys only, no tile (for placing on any ground) |
| `chopinly-wordmark.svg` / `.png` | ivory wordmark, outlined to paths (no font needed) |
| `chopinly-wordmark-dark.svg` / `.png` | ebony wordmark for light grounds |
| `chopinly-lockup-horizontal(-light).svg` / `.png` | mark beside wordmark, caps centred on the tile |
| `chopinly-lockup-stacked(-light).svg` / `.png` | mark above wordmark |

Icons: `icons/favicon.svg` (the tile), `icons/chopinly-192.png`, `icons/chopinly-512.png`,
`icons/chopinly-maskable-512.png`, `icons/apple-touch-icon.png` — all full-bleed ebony
squares (iOS/Android round their own corners; the keys sit inside the maskable safe
zone). OG cards: `og/chopinly.png` and `og/blog/*.png` from `dev/og.html` / `dev/og-post.html`.

## Where it's used

Landing header + hero (`index.html`), the app navbar (inline SVG in `app.html`,
styled by `.brand-mark`), the document/blog/tool page header (`dev/build-site.mjs`,
`dev/build-legal.mjs`), favicons + apple-touch-icon on every page, the manifest, the
OG cards, `README.md`, and the `Organization.logo` in JSON-LD.

## Regenerating

```bash
npx wrangler pages dev . --local --port 8789            # fonts for the measurement step
PYTHON=$(which python3) node dev/logo/finalize.mjs      # needs python3 + fonttools + brotli
node dev/render-og.mjs && node dev/render-og.mjs --posts
node dev/build-legal.mjs && node dev/build-site.mjs
```

`dev/logo/marks.mjs` holds the geometry (and the two unchosen candidates, A "Middle C"
and C "The Pendulum"); `dev/logo/build.mjs` rebuilds the candidate sheets. The wordmark
is shaped and kerned by Chrome at 144 px, then each glyph is outlined from the variable
font (opsz 144, wght 550) by `dev/logo/outline.py` — so the SVG matches what the site
renders, byte for byte in shape.
