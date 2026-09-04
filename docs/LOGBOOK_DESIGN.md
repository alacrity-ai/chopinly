# Woodshed — Logbook (practice log) design

> **Superseded (2026-09-04)** by Logbook v2 — see [`LOGBOOK_V2_DESIGN.md`](LOGBOOK_V2_DESIGN.md) and [`LOGBOOK_V2_IMPLEMENTATION.md`](LOGBOOK_V2_IMPLEMENTATION.md). Kept for the record of what v1 was and why it changed.

**Status:** approved 2026-08-30 (WSHED-23 epic). Technical plan in [`LOGBOOK_IMPLEMENTATION.md`](LOGBOOK_IMPLEMENTATION.md).
**Working name:** **Logbook** (nav label "Logbook", glyph: a pencil). It's the
notebook a teacher writes assignments in, kept by you. "Journal" implies
prose; "tracker" implies a dashboard. A logbook is terse entries, dated, that
add up to a record — exactly the depth we want.

---

## 0. The one-sentence brief

> Know what to practice today, write down what you did in under ten seconds,
> and be able to see — honestly — whether it's moving.

Everything below is measured against that. If a feature doesn't serve one of
those three clauses (*today* / *record it fast* / *is it moving*), it's out.

## 1. How practice is actually shaped (the model)

From how you described it, practice has exactly two levels and one clock:

| Thing | What it is | Examples | In-register name |
|---|---|---|---|
| **Goal** | The piece or skill you're working toward. Lives for weeks–months. | "Two-handed scales to 140", "Chopin Op. 10 No. 1", "Pathétique I" | **Goal** |
| **Spot** | A named trouble spot *inside* a goal. Lives for days–weeks. Either it's fixed or it isn't. | "mm. 5–8 consistency", "arpeggio m. 11", "LH voicing in the development" | **Spot** (pianists already say "trouble spots") |
| **Session** | One sitting at the piano. Has a date, a length, and a handful of entries: *which goals I touched, what I did, at what tempo.* | "Tue · 42 min · scales @128, Chopin mm. 5–8 slow, Pathétique run-through" | **Session** |

Two levels, no deeper. No sub-spots, no tags, no categories, no projects. A
goal can have zero spots (scales) or several (an étude). That's the whole
schema, and the UI never asks for more than that.

**One metric: tempo.** The only number the Logbook ever asks for is BPM,
and it's optional. Tempo is the universal, honest progress number in piano
practice ("I got mm. 5–8 to 112 today"), it's what the goal *target* is
usually stated in, and — crucially — the app already owns a metronome, so
the number is usually already on screen. Minutes are captured by the session
clock, never typed. Nothing else is measured. No mood, no 1–5 ratings, no
"quality" sliders — those are what make practice apps feel like homework.

Each goal also carries one short **"next time"** line. That's the goal-setting
half of the loop: at the end of a session you jot *what to do next* for the
goal ("start mm. 9–12, keep 5–8 at 100"), and it's the first thing you see the
next day. It replaces schedules, plans, and reminders with the thing a good
teacher actually writes in the book.

## 2. The three screens

`#/logbook` opens on **Today**. Two more screens, **Goals** and **History**,
are a tap away. That's it.

### 2a. Today — "what am I practicing, and what did I just do"

```
 Logbook                              Tue 30 Aug
 ● 23:14   session running          ◦ ◦ ● ● ◦ ● ●   ← week strip
                                     streak 4 days
 ── Today's goals ─────────────────────────────────
 ┌ Two-handed scales ─────────────── last 128 · 2d ┐
 │ next: C♯ and F♯ minor harmonic @124             │
 │                          [ log ]  [ ♩ 128 ]     │
 └─────────────────────────────────────────────────┘
 ┌ Chopin Op. 10 No. 1 ──────────── last 96 · today ┐
 │ next: mm. 5–8 at 100, then add m. 9             │
 │ spots: ○ mm. 5–8 consistency  ○ arpeggio m. 11  │
 │                          [ log ]  [ ♩ 96 ]      │
 └─────────────────────────────────────────────────┘
 ┌ Pathétique I ────────────────── last — · 9d ⚠ ┐
 │ next: —                                         │
 └─────────────────────────────────────────────────┘
 ── Logged today ───────────────────────────────────
   Chopin · mm. 5–8 @ 96 · "clean 4/5 runs"
   Sight singing · Book 2 Lesson 3 · ★★          (auto)
```

- **Session clock** at the top: one tap starts it, one tap ends it. It lives
  in the shell (see §4), so you can start it here, go use the metronome for
  half an hour, and come back — the clock kept running. Sessions can also be
  logged *without* the clock: "I practiced 30 minutes" + a duration picker,
  for the days you forgot to press start. The clock is a convenience, not a
  gate.
