# Woodshed — Logbook v2: goal-attributed practice

**Status:** approved 2026-09-04 (Leif; open questions closed in §11). Supersedes the v1 model in
[`LOGBOOK_DESIGN.md`](LOGBOOK_DESIGN.md) / [`LOGBOOK_IMPLEMENTATION.md`](LOGBOOK_IMPLEMENTATION.md)
(WSHED-23…28, shipped 2026-08-30). kbRelay epic: **WSHED Logbook v2** (see §10).

---

## 0. The one-sentence brief

> Tell me what you're practicing, and I will quietly build your practice
> history for you.

v1 said *"here is your list of goals, now go practice"* and asked for a
target, a next-time line, and trouble spots before a single minute was
played. Four days of alpha use showed that the timer and the goals never
touched: the app knew *you practiced two hours* but not *what*. v2 fixes
that with one constraint and one simplification:

1. **Practice time always belongs to a goal.** Play → choose a goal → the
   clock runs *against that goal*. Switch Goal splits the sitting into
   segments. There is no unclassified time.
2. **A goal is a lightweight identity, not a project.** Type + name. Every
   other bit of structure (target, next, spots) collapses into a dated
   **notes thread** on the goal, where the user supplies the semantics.

Everything else — Today, History, streaks, per-goal totals, "last practiced" —
is *derived* from the segments. Nothing about a day is stored.

### 0.1 North star

> **Capture more structure about practice without asking the musician to do
> more bookkeeping.**

v1 already proved the loop works: seeing *"2h 30m today"* changed behaviour.
v2 keeps that mechanism frictionless and adds one axis — the app moves from
optimising practice **quantity** to exposing practice **allocation**. A Today
screen that reads *Pathétique 1h 42m · Scales 12m · Sight reading 8m* needs no
nag and no curriculum; the imbalance is obvious, and agency stays with the
pianist. Over weeks the per-goal totals become information in themselves
(25 h on a piece that is still unstable says something about method).

The core loop is deliberately tiny:

> **Choose something → practice it → optionally leave a note → see what you
> actually did.**

**What we will not build** (tempting, and each one would break the loop):
planned durations, required daily goals, completion percentages, difficulty
ratings, priority scores, practice schedules, task systems, streak
punishments, reminders. If a later idea does not fit the loop above in one
clause, it is out.

The one qualitative feature that *does* fit: when you pick a goal, the hero
shows its **most recent note** (§3.1). "Next time" stops being a field; the
last thing you wrote is the context you resume with. Practice → observe →
note → leave → return → recall → practice.

## 1. What changes, in one table

| v1 (shipped) | v2 (this doc) |
|---|---|
| Goal = title · target · next · spots[] · lifecycle | Goal = **type · name** · status · notes thread |
| Timer is a bare session clock, independent of goals | Timer **runs against a goal**; Switch Goal is a first-class control |
| Today shows *every* active goal | Today shows *only goals practiced today*, with time per goal |
| Day minutes stored in `days{}`; per-goal minutes guessed by splitting a day evenly | Minutes derived from `segments[]`; per-goal minutes exact |
| History day = "goals that existed" + entries | History day = **what was actually practiced**, time per goal |
| Entries (bpm · spots · note · next) via a log sheet | **Notes** (dated, free text) on the goal; **tempo** optionally stamped on a segment from the metronome |
| JSON import / export | removed |
| "+ minutes" prompt (time without the clock) | replaced by **Add time** on the picker (goal + minutes), see §5.4 |
| Routes: `/`, `/goals`, `/goals/:id`, `/history`, `/log` | Routes: `/`, `/goals`, `/goals/:id`, `/history` (picker is an overlay, not a route) |

Removed outright: targets, next-time lines, spots and spot management,
entries and the log sheet, import/export, goal reordering (the library
sorts itself), the "neglected" warning (History answers that honestly).

## 2. Data model (`schemaVersion: 2`)

