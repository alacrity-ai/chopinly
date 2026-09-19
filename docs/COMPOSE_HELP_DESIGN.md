# Compose — Help: a knowledge base inside the app (WSHED-159, v122)

Leif (2026-09-18): *"I want to build a help/knowledge base for the Compose feature. For now, we can
stick the Help option below the rails toggles in the Options menu? or do you think it should be its
own dedicated button in the top bar (the main rail), your call. It should open probably a dedicated
help page (not a modal). The help should be keyword searchable, and also have articles about the
main editor, the primary modes, Gesture mode and the available gestures (with illustration examples
of each gesture), the favorites window, and then each rail, and the save scores option, including
the Layout editor. … The docs should have illustrations/screen shots for maximal effect.. or vector
graphics in some situations etc... Table of contents as a left sidebar, with keyword search etc..."*

This is the design and the implementation plan; §10 records what was built.

Companions: [`COMPOSE_DESIGN.md`](COMPOSE_DESIGN.md) (the feature this documents),
[`COMPOSE_LAYOUT_DESIGN.md`](COMPOSE_LAYOUT_DESIGN.md), [`COMPOSE_FORM_DESIGN.md`](COMPOSE_FORM_DESIGN.md),
[`COMPOSE_PIANO_DESIGN.md`](COMPOSE_PIANO_DESIGN.md), [`COMPOSE_NOTES2_DESIGN.md`](COMPOSE_NOTES2_DESIGN.md),
[`COMPOSE_RAILS2_DESIGN.md`](COMPOSE_RAILS2_DESIGN.md), [`COMPOSE_EXPRESSIONS_DESIGN.md`](COMPOSE_EXPRESSIONS_DESIGN.md),
[`COMPOSE_VOICES_DESIGN.md`](COMPOSE_VOICES_DESIGN.md), [`COMPOSE_MUSICXML_DESIGN.md`](COMPOSE_MUSICXML_DESIGN.md).

---

## 0. Principles

1. **Help is a place, not a popup.** A route — `#/compose/help` and `#/compose/help/<slug>` — so an
   article can be linked, bookmarked, reloaded and reached with the back button. A modal would make
   "send me the bit about chevrons" impossible and would fight the editor's own layers (the export
   sheet, the Layout view, the Favorites panel).
2. **One source, compiled once.** Articles are Markdown under `content/help/compose/`. A generator
   (`dev/build-help.mjs`) compiles them into one committed ES module, `js/lib/help/content.js`, and
   `npm test` fails when the committed module is stale — exactly the contract the crawlable site
   already lives under (`tests/site.test.mjs`). The browser ships **no Markdown parser**: it gets
   HTML strings, a heading list and a search index, and renders them.
3. **Offline, like everything else in Chopinly.** The compiled module, the figure module and every
   screenshot are in the service-worker precache. Help on a plane is the case that matters — that is
   where somebody is writing music without a signal and cannot remember what a hold on the tuplet
   button does.
4. **A question is answered in one search.** Keyword search over titles, headings, summaries and
   body text, ranked, with the matching sentence shown. No fuzzy matching, no stemming, no index
   server: the whole corpus is tens of kilobytes and a scan is instant.
5. **Every gesture is drawn, not described.** A chevron is a shape; prose about a shape is a
   failure. Gestures, grids and anatomy are **inline SVG generated from one module**
   (`js/lib/help/figures.js`) so they are crisp at any zoom, follow the skin in light and dark, cost
   no network, and can be corrected in a diff. **Screenshots** (`img/help/*.png`) are used where the
   thing being explained *is* the screen — the rails, the Options panel, the Favorites palette, the
   export sheet, the Layout view — and they are captured by a script from the running app
   (`dev/shoot-help.mjs`), never by hand, so a redesign is one command away from correct docs.
6. **It is Chopinly's voice.** Second person, short sentences, the house register: *a bar*, *a
   note*, *a piece*, *place*, *arm*, *the staff*. Never *document*, *canvas*, *object*, *insert
   mode*. An article says what to do first and explains the machinery second.
