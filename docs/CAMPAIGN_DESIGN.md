# Sight Singing — Campaign & Challenge design

Replaces the v1 "settings strip + random melody" layout with two proper modes,
the way a practice habit actually works: a **campaign** you progress through a
node or two a day, and a **challenge** drill that deals N random melodies at
settings you pick. Duolingo is the reference for the progression psychology;
the visual language stays inside the piano (ivory, brass, felt, gold stars —
the star stickers piano teachers put on finished lessons).

## 1. Screen map

```
#/sightsinging                      landing — choose a mode
#/sightsinging/campaign             the campaign map (books → lessons)
#/sightsinging/challenge            challenge configuration
#/sightsinging/run                  the exercise runner (both modes end up here)
```

Sub-hash routing so the browser back button does the right thing at every
step. The runner is one shared screen; campaign and challenge just hand it a
different playlist + settings + completion contract.

### Landing

Two large cards, side by side (stacked on phones):

- **Campaign** — "Book N, Lesson M" resume line + overall star count
  (e.g. "★ 23/90"). One tap resumes exactly where you left off.
- **Challenge** — "random melodies, your rules" + last drill's result line.

Nothing else. The landing is a fork, not a dashboard.

### Campaign map

Organization: **Books → Lessons → 3 melodies each.** (Stage = Book, Node =
Lesson; books are how piano pedagogy already names progression, so we use
that vocabulary in the UI.)

- 5 books × 6 lessons × 3 melodies = 90 campaign melodies.
- Rendered as a vertical path: each book is a section header (title +
  concept blurb + book progress); its 6 lessons are round medallions on an
  alternating left/right path (CSS only, no canvas). The current lesson
  glows brass; locked lessons are dim ebony; completed lessons show their
  **star stickers**.
- **Stars:** 1★ pass (avg ≥ 70%), 2★ strong (≥ 85%), 3★ gold-sticker
  (≥ 95%). Best-of is kept; replays never lower a score.
- **Unlocking is strictly linear** — finishing lesson n with ≥1★ unlocks
  lesson n+1 (across book boundaries too). No gating puzzles; the point is
  a habit, not a maze.
- Tapping an unlocked lesson shows its 3 melody titles + your best, and a
  **begin** button → runner with those 3 melodies in order.

### Challenge config

One card of controls, then **start drill**:

- **level** — 1 / 2 / 3 / any
- **clefs** — multi-toggle: treble · bass · alto · soprano (≥1 required;
  drill only deals melodies whose clef is toggled on)
- **melodies** — 3 / 5 / 10
- **strictness** — relaxed / standard / strict (campaign always grades at
  **relaxed** — Leif's call after playing v2; strictness is a challenge-only
  dial)
- **click** — on / off

Settings persist per-tool (same `store` mechanism as today). No melody
repeats within one drill.

### Runner (shared)

The v1.2 sing screen, generalized to a playlist:

- Header line: mode context — "Book 2 · Lesson 3 — melody 2 of 3" or
  "challenge — 4 of 10", plus melody meta (key, meter, tempo, clef).
- The staff, pitch lane, live grading, hear-it, start/stop — all unchanged
  from v1.2.
- After each melody: an **interstitial** — score %, tier counts, and
  **next melody** (or **finish**). Auto-advances after ~4s if untouched.
- After the last melody: the **set summary** — per-melody score list, set
  average big in Fraunces, and for campaign: the star award moment
  (stickers stamp on one by one — this is the gamification beat), then
  **back to the map** / **replay lesson**. For challenge: **again** (same
  settings, fresh deal) / **change settings**.
- Quitting mid-set (back / stop + leave): campaign keeps nothing (a lesson
  is one sitting — it's 3 short melodies), challenge just abandons.

## 2. Progress model

`store` (localStorage) keys:

- `campaign` — `{ [lessonId]: { stars, best, at } }`; lessonId is
  `"b1l4"`. Everything else (unlocked, resume point, book progress) is
  derived, never stored.
- `challenge-cfg` — last-used config.
- `challenge-log` — last result line (for the landing card).

No accounts, no sync — same offline-first posture as the rest of Woodshed.

## 3. What happens to the v1 screen

The v1 "settings on top, deal a melody" screen **is** challenge mode now
(config screen first, then the same runner) — it is not kept as a third
mode. The level/strictness strip disappears from the sing screen entirely;
during a run the only controls are start/stop, hear-it, and click toggle.

## 4. Open threads (decided later, not blockers)

- "hear it" before singing is allowed and unpenalized in both modes for
  now; a stricter "true sight-singing" rule (hear-it voids 3★) is a one-line
  change once Leif has a feel for it.
- A daily-streak flame on the landing page — deferred; needs more thought
  on what a "day" means without accounts.
- Campaign lesson content is fixed (not random) so lessons are replayable
  and mastery is real; if that feels stale in practice, node-scoped random
  pools are a melodies.js-level change.
