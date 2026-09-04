# Woodshed — Logbook implementation plan

> **Superseded (2026-09-04)** by Logbook v2 — see [`LOGBOOK_V2_DESIGN.md`](LOGBOOK_V2_DESIGN.md) and [`LOGBOOK_V2_IMPLEMENTATION.md`](LOGBOOK_V2_IMPLEMENTATION.md). Kept for the record of what v1 was and why it changed.

Companion to [`LOGBOOK_DESIGN.md`](LOGBOOK_DESIGN.md) (the *what*). This is
the *how*: files, data model, seams into the shell / metronome / sight
singing, tests, and the delivery slices that become WSHED tickets.

## 0. Decisions carried in from the design (open questions closed 2026-08-30)

| Question | Decision |
|---|---|
| Name | **Logbook** (`id: "logbook"`, glyph: pencil, category `tools`, listed after the tuner) |
| Session clock placement | **Shell navbar** — brass dot + `mm:ss` chip on every tool while a session is running; tap = go to the Logbook |
| `log` control on other tools | **Metronome only** |
| Weekly minutes target | **No** |
| Delete-goal safety | **Plain confirm**; export/import is the safety net |
| Storage | **localStorage**, one versioned document, single store module (design §6b) |

## 1. Files

```
js/lib/logbook.js                 data layer — pure, node-testable, no DOM
                                  (document shape, CRUD, derived metrics,
                                   session clock, export/import, change events)
js/tools/logbook/index.js         tool object {id:"logbook", …}
js/tools/logbook/ui.js            router + Today / Goals / History screens
js/tools/logbook/sheet.js         the log sheet (one card; used by Today and
                                  by the metronome's log control via hash)
js/tools/logbook/sparkline.js     tempo-over-time SVG (tiny, no deps)
css/app.css                       + a `/* ---------- logbook ---------- */`
                                  section and `.session-chip` in the shell
js/app.js                         + session chip in the navbar; `?bpm=` and
                                  `?log=` query pass-through on hash routes
js/registry.js                    + logbook entry
js/tools/metronome/ui.js          + reads `#/metronome?bpm=N` on mount;
                                  + `log` button → `#/logbook/log?bpm=N`
js/tools/sightsinging/ui.js       + `logbook.addAuto(...)` in `summary()`
sw.js                             + new files in SHELL, bump CACHE version
tests/logbook.test.mjs            data-layer tests (node --test)
```

The data layer is a **library** (`js/lib/`), not part of the tool folder, so
the shell, the metronome and sight singing can import it without pulling in
the Logbook UI. `js/lib/logbook.js` is the only module that touches
`localStorage` for logbook data (through `makeStore("logbook")`).

## 2. Data model (`schemaVersion: 1`)

One document under `ws.logbook.data`:

```js
{
  schemaVersion: 1,
  goals: [{
    id, title, target,            // target: string|null ("140", "from memory")
    next,                         // the "next time" line, string|null
    status,                       // "active" | "finished" | "shelved"
    kind,                         // "user" | "builtin"  (builtin = Sight singing)
    order,                        // number; Today/Goals sort key for active goals
    createdAt, updatedAt, finishedAt,
    spots: [{ id, text, createdAt, fixedAt }],   // fixedAt null = open
  }],
  entries: [{
    id, goalId, at,               // at = ms epoch; day derived in local time
    bpm,                          // number|null
    spotIds,                      // spots worked on in this entry
    note,                         // string|null
    auto,                         // null | { source:"sightsinging", label:"Book 2 Lesson 3 · ★★" }
  }],
  days: { "YYYY-MM-DD": { minutes } },   // clocked + manually added minutes
  clock: null | { startedAt },           // the running session, if any
  deleted: [{ id, kind, at }],           // tombstones (goals/entries), for a future sync
}
```

- **Day = the unit of a session.** Entries carry a timestamp; "sessions" in
  the UI are days. The clock adds elapsed minutes to today's `days` bucket
  when stopped; "add minutes" adds manually. This is simpler than session
  objects and matches how the History calendar reads.
- IDs: `crypto.randomUUID()`. All writes stamp `updatedAt` and save the whole
  document (tens of KB at most; a `save()` per interaction is fine).
- Derived, never stored: streak, week strip, per-goal last tempo / last
  touched / session count / minutes, tempo series, gold days (a day is gold
  when a spot was fixed that day or an entry set a per-goal BPM high-water
  mark).
- **Migration hook:** `load()` upgrades by `schemaVersion`; v1 has none.
- **Export** = `JSON.stringify(doc)` downloaded as
  `woodshed-logbook-YYYY-MM-DD.json`; **import** validates `schemaVersion`
  and replaces (confirm first). Both live on the Goals screen.

### `js/lib/logbook.js` API (sketch)

```js
export const logbook = {
  load(), save(),                          // internal, exposed for tests
  goals(status?), goal(id), addGoal({title,target}), updateGoal(id, patch),
  finishGoal(id), shelveGoal(id), reactivateGoal(id), deleteGoal(id), reorderGoals(ids),
  addSpot(goalId, text), fixSpot(goalId, spotId), unfixSpot(...), deleteSpot(...),
  addEntry({goalId, bpm, spotIds, note}), deleteEntry(id),
  addAuto({source, label}),                // ensures the builtin goal, adds entry
  startClock(), stopClock(), clock(),      // clock() → {startedAt}|null
  addMinutes(dayKey, n),
  today(), entriesOn(dayKey), days(),      // read models
  metrics: { streak(), weekStrip(), goalStats(id), tempoSeries(id), goldDays(month) },
  exportJson(), importJson(text),
  on(fn) → off,                            // change event (any write)
};
```

All read models return plain data so screens are pure render functions of
the document; every write ends in `save()` + `emit()`.

## 3. Routes & screens (`js/tools/logbook/ui.js`)

```
#/logbook                 Today
#/logbook/goals           Goals list
#/logbook/goals/<id>      one goal (edit, spots, finish/shelve/delete)
#/logbook/history         calendar + per-goal progress
#/logbook/log?goal=<id>&bpm=<n>   the log sheet (goal optional → picker on top)
```

Same sub-hash routing pattern as sight singing (`subPath()`, `nav()`), so
back works everywhere. A three-segment strip (today · goals · history) sits
at the top of the tool, styled like `.segmented`.

**Today** renders: date · clock (● start / ■ stop, elapsed `mm:ss`) · week
strip + streak · active goal cards (title, last bpm · ago, ⚠ if ≥7 days,
next line, open spots as tick-circles, `log` + `♩ bpm` buttons) · "logged
today" list (delete on long-press/⋯) · "add minutes" link. Empty state:
one line + a `+ goal` button.

**Log sheet** renders: goal picker (only when no `goal` param) · tempo
stepper (±1 tap, ±5 long-press; prefilled `bpm` param → goal's last bpm →
blank) · spot chips (tap = worked; long-press = fixed, with a small
"fixed ✓" toast) · note · next time · save. Save → `addEntry` → back to
Today.

**Goals**: drag-to-reorder (pointer events, mobile-friendly; a ▲▼ fallback
pair on each row), collapsed finished + shelved sections, `+ goal`,
export/import at the bottom. Goal page: title/target/next fields (autosave
on blur), spots list (add, tick, delete), finish / shelve / delete.

**History**: month header with ◀ ▶, 7-column dot grid (dot size by
minutes, gold class for gold days, tap → the day's entries below), totals
line (days · minutes · streak), then per-goal rows with sparkline, three
numbers, spots, entries.

## 4. Seams into the rest of Woodshed

1. **Shell session chip** (`js/app.js`): import `logbook`; render
   `<button class="session-chip">● 23:14</button>` next to the tool picker
   when `logbook.clock()` is set; tick each second; `logbook.on()` to
   show/hide; click → `#/logbook`. Wake-lock is *not* tied to the clock
   (screen can sleep while you play; the metronome still drives wake-lock).