7. **The shell is general; the content is Compose.** `js/lib/help/` and `content/help/<tool>/` are
   tool-agnostic from the start, so the Logbook or Scores can add a section later without moving
   anything. Only Compose ships now.
8. **Documentation that can rot silently is worse than none.** Every cross-link, every figure name
   and every screenshot path is checked by a test (§8). A renamed article breaks the build, not the
   reader.

---

## 1. Where the door is

**Decision: a `Help` section at the bottom of the Options ▾ panel, below the rail toggles** — the
first of Leif's two options — plus three other ways in.

| way in | where | why |
|---|---|---|
| **Options ▾ → Help** | a third captioned section under *Input* and *Rails*: one `.cp-opt-row` — *Help & guides · how Compose works* | Options is already "the header's control panel" (§8.5q); help sits under the toggles it explains. |
| **`?` on the compositions list** | a quiet icon button in the list header beside *import* / *new* | Where a first-time user actually stands. They have no composition open, so the editor's menus do not exist yet. |
| **`?` key** | in the editor | A desk user's reflex. |
| **the URL** | `#/compose/help`, `#/compose/help/<slug>` | Linkable, and what the other three do. |

**Why not a dedicated button in the top bar.** The header rail is `File ▾ · title · Options ▾` and
§8.5q measured the Options panel at 343 px on a 390 px phone — the header is already at its limit.
A fourth control there costs the title its room on every phone, permanently, to save one tap on a
thing that is read rarely and at length. The list's `?` covers discovery for the newcomer, which is
the real argument for a top-bar button.

**What opening it does.** Help is a route, so the editor **stays open behind it**: `#/compose/help`
is pushed, the editor is untouched (not closed, not saved differently, no history snapshot), and the
back button — or *Compose* in the help bar — returns to exactly the piece and mode you left. Opening
help from the list returns to the list. The route remembers where it came from in
`history.state` and falls back to `#/compose`.

---

## 2. The articles

Twenty-four articles in four sections. Slugs are stable — they are the URL and the link target.

### Start here

| # | slug | title | what it covers |
|---|---|---|---|
| 1 | `overview` | What Compose is | The one-paragraph promise: tap-driven notation, nothing guessed, a bar always adds up. What it does and does not do today (two staves, four voices a staff; no lyrics or chord symbols yet). Where the other articles are. |
| 2 | `first-composition` | Your first composition | The walkthrough: *new composition* → title and composer → the blank grand staff → arm a quarter → place four notes → hear it → export. Ten minutes, start to PDF. |

### The editor

| # | slug | title | what it covers |
|---|---|---|---|
| 3 | `editor` | The editor screen | Anatomy (header · rails · score), systems that wrap to the width, zoom, the ghost note, the sound a placed note makes, bars appearing and being trimmed, everything saving itself, the title/composer/tags. |
| 4 | `modes` | Place, Select and Pan | The three modes, what a pointer does in each, how you leave one, and the rule that the score never moves in an edit mode. |
| 5 | `selection` | Selecting, moving, deleting | Tap · lasso · cluster drag · re-pitch by drag and arrow keys · retype from the palette · copy, cut and the paste cursor · delete. The all-or-nothing fit rule. |
| 6 | `input` | Pen and Touch | The switch, what a palm does in each setting, hold-to-aim, the one-time flip when a Pencil first appears. |
| 7 | `gestures` | Gesture mode | The toggle, then **every gesture with its own figure**: drag to lasso, strike to delete, the four chevrons (`<` `>` longer/shorter, `∧` `∨` accidentals), the two-second hold that summons Favorites, and hold-to-aim on a finger. Precedence, and what each does with and without a selection. |
| 8 | `favorites` | The Favorites palette | Summoning by hold, the toggle, moving it by its grabber, six slots × eight pages, assigning from any rail button (hold menus included), what cannot be a favorite and why, clearing by hold. |
| 9 | `options` | The Options panel | Input · Rails · Help; which rails exist and what each is for; the panel stays open while you flip things. |
| 10 | `shortcuts` | Keyboard shortcuts | The full table: durations `1`–`7`, `.`, `t`, `v`, `h`, arrows, `⌘/Ctrl` C·X·V·Z, voices, Space, Home, Esc, Delete. |
| 11 | `nudges` | When an edit is refused | The house rule (*a refused edit changes nothing*) and the sentences you will meet: *too long for this bar*, *tie needs the same pitch next*, *pick a note for the accidental*, *already the shortest*, *write the pickup first*. What each is telling you and the way through. |