One document under `ws.logbook.data`, unchanged storage mechanism
(`makeStore("logbook")`, whole-doc save, change listeners). Pure, DOM-free
`js/lib/logbook.js` as today.

```js
{
  schemaVersion: 2,
  goals:    [ Goal ],
  segments: [ Segment ],
  notes:    [ Note ],
  deleted:  [ { id, kind, at } ],     // tombstones, as v1
}

Goal = {
  id, name,
  composer?: string,                  // pieces only, optional (WSHED-60): shown as "Bach – Prelude in C"
  type:   "piece" | "technique" | "other",
  status: "active" | "finished" | "shelved",
  kind:   "user" | "builtin",          // builtin: "sightsinging"
  createdAt, updatedAt, finishedAt: null | ms,
}

Segment = {
  id, goalId,
  startedAt: ms,
  endedAt:   ms | null,                // null ⇒ this is the running segment (at most one)
  bpm:       null | number,            // optional tempo stamped from the metronome
  auto:      null | { source, label }, // written by another tool (sight singing)
}

Note = { id, goalId, body, createdAt }
```

**Decisions baked in:**

- **Notes are a top-level array**, not nested in the goal, so every
  collection is queried the same way (`where goalId = …`) and deleting a goal
  is one filter per array. Leif's sketch had `goal.notes[]`; same shape to the
  UI, simpler storage.
- **The running segment is a segment with `endedAt: null`.** No separate
  `clock` object. Reload, close the tab, come back tomorrow: the segment is
  still running and Today shows it. At most one may be open; `start` on an
  already-running doc is a `switch`.
- **Seconds are stored, minutes are displayed.** No rounding in storage.
- **Segments under 10 s are dropped** on stop/switch (an accidental double
  tap should not create a 3-second "Scales" row). Anything ≥ 10 s is kept.
- **Days are derived by clipping.** `minutesOn(day)` = Σ over segments of the
  overlap between `[startedAt, endedAt ?? now]` and `[dayStart, dayStart+24h)`.
  A segment that runs across midnight is credited to both days honestly.
  Streak and calendar use this. `practicedOn(day)` = `minutesOn(day) ≥ 1`.
- **Goal type is organisational only.** Same data model for all three; type
  drives colour, glyph, grouping and the picker's sections.

### 2.1 `js/lib/logbook.js` API

```js
// goals
goals({ status = "active", type, q, sort = "recent" })  // library query: filter + search + sort
goal(id) · addGoal({ name, type }) · renameGoal(id, name) · retypeGoal(id, type)
finishGoal · shelveGoal · reactivateGoal · deleteGoal      // delete cascades segments + notes → tombstones

// practice (the timer)
running()                  // → { segment, goal, elapsedMs } | null
start(goalId)              // opens a segment; if one is running this is switchTo
switchTo(goalId)           // closes the running segment (drop if < 10 s), opens a new one
stop()                     // closes the running segment → returns the closed segment (or null if dropped)
stampTempo(bpm)            // sets bpm on the running segment (metronome round trip)
addTime({ goalId, minutes, endedAt = now }) // manual segment ending at `endedAt` (§5.4)
deleteSegment(id)

// notes
notes(goalId) · addNote(goalId, body) · deleteNote(id)

// sight singing
addAuto({ source, label, startedAt, endedAt })   // §7

// read models (all derived from segments)
today() · dayKey(ms) · minutesOn(key) · practicedOn(key)
practicedOn(key)           // boolean
dayReport(key)             // { minutes, goals: [{ goal, minutes, segments[] }] }  ← Today + History day view
metrics.streak() · metrics.weekStrip() · metrics.month(y, m) · metrics.minutesBetween(a, b)
metrics.goalStats(id)      // { minutes, days, lastPracticedAt, avgSessionMin, thisWeekMin, thisMonthMin, bestBpm, lastBpm }
metrics.tempoSeries(id)    // [{ at, bpm }] from segments with bpm
metrics.monthByGoal(y, m)  // [{ goal, minutes }] sorted desc  ← History month roll-up
```