2. **Metronome**: on mount parse `bpm` from the hash query and `setBpm()` if
   valid, then strip the query with `history.replaceState`. Add a small
   `log` button beside *tap tempo* (rendered only if `logbook.goals("active")`
   has a user goal) → `location.hash = "#/logbook/log?bpm=" + settings.bpm`.
   Every tempo in the Logbook is a `<button>` → `#/metronome?bpm=N`.
3. **Sight singing** (`summary()` in `ui.js`): after computing `avg`/`stars`,
   call `logbook.addAuto({ source: "sightsinging", label })` with
   `Book N Lesson M · ★★` (campaign) or `Challenge · 5 melodies · 84%`.
   Only on the first summary of a run (not on redo/replay re-summaries —
   guard with a flag on `runState`).
4. **Hash query pass-through** (`js/app.js`): `fromHash()` must match
   `#/metronome?bpm=96` and `#/logbook/log?…` — compare against the hash
   with the query stripped.

## 5. Visual notes (inside the existing system)

- Reuse tokens + `.segmented`, `.tap`, `.nudge`, `.btn-round`, `.tuner-status`,
  `#1e1913` card fill and `1rem` radius from the sight-singing cards.
- Numerals (tempo, minutes, streak) in `var(--serif)`, `font-variant-numeric:
  tabular-nums`. Section labels uppercase, `letter-spacing: .12em`,
  `--ivory-dim`.
- Spot circles: 12px ring `--ivory-dim`; fixed = `--gold` fill + strike.
- ⚠ and delete are the only `--felt` uses. Gold days use `--gold` (the
  sight-singing sticker color). `prefers-reduced-motion` disables the chip
  pulse.

## 6. Tests

`tests/logbook.test.mjs` runs against an in-memory store (the data layer
accepts a store factory for tests): goal CRUD + ordering; spot fix/unfix;
entries → last bpm / last touched / ⚠ threshold; streak across month
boundaries and today-without-entries; week strip; gold-day rules; clock
start/stop accumulates minutes into the right local day; export → import
round-trip; import rejects wrong `schemaVersion`; `addAuto` creates the
builtin goal exactly once; tombstones on delete.

Browser check before deploy: Playwright at 390px — add goal, two-tap log,
spot long-press, clock chip visible on the metronome, `♩` round trip sets the
metronome tempo, sight-singing fake run writes an auto entry.

## 7. Delivery slices → tickets

| Slice | Ticket | Scope |
|---|---|---|
| 1 | Goals + spots + Today + log sheet | `lib/logbook.js` v1 (goals, spots, entries, export/import), tool skeleton, Today, sheet, Goals screens, tests |
| 2 | Session clock in the shell | clock in the data layer, navbar chip, minutes/streak/week strip on Today |
| 3 | History | calendar, gold days, per-goal sparkline + stats |
| 4 | Metronome ↔ Logbook | `?bpm=` on both sides, `log` button, tempo buttons |
| 5 | Sight-singing auto entries + land | `addAuto`, builtin goal, sw.js bump, deploy, docs |

Ship after slice 5 in one deploy (the tool is hidden from nothing — an empty
Logbook is a valid state), or after slice 2 if review wants it earlier.

## 8. Deploy

`wrangler pages deploy . --project-name woodshed` with `cloudflare_api_token`
/ `cloudflare_account_id` from agentsecrets; bump `CACHE` in `sw.js` so
installed clients pick up the new shell list; verify on
https://metronome.apps.lalalimited.com/#/logbook.
