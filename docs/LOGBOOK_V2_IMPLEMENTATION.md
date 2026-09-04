# Woodshed — Logbook v2 implementation plan

**Status:** approved 2026-09-04 (Leif delegated the open questions; decisions in
[`LOGBOOK_V2_DESIGN.md`](LOGBOOK_V2_DESIGN.md) §11). Epic **WSHED-29**.
Supersedes [`LOGBOOK_IMPLEMENTATION.md`](LOGBOOK_IMPLEMENTATION.md) (v1).

This is the step-by-step plan for landing the epic in production at
https://metronome.apps.lalalimited.com. Phases are ordered so that every
phase leaves `main` shippable, the test suite green, and the live site
usable; nothing is half-migrated between phases.

---

## 0. Ground rules

- **Repo** `~/lets-get-rich/woodshed`, Alacrity persona (`leifktaylor`,
  GitHub `alacrity-ai`). Branch `logbook-v2` off `main`; one PR at the end
  (the phases are commits, not separate PRs — the schema change makes
  intermediate deploys pointless, and Leif reviews the feature in prod).
- **No build step, no dependencies.** Vanilla ES modules, `node --test` for
  the pure layer. Every new JS file must be added to `sw.js` `SHELL[]` or it
  won't work offline; every removed one must be deleted from it.
- **Storage key stays `ws.logbook.data`.** The upgrade path is: old doc read
  → `migrate()` → v2 doc → saved on first write. No parallel key, no
  "backup" copy (localStorage is ~5 MB and the doc is tiny; a v1 copy would
  be dead weight forever).
- **The data layer never touches the DOM;** the UI never computes minutes.
  All derived numbers come from `logbook.metrics.*` / `dayReport` so the
  tests are the spec for what the screen shows.
- **Copy in register**, no "session" / "timer" in UI text.
- **Types** are `"piece" | "technique" | "other"`; the type registry
  (`TYPES` in `js/lib/logbook.js`) is the single source of glyph, label,
  CSS class and example names.

## 1. File plan

```
js/lib/logbook.js                 rewritten   data layer v2 (§2)
js/tools/logbook/index.js         unchanged   tool entry
js/tools/logbook/ui.js            rewritten   router + Today + shared chrome (strip, toast)
js/tools/logbook/library.js       new         Goals tab (search / filter / sort / sections)
js/tools/logbook/goalpage.js      new         one goal: rename, retype, status, stats, sparkline, notes, practice list
js/tools/logbook/picker.js        new         "What are you working on?" sheet (+ add-time mode)
js/tools/logbook/create.js        new         two-step goal creation sheet (shared by library + picker)
js/tools/logbook/notes.js         new         notes thread renderer + quick-note sheet
js/tools/logbook/history.js       new         calendar, day report, month-by-goal
js/tools/logbook/motion.js        new         FLIP whoosh, stamp, settle, haptic — all no-ops under reduced motion
js/tools/logbook/sparkline.js     kept        (target line removed from the call site; API unchanged)
js/tools/logbook/util.js          kept + fmtMin/fmtDur tweaks
js/tools/logbook/sheet.js         DELETED     v1 log sheet
js/app.js                         edited      shell chip shows goal
js/tools/metronome/ui.js          edited      stamp / practice button
js/tools/sightsinging/ui.js       edited      addAuto with real span
css/app.css                       edited      logbook block rewritten; session chip; new keyframes
sw.js                             edited      cache v10; SHELL list updated
tests/logbook.test.mjs            rewritten
tests/fixtures/logbook-v1.json    new         captured v1 doc for the migration test
docs/*                            edited      status lines, README tool list
```

Splitting `ui.js` (351 lines in v1) into per-screen modules keeps each file
under ~250 lines; `ui.js` owns routing, the strip, the toast, the running
ticker, and passes a `ctx` (`{ root, nav, render, toast, openPicker }`) to
each screen.

## 2. Phase 1 — data layer v2 + tests (WSHED-33)

Ships nothing visible; the whole UI still compiles against the old API until
Phase 2, so this phase is committed together with Phase 2's first commit.
Written test-first.

### 2.1 Fixture

Hand-write `tests/fixtures/logbook-v1.json` from the v1 schema with: two user
goals (one with target + next + two spots, one fixed; one bare), the builtin
`sightsinging` goal, four entries (bpm-only, note+spot, auto, bpm+note),
three `days` (one with entries, one clock-only, one both), a running
`clock`, and one tombstone. Values chosen so the assertions in 2.3 are exact.