### The rails

| # | slug | title | what it covers |
|---|---|---|---|
| 12 | `rails` | How the rails work | The grammar every rail shares: a button **arms** with nothing selected and **acts** on a selection; states that persist (dot, tuplet, rest) against accidentals that are one-shot; hold for the variants menu; captions; one lane that scrolls sideways and never wraps; showing and hiding rails. |
| 13 | `rail-controls` | Controls | Undo · redo · Select ∣ Pan · copy, cut, paste · zoom. |
| 14 | `rail-transport` | Transport | Stop · bar back · play/pause · bar forward · position · tempo; what playback follows (repeats, jumps, tempo marks, pedal, graces, ornaments, fermatas); tempo is saved, not undoable. |
| 15 | `rail-notes` | Notes | Voices `1 2 3 4` · durations and the ▾ row · dot · tie · tuplet (and its hold menu) · accidentals · slur · arpeggio · glissando. |
| 16 | `rail-keys` | Key · time · clef · marks | The arm-then-tap grammar for key, time and clef changes anywhere in the piece; articulations and ornaments; pickup bars. |
| 17 | `rail-dynamics` | Dynamics · hairpins · text | The half-beat slot grid, dynamics (including the extremes and the sudden ones), hairpins and *niente*, text and text lines, and how a mark is selected, dragged and deleted. |
| 18 | `rail-form` | Form | Barlines and repeats (with counts), endings, segno / coda / D.C. / D.S. jumps, rehearsal marks, tempo marks and their units, bar repeats, insert and delete bar, pickup. |
| 19 | `rail-piano` | Piano | Pedal (line, sign and sostenuto), 8va / 8vb / 15ma, hand marks, and fingering that stays armed while you stamp a hand. |
| 20 | `rail-marks` | Grace · tremolo · marks | Grace notes and grace chords, acciaccatura slashes, tremolo, trills with lines and accidentals, portato / breath / caesura, inverted and delayed turns, stem and beam overrides. |

### Keeping and sharing

| # | slug | title | what it covers |
|---|---|---|---|
| 21 | `saving` | Saving and your library | Every edit saved at once on the device; the compositions list (search, sort, group, tags); an account backs it up and syncs it; export everything; what is kept per device (rails, favorites, zoom, Pen ∣ Touch) and is deliberately not synced. |
| 22 | `export-pdf` | Export a PDF · Add to Scores | The export sheet: page size, staff size, margins, header, the live preview and its pager; *Save to device* vs *Share…*; *Add to Scores* and what a second send replaces. |
| 23 | `layout` | The Layout editor | What a pin is and why it is paper-only; break and keep; dragging a barline for a bar's width; locking a row; the marks; a tight row; Reset; that a piece with no pins prints exactly as before. |
| 24 | `musicxml` | MusicXML in and out | Export for Sibelius / MuseScore / Finale / Dorico; importing `.musicxml` / `.xml` / `.mxl`; what survives the trip and what does not. |

Every article carries front matter: `slug`, `title`, `section`, `order`, `summary` (one sentence,
shown in the sidebar's search results and on the index), and optional `keywords` (words a reader
would search that the prose does not contain — *"undo"*, *"triplet"*, *"repeat sign"*).

---

## 3. The page

```
┌──────────────────────────────────────────────────────────────────┐
│ ‹ Compose     Help                                               │  bar
├──────────────────┬───────────────────────────────────────────────┤
│ ⌕ search help    │   Gesture mode                                │
│                  │   ─────────────                               │
│ START HERE       │   Gesture mode adds five strokes to Place …   │
│  What Compose is │                                               │
│  Your first …    │   ## Drag to lasso                            │
│ THE EDITOR       │   ┌───────────────────────┐                   │
│  The editor …    │   │   (svg figure)        │                   │
│ ▸ Place, Select… │   └───────────────────────┘                   │
│  Gesture mode  ◄ │   A stroke on empty staff …                   │
│    Drag to lasso │                                               │
│    Strike to …   │   ## Strike to delete                         │
│    The chevrons  │   …                                           │
│ THE RAILS        │                                               │
│  …               │   ‹ Pen and Touch      The Favorites palette › │
└──────────────────┴───────────────────────────────────────────────┘
```

