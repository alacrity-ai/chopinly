# Chopinly — Scores: implementation plan (WSHED-98)

Companion to [`SCORES_DESIGN.md`](SCORES_DESIGN.md). Four phases, each its own
ticket, each landing on `main` through the ship loop in
`claude_ops/docs/sops/chopinly-ops.md` and each leaving production usable.
Anonymous use never breaks at any phase; nothing is half-migrated between them.

**Repo** `~/lets-get-rich/woodshed`, persona `leifktaylor`, Pages project
`woodshed`, host `chopinly.com`. Branch per phase `WSHED-<n>-scores-<slug>` off
`main`, PR, `gh pr merge --merge`, confirm the merge, `npm run deploy`, poll the
edge, rerun E2E against production, screenshots on the card, hand off to Leif.

## 0. Ground rules

- **No build step, no npm dependencies.** pdf.js is *vendored* (copied files
  under `vendor/pdfjs/`), not installed. `node --test` for the pure layer.
- **Every new module goes into `sw.js` `SHELL[]`** (the test enforces `js/`;
  P0 extends it to `vendor/pdfjs/`). Bump `CACHE` in `sw.js` and `VERSION` in
  `js/version.js` on every shipped phase.
- **The data layer never touches the DOM.** `js/lib/scores/*` is pure or
  storage-only and unit-tested; `js/tools/scores/*` is the UI.
- **The merge rule stays in `js/lib/merge.js`**, imported by both sides. New
  kinds and the per-kind body cap are added there and nowhere else.
- **The PDF blob is never mutated.** Any code path that would write into it is a
  bug.
- **Copy in register.** *score*, *page*, *bookmark*, *ink*, *practice this*. Not
  *document*, *file*, *annotation*, *viewer*.
- **Legal pages are generated** (`node dev/build-legal.mjs`) and committed;
  `tests/site.test.mjs` fails when they are stale.

## 1. File plan (whole epic)

```
vendor/pdfjs/                      P0   pdf.mjs · pdf.worker.mjs · standard_fonts/ · LICENSE · VERSION
dev/vendor-pdfjs.mjs               P0   downloads a pinned pdfjs-dist tarball, copies the four things above (run once per bump)
dev/make-fixture-pdf.mjs           P0   writes tests/fixtures/score-12p.pdf (hand-built, dependency-free)
js/lib/scores/store.js             P0   IndexedDB chopinly-scores: files (P0) · pages (P1) · meta
js/lib/scores/pdf.js               P0   lazy loader + open(blob) → { pages, info, render(n, width, dpr) }
js/lib/scores/pagecache.js         P0   memory ring + prefetch; P1 adds the persistent tier
js/lib/scores/library.js           P1   search · sort · group · suggestions (pure)
js/lib/scores/ink.js               P2   encode/decode · simplify · hit-test · bounds (pure)
js/lib/scores/cloud.js             P3   upload/download queue + reconcile
js/tools/scores/index.js           P0   { id: "scores", name: "Scores", category: "library" }
js/tools/scores/ui.js              P0   router library ↔ reader, shared chrome
js/tools/scores/library.js         P0   list + import; P1 search/sort/group/tags/metadata sheet
js/tools/scores/reader.js          P0   canvas, tap zones, turn engine, keys, chrome auto-hide, fit
js/tools/scores/marks.js           P1   bookmark button + jump list
js/tools/scores/inkbar.js          P2   pen / highlighter / eraser / undo / colours / finger toggle
js/lib/logbook.js                  P1   scores[] · marks[] · ink[] (P2) · cascade · stamp
js/lib/merge.js                    P1   KINDS + score, mark; P2 + ink and BODY_CAPS
js/tools/logbook/ui.js             P1   Today hero "open score"; goal page score row
js/tools/logbook/picker.js         P1   `score` mode (link a goal)
js/ui/account.js                   P1   "scores on this device" row + sheet; P3 quota line
functions/lib/scores.js            P3   /api/scores/* handlers
functions/lib/routes.js            P3   route table entries; DELETE /api/me prefix wipe
functions/lib/sync.js              P2   per-kind body cap; P3 tombstone → R2 delete
migrations/0002_storage_bytes.sql  P3   users.storage_bytes
wrangler.toml                      P3   [[r2_buckets]] binding = "SCORES"
dev/build-legal.mjs                P0   "third-party" wording; P3 privacy table + terms clause
tests/scores.test.mjs              P0→  doc ops, envelopes, cascade, quota maths
tests/library.test.mjs             P1
tests/ink.test.mjs                 P2
tests/sw.test.mjs                  P0   + vendor/pdfjs precache requirement
tests/e2e/scores.mjs               P0→  grows each phase
tests/e2e/scores-cloud.mjs         P3
docs/SCORES_QA.md                  P3   the iPad checklist Leif runs
README.md, content/tools/scores.md P3   the public story (tool page for the crawl surface)
```