### 2.2 `js/lib/logbook.js`

```js
export const SCHEMA_VERSION = 2;
export const TYPES = {
  piece:     { label: "piece",     glyph: "●", cls: "t-piece",     examples: "Pathétique Sonata, Bach Invention, Clair de lune" },
  technique: { label: "technique", glyph: "▲", cls: "t-technique", examples: "Scales, arpeggios, Hanon, octaves" },
  other:     { label: "other",     glyph: "◆", cls: "t-other",     examples: "Sight reading, improvisation, ear training" },
};
export const BUILTIN_SIGHTSINGING = "sightsinging";
export const BUILTIN_FREEPRACTICE = "freepractice";
export const MIN_SEGMENT_MS = 10_000;
```

Keep `dayKey`, `dayStart`, `addDays`, `uuid`, `makeStore` wiring, the
`listeners` set and `save()`.

**`migrate(doc)`**: `null/invalid → emptyDoc()`; `v2 → fill defaults`;
`v1 → migrateV1(doc)`:

1. goals: `{ id, name: title, type: kind === "builtin" ? "other" : "piece", status, kind, createdAt, updatedAt, finishedAt }`.
2. notes from goal fields, in this order per goal so the thread reads
   naturally: `target: …` (at `createdAt`), `spots: a · b (fixed Aug 28)` (at
   `createdAt + 1`), `next time: …` (at `updatedAt`).
3. notes from entries: body = join of `♩ ${bpm}`, spot texts, `"note"` with
   ` · `; auto entries → body = `auto.label`; `createdAt = entry.at`.
4. `days`: for each key with minutes > 0 → segment on `freepractice`
   (`ensureBuiltin("freepractice", "Free practice", "other")`),
   `startedAt = dayStart(key) + 12h`, `endedAt = startedAt + minutes*60000`,
   `auto: { source: "migration", label: "v1 daily minutes" }`.
5. `clock` → running segment on `freepractice` with `startedAt = clock.startedAt`.
6. `deleted` carried; `schemaVersion = 2`. Save immediately so the upgrade
   happens once.

**Goals**: `goals({ status = "active", type = null, q = "", sort = "recent" } = {})`
— `status: "active" | "finished" | "shelved" | "all"`; `q` normalised via
`.normalize("NFD").replace(/\p{M}/gu, "")` + lowercase substring; sorts:

| sort | comparator |
|---|---|
| `recent` | lastPracticedAt desc, never-practiced last, then createdAt desc |
| `name` | localeCompare |
| `created` | createdAt desc |
| `time` | lifetime minutes desc |
| `week` | minutes in the last 7 days desc |
| `month` | minutes this calendar month desc |

`addGoal({ name, type = "piece", kind = "user", id })` validates name and
type; `renameGoal`, `retypeGoal`, `finishGoal`/`shelveGoal`/`reactivateGoal`
(`setStatus`), `deleteGoal` (builtin guard; cascades segments + notes to
tombstones; if the running segment belongs to it, it is closed first).

**Practice**: `runningSegment()` = `segments.find(s => s.endedAt === null)`;
`running()` → `{ segment, goal, elapsedMs }` | null.
`closeRunning(at = now())`: sets `endedAt`; if `endedAt - startedAt < MIN_SEGMENT_MS`
removes it (no tombstone) and returns null. `start(goalId)`: if running →
`switchTo`; else push `{ id, goalId, startedAt: now(), endedAt: null, bpm: null, auto: null }`;
reactivates a finished/shelved goal. `switchTo(goalId)`: no-op if same goal;
`closeRunning()` then open. `stop()` → closed segment | null.
`stampTempo(bpm)` validates 20–300, sets on the running segment, throws if
none. `addTime({ goalId, minutes, endedAt = now() })` → closed segment.
`deleteSegment(id)` (not the running one).

**Notes**: `notes(goalId)` newest first (createdAt desc, then insertion
desc); `addNote(goalId, body)` trims, rejects empty; `deleteNote(id)`.

**Sight singing**: `addAuto({ source, label, startedAt, endedAt = now() })`:
if `running()` → `addNote(running.goal.id, label)` and return
`{ kind: "note", … }`; else `ensureBuiltin("sightsinging", "Sight singing", "other")`
and push a closed segment with `auto: { source, label }`, return
`{ kind: "segment", … }`. If the span is under `MIN_SEGMENT_MS` (shouldn't
happen; a lesson is minutes) still keep it — auto segments are exempt.

**Read models** (all take `nowMs = now()` so the running segment is live):