- **The bar.** `‹ Compose` (back to where you came from) · the word *Help* · on a phone, a
  *Contents* button that opens the sidebar as a drawer.
- **The sidebar** (`.hp-side`): the search field pinned at the top, then the table of contents —
  section captions in the rails' caption voice (small caps, letter-spaced, dim) and the articles
  under them. The current article is marked, and **its own `##` headings appear nested beneath it**
  with a scroll-spy so a long article is navigable from the same list. 17 rem wide; under 900 px it
  becomes a drawer over the article, opened by *Contents* and closed by a tap outside, Esc, or
  choosing anything.
- **The article** (`.hp-doc`): one `h1`, the summary as a lede, then the body. Max 42 rem of
  measure, centred in its column. Figures are full-width of the measure with a caption under them.
  Prev / next at the foot, in reading order across sections.
- **The index.** `#/compose/help` with no slug is the contents page: every section as a card list of
  title + summary, so the whole shape is visible at once.

**Theming.** The article uses the shell's own type and skin tokens (the landing's `pages.css` reads
as a website; help is part of the app). Code, tables and blockquotes inherit the existing
`.table-wrap` treatment. Figures set their stroke and fill from `currentColor` and the accent token,
so light, dark and every skin are correct without a second asset.

---

## 4. Search

`js/lib/help/search.js` — pure, DOM-free, node-tested.

```js
search(index, query, { limit = 12 }) → [{ slug, title, section, score, snippet }]
```

- The query is lowercased and split on non-word characters into terms; terms under two characters
  are dropped unless they are the only term.
- Each article is scored per term against four fields, and an article must match **every** term
  (AND) to appear:

  | field | whole-word | prefix |
  |---|---|---|
  | title | 8 | 4 |
  | `keywords` | 6 | 3 |
  | headings | 4 | 2 |
  | summary | 3 | 1.5 |
  | body | 1 | 0.5 |

  A field's hits are counted but damped (`1 + ln n`) so a long article cannot win on repetition.
- Ties break on the section order then the article order, so results are stable and never shuffle
  under the cursor.
- **The snippet** is the first body sentence containing the highest-weighted term, trimmed to about
  160 characters on word boundaries, with every matched term wrapped in `<mark>`. The snippet is
  built from the article's **plain text** (never its HTML), and the terms are escaped before they
  are put in the pattern, so a search for `<` or `*` cannot inject anything.
- Typing filters live (120 ms debounce). `↑` / `↓` walk the results, `Enter` opens the first or the
  walked one, `Esc` clears the field and restores the table of contents. With a query, the sidebar
  shows results *instead of* the TOC; clearing brings the TOC back.
- No index is fetched or built at load: the compiled module already carries `text`, so the first
  keystroke searches.

---

## 5. Figures

### 5.1 Vector — `js/lib/help/figures.js`

One module, `figure(name)` → an SVG string, `FIGURES` → the names. Every figure draws on a
`0 0 240 140` viewBox, uses `currentColor` for ink and `var(--accent)` for the stroke being taught,
carries `role="img"` and an `<title>` (its caption), and has no text smaller than 9 units.