`sort` options for the library: `recent` (last practiced desc, never-practiced
last, then created desc) · `name` · `created` · `time` (lifetime minutes) ·
`week` · `month`.

### 2.2 Migration v1 → v2 (runs once in `migrate()`)

Leif is the only user and has a few days of alpha data; the migration is
lossless where it can be and honest where it can't:

| v1 | v2 |
|---|---|
| `goal.title` | `goal.name` |
| user goal | `type: "piece"` (retype from the goal page; a technique/other guess would be wrong more often than right) |
| builtin `sightsinging` | `type: "other"`, name "Sight singing" |
| `goal.target` | Note `target: <target>` dated `createdAt` |
| `goal.next` | Note `next time: <next>` dated `updatedAt` |
| `goal.spots[]` | one Note `spots: mm. 5–8 consistency · arpeggio m. 11 (fixed Aug 28)` dated `createdAt` |
| `entry` with bpm / note / spots | Note on that goal dated `entry.at`: `♩ 112 · mm. 5–8 · "clean 4/5 runs"` |
| `entry.auto` (sight singing) | Note on the Sight singing goal with the label |
| `days[key].minutes` | one Segment per day on a new builtin goal **"Free practice"** (`type: "other"`, `kind: "builtin"`), `startedAt = dayStart + 12:00`, `endedAt = + minutes` |
| `clock` (if running at upgrade) | a running Segment on "Free practice" |
| `deleted[]` | carried over |

Consequences to accept: streak and month totals survive; per-goal minutes
for pre-v2 days show under "Free practice", not the real goal (v1 never knew).
Days that had entries but zero clock minutes stop counting as practiced.
Tempo history migrates as notes, so v1 sparklines are lost; v2 sparklines
start from the first stamped segment.

## 3. Screens

`#/logbook` opens on **Today**. The segmented strip stays: today · goals ·
history. The **goal picker** (§4) is an overlay reachable from Today's Play
and Switch, and from the shell chip.

### 3.1 Today — "what am I working on, and what have I done"

```
 today · goals · history                        Thu 4 Sep
 ┌─────────────────────────────────────────────────────┐
 │  ● PIECE                                            │
 │  Pathétique Sonata — 1st mvt        ← active goal   │
 │  27:14                              ← Fraunces      │
 │  today on this goal 57m                             │
 │  last note · yesterday                    + note    │
 │  "Work mm. 93–108 slowly. LH jumps weak."           │
 │        ( ■ stop )    [ ⇄ switch ]                   │
 └─────────────────────────────────────────────────────┘
 ○ ○ ● ● ○ ● ●   streak 4 days           1h 30m today

 ── practiced today ──────────────────────────────────
   ● Pathétique Sonata — 1st mvt          57m  ◂ live
   ▲ Scales                               33m
   ◆ Sight singing · Book 2 L3 ★★         12m  auto
```

- **Idle hero:** a big brass **▶ play** and the day's total (or *"start
  practicing"*). Tapping play opens the picker; choosing a goal starts the
  clock and the goal name **whooshes** into the hero (§6).
- **Running hero:** goal type dot + name, elapsed on *this segment*, **stop**
  and **switch**. Tapping the goal name opens its page (notes) without
  stopping. A tiny "today on this goal: 57m" line under the elapsed.
- **Last note, unobtrusively.** Under the elapsed, in italic ivory-dim:
  *Last note · yesterday — "Work mm. 93–108 slowly. LH jumps were the weak
  point."* (first 2 lines, tap to expand / open the goal page). Beside it a
  small **+ note** that opens the quick-note sheet for the active goal, so the
  observation can be written the moment it happens, without leaving the
  clock. If the goal has no notes yet the line reads *no notes yet — + note*.
  This is the whole "next time" mechanism.