- `clip(seg, key)` → ms of overlap with `[dayStart(key), dayStart(key)+24h)`.
- `minutesOn(key)` = round(Σ clip / 60000); `practicedOn(key)` = ≥ 1.
- `dayReport(key)` → `{ key, minutes, goals: [{ goal, minutes, segments, live }] }`
  sorted minutes desc (live row first if tied), plus `total`.
- `metrics.streak()` as v1 but on `practicedOn`.
- `metrics.weekStrip()` as v1.
- `metrics.month(y, m)` → cells `{ key, minutes, practiced, gold, goals }`
  + `totals { days, minutes }`.
- `metrics.minutesBetween(a, b)`.
- `metrics.goalStats(id)` → `{ minutes, days, lastPracticedAt, daysSince, avgSessionMin, weekMin, monthMin, bestBpm, lastBpm, segments (desc) }`.
- `metrics.tempoSeries(id)` from segments with bpm, asc.
- `metrics.monthByGoal(y, m)` → `[{ goal, minutes }]` desc, clipped to the month.
- `metrics.goldDays()`: day set where (a) that day's minutes exceeded every
  earlier day's, or (b) a segment's bpm exceeded that goal's previous best.
  Computed in chronological order; a day with < 1 min is never gold.

Exports: `createLogbook`, `logbook` singleton, the constants, `dayKey`,
`dayStart`, `addDays`. Nothing named `entry`, `spot`, `clock`, `days`,
`export`, `import` survives.

### 2.3 Tests (`tests/logbook.test.mjs`)

Same harness (`memStore`, `fresh()` with a fake clock at local noon). Cases,
each one `test()`:

1. migration: load the fixture through a store → goal names/types, note
   bodies in order, one free-practice segment per v1 day with the right
   minutes, running clock carried, tombstones intact, `schemaVersion === 2`,
   and the doc was saved back.
2. goals: add (trim, type validation, default piece), rename, retype,
   finish/shelve/reactivate, delete cascade → tombstones for goal + segments + notes.
3. practice: start opens; second start switches (first segment closed at the
   switch time); stop closes; < 10 s dropped without tombstone; start on a
   shelved goal reactivates it.
4. midnight: 23:50 → 00:20 credits 10 to day 1 and 20 to day 2; `dayReport`
   for both.
5. dayReport: two goals, ordering by minutes, live row with elapsed growing
   as the clock ticks.
6. goalStats: minutes, days, avg, week/month windows, lastPracticedAt,
   daysSince.
7. streak: fresh-morning rule; gap breaks it.
8. gold days: new best daily total; new best bpm on a goal; a 30-second day
   never gold.
9. library query: `q` accent-insensitive; type filter; each of the six sorts
   against a known ordering.
10. notes: add/order/delete; empty rejected; cascade on goal delete.
11. addAuto: running → note on the running goal, no new segment; idle → auto
    segment on the builtin, visible in `dayReport`.
12. stampTempo: sets bpm on the running segment only; throws when idle;
    `tempoSeries` + `bestBpm` reflect it.
13. addTime: closed segment ending now; shows in `dayReport`.
14. monthByGoal: sums equal `month().totals.minutes`.

`npm test` must stay green for every other suite (judge, corpus, staff,
melodies) — they don't import the logbook.

## 3. Phase 2 — UI skeleton, library, goal page, creation (WSHED-34)

### 3.1 `ui.js` (router + chrome)

- Routes: `#/logbook` Today · `/goals` · `/goals/<id>` · `/history`. `/log`
  is gone; an old `#/logbook/log?…` link redirects to Today.
- Exposes `ctx = { root, nav, render, toast, openPicker, openCreate, openQuickNote }`
  to the screens.
- One `setInterval` ticker (1 s) owned by `ui.js` while a segment is
  running; screens register `onTick` callbacks for the elements they need to
  update (hero elapsed, live row minutes) so a tick never re-renders a screen.
- The `logbook.on()` subscription re-renders unless a sheet is open or the
  user is typing in a field (`document.activeElement` is an input/textarea
  inside the tool root).

### 3.2 `library.js`

- Header: search input (`/` focuses it on desktop; `type="search"`,
  `autocomplete=off`), type chips, sort `<select>`. State persisted in
  `makeStore("logbook").get("library", { type: null, sort: "recent" })`;
  search text is not persisted.
- Sections: active (always open), finished / shelved (`<details>`), counts in
  the summary. Empty state copy: *"No goals yet. A goal is what you practice —
  a piece, a technique, or anything else."* + **+ goal**.