| name | what it draws |
|---|---|
| `gesture-lasso` | A staff fragment with four notes and a freehand loop enclosing two of them, arrowhead on the path. |
| `gesture-strike` | The same fragment, two notes shown selected (halo), a straight stroke through both. |
| `gesture-chevron-right` | A `>` stroke, with a quarter → eighth pair beside it. |
| `gesture-chevron-left` | A `<` stroke, eighth → quarter. |
| `gesture-chevron-up` | A `∧` stroke, C → C♯. |
| `gesture-chevron-down` | A `∨` stroke, C♯ → C♮. |
| `gesture-hold` | A pointer dot with two concentric rings and *2 s*, the Favorites panel arriving. |
| `gesture-aim` | A fingertip, the ghost note lifted 40 px above it, the dashed offset marked. |
| `anatomy-editor` | The editor screen as labelled blocks: header, rails, score, with callout numbers. |
| `anatomy-rail` | One rail: caption, a group, a button with a hold-menu chevron, the sideways scroll fade. |
| `modes-triangle` | The three modes and the ways between them (tap the armed duration, Esc, the switch). |
| `slot-grid` | One 4/4 bar with its eight expression slots ticked, an `mf` sitting on the & of two. |
| `layout-pins` | A row of four bars with a break flag, a keep arc and a weighted bar's rule. |
| `ghost-note` | A staff with the 40 %-opacity ghost under a stylus and the solid note it becomes. |

Figures are drawn as data (arrays of points and glyph positions) rather than pasted path strings, so
a change is readable in a diff. The Bravura glyph table (`js/lib/staff/glyphs.js`) supplies real
noteheads, clefs and accidentals — the figures are engraved, not approximated.

### 5.2 Screenshots — `dev/shoot-help.mjs`

Playwright against the local dev server, an iPad-landscape viewport at `deviceScaleFactor: 2`, the
dark skin, a **seeded composition** (a fixed eight-bar piece built through the engine, so the shots
are identical run to run), and per shot: navigate, open what is needed, wait for Bravura, clip to a
named element's box plus padding, write `img/help/<name>.png`.

`editor`, `rail-controls`, `rail-transport`, `rail-notes`, `rail-keys`, `rail-dynamics`,
`rail-form`, `rail-piano`, `rail-marks`, `options-panel`, `favorites-panel`, `export-sheet`,
`layout-view`, `compositions-list`.

Shots are committed. They are **not** regenerated by `npm test` (they need a browser and a server);
the test only asserts that every path an article references exists. `node dev/shoot-help.mjs` is the
command to re-shoot after a redesign, and the article that a shot belongs to is named in the shot
list so a stale one is easy to find.

**Cache.** `/img/*` carries a 7-day `Cache-Control` and the deploy token cannot purge the zone
(WSHED-97). So a **changed shot gets a new filename** — `rail-notes-2.png` — never an overwrite.

### 5.3 In the Markdown

```markdown
![A stroke through two selected notes deletes them.](figure:gesture-strike)
![The Notes rail, with the quarter armed.](/img/help/rail-notes.png)
```

A line that is nothing but an image is a block: `figure:<name>` becomes the inline SVG, a path
becomes `<img loading="lazy" width height>` (dimensions read from the PNG at build time so nothing
reflows), and the alt text becomes the `<figcaption>` as well as the `alt`. Inline images are not
supported and fail the build.

---

## 6. Content pipeline

```
content/help/compose/*.md          ── dev/build-help.mjs ──▶  js/lib/help/content.js   (committed)
                                                              │
js/lib/help/figures.js  ───────────────────────────────────── ┤
js/lib/help/search.js   ───────────────────────────────────── ┤
img/help/*.png          ◀── dev/shoot-help.mjs                │
                                                              ▼
                                              js/tools/compose/help.js  (the view)
```

**`dev/build-help.mjs`** reuses `dev/lib/markdown.mjs` (`frontMatter`, `render`, `plain`,
`escapeHtml`) — the same renderer the crawlable site uses, so help and the site cannot drift in what
Markdown means.

1. Read every `.md` in `content/help/<tool>/`, parse front matter, validate it (`slug`, `title`,
   `section`, `order`, `summary` required; slug unique and kebab-case; section from the tool's
   declared list).
2. Replace standalone image lines with sentinels, render the body once (so heading ids stay unique
   across the whole article), then substitute the `<figure>` HTML back.
3. Rewrite `help:<slug>` links to `#/compose/help/<slug>` and `app:<route>` links to `#/<route>`, so
   an article can point at the thing it describes.