- **Goal cards** show three things and only three: the **"next time"** line,
  the **last tempo + how long ago**, and open **spots** as tap-to-tick
  circles. A goal untouched for 7+ days gets a quiet felt-red ⚠ — the one
  nudge the app makes, and the honest one ("you've been avoiding the
  Beethoven").
- **[ log ]** is the whole product. It opens a one-card sheet:

  ```
  Chopin Op. 10 No. 1
  ♩  [ − ]  100  [ + ]      ← prefilled from the metronome if it's set,
                               else the goal's last tempo
  spots worked:  ☑ mm. 5–8   ☐ arpeggio m. 11      ← tap = worked on it;
                                                       long-press = fixed ✓
  note  ___________________________ (optional, one line)
  next time  ______________________ (optional, replaces the goal's line)
                                            [ save ]
  ```

  Fastest path: tap **log**, tap **save** — two taps, records "touched
  Chopin at 100" with a timestamp. Everything else on the sheet is optional.
  Logging the same goal twice in a session is fine (slow work at 80, then a
  run at 100 → two entries; the goal's "last" is the most recent).

- **[ ♩ 96 ]** jumps to the metronome *already set to that tempo*. That's the
  round trip: Logbook → metronome at the goal's tempo → practice → the
  metronome's "log this" button → back into the Logbook with the tempo you
  actually ended at.
- **Logged today** is the running list for the session, newest first.
  Sight-singing results appear here automatically (§4) marked *(auto)*.

### 2b. Goals — "what am I working toward"

A plain list: **active** goals in the order you drag them (that order is the
Today order — "what's first when I sit down"), then a collapsed **finished**
section, then **shelved**.

Add a goal = one field, the title. Optional second field: **target** (a tempo,
"140", or a plain phrase, "from memory"). That's the whole form.

Inside a goal:

- edit title / target / "next time"
- **spots**: add (one line each), tick as fixed (they move to a struck-through
  "fixed" list with the date — the satisfying part), delete
- **finish** (moves to finished with today's date; the card shows the
  start→finish span: "Chopin Op. 10 No. 1 · 11 weeks · 34 sessions") or
  **shelve** (paused, no judgment, no ⚠) or **delete** (with its entries — a
  confirmation, then gone)

No due dates. A target and a "next time" line are all the planning a goal
gets; dates on goals turn a practice book into a guilt machine.

### 2c. History — "is it moving"

Top: a **month calendar of dots** — a dot for every day with a session, sized
by minutes, gold for days you also finished a spot or set a tempo high-water
mark. The same gold sticker the sight-singing books use, so it reads as one
app. Swipe for previous months. Tapping a day lists its sessions.

Below: **per-goal progress**, one row per goal, tap to expand:

- **tempo line** — a small sparkline of logged BPM over time, with the target
  as a faint line to cross. This is the chart that matters; it's the only
  chart.
- **sessions · minutes · last touched** — three numbers
- **spots** — open vs fixed, with fixed dates ("arpeggio m. 11 · fixed Aug 22")
- the goal's entries, newest first, with notes

Then the **week and month totals** (minutes, sessions, days practiced, streak)
in one quiet line each. No badges, no levels, no "you're in the top 10%."
The streak is shown because it's true and motivating; it's never *rewarded*,
so a broken one costs nothing but the number.

## 3. Metrics — the full list, on purpose

| Metric | Where | Why it earns its place |
|---|---|---|
| Streak (consecutive days with a session) | Today, History | the habit number |
| Week strip (7 dots) | Today | "have I practiced this week?" at a glance |
| Minutes today / this week / this month | Today (today only), History | the effort number; from the clock or typed |
| Last tempo + days since, per goal | Today, Goals, History | the progress *and* the neglect signal in one |
| Tempo over time, per goal | History | the progress chart |
| Sessions count + total minutes, per goal | History | "how much have I actually put into this" |
| Spots open / fixed (+ dates) | Goals, History | the qualitative progress, made countable |
| Goal span (start → finished, sessions) | Goals (finished) | the trophy line |

Nothing else. In particular **no** per-goal timers (you'd have to remember to
switch them, and you won't), **no** accuracy/quality self-ratings, **no**
weekly goals in minutes (the target is musical, not chronological).

## 4. How it ties Woodshed together

This is the part that makes it a Woodshed feature rather than a notes app
bolted onto the side.

1. **The session clock lives in the shell, not the tool.** Start it in the
   Logbook; a small brass dot + elapsed time sits in the navbar on every
   tool. Switching to the metronome or sight singing doesn't end the session
   — practicing *is* using the other tools. Ending it from any screen saves
   the session.
2. **Metronome ↔ Logbook, both directions.** The metronome gets a small
   **"log"** control (visible only when the Logbook has ≥1 active goal): tap →
   the log sheet from §2a, goal picker on top, tempo prefilled with the
   metronome's current BPM. And every tempo shown in the Logbook is a button
   that opens the metronome at that tempo. Tempo is the shared currency.
3. **Sight singing writes to the Logbook by itself.** Finishing a campaign
   lesson or a challenge drill adds an *(auto)* entry to today's session
   ("Sight singing · Book 2 Lesson 3 · ★★" / "Challenge · 5 melodies · 84%"),
   under a built-in, undeletable **Sight singing** goal that appears the
   first time it's used. Ear training counts as practice without typing a
   word, and the History calendar reflects it.
4. **One visual language.** Ebony/ivory/brass/felt, Fraunces numerals for
   tempo and minutes, gold star stickers on the calendar, felt red reserved
   for the single ⚠ neglect mark (as it's reserved for the downbeat in the
   metronome). Entries are set like lines in a ledger, not chat bubbles.
5. **Offline and private like everything else.** Data lives on the device
   (same store the tools use). **Export / import** as a single JSON file from
   the Goals screen, so nothing is trapped and a new phone isn't a reset.
   That is the entire data-portability story for v1.

## 5. Interaction budget (the usability contract)

| Task | Taps | Path |
|---|---|---|
| Start a session | 1 | Today → ● |
| Log that I touched a goal | 2 | log → save |
| Log a goal with tempo + spot | 4 | log → ± tempo → tick spot → save |
| Set what to do next time | 3 | log → next time field → save |
| Add a goal | 3 | Goals → + → title → done |
| Add a spot | 3 | goal → + spot → text → done |
| Mark a spot fixed | 1 | long-press its circle (or tick in the goal) |
| Jump to metronome at a goal's tempo | 1 | ♩ button |
| See if a goal is improving | 2 | History → goal |

If a change to the design pushes any of the first three past their budget,
the change is wrong.

## 6. Explicit non-goals (v1)

- **No reminders / notifications / scheduling.** The "next time" line and
  the ⚠ mark are the nudges. Push notifications would turn it into nagware.
- **No cloud sync or accounts.** Export/import JSON only. (Sync is a v2
  question for the whole app, not this tool.)
- **No repertoire library, composer metadata, sheet-music links, audio
  recordings.** A goal is a title. If you want the score, it's on the stand.
- **No per-goal timers, mood tracking, self-ratings, tags, or folders.**
- **No gamification beyond streak + the calendar's gold days.** The
  sight-singing books already have stars because they *grade* you; the
  Logbook doesn't grade, so it doesn't award.
- **No editing of auto entries** beyond deleting them.

## 6b. Storage posture (decided 2026-08-30)

**v1 = localStorage**, via the shell's existing `ws.<tool>.<key>` store, with
an escape hatch so a later Cloudflare move is a backend swap, not a rewrite:

- The whole Logbook state is **one versioned JSON document**
  (`ws.logbook.data`, `schemaVersion`). Export/import is literally that
  document. Size is a non-issue (years of entries ≈ tens of KB).
- The UI only talks to one small store module (`load / save / export /
  import`); nothing else touches `localStorage`.
- Every record carries a stable `id`, `createdAt`, `updatedAt`, and deletes
  leave tombstones — so a future sync can merge instead of "last device wins".
- Known caveat: localStorage is per-browser and iOS can evict it under
  storage pressure if the PWA sits unused for a long time. Installed PWA +
  occasional export covers v1; that caveat is the honest reason to go cloud
  eventually, not now.

**If Woodshed goes multi-tenant** the landing is a Worker + D1/KV holding the
same document per user, the store module becoming load-from-cloud /
cache-locally / write-through, with identity via the pairing-code or
magic-link pattern already used elsewhere. That is a whole-app decision (the
metronome settings and sight-singing stars would ride the same rail), so it
is out of scope here.

## 7. Open questions — closed 2026-08-30

| Question | Decision |
|---|---|
| Name | **Logbook** |
| Session clock placement | Navbar chip (brass dot + elapsed) on every tool; tap → Logbook |
| `log` control on tuner / pitch pipe | No — metronome only |
| Weekly minutes target | No |
| Delete-goal safety | Plain confirm; export/import is the safety net |

Implementation: [`LOGBOOK_IMPLEMENTATION.md`](LOGBOOK_IMPLEMENTATION.md).

## 8. Suggested delivery slices (for ticketing later, not a technical plan)

1. **Goals + spots + Today/log sheet** — the two-tap log, local storage,
   export/import. Usable on day one.
2. **Session clock in the shell** + minutes/streak/week strip.
3. **History** — calendar, per-goal tempo line, totals.
4. **Metronome ↔ Logbook** round trip (log control + ♩ buttons).
5. **Sight-singing auto entries.**