- Row: `<button class="lb-row-main">` with `<i class="lb-type t-piece">●</i>`,
  name, sub `2h 10m · today`. Tap → goal page.
- **+ goal** → `openCreate({ onCreated: (g) => stamp(row) })`.

### 3.3 `create.js` — the two-step sheet

- One overlay (`.lb-sheet-wrap` → `.lb-sheet`), title *new goal*, three
  type chips with glyphs (default piece; examples line updates per chip), a
  name input, **create**. Enter creates; Esc / ✕ / backdrop closes.
- `openCreate({ name = "", type = "piece", onCreated })`: returns a promise
  of the goal or null. Used by the library and by the picker (which passes
  the typed search text as `name`).
- Validation error shown inline under the field (`role="alert"`), never a
  `prompt()`/`alert()`.

### 3.4 `goalpage.js`

- Head: back, status word, type badge (tap → cycles through types with a
  toast, no menu — three values, one tap each).
- Name: `<h2 contenteditable>`-free — an input styled as the title;
  `change` → `renameGoal`.
- Stats line from `goalStats`; sparkline when `tempoSeries` non-empty
  (target line dropped); caption with first → last bpm.
- Actions: **▶ practice this** (start/switch → `nav("")`), finish / shelve or
  reactivate, delete (confirm with counts of segments + notes).
- Notes thread (Phase 4) and practice list (`goalStats.segments` grouped by
  day, last 30, long-press → delete with confirm) below.
- Builtin goals: rename/retype/delete disabled, a one-line explanation.

### 3.5 CSS (first pass)

Rewrite the `/* ---------- logbook ---------- */` block: drop `.lb-goal*`,
`.lb-next`, `.lb-spot*`, `.lb-entries*`, `.lb-reorder`, `.lb-addspot`,
`.lb-bpm`, `.lb-stepper`, `.lb-new`; add `.lb-type.t-*` (colour per type:
`--brass` / `--ivory-dim` / `--sage`), `.lb-sheet-wrap` (fixed, backdrop,
bottom-sheet on `max-width: 40rem`, centred card above), `.lb-search`,
`.lb-typechips`, `.lb-sort`. Keep `.lb-row*`, `.lb-details`, `.lb-stats`,
`.lb-toast`, `.lb-spark*`, calendar styles.

## 4. Phase 3 — practice flow: hero, picker, chip (WSHED-35)

### 4.1 Today hero (`ui.js` → `renderToday`)

Idle:
```
[ ▶ ]   1h 30m today            (or "start practicing" when 0)
```
Running:
```
● PIECE                                  (type badge, small caps)
Pathétique Sonata — 1st mvt              (tap → goal page)
27:14                                    (Fraunces, tabular)
today on this goal 57m
last note · yesterday                        + note
"Work mm. 93–108 slowly. LH jumps weak."     (2-line clamp; tap → goal page)
        ( ■ stop )      [ ⇄ switch ]
```
Then the week strip + streak + total, then the **practiced today** list
(Phase 5 fills the rows; Phase 3 renders them plainly).

- Play → `openPicker({ mode: "start" })`. Long-press play →
  `openPicker({ mode: "addtime" })`.
- Stop → `logbook.stop()` → toast `"57m on Pathétique"` (or `"under 10 s — not
  kept"`), `settle()` motion, re-render.
- Switch → `openPicker({ mode: "switch", excludeId: running.goal.id })`.
- + note → `openQuickNote(goalId)` (Phase 4 component; Phase 3 wires a
  minimal version so the AC holds).
- Reload with a running segment: `running()` is truthy from the doc, the
  hero renders running immediately; the ticker takes over.

### 4.2 `picker.js`

`openPicker({ mode: "start" | "switch" | "addtime", excludeId })` → promise.

- Markup: `.lb-sheet-wrap` → `.lb-sheet.lb-picker`: title per mode (*What
  are you working on?* / *Switch to…* / *Add time to…*), search input, list,
  footer row **+ new goal**, and (start/switch only) a *show finished* toggle.
- List build: `recent = goals({ sort: "recent" }).filter(hasPracticed).slice(0, 5)`
  minus `excludeId`; then `by type` for the remaining active goals (section
  header per type, only non-empty). With `q`, one flat filtered list across
  active (+ finished/shelved when toggled or when `q` matches one of them —
  searching should always find it).
- The **+ new goal ‘q’** row is the last row always, and the *first* row
  when there are no matches. Enter with a highlighted row picks it; Enter
  with no highlight picks the first row.