## Phase 0 — the reader (import, open, turn)

**Goal:** a musician can import a PDF on this device, find it in a list, open it
full screen, and turn pages by tapping the edges. Local only, anonymous, offline.

1. **Vendor pdf.js.** `dev/vendor-pdfjs.mjs` fetches the pinned `pdfjs-dist`
   release tarball from npm (`https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-<v>.tgz`),
   copies `build/pdf.min.mjs` → `vendor/pdfjs/pdf.mjs`, `build/pdf.worker.min.mjs`
   → `vendor/pdfjs/pdf.worker.mjs`, `standard_fonts/` and `LICENSE`, writes
   `VERSION`. Pin the current 5.x. Commit the output; the script exists so a bump
   is one command. `_headers`: `/vendor/*  Cache-Control: public, max-age=604800`
   (path-versioned when bumped: `vendor/pdfjs-<v>/` if the edge ever bites, as it
   did with icons).
2. **`js/lib/scores/pdf.js`.** `load()` does `import("/vendor/pdfjs/pdf.mjs")`
   once, sets `GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.mjs"`
   and `standardFontDataUrl`. `open(blob)` → `{ pages, info: { title, author },
   render(n, cssWidth, dpr) → ImageBitmap, close() }`. Renders on an
   `OffscreenCanvas` when available, else a detached `<canvas>` →
   `createImageBitmap`. Rotation honoured. Encrypted PDFs reject with a sentence.
3. **`js/lib/scores/store.js`.** IndexedDB `chopinly-scores` v1 with `files` and
   `meta`; `put / get / del / clear / usage / has / localIds`, `persist()` on
   first put. Same shape as `takes/store.js`; separate file.
4. **`js/lib/scores/pagecache.js`.** Memory ring of five bitmaps around the
   current page; `warm(n)` schedules `n±1, n±2` in idle time; `get(n)` resolves
   from the ring or renders; `invalidate()` on fit change. Persistent tier is P1.
5. **Logbook doc.** `scores[]` with the P0 fields (`id, title, composer, tags,
   pages, size, sha256, addedAt, openedAt, updatedAt`); `addScore`, `removeScore`,
   `touchScore(id)`; migrate fills `scores: []`. Not yet in `KINDS` (P1), so
   nothing syncs and nothing pends.
6. **Tool.** `js/tools/scores/index.js` registered after the Recorder with
   category `library`; `app.js` draws the rule between groups already. Routes:
   `#/scores` (library), `#/scores/<id>` (reader), `?p=<n>`.
7. **Library (P0 cut).** *+ score* → file input (`accept="application/pdf"`,
   `multiple`); per file: `pdf.open` for page count and info, `sha256`, store
   blob, `addScore` with the default title / composer, toast *added*. Rows:
   title / composer · pages. Tap → reader. Hold → delete (confirm). Empty state
   copy: *no scores yet — add a PDF and it lives here*.
8. **Reader.** Page canvas centred on black; fit-width portrait / fit-page
   landscape; top bar (back · title · page x / y) auto-hides after 2 s; the three
   tap zones with the 300 ms / 10 px tap rule; swipe; keys; soft stop at the ends
   with a haptic; `setRunning(true)` on open (wake lock), `false` on leave;
   `ws.scores.pos` remembers the page per device; resize / orientation re-fits
   and re-renders the current page first.
9. **Service worker.** `SHELL[]` gains every new `js/` file plus the three
   `vendor/pdfjs/` entries and the `standard_fonts/` files it lists explicitly;
   `tests/sw.test.mjs` extended to require every file under `vendor/pdfjs/`.
   `CACHE` → next.
10. **Legal.** `dev/build-legal.mjs`: the three "no third-party code" sentences
    reworded per design §11; regenerate; `npm test`.
11. **Fixture + E2E.** `dev/make-fixture-pdf.mjs` writes a valid 12-page PDF
    (Helvetica text "Page n" per page, hand-assembled xref) to
    `tests/fixtures/score-12p.pdf`. `tests/e2e/scores.mjs`: import via
    `setInputFiles`, row appears, open, page 1 rendered (canvas has non-black
    pixels), tap right ×3 → `4 / 12`, tap left → `3 / 12`, keyboard `End` →
    `12 / 12`, tap right → stays, chrome hides then centre tap shows it, reload
    opens on the same page, offline (`context.setOffline(true)`) still opens.
12. **Ship.** PR, merge, deploy, poll, prod E2E, screenshots (library, reader
    portrait, reader landscape), handoff. Leif tries a real score on the iPad.

**Done when:** a 30 MB scan from Files opens on the iPad, turns on edge taps
without a blank frame, survives a reload, and the app is unchanged for anyone who
never opens Scores.