- **Practiced today:** one row per goal with segments today, sorted by
  minutes desc, the active one ticking live. Tap → goal page. Long-press →
  "add note" quick sheet (§3.3). No rows → the empty state is the play button
  and one sentence: *"Press play and say what you're working on."*
- **+ Goal** lives on the Goals tab and inside the picker; not on Today.
  Today is a record, not a list to manage.

### 3.2 Goals — the practice library

```
 today · goals · history
 [ search goals…                      ]  (+ goal)
 ( all ) ( ● piece ) ( ▲ technique ) ( ◆ other )     sort: recent ▾
 ── active ───────────────────────────────────────────
   ● Pathétique Sonata — 1st mvt    2h 10m · today
   ▲ Scales                         1h 05m · yesterday
   ● Bach Invention No. 8           40m · 6d ago
   ◆ Sight reading                  — · never
 ▸ finished · 2        ▸ shelved · 1
```

- **Search** matches name (substring, accent-insensitive). Typing narrows all
  sections. **Type chips** filter. **Sort** per §2.1. Filter/sort state
  remembered in `ws.logbook.library` (not in the doc).
- **Rows:** type glyph in its colour · name · lifetime minutes · last
  practiced. Tap → goal page.
- **+ Goal** → the two-step creation flow (§4.2), inline as a sheet.
- Finished / shelved collapse under `<details>` as today.

### 3.3 Goal page — identity, stats, notes

```
 ←  active                                       ● PIECE ▾
 Pathétique Sonata — 1st mvt                    (tap to rename)
 Beethoven                                       (composer, pieces only — tap to edit)
 2h 10m lifetime · 5 days · avg 26m · last today · ♩ best 112
 ▂▃▅▆ tempo (only if any segment has a bpm)
 ( ▶ practice this )   [ finish ] [ shelve ]

 ── notes ────────────────────────────────────────────
 [ add a note — fingering, a spot, what to do next…  ]  (⏎ saves)
 Sep 4   mm. 51–66 still unstable. RH octave entry is late.
 Sep 6   Fixed fingering in 54–57. Dotted rhythms tomorrow.
 Sep 9   Much cleaner. Transition into development weakest.
 ── practice · 10 of 153 days ────────────────────────
 Sep 4   27m · 30m
 Sep 3   40m
 …
              [ show 10 more · 133 left ]          (WSHED-61: every day, ten at a time)
```

- Notes are **append-only, newest first**, dated, one line or many
  (`textarea`, Enter saves, Shift+Enter newline). Long-press → delete.
  No editing: correct by adding (same rule as kbRelay timelines; keeps the
  thread honest and the code small).
- **▶ practice this** starts (or switches to) this goal and jumps to Today —
  the third way into a segment besides Play and Switch.
- Rename inline; retype via the type badge; delete under a `…` menu with the
  same confirm as today (cascade count in the prompt).
- **Composer** (WSHED-60) is a piece's second line: set in the creation sheet
  (*name*, then *composer (optional)*), edited inline here like the name. One
  `displayName(goal)` — `"Bach – Prelude in C"`, or just the name — is used
  everywhere a goal is named; search matches it; the *name* sort orders by it
  so a composer's works sit together. The field rides in the sync envelope
  body like any other.
- **Practice record** (WSHED-61): every segment grouped by day, newest first,
  ten days at a time behind *show more* — a piece practiced daily for years
  stays readable.

### 3.4 History — truthful reconstruction

```
 ◀  September 2026  ▶
   M  T  W  T  F  S  S     ⓘ    (dot colour + size = the day's band; brass corner = new best tempo)
 12 days · 17h 20m · streak 4
 ── Thu 4 Sep · 1h 30m ───────────────────────────────
   ● Pathétique Sonata — 1st mvt      30m
   ▲ Scales                            1h
 ── this month by goal ───────────────────────────────
   ● Pathétique Sonata — 1st mvt   4h 10m  ████████
   ▲ Scales                        3h 15m  ██████
   ◆ Sight reading                 2h      ████
```

