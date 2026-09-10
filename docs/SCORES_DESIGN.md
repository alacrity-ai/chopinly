# Chopinly — Scores: a sheet-music library in the case (WSHED-98)

**Status:** draft for Leif's review, 2026-09-09. Decisions Leif delegated are made
below (§2) and are the plan unless he objects.
**Brief:** *"I have an application called forScore … load PDFs, attach metadata
(title, composer), search and categorize, bookmark pages, draw with the iPad
pencil (phrase lines, fingerings), and most importantly turn pages by tapping the
right side (forward) and left side (back). We should add a similar feature set to
Chopinly … PDFs from the local device, or upload them to the cloud so they are
accessible across devices (account wide)."*
**Confirmed by Leif:** ink is a **separate layer, never written into the PDF**;
a **rendered-page cache** is wanted because real scores run 30 MB and more.
**Companion:** [`SCORES_IMPLEMENTATION.md`](SCORES_IMPLEMENTATION.md) (phased plan).

## 0. Principles

1. **Nothing changes for the musician who never signs in.** Scores work fully
   offline, anonymous, on one device. An account adds *the file follows you*,
   nothing else. No feature is gated behind sign-in.
2. **The PDF is never modified.** What the musician imported is what they can
   export, byte for byte. Everything Chopinly adds (title, composer, tags,
   bookmarks, ink, reading position) lives beside the file.
3. **Turning the page is the product.** Every other feature may take a tap or
   two; a page turn is one tap on the edge, instant, with the next page already
   rendered. Nothing on the reading screen competes with the music.
4. **It is Chopinly, not a PDF reader.** A score is a piece; a piece is a goal.
   Opening the score and pressing play is the same gesture as practicing it.