## Phase 1 — library depth, bookmarks, the Logbook link, metadata sync

**Goal:** scores are findable, bookmarkable, tied to goals, and their *metadata*
follows the account. The rendered-page cache makes big scans instant on the
second open.

1. **`js/lib/scores/library.js`** (pure): `search(scores, q)` (fold accents and
   case, match title / composer / tags), `sort(scores, by)`, `groupByComposer`,
   `suggestComposers(goals, scores)`, `suggestTags(scores)`. Unit tests.
2. **Library UI.** Search box, sort control, group toggle, tag chips, thumbnails
   (page 1 at 120 px, rendered at import into the `pages` store bucket 0),
   metadata sheet (title, composer with autocomplete, tags, linked goal, *save to
   a file* via `URL.createObjectURL` of the untouched blob, delete). Duplicate
   import by hash highlights the existing row instead of adding.
3. **Persistent page cache.** `store.js` v2 adds `pages`; `pagecache.js` gains
   the WebP tier per design §5 (threshold 8 MB or 150 ms, budget 300 MB,
   least-recently-opened eviction, warm first ten on import for large files).
   `usage()` reports files and pages bytes separately.
4. **Bookmarks.** `marks[]` in the doc (`addMark`, `removeMark`, `marksFor`),
   `js/tools/scores/marks.js`: bookmark button in the top bar (filled when the
   page has one), a sheet listing marks with labels, tap → page, hold → remove.
5. **Logbook link.** `score.goalId`; picker `score` mode; *practice this* in the
   reader's *more* menu and the metadata sheet (creates a piece goal from title
   + composer when unlinked, then `logbook.start(goalId)`); Today hero **open
   score** when the running goal has a score; goal page **score** row. Deleting
   a goal clears `goalId` on its scores.
6. **Sync.** `KINDS` + `score`, `mark`; `logbook.js` stamps, pends and tombstones
   them like notes; cascade: removing a score tombstones its marks;
   `applyRemote` handles all three. The blob is *not* synced (P3) — a score row
   that arrives from another device shows *on another device* (P0 store's
   `localIds`) and cannot be opened yet; that is honest and P3 fixes it.
7. **Account sheet.** *scores on this device* row (count · MB files · MB rendered
   pages) → sheet with *clear rendered pages*, *remove all scores from this
   device* (metadata stays, rows go grey). *Sign out & clear this device* also
   clears both stores.
8. **Tests.** `tests/scores.test.mjs` grows (marks, cascade, envelopes, merge for
   `score` and `mark`, dedupe by hash); `tests/library.test.mjs`; E2E adds
   search, sort, tags, metadata edit, bookmark add / jump / remove, *practice
   this* starts the clock and the hero shows *open score*, delete cascades; the
   accounts-sync suite gains a score row syncing between two contexts (metadata
   only).
9. **Ship** as P0.

**Done when:** Leif can find any score in two keystrokes, bookmark the coda,
press *practice this*, and see the score's title and bookmarks on his phone
(greyed, no file yet).

## Phase 2 — ink

**Goal:** Pencil marks on any page, on a layer beside the PDF, synced.

1. **`js/lib/scores/ink.js`** (pure): `encode(strokes)` / `decode(body)` per
   design §7 (normalised, quantised, delta-encoded integers), `simplify(points,
   tol)`, `hit(strokes, x, y, r)` for the eraser, `bytes(body)` for the cap
   check. Unit tests including a dense synthetic page under 128 KB.
2. **Overlay.** `js/tools/scores/reader.js` gains an overlay canvas sized with
   the page; `inkbar.js` renders the bar (pen · colours · highlighter · eraser ·
   undo · redo · clear · finger toggle) below the top bar when ink is on.
   Pointer handling: `pen` draws (pressure → width, coalesced events), touch
   falls through unless the finger toggle is on, a stroke needs 4 px of travel,
   edge taps still turn. Rendering replays the model with quadratic smoothing;
   the in-progress stroke draws incrementally.
3. **Model + sync.** `ink[]` in the doc keyed `${scoreId}:${page}`;
   `setInk(scoreId, page, strokes)` debounced 400 ms; `KINDS` + `ink`;
   `BODY_CAPS = { default: 8192, ink: 131072 }` in `merge.js`, used by
   `functions/lib/sync.js` instead of the constant. Cascade: removing a score
   tombstones its ink. Over-cap pages keep the last synced version and toast
   once.
4. **Redraw on turn.** Turning restores the page's strokes from the doc before
   the bitmap is drawn, so ink and page appear on the same frame.
5. **Tests.** `tests/ink.test.mjs`; E2E draws two strokes with synthetic
   `PointerEvent`s (`pointerType: "pen"`, pressure), verifies overlay pixels, turns
   away and back (ink persists), reloads (persists), erases one, undoes; the
   accounts-sync suite carries an ink page between two contexts. `sw.test.mjs`
   covers the new files by construction.