- ↑↓ move the highlight (`aria-activedescendant`), Esc closes, tap outside
  closes. Focus: `matchMedia("(pointer: fine)")` → autofocus the search.
- Picking: `mode === "addtime"` → second panel (minutes chips 15/30/45/60 +
  a −5/+5 stepper, **add**) → `addTime`; otherwise `logbook.start(id)` (which
  handles switch), `whoosh(rowEl, heroEl)`, resolve.
- **+ new goal** → `openCreate({ name: q })` → on create: `stamp` then
  proceed as if picked.

### 4.3 Shell chip (`js/app.js`)

`● 27:14 · Pathétique` — the dot takes the type class, the name is clamped
to ~14 ch with `text-overflow: ellipsis`. `syncChip` reads `logbook.running()`.
The chip's `href` stays `#/logbook`.

### 4.4 Remove

`sheet.js` (+ its `sw.js` entry), the `/log` route, `renderLog`, entry rows.

## 5. Phase 4 — notes (WSHED-36)

`notes.js` exports `renderNotes(container, goalId, ctx)` and
`openQuickNote(goalId, ctx)`.

- Composer: `<textarea rows=1>` that auto-grows; placeholder *add a note —
  fingering, a spot, what to do next…*; Enter saves, Shift+Enter newline;
  save clears and slides the new note in.
- Thread: newest first, grouped by day heading (`Sep 4`), body with
  `white-space: pre-wrap`; long-press → confirm → delete.
- Quick-note sheet: same composer in a `.lb-sheet`, title = goal name, used
  by the hero's **+ note** and by long-press on a Today row.
- The hero's *last note* line reads `notes(goalId)[0]`.

## 6. Phase 5 — Today rows + History (WSHED-37)

`history.js` exports `renderHistory(root, ctx)`; Today's list lives in
`ui.js`.

- Today rows from `dayReport(today())`: glyph, name, minutes, `auto` tag
  for auto segments, `.live` on the running goal (breathing dot). Long-press
  → quick note.
- History: month nav, calendar (dot size by minutes, gold from
  `month().cells[].gold`), totals line, selected-day report rows (tap → goal
  page), **this month by goal** bars (`monthByGoal`, width relative to the
  top goal, minutes label).
- Remove v1 history's per-goal `<details>` with sparklines (now on the goal
  page).

## 7. Phase 6 — seams (WSHED-38)

- **Metronome**: the `#log-tempo` button becomes `#lb-btn`. `sync()`:
  running → label `♩ stamp`, click → `stampTempo(settings.bpm)` + toast
  (`toast()` is moved to `util.js` so tools outside the logbook can use it);
  idle → label `practice`, click → `openPicker({ mode: "start" })`
  (imported from `../logbook/picker.js`; the picker only needs a root to
  mount into and works outside the logbook tool). Button hidden only when
  there are zero goals *and* nothing is running (then "practice" still works
  via search-to-create, so: never hidden; keep it simple).
- **Sight singing**: `runState.startedAt = Date.now()` when `renderRun`
  begins; at the two `addAuto` call sites pass `{ startedAt: runState.startedAt, endedAt: Date.now() }`.
  `redo` / `replay` reset `startedAt` with `logged`.
- Metronome deep link `#/metronome?bpm=` unchanged.

## 8. Phase 7 — flourishes (WSHED-39)

`motion.js`:

```js
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const haptic = (ms = 10) => { try { navigator.vibrate?.(ms); } catch {} };
export function whoosh(fromEl, toEl)   // FLIP: clone fromEl's text at its rect, animate to toEl's rect (transform+opacity), then reveal toEl
export function stamp(el)              // adds .lb-stamp (existing @keyframes stamp), removes on animationend
export function settle(numeralEl, rowEl)   // numeral fades/scales down toward the row, row flashes .lb-tick
export function slideIn(el)            // .lb-slide-in 120 ms
```

CSS: `.lb-stamp`, `.lb-tick` (felt-red left border flash), `.lb-slide-in`,
`.lb-live .lb-type { animation: breathe 1.6s … }`, `.lb-week i.on.new
{ animation: glow 600ms }`, sheet enter/exit (`transform: translateY(100%)`
→ 0, 240 ms), and the reduced-motion block turns every one of them into
opacity-only or `animation: none`.

Haptic on: pick, create, stop.

## 9. Phase 8 — test + QA (WSHED-40)

- Unit suite from Phase 1 is complete; this phase adds nothing unless
  Phases 2–7 changed the API (then tests first).