5. **Same shell, same rules.** Vanilla ES modules, no build step, one deploy, one
   sync engine, the merge rule in one file, every new module in the service
   worker precache, copy in register (no "document", "file manager", "annotation
   mode" in UI text).

## 1. What the musician gets

| forScore | Chopinly Scores (MVP) |
|---|---|
| Import PDFs from Files / share sheet | Import from the device's file picker (Files app on iPad, any file dialog elsewhere). Several at once. |
| Title, composer, genre, tags, rating, difficulty… | **Title, composer, tags.** Composer autocompletes from the goals already in the logbook. |
| Search by any field, browse by composer | Search box over title / composer / tags; group by composer or sort by title / recently opened. |
| Bookmarks (named page ranges) | Bookmarks: a page with a label. Jump list in the score sheet. |
| Pencil annotations, layers, stamps, shapes | Pencil ink: pen (three colours), highlighter, eraser, undo. Vector layer per page, never in the PDF. |
| Tap right / left edge to turn | The same. Plus swipe, arrow keys, and Bluetooth page-turn pedals (they send arrow / page keys). |
| Setlists, half-page turns, two-up, audio, metronome links | Not in the MVP (setlists and two-up are natural follow-ups). |
| iCloud / Dropbox sync | With an account: metadata, bookmarks and ink sync through the existing engine; the PDF goes to Chopinly's own bucket, private to the account. |
| — | **A score links to a goal.** *Practice this* on a score starts the clock on its piece. When the clock runs on a piece with a score, the Today hero offers *open score*. |

## 2. Decisions Leif delegated

| Question | Decision | Why |
|---|---|---|
| PDF renderer | **pdf.js (Mozilla, Apache-2.0), vendored** under `vendor/pdfjs/` and served from chopinly.com. Pinned version, licence file beside it, loaded with a dynamic `import()` only when the Scores tool mounts. | The only mature renderer that runs in a browser without a build step (it ships ES modules). Vendoring keeps the "everything the browser runs is served from chopinly.com" promise true. Lazy loading keeps the app's first paint untouched for musicians who never open a score. |
| Where the bytes live on the device | **IndexedDB**, a new database `chopinly-scores` with two stores: `files` (the PDF `Blob` keyed by score id) and `pages` (rendered page bitmaps, §5). Mirrors `js/lib/takes/store.js`; a separate module, not a shared one. | Takes and scores have different lifecycles (audio never leaves the device; scores may). A shared store would need a `kind` column and two eviction policies in one file. Two small stores are more honest than one clever one. |
| Ink representation | **Vector strokes per page**, coordinates normalised to the page box and quantised to 1/10 000, delta-encoded integer arrays. Rendered on a canvas overlay. Never flattened into the PDF. | Confirmed by Leif. Vectors survive zoom, device pixel ratio and re-renders; a page of fingerings is a few hundred bytes. The PDF stays pristine and exportable. |
| Sync unit for ink | **One entity per (score, page)**, kind `ink`, merged last-write-wins like everything else. Body cap raised for this kind (§7.3). | Per-stroke entities would multiply rows a hundredfold for no benefit: two devices inking the *same page* at the *same time* does not happen in practice. Per-score would make every stroke re-send the whole score's ink. |
| Bookmarks | **Their own kind, `mark`** `{ scoreId, page, label }`. | Two devices adding bookmarks to the same score is plausible (iPad at the piano, phone on the train). Separate rows merge without loss; an array inside the score row would lose one side. |
| Reading position | **Per device**, `ws.scores.pos` in localStorage. Not synced. | Syncing "where I was" churns the change stream on every page turn and surprises the musician when the phone jumps the iPad. forScore does not sync it either. |
| Cloud file storage | **Cloudflare R2**, bucket `chopinly-scores`, binding `SCORES` in the Pages project, keys `u/<userId>/<scoreId>.pdf`. Uploaded and downloaded **through Pages Functions** (`PUT` / `GET /api/scores/:id/file`), streamed, never a public URL. | D1 is the wrong store for 30 MB binaries and the sync body cap is 8 KB. R2 has no egress charge and a 10 GB free tier. Proxying through the Function keeps auth on the session cookie, keeps the bucket private, and avoids minting S3 credentials for presigned URLs. Workers stream request bodies to R2 without buffering. |
| Quota | **500 MB per account**, per-score cap **60 MB**. Tracked in `users.storage_bytes`, enforced on upload with a sentence, shown in the account sheet. | Hundreds of engraved scores or a few dozen scans. Revisit with real usage. |
| Upload policy | **Automatic when signed in and online**, in the background, newest first; download **on open**, with a setting *keep every score on this device* for people who want the whole library offline. | The brief says "accessible across devices"; making the musician press *upload* per score would break that. Auto-download of the whole library on a phone would eat storage they did not ask to spend. |
| Rendered-page cache | **Two tiers** (§5): an in-memory ring of `ImageBitmap`s around the current page, and a persistent `pages` store of encoded bitmaps for scores over a size threshold, with a byte budget and least-recently-opened eviction. | Confirmed by Leif. Engraved PDFs render in tens of milliseconds and need only the memory tier; 30 MB scans are JPEG-decode bound and the second open should be instant. |
| Pen versus finger | **Pen draws, finger turns and scrolls** by default (`pointerType === "pen"`). A toggle in the ink bar lets a finger draw on devices without a stylus. | Native palm rejection for free on iPad. Finger-drawing devices (Android phones, a desktop mouse) still get ink. |
| Tool placement | New tool `scores`, category **`library`**, listed after the Recorder and before the lessons. Hash routes `#/scores` (library) and `#/scores/<id>` (reader). | Neither an instrument nor a lesson nor a capture device. Its own rule in the tool menu, like the Recorder. |
| Legal pages | Reword the "no third-party code" lines to **"no third-party scripts from other domains"**; add uploaded score files to the privacy table; add a copyright / takedown clause to the terms. All via the generator. | The privacy promise stays true in spirit; the letter must match the code. People will upload purchased and photocopied music; the terms need to say what we do about a complaint. |
| Copyright posture | Files are **private to the account**: no sharing, no public links, never served to another user, never used for anything but showing them to their owner. Takedown contact in the terms. | Personal copies for personal use are the whole use case. Not being a distribution channel is the defence. |

## 3. Architecture

```
chopinly.com (Pages project "woodshed")
├── /app                      the shell; Scores is one more tool in the registry
├── /vendor/pdfjs/            pdf.mjs · pdf.worker.mjs · standard_fonts/ · LICENSE · VERSION
├── js/lib/scores/
│     store.js                IndexedDB chopinly-scores: files + pages (blob store, usage, eviction)
│     pdf.js                  pdf.js loader (lazy import, worker URL), open(blob) → { pages, render(n, scale) }
│     pagecache.js            memory ring + persistent tier + prefetch scheduler
│     ink.js                  stroke model: encode/decode, simplify, hit-test for the eraser, bounds
│     library.js              search, sort, group, composer suggestions (pure)
│     cloud.js                upload / download queue against /api/scores, reconciles with the sync engine
├── js/tools/scores/
│     index.js                tool entry { id: "scores", category: "library" }
│     ui.js                   router: library ↔ reader; shared chrome
│     library.js              list, search, import, metadata sheet
│     reader.js               page canvas, tap zones, turn engine, chrome auto-hide
│     inkbar.js               pen / highlighter / eraser / undo / colours / finger toggle
│     marks.js                bookmark button + jump list
├── js/lib/logbook.js         + kinds score · mark · ink (doc arrays, stamp, tombstones, cascade)
├── js/lib/merge.js           + KINDS, per-kind body caps (shared with functions/)
├── functions/lib/scores.js   PUT/GET/DELETE /api/scores/:id/file · GET /api/scores/files · quota
└── R2 "chopinly-scores"      u/<userId>/<scoreId>.pdf
```

The data layer never touches the DOM; the reader never parses PDFs itself; the
merge rule stays in `js/lib/merge.js`, imported by both sides.

## 4. Data model

### 4.1 Logbook document (local, `ws.logbook.data`, schema stays 2, additive)

```js
scores: [{ id, title, composer?, tags: string[], pages, size, sha256, goalId?,
           addedAt, openedAt, updatedAt }]
marks:  [{ id, scoreId, page, label, createdAt, updatedAt }]
ink:    [{ id: `${scoreId}:${page}`, scoreId, page, v: 1, strokes: [...], updatedAt }]
```

- `title` defaults to the PDF's `Title` metadata, else the filename without
  extension. `composer` defaults to the PDF's `Author` when it looks like a name.
- `sha256` is computed on import (`crypto.subtle.digest`, ~100 ms for 30 MB) and
  is what the cloud layer trusts: a file with the same hash on two devices is the
  same file, so an import on the phone of a score already in the account does not
  upload it twice.
- Deleting a score tombstones its marks and ink (cascade, like a goal's takes) and
  deletes the local blob, its cached pages and, when signed in, the R2 object.
- Deleting a goal clears `goalId` on its scores; it does not delete the score.

### 4.2 Device stores (IndexedDB `chopinly-scores`)

| store | key | value |
|---|---|---|
| `files` | score id | `{ id, blob, size, sha256, at, uploaded: bool }` |
| `pages` | `${scoreId}:${page}:${bucket}` | `{ key, scoreId, blob (image/webp), w, h, at }` |
| `meta` | `"usage"` | running byte totals so the account sheet does not scan |

`navigator.storage.persist()` is requested on the first put (already the pattern
for takes; Safari evicts idle non-installed sites after a week, installed PWAs
are exempt).

### 4.3 Per-device settings (`ws.scores.*` via `makeStore("scores")`)

`pos` (score id → last page), `fit` (`width` | `page`), `fingerInk` (bool),
`keepAll` (bool, download the whole library), `sort`, `group`.

### 4.4 D1

```sql
ALTER TABLE users ADD COLUMN storage_bytes INTEGER NOT NULL DEFAULT 0;
```

`entities.kind` gains `score`, `mark`, `ink` (no schema change; the column is free
text validated against `KINDS`). The file itself is not in D1.

## 5. Rendering and the page cache

**Renderer.** `pdf.js` in its worker. A score is opened from the blob
(`getDocument({ data })`); pages render to an `OffscreenCanvas` where available
(a plain canvas otherwise) at `devicePixelRatio` capped at 3, in the *fit* the
reader is in: fit-width in portrait (the page scrolls vertically if taller than
the screen), fit-page in landscape. Rotation is respected. Text and annotation
layers are not built; the canvas is the page.

**Memory tier.** A ring of up to five `ImageBitmap`s: current, next two, previous
two. A turn draws from the ring (no work on the main thread beyond `drawImage`),
then the scheduler renders the new page-plus-two in idle time
(`requestIdleCallback`, falling back to a timeout). Turning faster than the
renderer shows the page as soon as it is ready, never a blank frame: the previous
page stays until the new one is drawn.

**Persistent tier.** For any score whose file is over **8 MB**, or whose first
render took over **150 ms**, every rendered page is also encoded to `image/webp`
(quality 0.86, ~150 to 400 KB per page at iPad resolution) and put in `pages`
keyed with a size bucket (`Math.round(width / 100)`), so a device that renders at
one width does not poison another. Reads check `pages` first, then render.
Budget **300 MB**, evicted least-recently-opened score first; the account sheet
shows the number and offers *clear rendered pages*. Importing a large score
pre-renders its first ten pages in idle time so the first open is already warm.

**Why not pre-render everything on import.** A 60-page scan is 60 × 300 KB =
18 MB of WebP and a minute of worker time on an older iPad, for pages the
musician may never reach. Warming the first ten and caching the rest as they are
turned gives the same feel at a fraction of the cost.

## 6. The reader

**Chrome.** Full screen, black margins, page centred. A thin top bar (back, title
· composer, page `12 / 48`, bookmark, ink, more) that auto-hides after two seconds
of no interaction and returns on a centre tap. Wake lock via the tool's
`setRunning(true)` while a score is open, exactly as the metronome does.

**Turning.**

- Tap zones: right **35 %** of the width turns forward, left **35 %** back, the
  middle **30 %** toggles the chrome. The zones are full height. A tap is a
  pointer down and up within 300 ms and 10 px, so scrolling a tall page never
  turns it.
- Swipe left / right also turns. Vertical scroll pans a fit-width page.
- Keys: `ArrowRight` `ArrowDown` `PageDown` `Space` forward; `ArrowLeft` `ArrowUp`
  `PageUp` back; `Home` / `End`. That is what AirTurn and PageFlip pedals send.
- The last page turns forward to nothing (a soft stop, brief haptic), never wraps.
- Turn animation: none. The page changes on the same frame the tap lands. A
  turn that has to wait for the renderer shows a small spinner in the corner
  after 250 ms, not a blank page.

**Fit and zoom.** Fit-width or fit-page from the *more* menu; pinch-to-zoom in the
MVP is **not** implemented (fit-width on an iPad is legible; zoom would fight the
edge taps). Double-tap toggles fit.

**Position.** Opening a score returns to its last page on this device. A
bookmark, a search hit or `#/scores/<id>?p=12` opens on that page.

## 7. Ink

**Input.** A `<canvas>` overlay the exact size of the page canvas. Pointer events
with `pointerType === "pen"` draw (pressure → width, `getCoalescedEvents` for
smooth curves at 240 Hz on iPad); touches are ignored by the overlay so they fall
through to turning and scrolling. With the finger toggle on, touches draw and
edge taps still turn (a tap is not a stroke; a stroke needs 4 px of travel).
The Pencil's double-tap (`pointerType pen` + button change) switches pen ↔ eraser
where the browser exposes it; nothing breaks where it does not.

**Tools.** Pen in three colours (ink black, brass, felt red), highlighter
(translucent wide brass), stroke eraser (removes any stroke the pointer crosses),
undo / redo (per page, per session), clear page (with confirm). Pen width follows
pressure between 1.2 and 3.5 CSS px at fit-width; the highlighter is a fixed 18 px.

**Model.** `{ v: 1, strokes: [ { t: "pen"|"hi", c: 0|1|2, w: 24, p: [x0,y0,pr0, dx,dy,dpr, …] } ] }`,
all integers, coordinates in 1/10 000 of the page box, pressure in 1/255, points
delta-encoded, and simplified with a 1-unit tolerance before storing. A page of
fingerings is ~300 bytes; a page of phrase marks and circles ~3 KB. Rendering
replays strokes with `lineJoin round`, quadratic smoothing between points.

**Storage and sync.** One `ink` entity per page (§2). Saved to the doc 400 ms
after the last stroke (debounced), which triggers the existing sync schedule.
The sync body cap becomes per-kind: `{ default: 8 KB, ink: 128 KB }` in
`js/lib/merge.js` so the browser and the Function agree; a page that somehow
exceeds it keeps its last-synced version and the reader shows *too much ink on
this page to back up* once.

**Export.** *Save this score to a file* exports the original PDF unchanged.
*Save with ink* (a follow-up, not MVP) would render pages plus ink to a new PDF
via pdf.js's canvas output; it will never overwrite the original.

## 8. Library

**List.** Rows of *title* over *composer · pages · tags*, a small thumbnail of
page 1 (rendered once at import, stored in `pages` as bucket 0 at 120 px wide).
Search box at the top: substring match over title, composer, tags, case and
accent insensitive, instant, in memory (`library.js` is pure and unit-tested).
Sort: recently opened (default), title, composer. Group by composer with sticky
headers. Tag chips under the search box narrow the list; tags are free text,
suggested from existing ones.

**Import.** A brass *+ score* button opens `<input type="file"
accept="application/pdf" multiple>`. Each file: parse with pdf.js (page count,
metadata), hash, store the blob, add the entity, render the thumbnail. A sheet
per file shows the prefilled title and composer with *save* and *skip*; several
files at once show one sheet after another. A file that is not a PDF, is
encrypted, or is over 60 MB is refused with a sentence. An import whose hash
matches an existing score is not duplicated; the existing one is highlighted.

**Metadata sheet.** Title, composer (autocomplete from goals' composers and other
scores), tags, linked goal (the goal picker in `score` mode; *create a piece from
this score* makes a piece goal with the same title and composer), *save to a
file*, *remove from this device* (signed in, file in the cloud) or *delete*
(everywhere, with confirm).

**Where the file is.** A row shows a small cloud glyph when the file is in the
account but not on this device; tapping the row downloads it (progress in the
row) and opens it. Offline, such a row says *on another device* like a take does.

## 9. Logbook linkage

- `score.goalId` links a score to a goal. From the reader's *more* menu and the
  metadata sheet: **practice this** starts the clock on the linked goal (creating
  a piece from the score's title and composer when there is none) and returns to
  the reader with the Logbook strip showing the running goal. Stopping is the
  normal stop.
- The Today hero, when the running goal has a score, shows **open score** beside
  *+ note* and *● take*. The goal page gets a **score** row above the takes.
- Nothing about minutes changes: the clock is the clock. A score does not create
  segments; it starts the same one the play button would.

## 10. Cloud files (accounts)

### 10.1 API (Pages Functions, session cookie, same origin)

| route | does |
|---|---|
| `PUT /api/scores/:id/file` | Streams the body to R2 `u/<uid>/<id>.pdf`. Headers `content-length`, `x-chopinly-sha256`. Refuses over 60 MB per file or when `storage_bytes + size > 500 MB` (413 with a sentence). Updates `users.storage_bytes` in the same request. Idempotent: same id + same hash returns 200 without re-storing. |
| `GET /api/scores/:id/file` | Streams from R2 with `content-type: application/pdf`, `etag` = sha256, `cache-control: private, no-store`. 404 when the object is not the caller's. |
| `DELETE /api/scores/:id/file` | Removes the object and credits the quota. Also called by the sync handler when it writes a `score` tombstone, so *delete everywhere* needs no second request. |
| `GET /api/scores/files` | `{ files: [{ id, size, sha256 }], used, quota }` — what the bucket holds for this user; the client reconciles local state against it after every sync. |
| `DELETE /api/me` | Now also lists and deletes the `u/<uid>/` prefix, then zeroes the quota. |

Rate limit: 60 file requests per user per minute, on the existing `rate_limits`.

### 10.2 Client engine (`js/lib/scores/cloud.js`)

- After each successful sync (`sync.on`), fetch `/api/scores/files` and compute:
  **to upload** = local files whose id is not in the cloud list (or whose hash
  differs); **in cloud only** = cloud ids with no local blob.
- Uploads run one at a time, newest score first, only when `navigator.onLine`
  and the tab is visible; 413 and 429 pause the queue with a sentence in the
  account sheet; a failed upload retries with backoff and never blocks sync.
- Downloads happen on open (or in the background for every score when *keep
  every score on this device* is on). Progress shows in the row; a download that
  loses the network resumes from zero (files are small enough that ranges are
  not worth the code).
- **Sign in** marks every local file for upload (like `markAllPending`). **Sign
  out** keeps files on the device. **Sign out & clear this device** clears the
  `files` and `pages` stores. **Delete account** removes cloud files and keeps
  the device's copies, as it does for the rest of the logbook.

### 10.3 Storage in the account sheet

A **scores on this device** row (count · MB downloaded · MB of rendered pages)
opening a sheet with *remove downloaded scores not opened in 90 days* (signed in
and backed up only), *clear rendered pages*, *keep every score on this device*.
Signed in, the sync line gains *· 212 MB of 500 MB* when scores exist.

## 11. Legal and privacy

All through `dev/build-legal.mjs`; the generated pages are committed.

- **"No third-party code"** → *"No third-party scripts from other domains. The
  PDF renderer (pdf.js, Mozilla, Apache-2.0) is served from chopinly.com like
  the rest of the app."* Three places.
- **Privacy §2 (local)**: scores you import are stored in your browser's database
  on your device and never sent to us unless you sign in.
- **Privacy §3 table**: *Score files you upload* · why: to show them on your other
  devices · retention: until you delete the score or your account. Processor:
  Cloudflare R2 (already listed as Cloudflare).
- **Terms**: a clause that you may only upload music you have the right to keep
  a personal copy of; that files are private to your account and never shared or
  published; a takedown address (`hello@chopinly.com` forwarding) and that we
  remove files on a valid notice. The existing "upload content you have no right
  to store" line already covers the basics; this makes the procedure explicit.
- **Cookies**: unchanged (no new cookies).

## 12. Performance and limits

| item | number |
|---|---|
| pdf.js payload (pinned 5.x, minified ESM) | ~0.4 MB main + ~1.4 MB worker, precached, loaded on first open of Scores |
| Engraved 10-page PDF | 0.3 to 2 MB; first render ~30 ms per page on an iPad |
| Scanned 60-page score | 20 to 50 MB; first render 200 to 600 ms per page; cached WebP ~300 KB per page |
| Per-score cap | 60 MB (import and upload) |
| Per-account cloud quota | 500 MB |
| Rendered-page budget on device | 300 MB, evict least-recently-opened score |
| Ink body cap | 128 KB per page (a dense page is ~3 KB) |
| Sync change cap | unchanged (5 000 changes per call); a 60-page fully inked score is 60 rows |

## 13. Platform notes

- **iPad and iPhone Safari**: the file picker reads from Files (iCloud Drive,
  On My iPad, third-party providers). No File System Access API, so the library
  is a copy inside the app's storage, exactly as forScore's is. Installed PWAs are
  exempt from Safari's seven-day storage eviction; browser tabs are not, which is
  the main reason the cloud copy matters on Apple devices. Wake Lock is supported
  since iOS 16.4. Pencil pressure and `pointerType: "pen"` are supported.
- **Android Chrome**: everything works; a manifest `share_target` could accept
  PDFs from the share sheet later (not MVP; iOS Safari does not support it).
- **Desktop**: mouse draws only with the finger toggle on; arrow keys turn.
- **Getting out of forScore**: forScore exports PDFs (with or without flattened
  annotations) via its share sheet to Files; Chopinly imports them from there.
  There is no forScore metadata import; title and composer are typed once.

## 14. Tests

- **Unit** (`node --test`): `library.test.mjs` (search, sort, group, composer
  suggestions), `ink.test.mjs` (encode/decode round trip, simplification,
  eraser hit-test, body size of dense pages under the cap), `scores.test.mjs`
  (doc ops, cascade on delete, envelopes and merge with the three new kinds,
  quota arithmetic), `sw.test.mjs` extended to require the `vendor/pdfjs/`
  files in the precache, `site.test.mjs` unchanged (legal pages regenerated).
- **E2E** (Playwright, mobile Chromium): `tests/e2e/scores.mjs` — import a
  fixture PDF (generated by `dev/make-fixture-pdf.mjs`, a 12-page text-only PDF
  written by hand, no dependency), library row and thumbnail, open, edge taps
  turn forward / back and stop at the ends, keyboard turns, chrome auto-hide,
  bookmark add and jump, ink with synthetic `PointerEvent`s of `pointerType:
  "pen"` (drawn stroke persists across a page turn and a reload), metadata edit,
  search, delete cascade; `tests/e2e/scores-cloud.mjs` — two contexts on
  `@e2e.chopinly.com` accounts: import on A, upload, row on B shows the cloud
  glyph, open on B downloads, ink on B appears on A, delete on A removes on B,
  quota refusal with a fixture over the cap (cap lowered via a test-only header
  under `E2E_SECRET`).
- **On the iPad, by Leif**: Pencil feel (latency, pressure, palm rejection),
  a 30 MB scan (first open, second open, turning speed), the file picker from
  Files, the installed PWA keeping its library across a week.

## 15. Not in the MVP, and why

- **Setlists** — real, wanted, and a clean follow-up (a `set` kind holding
  ordered score ids; the reader turns across scores). After the MVP proves the
  reader.
- **Half-page turns and two-up** — presentation modes; the turn engine is built
  so a "page" can be a half or a spread later.
- **Pinch zoom** — fights edge taps; fit modes cover the iPad.
- **Save with ink to a new PDF** — export path; never overwrites the original.
- **Sharing scores between accounts** — deliberately absent (copyright posture).
- **Audio playback, metronome links per score** — the metronome already stamps
  tempo on the running goal; a per-score default tempo could come with setlists.