4. Collect `headings` (level 2 and 3, with their ids) and `text` (`plain()` of the body, whitespace
   collapsed) for search and the scroll-spy.
5. Emit `js/lib/help/content.js`:

```js
export const SECTIONS = [{ id: "start", title: "Start here" }, …];
export const ARTICLES = [
  { slug: "gestures", title: "Gesture mode", section: "editor", order: 7,
    summary: "…", keywords: ["chevron", "lasso", …],
    headings: [{ level: 2, text: "Drag to lasso", id: "drag-to-lasso" }, …],
    html: "…", text: "…" },
  …
];
export const BY_SLUG = Object.fromEntries(ARTICLES.map((a) => [a.slug, a]));
```

   Written with a stable key order and `JSON.stringify` so the diff of a content change is the
   content change.

The generated module is expected to land around 80–110 KB — smaller than `engine.js` and a tenth of
what the vendored pdf.js already costs, all of it text that gzips to a fraction.

---

## 7. Wiring

| file | change |
|---|---|
| `js/tools/compose/ui.js` | The router learns a third route. `#/compose/help[/<slug>]` mounts the help view over the list; the editor, if one is open, is **left mounted and hidden** (`hidden` on its root) rather than closed, so returning is instant and nothing is saved or snapshotted on the way. |
| `js/tools/compose/help.js` | **New.** The view: bar, sidebar, search, article, prev/next, drawer, scroll-spy, deep links to headings (`#/compose/help/gestures#the-chevrons`). |
| `js/tools/compose/rails.js` | A third `.cp-opt-cap` (*Help*) and one `.cp-opt-row` `data-act="help"` at the foot of the Options panel. |
| `js/tools/compose/editor.js` | `act("help")` → open the route (the Options panel closes first, unlike the toggles); `?` in the key handler; the editor exposes nothing else. |
| `js/tools/compose/list.js` | A quiet `?` button in the list header. |
| `js/lib/icons.js` | One new icon, `help` (a question mark in a ring), drawn like the rest. |
| `css/app.css` | A `--- Compose: help (WSHED-159) ---` block: the layer, the bar, the sidebar, the drawer, search results, article type, figures. |
| `sw.js` | The new modules, the generated content module and `img/help/*` into `SHELL`; `CACHE` → `chopinly-v122`. |
| `js/version.js` | `VERSION` → `v122`. |
| `package.json` | `"help": "node dev/build-help.mjs"`, `"shots:help": "node dev/shoot-help.mjs"`. |

**Reading `help.js` costs nothing until it is opened**: `ui.js` imports it dynamically, as the
editor already does for the export sheet, so the help corpus is not parsed by anybody who never
opens it.

---

## 8. Tests

**Unit (`tests/help.test.mjs`, node):**

- the committed `js/lib/help/content.js` equals the generator's output (run `node dev/build-help.mjs`);
- every article has front matter that validates, a unique slug, a summary under 200 characters and a
  body over 120 words;
- every `help:<slug>` cross-link resolves to an article that exists;
- every `figure:<name>` names a figure `figures.js` exports;
- every `/img/help/*.png` an article references is a file on disk;
- every article's section is one of `SECTIONS`, and `order` is unique inside its section;
- **coverage:** every rail in `rails.js`'s `RAILS` has an article, and every `data-act` on a rail is
  mentioned by name in some article — the test that stops a new button from shipping undocumented.

**Unit (`tests/help-search.test.mjs`, node):** ranking (a title hit beats a body hit; a two-term
query needs both; prefixes match), the damping, snippet building and its escaping, stable ties,
empty and junk queries.

**Unit (`tests/help-figures.test.mjs`, node):** every name in `FIGURES` returns a well-formed SVG
with a `viewBox`, a `<title>`, no raw `<script>`, and no hard-coded colour outside the token set.

**`tests/sw.test.mjs`** already fails on any module under `js/` that is not precached; it gains the
same assertion for `img/help/*`.