- Calendar as today (Monday-first). Each practiced day is coloured by its
  **band** — the daily total against what the practice and injury literature
  calls healthy: *touched* < 15 min · *okay* 15–45 · *good* 45 min–2 h ·
  *sweet spot* 2–4 h (gold) · *diminishing* 4–6 h (amber) · *too much* ≥ 6 h
  (ember, smaller). Dot size is fixed per band and peaks at the sweet spot;
  nothing is ever coloured for beating yesterday (WSHED-59 replaced the
  "personal-best day" gold, which had no ceiling). A **brass corner** marks a
  new best bpm on a goal. A circled-i at the bottom right of the grid opens
  the key as a sheet — no inline legend.
- Selecting a day shows `dayReport(key)`: goals + minutes, tap → goal page.
- Below: **month by goal** bars from `monthByGoal`. The per-goal sparklines
  move to the goal page (they belong to the goal, not the month).

A **detailed analytics** button closes the screen (WSHED-63, §3.5).

### 3.5 Analytics — how you spend your practice time (WSHED-63)

`#/logbook/history/analytics`, reached from the bottom of History; the back
chevron returns. Everything is computed client-side by the pure
`js/lib/analytics.js` (`resolveRange` → `analyze(doc, range + focus)`) and
drawn by hand-rolled SVG in `js/tools/logbook/charts.js` — no chart library.

- **Range** chips *7d · 30d · 90d · 1y · all · custom* (two date inputs);
  the choice persists (`makeStore("logbook").analytics`). Segments are clipped
  to `[from, to)`; the running one counts to now.
- **Focus**: tapping a type, a composer or a work narrows every view to it —
  a chip names the focus, × clears it, a focused work offers *open goal*.
- **Views**: headline cards (total with % vs the previous period of the same
  length, days practiced / days elapsed, per practiced day, sessions with
  average + median, longest streak) · time per day/week/month (unit picked by
  range length; daily bars carry the §3.4 band colour; tap a bar to read it)
  · by type donut · by composer (pieces only, *no composer* bucket, share of
  piece time) · by work (top 10, *show all*) · time of day (24 bins) · day of
  the week · session length buckets · days by band (stacked bar).
- Phone: one column. ≥ 52rem: two columns, time/works full width.

## 4. The goal picker — "What are you working on?"

The centre of the redesign. One component, used for **Play**, **Switch**,
the shell chip, and **Add time**.

```
 ┌───────────────────────────────────────────────────┐
 │ What are you working on?                      ✕   │
 │ [ search or type a new goal…              ]       │
 │ recent                                            │
 │   ● Pathétique Sonata — 1st mvt   today · 57m     │
 │   ▲ Scales                        yesterday       │
 │   ◆ Sight reading                 3d ago          │
 │ pieces                                            │
 │   ● Bach Invention No. 8          6d ago          │
 │ technique                                         │
 │   ▲ Arpeggios                     never           │
 │ ─────────────────────────────────────────────────│
 │   + new goal                                      │
 └───────────────────────────────────────────────────┘
```

- **A bottom sheet on phones, a centred card on desktop.** Slides up over
  Today; Today stays visible and dimmed behind it, so the user never loses
  the sense of "I'm on the practice screen".
- **Recent first** (last 5 by last-practiced), then active goals grouped by
  type. Finished/shelved goals are searchable but not listed by default (a
  "show finished" toggle at the bottom); picking one reactivates it.
- **Search-to-create:** typing narrows the list; when nothing matches (or
  always, as the last row) the first row becomes **"+ new goal ‘Scales’"**.
  Enter on that row jumps to the type step with the name pre-filled. This is
  the "creating a goal is cheaper than avoiding it" path: *type name → Enter
  → tap a type → practicing*, three actions.
- **Switch** uses the same sheet with the running goal marked and excluded
  from "recent".
- **Focus:** on desktop the search input autofocuses; on touch it does not
  (the keyboard would cover the recent list, which is the 80 % path) — a tap
  on the field brings the keyboard.