- **Manual E2E** on desktop Chromium (local `python3 -m http.server 8080`)
  and on Leif's phone after deploy. Checklist (`docs/LOGBOOK_V2_QA.md`,
  filled and attached to WSHED-40):
  1. Fresh profile: Today empty state → play → picker empty state → type
     "Scales" ⏎ → technique → running hero shows Scales, 0:00 ticking.
  2. Switch → type "Path" → + new goal → piece → hero shows Pathétique; Today
     lists both rows; total = sum.
  3. Stop → toast; rows settle; chip hides.
  4. Goal page: rename, retype, note ⏎ → appears; hero shows it as last note
     on next start.
  5. History: today's dot; day report matches Today; month-by-goal bars.
  6. Metronome: practice → picker → start; stamp → toast; goal page
     sparkline shows one point.
  7. Sight singing: lesson with a goal running → note; lesson idle → auto
     segment on Today.
  8. Reload with a running segment → hero + chip restored; leave overnight →
     both days credited (simulate by editing `startedAt` in devtools).
  9. Migration: paste the v1 fixture into `ws.logbook.data`, reload → goals,
     notes, free-practice days, streak intact.
  10. Offline: airplane mode → app loads, everything works.
  11. Reduced motion: OS setting → no transforms; still usable.
  12. Tap counts match the WSHED-32 table.

## 10. Phase 9 — land (WSHED-41)

1. `sw.js`: `CACHE = "woodshed-v10"`; `SHELL` += `library.js goalpage.js
   picker.js create.js notes.js history.js motion.js`, −= `sheet.js`.
2. Docs: this file + design doc status lines; `DESIGN.md` §7 → one-paragraph
   v2 pointer; `README.md` logbook sentence rewritten; v1 docs get a
   "superseded by v2" banner.
3. Secret-scan the diff (`git diff main | grep -iE 'key|token|secret'`),
   commit trail per `git-commit-push-pr.md`, push `logbook-v2`, open PR →
   `main` as `leifktaylor`, merge.
4. Deploy: `CLOUDFLARE_API_TOKEN=$(agentsecrets get …) npx wrangler pages deploy . --project-name woodshed`
   per `claude_ops/docs/sops/cloudflare-deploys.md`; verify
   `curl -s https://metronome.apps.lalalimited.com/sw.js | grep v10`, load the
   site, run E2E items 1–3 + 10 live.
5. kbRelay: each child card → review with a handoff; epic → review with the
   deploy evidence; **not** done — Leif reviews the feature in production.

## 11. Commit plan

| # | Commit | Phase |
|---|---|---|
| 1 | `WSHED-29: design + implementation plan for Logbook v2` | docs |
| 2 | `WSHED-33: logbook data layer v2 — segments, notes, migration, metrics + tests` | 1 |
| 3 | `WSHED-34: goal library, creation sheet, goal page` | 2 |
| 4 | `WSHED-35: practice flow — hero, picker, switch/stop, add time, shell chip` | 3 |
| 5 | `WSHED-36: notes thread + quick note` | 4 |
| 6 | `WSHED-37: Today rows + History from segments` | 5 |
| 7 | `WSHED-38: metronome stamp/practice, sight-singing auto span` | 6 |
| 8 | `WSHED-39: flourishes — whoosh, stamp, settle, reduced motion, haptics` | 7 |
| 9 | `WSHED-40: QA checklist + fixes` | 8 |
| 10 | `WSHED-41: sw v10, docs, deploy` | 9 |

Commits 2 and 3 land together on the branch (the UI must compile), but stay
separate commits for review.

## 12. Risks and how they're handled

| Risk | Handling |
|---|---|
| Migration eats Leif's alpha data | Fixture-driven test; migration is pure and idempotent (v2 in → v2 out); the running clock is carried; QA item 9 |
| A segment left running for days | It's honest: both days get credited; the hero shows the elapsed; stop closes it. No auto-stop — guessing when someone stopped is worse than a long segment they can delete from the goal page |
| Picker feels slow to open on a phone | Sheet is pre-built markup toggled with a class, list rendered from an in-memory doc; no network, no layout thrash |
| Ticker re-renders and steals focus | Ticks patch text nodes only; the change listener skips re-render while a field is focused or a sheet is open |
| SW serves a stale mix of old/new modules | Cache name bump + network-first; every new module in `SHELL` |
| Losing the tempo sparkline value | `bpm` on segments + metronome stamp; v1 tempos migrate as notes (documented loss) |