**E2E (`tests/e2e/compose-help.mjs`, Playwright):** open from the Options panel and from the list's
`?`; the sidebar lists four sections and 24 articles; search *chevron* → the gestures article first,
snippet marked; `Enter` opens it; its figures are in the DOM and have non-zero boxes; the headings
show nested in the sidebar and the scroll-spy follows; prev/next walk in order; a deep link
(`#/compose/help/layout`) reloads straight into that article; `‹ Compose` returns to the **same
composition and mode** it was opened from; at 390 px the sidebar is a drawer; screenshots at phone
and iPad width attached to the card.

---

## 9. Build order

| step | what |
|---|---|
| 1 | `js/lib/help/figures.js` + its test — the figures are what the articles are written against. |
| 2 | `js/lib/help/search.js` + its test. |
| 3 | `dev/build-help.mjs`, `content/help/compose/` skeleton (front matter + headings), `tests/help.test.mjs`. |
| 4 | `js/tools/compose/help.js` + the CSS + the wiring (§7) — a working shell with skeleton content. |
| 5 | `dev/shoot-help.mjs`; capture the fourteen shots. |
| 6 | Write the twenty-four articles for real. |
| 7 | `npm test`, the E2E locally, the SW and version bump, deploy, the E2E against production. |

---

## 10. What was built

Landed whole in **v122**, as designed above, with these differences worth recording.

- **The corpus is bigger than estimated.** `js/lib/help/content.js` is **161 KB**, not the 80–110 KB
  §6 guessed: the inline SVG of each figure is embedded in the article's HTML rather than referenced,
  which is what makes a figure theme itself and cost no request. It is text, and it gzips to a small
  fraction; it is still smaller than `engine.js` + `layout.js` together, and it is loaded **only when
  help is opened** (`ui.js` imports `help.js` dynamically).
- **Figures are 240 × 120, not 240 × 140.** The first cut drew a caption line inside each SVG *and*
  emitted a `<figcaption>` from the alt text — the same sentence twice. The in-SVG captions are gone;
  only labels that point at part of the picture remain, and the box shrank to fit.
- **`.cp-editor[hidden]` needed saying.** The router hides the editor under the help page, but
  `.cp-editor` sets `display`, which beats the UA's `[hidden]` rule. One line in the help CSS block.
- **`?` also accepts a shifted `/`.** Chromium's synthetic keys — and some layouts — report the
  unshifted character, so the editor takes either.
- **The list header is tight on a phone.** A third button in `.sc-head` widened the page at 390 px
  (`noWiden` in the compose E2E caught it). Under 30 rem the `?` keeps its icon alone and the
  compositions header's gap narrows.
- **A coverage gap the test found before a reader did.** `ACT_WORDS` needed per-rail entries: the
  `art` button exists on two rails and means different things, and the title button (`details`) is
  documented with the editor rather than with Options. Both are declared explicitly in
  `tests/help.test.mjs` now, which is the point of the table.

Everything else — the route, the four doors, the 24 articles, the four sections, the sidebar with
nested headings and a scroll-spy, the drawer under 900 px, the ranked search with marked snippets,
the fourteen figures, the fourteen captured screenshots, the generator, the freshness test and the
coverage gate — is as written above.

**Files:** `content/help/compose/*.md` (24) · `dev/build-help.mjs` · `dev/shoot-help.mjs` ·
`js/lib/help/{content,search,figures}.js` · `js/tools/compose/help.js` · `img/help/*.png` (14) ·
`tests/help.test.mjs` · `tests/help-search.test.mjs` · `tests/help-figures.test.mjs` ·
`tests/e2e/compose-help.mjs`; edits to `ui.js`, `rails.js`, `editor.js`, `list.js`, `icons.js`,
`css/app.css`, `sw.js`, `js/version.js`, `package.json`.

**Commands:** `npm run help` rebuilds the corpus; `npm run shots:help` re-shoots the screenshots
against a local dev server.

### Left for later

- **A crawlable mirror.** The same Markdown could also emit public pages under `/help/compose/…`
  through `dev/build-site.mjs`, which would put Compose's documentation in search results. Out of
  scope for v1; the content pipeline was built so it is additive when it is wanted.
- **Help for the other tools.** `js/lib/help/` and `content/help/<tool>/` are tool-agnostic already;
  a Logbook or Scores section is content plus a door.