- Escape / ✕ / tap-outside close it. Not a route; no history entry.

### 4.2 Creating a goal — two steps, one screen

```
 ┌───────────────────────────────────────────────────┐
 │ new goal                                      ✕   │
 │   ( ● piece )  ( ▲ technique )  ( ◆ other )       │
 │   Pathétique Sonata, Bach Invention, Clair de lune│  ← examples change per type
 │ [ name                                     ]      │
 │                  ( create )                       │
 └───────────────────────────────────────────────────┘
```

Type chips first (default **piece**, since most goals are), name below,
Enter creates. If the flow was entered from the picker the new goal becomes
the active one immediately (start or switch) and the sheet closes with the
whoosh; from the Goals tab it drops into the library with the stamp (§6).
No other fields, ever.

## 5. Practice flow — the state machine

```
 idle ──play──▶ picker ──choose g──▶ running(g)
 running(g) ──switch──▶ picker ──choose h──▶ running(h)   [segment g closed, h opened]
 running(g) ──stop────▶ idle                              [segment g closed]
 running(g) ──"practice this" on goal page h──▶ running(h)
 any ──add time (goal + minutes)──▶ same state, one closed segment appended
```

Rules:
1. At most one running segment. `start` while running == `switchTo`.
2. Closing a segment shorter than 10 s discards it (tombstone not needed —
   it was never shown).
3. The running segment survives reload, tool switches, and days; the shell
   chip (§8) shows it everywhere.
4. Stop shows a brief toast: *"57m on Pathétique"* (felt-red tick) and the
   Today row settles into place.
5. **5.4 Add time** (forgot to press play): from the picker's `…` or a
   long-press on Play: goal + minutes stepper (15/30/45/60 quick chips),
   creates a closed segment ending now. This replaces v1's "+ minutes"
   prompt and keeps the invariant that all time has a goal. Cut it if it
   feels like fluff after a week; the data model does not depend on it.

## 6. Flourishes — satisfying selections

Woodshed's motion vocabulary today: the **pendulum** (phase-locked), the
**stamp** (sight-singing stars: scale 2.4 → 1 with overshoot, 0.5 s), the
**note pop**, the **breathe** pulse, the **session chip pulse**. v2 adds two
moves and reuses the rest. All respect `prefers-reduced-motion` (fall back to
opacity only) and use `navigator.vibrate?.(10)` where available.

| Moment | Move | Feel |
|---|---|---|
| Goal chosen in the picker (Play or Switch) | **whoosh**: the chosen row lifts, the sheet drops away, the goal name lands in the hero via a FLIP transition (~380 ms, `cubic-bezier(0.2, 0.9, 0.3, 1.1)`); the elapsed numeral fades in from 0:00; the brass play button crossfades to stop | "I picked it up and put it on the stand" |
| Goal created (from the library) | **stamp** on the new row, brass glow 600 ms | teacher's sticker |
| Goal created (from the picker) | stamp *then* whoosh, chained | earned + started |
| Stop | felt-red tick on the row, elapsed numeral settles into the row's minutes (count-down morph, 300 ms), toast | closing the book for now |
| Switch | old row's live dot stops; new row appears with a short stamp | page turn |
| Row tick (running) | minutes text updates once a minute, the type dot **breathes** on the active row | alive, not busy |
| Day dot fills (first minute of the day) | the week-strip dot fills with the brass glow | "today counts" |
| Note saved | the new note slides in at the top (120 ms), input clears | fast, quiet |
| Best-tempo day in History | brass corner on the calendar dot | progress on a piece, not hours |

