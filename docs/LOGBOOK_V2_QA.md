# Logbook v2 — QA record (WSHED-40)

**Run:** 2026-09-04, branch `logbook-v2`, local `python3 -m http.server`,
Playwright + Chromium (phone emulation 420×860 @2x with touch; desktop
1200×800; a reduced-motion context; an offline context after the service
worker installed). Script: the E2E driver attached to WSHED-40. Every step
asserts on DOM text and on `logbook.doc` through the live module, and the
run fails on any `pageerror` or console error.

**Result: 18 / 18 steps green, zero console errors.** Unit suite: 49 / 49
(`npm test`).

| # | Check (plan §9) | Result | Evidence |
|---|---|---|---|
| 1 | Fresh profile → Today empty state → play → picker empty state → type "Scales" ⏎ → technique → running hero, 0:00 ticking | ✓ | `01-today-empty` `02-picker-empty` `03-create-sheet` `04-running-scales` |
| 1b | Shell chip shows `● 0:07 · Scales` on every tool | ✓ | `04-running-scales` (top) |
| 2 | Switch → type "Pathétique Sonata — 1st mvt" ⏎ → piece → hero shows it; Today lists both rows (Scales 30m); total = sum | ✓ | `05-running-pathetique` |
| 2b | + note from the hero → *last note · today* shows the note on the hero | ✓ | `06-hero-with-note` |
| 3 | Stop → toast "1h 02m on Pathétique…", rows settle, chip hides, total 1h 32m | ✓ | `07-stopped` |
| 4 | Goals tab: 2 rows, sort "most practiced" reorders, search "sca" → 1, type chip technique → 1 | ✓ | `08-library` |
| 4b | + goal from the library (other · Sight reading) → 3 rows, stamp | ✓ | — |
| 4c | Goal page: rename ⏎ → persisted; type badge tap → other; note ⏎ → thread; practice list 1 segment; **practice this** → running hero; stop under 10 s → "not kept" | ✓ | `09-goal-page` |
| 5 | History: today's dot; day report = 2 rows matching Today; month-by-goal 2 bars; totals 1h 32m | ✓ | `10-history` |
| 5b | Add time: long-press play → "Add time to…" → Sight reading → 15m → row appears, total 1h 47m | ✓ | — |
| 6 | Metronome: idle label *practice* → picker → start; label becomes *♩ stamp*; tap → bpm on the running segment + toast | ✓ | `11-metronome-stamp` |
| 7 | Sight singing `addAuto`: goal running → note on that goal, no segment; idle → auto segment on Sight singing, `AUTO` tag on Today | ✓ | `12-today-full` |
| 8 | Reload with a running segment → hero + chip restored | ✓ | — |
| 9 | Migration: v1 fixture in `ws.logbook.data` → v2: 4 goals incl. Free practice, 5 Chopin notes in order, running clock carried | ✓ | `13-migrated-goal` `14-migrated-today` |
| 10 | Desktop: picker is a centred card, search autofocused, Esc closes | ✓ | `15-desktop-picker` |
| 11 | Reduced motion: play → create → running → stop with no sheet/whoosh animation | ✓ | `16-reduced-motion` |
| 12 | Offline: cache `woodshed-v10` holds the new modules; offline navigation to Goals + open the creation sheet works | ✓ | `17-offline` |

**Tap counts** (WSHED-32 table) as driven: existing goal → practicing = 2
(play, row); new goal → practicing = 3 (play, name ⏎, type); switch = 2;
stop = 1; note while practicing = 2 (+ note, text ⏎). All match.

**Not covered here:** a physical phone (haptics, real keyboard overlap on the
bottom sheet). That is Leif's production review; the emulated run used touch
events and the phone viewport.

**Bugs found and fixed during the run**
- Creation sheet focused its name field on a 50 ms delay, so a fast
  `name ⏎ ⏎` could miss — focus is now immediate when a name is carried in.
- The today · goals · history strip lost its handlers when a screen
  re-rendered itself (library search, history day click) — now one delegated
  listener on the tool root.
- Goal page actions wrapped unevenly — *practice this* now spans its own row.