6. **Ship** as P0. Leif checks Pencil latency, pressure and palm rejection on
   the iPad; a latency complaint is the one thing that could send this back.

**Done when:** fingerings written on the iPad appear on the same page on the
phone, the PDF exported from the metadata sheet is byte-identical to the import,
and turning a page with ink shows both on one frame.

## Phase 3 — cloud files, quota, legal, the public story

**Goal:** with an account, the PDF itself follows the musician. MVP complete.

1. **R2.** `wrangler r2 bucket create chopinly-scores` (token
   `cloudflare_api_token`); `wrangler.toml` `[[r2_buckets]] binding = "SCORES"
   bucket_name = "chopinly-scores"`; local dev uses the Miniflare R2 shim
   automatically. Migration `0002_storage_bytes.sql`; apply remote.
2. **API.** `functions/lib/scores.js` per design §10.1: `PUT` streams
   `request.body` to `env.SCORES.put(key, body, { httpMetadata, customMetadata:
   { sha256 } })` after checking `content-length` against the per-file cap and the
   quota (`users.storage_bytes` updated in a D1 batch); `GET` streams
   `object.body` with etag; `DELETE` credits the quota; `GET /files` lists the
   prefix; sync tombstone hook; `DELETE /api/me` prefix wipe; rate limit
   `scores:<uid>` 60/min. Errors are sentences.
3. **Client.** `js/lib/scores/cloud.js` per design §10.2: reconcile after every
   sync, upload queue (one at a time, newest first, online + visible only,
   backoff), download on open with progress, *keep every score on this device*
   background downloads, sign-in marks all for upload, `uploaded` flag in the
   `files` store. The library row's cloud glyph and the *on another device*
   state become *in the cloud — tap to download*.
4. **Account sheet.** Quota line *212 MB of 500 MB*; *remove downloaded scores
   not opened in 90 days* (only for scores confirmed in the cloud); upload / quota
   errors surface here as sentences.
5. **Legal.** Privacy §2 and §3 rows, the terms' personal-copy and takedown
   clause, regenerate, `npm test`.
6. **Public story.** README *In the case* gains **Scores**; `content/tools/scores.md`
   tool page (the crawl surface: `node dev/render-og.mjs`, `node dev/build-site.mjs`,
   `node dev/indexnow.mjs` after deploy); landing screenshot of the reader.
7. **Tests.** `tests/e2e/scores-cloud.mjs` per design §14 (two contexts, upload,
   download, ink both ways, delete everywhere, quota refusal via a test-only
   `x-chopinly-e2e-quota` header honoured only with `E2E_SECRET`);
   `tests/scores.test.mjs` quota arithmetic; `tests/site.test.mjs` for the new
   tool page.
8. **QA doc.** `docs/SCORES_QA.md`: the iPad checklist (Files import, a 30 MB
   scan cold and warm, Pencil, pedal keys, install-and-wait-a-week, sign in on a
   second device, delete account leaves the device copy).
9. **Ops SOP.** `claude_ops/docs/sops/chopinly-ops.md` gains the R2 bucket, the
   quota, `dev/vendor-pdfjs.mjs`, and the "vendor path-version on bump" rule.
10. **Ship** as P0; Leif reviews in production on the iPad and the phone.

**Done when:** a score imported on the iPad opens on the phone after sign-in, ink
and bookmarks match on both, the quota shows in the account sheet, deleting the
account empties the bucket prefix, and the legal pages describe exactly what the
code does.

## 4. Order, risk, and what could send a phase back

| phase | ticket | risk | mitigation |
|---|---|---|---|
| P0 reader | WSHED-99 | pdf.js worker under the service worker / `nodejs_compat` Pages dev; iPad memory on 50 MB scans | worker is a plain module script served from our origin; test the largest real score Leif has before P1 starts; the ring holds five bitmaps, never the whole score |
| P1 library | WSHED-100 | WebP cache budget vs. iPad quota (Safari grants ~60 % of free disk to installed PWAs) | budget 300 MB, eviction tested; `usage()` shown in the sheet |
| P2 ink | WSHED-101 | Pencil latency feel | draw the live stroke on the same frame as the event (no debounce on the canvas, only on the save); measure on the iPad before polishing tools |
| P3 cloud | WSHED-102 | request body limits at the Cloudflare edge (100 MB on the free plan) vs. the 60 MB cap; quota drift after failed uploads | cap stays under the edge limit; `storage_bytes` is recomputed from a prefix list on every `GET /files` when it disagrees |

MVP = P0 + P1 + P2 + P3 landed and Leif's iPad checklist green. Setlists,
two-up, half-page turns and *save with ink* are follow-up tickets filed after
the MVP, not before.