Sound: **none** by default. The metronome owns audio; a practice tracker that
clicks is a nuisance next to a piano. (A future "tick on start" setting can
reuse the metronome's wood voice.)

### 6.1 Ceremonies — the two moments that stop you (WSHED-47, 2026-09-04)

Leif's brief: the start and stop flourishes should be *pronounced, even
momentarily blocking, so we can enjoy their full effect* — "practice engaged"
on choosing a goal, "you worked toward a goal for a length of time" on stop.
No infantilising copy; excitement is carried by feel. `js/tools/logbook/ceremony.js`.

Both are full-screen ebony curtains on `body` that swallow input, auto-dismiss,
and — after a minimum hold — dismiss on tap / Esc / Enter. Silent. Palette only.

| Ceremony | When | What happens | Timing | Haptic |
|---|---|---|---|---|
| **Engage** | after the picker closes on Play (Today hero, metronome "practice", goal page "practice this") | curtain; a brass ring ripples out from the centre like a downbeat (a second, thinner ring 140 ms behind); the type label, then the goal name in large italic Fraunces, then `0:00` in brass rise in sequence. On exit the name **whooshes** down onto the running hero so the moment lands on the clock | 1.1 s, tap-through after 0.4 s | `[18, 60, 36]` |
| **Bow** | after Stop, when the segment is kept (≥ 10 s) | a brass bloom behind a huge serif numeral that **counts up** to the duration (`27min`, `1h 02m`, `40s`, ease-out so the last digits slow); **brass shavings** — 24…120 canvas particles, count scaling with minutes — burst upward from the numeral and settle under gravity; beneath: *on ‹goal›* and *today on this goal · streak*. A quiet "tap to continue" appears only if you linger past 1 s. On exit the numeral **settles** into the goal's row, which ticks felt-red | 2.2 s, tap-through after 0.6 s | `[30, 50, 30, 50, 90]` |

Not ceremonies, on purpose: **Switch** (mid-practice; the page-turn whoosh
stays), **add time** (bookkeeping, stamp + toast), and a stop under 10 s
(toast "not kept"). Reduced motion: both curtains are static, shorter
(0.5 s / 1.2 s), no rings, bloom or particles.

## 7. Seams into the rest of Woodshed

- **Shell chip** (`js/app.js`): shows `● 27:14 · Pathétique` (type dot,
  elapsed, truncated name) on every tool; tap → Today. When idle, the chip is
  hidden as today. The chip is where you *see* that time is being attributed
  while you're in the metronome.
- **Metronome** (`js/tools/metronome/ui.js`): the v1 "log" button becomes
  **♩ stamp** — visible only while a segment is running; one tap calls
  `stampTempo(bpm)` and toasts *"♩ 112 → Pathétique"*. Last stamp wins for the
  segment. When idle, the button reads **practice** and opens the picker
  (starting a segment without leaving the metronome). Goal page tempo links
  (`#/metronome?bpm=…`) stay.
- **Sight singing** (`js/tools/sightsinging/ui.js`): on lesson / challenge
  summary, `addAuto({ source, label, startedAt, endedAt })` with the run's
  real span (the runner knows when the count-in began). Rule: **if a user
  segment is running, the result becomes a Note on the running goal** (you
  chose "Sight reading" and went sight singing — don't double count); **if
  nothing is running, it becomes an `auto` segment on the builtin "Sight
  singing" goal**. Either way Today shows it.
- **Registry / nav**: unchanged. Glyph stays the pencil.

## 8. Ergonomics

- **One thumb at the piano.** Play/stop/switch sit in the lower half of the
  hero on phones; the picker is a bottom sheet with recent goals nearest the
  thumb. Tap targets ≥ 48 px. Nothing critical hides behind a long-press
  (long-press is only shortcuts: quick note, add time, delete note).
- **Three actions to be practicing from cold**: play → tap goal. Or with a
  new goal: type name → Enter → tap type. Measured in the E2E checklist.
- **Keyboard on desktop:** `/` focuses library search; in the picker ↑↓
  moves, Enter picks, Esc closes; on the goal page Enter saves a note.
- **No confirm dialogs on the happy path.** Confirms only on delete goal and
  delete segment. Stop and Switch never ask.
- **Copy in register:** *play · stop · switch · practice this · new goal ·
  note*. No "session", no "timer" in the UI text (the clock is implied).
- **Colour:** piece = `--brass`, technique = `--ivory-dim`, other = `--sage`
  (an existing token). Glyphs: ● ▲ ◆ so type is legible without colour.

## 9. Tests & verification

`tests/logbook.test.mjs` is rewritten for v2 (in-memory store, fake clock):

- start / switch / stop open and close segments; a second `start` switches;
  `< 10 s` segments are dropped.
- `minutesOn` clips across midnight (a 23:50 → 00:20 segment credits 10 + 20).
- `dayReport` groups by goal, sorts by minutes, includes the running segment
  live.
- `goalStats` (minutes, days, avg, week/month windows, last practiced).
- streak with a fresh morning; gold days.
- `goals()` search / type filter / every sort.
- notes: add, order, delete, cascade on goal delete.
- `addAuto` both branches (running goal → note; idle → auto segment).
- **migration fixture**: a captured v1 doc → v2 with the table in §2.2 held
  exactly (goal count, notes text, free-practice segments per day, running
  clock carried).
- `stampTempo` sets bpm on the running segment only.

Manual E2E checklist (phone + desktop, attached to the test ticket): cold
start → play → new goal via search → switch → stop → Today totals → History
day → goal page notes → metronome stamp → sight-singing auto entry (both
branches) → reload with a running segment → offline.

## 10. Delivery slices → tickets

| # | Slice | Ticket |
|---|---|---|
| 0 | Design questions closed: picker rendering, flourishes, ergonomics (this doc §4, §6, §8) | three design tickets |
| 1 | Data layer v2: schema, migration, segments/notes API, metrics; remove import/export; tests | implement · data layer |
| 2 | Goal library: types, two-step creation, search/filter/sort, goal page (rename/retype/status/stats) | implement · library |
| 3 | Practice flow: hero, picker, start/switch/stop, add time, shell chip with goal | implement · timer + picker |
| 4 | Notes thread on the goal page + quick note from Today | implement · notes |
| 5 | Today + History derived views, month-by-goal, gold days | implement · Today/History |
| 6 | Seams: metronome stamp, sight-singing auto branches | implement · seams |
| 7 | Flourishes pass (whoosh, stamp, settle, reduced-motion, haptics) | implement · flourishes |
| 8 | Test + QA: unit suite, migration fixture, manual E2E on phone | test |
| 9 | Land: `sw.js` cache `woodshed-v10`, docs (this file → approved; DESIGN.md §7 pointer), PR, deploy | land |

Order: 1 → 2 → 3 → 5 → 4 → 6 → 7 → 8 → 9. Slices 2 and 3 can overlap once 1
has merged. Each slice is a PR to `main`, deployed at the end (Cloudflare
Pages, `wrangler pages deploy . --project-name woodshed`).

## 11. Decisions (open questions closed 2026-09-04)

Leif delegated these; decided for the smallest honest implementation.

1. **Default type on migration: `piece`** for every v1 user goal. Retyping is
   one tap on the goal page; guessing "technique" from a title would be wrong
   more often than right.
2. **Add time ships in slice 3, minimal**: long-press play → picker → minutes
   chips (15/30/45/60) → done. It preserves the "all time has a goal"
   invariant for the forgot-to-press-play case and is ~40 lines. Revisit
   after a week of use; the model does not depend on it.
3. **Notes are append-only, deletable** (long-press → delete, confirm). No
   edit. Correct by adding; the thread stays an honest record and the code
   stays small.
4. **Type colour: glyph + colour, one new token.** piece = `--brass` ●,
   technique = `--ivory-dim` ▲, other = `--sage` ◆ (existing token `#8fae82`; no new colour needed).
   Colour is never the only signal.
5. **Last note on the hero** (Leif's addition, §0.1 / §3.1): ships in slice 3
   with a **+ note** affordance; the quick-note sheet (slice 4) is shared.
6. **Sound: none.** Haptics only.
