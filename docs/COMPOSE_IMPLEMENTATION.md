# Chopinly — Compose: implementation plan (WSHED-114)

Companion to [`COMPOSE_DESIGN.md`](COMPOSE_DESIGN.md). Five phases, each its own
ticket, each landing on `main` through the ship loop in
`claude_ops/docs/sops/chopinly-ops.md` and each leaving production usable.
**Phase 0 is the ergonomics gate:** it lands note placement and nothing else, Leif
judges how it feels on the iPad, and phases 1–4 start only after that verdict
(and absorb whatever it changes).

**Repo** `~/lets-get-rich/woodshed`, persona `leifktaylor`, Pages project
`woodshed`, host `chopinly.com`. Branch per phase `WSHED-<n>-compose-<slug>` off
`main`, PR, `gh pr merge --merge`, confirm the merge, `npm run deploy`, poll the
edge, rerun E2E against production, screenshots on the card, hand off to Leif.

## 0. Ground rules

- **No build step, no npm dependencies.** Nothing is vendored until P4 (pdf-lib
  + fontkit, copied files under `vendor/pdflib/`). `node --test` for the pure
  layer.
- **Every new module goes into `sw.js` `SHELL[]`** (`tests/sw.test.mjs`
  enforces `js/`; P4 extends it to `vendor/pdflib/`). Bump `CACHE` in `sw.js`
  and `VERSION` in `js/version.js` on every shipped phase.
- **The data layer never touches the DOM.** `js/lib/compose/*` is pure and
  unit-tested; `js/tools/compose/*` is the UI.
- **The engine owns the invariants.** No UI code writes into `measures` — every
  edit is an `engine.js` call that returns a new document or throws a `Nudge`.
- **The merge rule stays in `js/lib/merge.js`**, imported by both sides. The new
  kind and its body cap are added there and nowhere else (P3).
- **The sight-singing staff does not change behaviour.** Extracting the glyph
  table into `js/lib/staff/glyphs.js` is a pure move; `tests/staff.test.mjs`
  and the sight-singing E2E stay green.
- **Copy in register.** *composition*, *bar*, *place*, *arm*, *Select*,
  *Pan*. Not *document*, *canvas*, *object*, *insert mode*.
- **No half-measure fallbacks.** A layout that cannot fit, an export that cannot
  embed the font, a bar that does not add up — all visible failures, never
  quietly degraded.

## 1. File plan (whole epic)

```
js/lib/staff/glyphs.js              P0   Bravura codepoints (moved out of staff/render.js, extended)
js/lib/compose/ticks.js             P0   PPQ, ticks(), capacity(), beatGroups(), splitRest(), grid()
js/lib/compose/model.js             P0   newComposition(), ids, validate(), clone()
js/lib/compose/engine.js            P0   place · remove · appendBar · trimBars · normalize; P1 the editing ops; P2 key/time/clef + marks; P3 dyn/hairpin/text
js/lib/compose/history.js           P0   snapshot undo / redo
js/lib/compose/layout.js            P0   grand staff, columns, heads, stems, beams (single level), rests, ledgers, brace, barlines; P1 chords, ties, tuplets, dots, accidentals; P2 mid-piece changes, articulations, gliss; P3 hairpins, dynamics, text
js/lib/compose/hit.js               P0   point → slot / step; point → thing
js/lib/compose/render.js            P0   layout → SVG; selection classes; ghost overlay
js/lib/compose/sound.js             P0   audition on the piano voice
js/lib/compose/export/pdf.js        P4   vector PDF via vendored pdf-lib
js/lib/compose/export/musicxml.js   P4   MusicXML 4.0 serialiser
js/tools/compose/index.js           P0   { id: "compose", name: "Compose", category: "library" }
js/tools/compose/ui.js              P0   router list ↔ editor
js/tools/compose/list.js            P0   new / open / rename / delete; P3 search, goal link
js/tools/compose/editor.js          P0   modes, pointer policy, ghost, selection (single), keys, save; P1 multi-select + drag
js/tools/compose/rails.js           P0   control + palette rails; P1 dot / tie / tuplet / accidentals wired; drop-down host
js/tools/compose/utility.js         P2   key / time / clef pickers; articulations; ornaments; glissando
js/tools/compose/expression.js      P3   dynamics, hairpins, text
js/tools/compose/exportsheet.js     P4   page size, staff size, margins, preview, save / add to Scores
js/lib/logbook.js                   P0   compositions[] + CRUD (local); P3 kind `composition`, goal cascade, placeForGoal
js/lib/merge.js                     P3   KINDS + composition; BODY_CAPS.composition = 262144
functions/lib/sync.js               P3   (no change expected — caps come from merge.js; verify)
js/tools/logbook/picker.js          P3   `composition` mode (link a goal)
js/tools/logbook/ui.js              P3   goal page: composition row; Today hero "open composition"
js/ui/account.js                    P3   export includes compositions
js/registry.js                      P0   + compose after scores
css/app.css                         P0→  .cp-* rails, score, selection, ghost, nudge flash
sw.js                               P0→  SHELL[] + every new file; P4 vendor/pdflib/*
vendor/pdflib/                      P4   pdf-lib.esm.js · fontkit.esm.js · LICENSE · VERSION
dev/vendor-pdflib.mjs               P4   fetch pinned tarballs, copy the ESM builds (run once per bump)
fonts/Bravura.otf                   P4   export-time font (OFL; licence already shipped)
tests/compose-ticks.test.mjs        P0
tests/compose-engine.test.mjs       P0→  grows each phase; fuzz of invariants
tests/compose-layout.test.mjs       P0→
tests/compose-hit.test.mjs          P0
tests/compose-export.test.mjs       P4   MusicXML golden files; PDF has N pages + embedded fonts
tests/e2e/compose.mjs               P0→  grows each phase
docs/COMPOSE_QA.md                  P4   the iPad checklist Leif runs
README.md, content/tools/compose.md P4   the public story (tool page for the crawl surface)
```

## Phase 0 — placement (the ergonomics gate)

**Goal:** open Compose, tap *new*, and place quarter notes (and any other plain
duration, or their rests) on a blank piano score by tapping. Select one thing,
delete it, undo, redo. The score never moves under a palm. Local only. Nothing
changes for anyone who never opens Compose. **Leif evaluates the feel on the
iPad before P1 starts.**

1. **`js/lib/staff/glyphs.js`.** Move the `G` table + `timeDigit` out of
   `staff/render.js` into a shared module; add brace, double whole, 16th / 32nd /
   64th flags, 16th–64th rests, double sharp / flat, tuplet digits. `staff.test`
   + sight-singing E2E unchanged.
2. **`ticks.js`.** `PPQ`, `ticks()`, `capacity()`, `beatGroups()`,
   `splitRest()`, `grid()`. Tests: every palette duration (with dots 0–2, tuplets
   2/3/5/6/7 down to 32nd) is an integer; 4/4, 3/4, 6/8, 2/2, 5/4 capacities and
   groups; `splitRest` for every gap in a 4/4 and 6/8 bar matches the standard.
3. **`model.js`.** `newComposition({ title })` → 8 bars, treble + bass, C, 4/4,
   each staff one voice with a whole-bar rest; `validate()` checks §4.2
   invariants; `clone()`.
4. **`engine.js` (P0 cut).** `place`, `addPitch` (needed so a second tap on the
   same slot does not Nudge — chords are cheap here), `remove`, `appendBar`,
   `trimBars`, `normalize`, `Nudge`. Tests: place into a whole rest at every
   grid slot of every duration; place at the end of a bar; overflow nudges;
   remove restores rests; normalize produces standard groupings; fuzz 10,000
   random place / remove ops keep every invariant.
5. **`history.js`.** `push(doc)`, `undo()`, `redo()`, cap 200, `canUndo` /
   `canRedo`.
6. **`layout.js` (P0 cut).** Grand staff, brace, barlines, leading clefs + key +
   time, columns from the union of onsets, heads + stems + single-level beams
   for eighths and sixteenths within beat groups (sixteenths get a second beam —
   it is the same code path), flags, rests, ledger lines, chords (basic: shared
   stem, seconds flipped), system packing + justification, hit tables. Tests:
   both staves share x per tick; beams never cross a group; packing at 360 px
   and 1,200 px; last system unstretched.
7. **`hit.js`.** Point → `{ system, bar, staff, ticks, step }` via the columns;
   point → head / rest / stem / nothing. Test the round trip.
8. **`render.js`.** SVG per §9 with stable `data-id`s; `setSelection(ids)`;
   ghost overlay `showGhost({ x, y, shape }) / hideGhost()`.
9. **`sound.js`.** `audition(pitches, ms = 250)` on `createPiano`.
10. **Logbook.** `compositions[]`, `addComposition / updateComposition /
    removeComposition / composition / compositions / touchComposition`; migrate
    fills `[]`; not yet in `KINDS` (P3), so nothing syncs.
11. **Tool.** `index.js` registered after Scores, category `library`; routes
    `#/compose`, `#/compose/<id>`. `list.js`: *+ composition* (a title prompt,
    default *Untitled*), rows title · bars · last opened, tap → editor, hold →
    rename / delete. Empty state: *nothing written yet — start a composition*.
12. **Editor.** Control rail (undo · redo · Select · Pan · delete · − +) and
    palette rail (whole · half · quarter · eighth · sixteenth · *more* with
    double whole / 32nd / 64th · Rest toggle; dot / tie / tuplet / accidentals
    drawn but disabled until P1); modes per §8.2; pointer policy per §8.3
    (single-touch tap rule, pen full, palm discarded); ghost on move (pen /
    mouse) and on down (touch); place on up at the down point; single selection
    (tap head / rest); delete; undo / redo; keys `1`–`7`, `r`, `s`, `v`, `Esc`,
    Delete, Cmd/Ctrl+Z; Pan pans with inertia and pinches zoom (S 8–22, re-laid
    out); auto-append bar; save debounced 300 ms + flush on `pagehide` / unmount;
    `setRunning(true)` while an editor is open (keeps the screen awake at the
    piano). Nudges flash the bar and toast the sentence.
13. **Shell.** `registry.js`, `sw.js` `SHELL[]`, `css/app.css` `.cp-*`,
    `CACHE` + `VERSION` bump.
14. **E2E.** `tests/e2e/compose.mjs` (Chromium, iPad UA): new → arm quarter →
    tap ×5 → bar 1 has four quarters, bar 2 one quarter + rests, bar 9 exists
    (auto-append); tap a head → selected; delete → rest back; undo / redo;
    eighth armed → tap the "and" → lands on the off-beat; rest on → rest placed;
    a touch pointer with width 60 does nothing; two simultaneous touches do
    nothing; Pan pans; reload restores; `#/sightsinging` still renders.
    Screenshots at 390 px and 1,024 px.
15. **Ship.** PR, merge, deploy, poll, prod E2E, screenshots, handoff. Leif
    writes a few bars on the iPad with the Pencil and a palm down, and reports.

**Done when:** on the iPad, arming a quarter and tapping places quarters exactly
where the ghost showed, a resting palm never moves or marks the score, the
notes sound, undo works, and the app is unchanged for anyone who never opens
Compose. Leif's verdict on the feel gates P1.

## Phase 1 — editing (select, drag, retype, chords, dots, ties, tuplets, accidentals) — LANDED v67–v69 (WSHED-115) + v72 (WSHED-116, 2026-09-13)

**Goal:** everything in the brief's "usage would feel like" paragraph.

1. **Engine.** `retype`, `setPitch` (spelling from the key), `toggleRest`, `dot`,
   `tie`, `tuplet` (including armed tuplet placement), `accidental`. Tests for
   every op and every Nudge; the fuzz gains these ops.
2. **Layout.** Dots in spaces (chord dots aligned), ties (in-system and across a
   break), tuplet brackets + numbers (omitted on a single beamed group),
   accidental display per §6.4 with stacking, chord seconds and stem direction
   for chords, secondary beams with partials.
3. **Editor.** Multi-selection (tap adds in Select mode; long-press or Select-mode
   drag → marquee; stem tap → chord); drag re-pitch with audition per step,
   commit on release, horizontal ignored; palette-on-selection retype + arm;
   dot / tie / tuplet (tap = triplet, hold = 2 / 5 / 6 / 7) / ♯ ♭ ♮ wired to the
   selection or armed; Rest toggle on a selection; arrows ↑/↓ re-pitch, ←/→
   move, Shift extends; `.` `t` keys.
4. **E2E.** Retype quarter → half; overflow nudge leaves the bar unchanged; dot
   a chord dots every head; tie two same-pitch notes; triplet of eighths;
   marquee three notes and delete; drag a note up two steps (pointer sequence)
   and hear nothing break (audition is silent in headless — assert the pitch
   changed).
5. Ship loop; screenshots of a bar with a dotted chord, a tie, a triplet.

**Done when:** a two-bar phrase with a chord, a dotted note, a tie and a triplet
can be written and corrected without the keyboard, and every button obeys
"selection first, then the button".

## Phase 2 — the utility rail (key / time / clef anywhere; articulations, ornaments, glissando) — LANDED v73 (WSHED-117, 2026-09-13); v74 re-cut the targeting to Leif's review: no target-bar control — pick a key / time / clef, then tap the bar (key, time) or the staff + beat (clef, any beat of the metre, `clefChanges`) it starts at

**Goal:** the piece can change key, metre and clef at any bar; notes carry
articulations and ornaments; chords can glissando.

1. **Engine.** `setKey`, `setTime` (re-normalise following bars, spill into new
   bars, report the count for the confirm sheet), `setClef` (per staff),
   `articulate`, `gliss`. Tests: a 4/4 → 3/4 change on bar 3 of a full 8-bar
   piece yields the right bar count and no lost ticks; a clef change re-steps
   nothing (pitches are absolute).
2. **Layout.** Mid-piece key / time / clef columns with cautionary naturals on
   key changes, courtesy signatures at a system end when the next system
   changes; articulations opposite the stem, fermata above; ornaments above;
   glissando line with *gliss.*.
3. **UI.** `utility.js`: the chevron on the palette slides the rail in; key
   picker (circle of fifths list, major / minor names), time picker (common
   metres + custom), clef picker (treble / bass / alto / tenor per staff);
   fermata · staccato · accent · tenuto · trill · mordent · turn · gliss buttons
   act on the selection. Changes insert **at the selected bar** (or the bar of
   the last placement); a confirm sheet for `setTime` when bars would spill.
4. **E2E.** Key change at bar 3 draws the new signature with naturals; time
   change spills as computed; staccato on a chord; gliss between two chords.
5. Ship loop; screenshots.

**Done when:** an eight-bar piece can modulate, change metre and switch the
bass staff to treble at bar 5, and the layout is correct on both screen widths.

## Phase 3 — the expression rail, sync, and the logbook link — rail LANDED v85, sync v81 (WSHED-118 / 117, 2026-09-14); goal link open

**Goal:** dynamics, hairpins and text; compositions follow the account and can
be practiced.

1. **Engine.** `dynamic`, `hairpin` (start / stop on events; a stop without a
   start Nudges), `text` (bar-level `marks`). Tests.
2. **Layout.** Dynamics below the staff at the column; hairpins as two lines
   between columns, open across a system break; text above.
3. **UI.** `expression.js` as a second drop-down: pp p mp mf f ff, < >, *text*
   (a prompt; suggestions *rit.* *a tempo* *cresc.* *dim.* *dolce*).
4. **Sync.** *Landed early in v81 (WSHED-117, Leif: "compositions should save
   to the cloud, no premium needed"):* `KINDS` + `composition`,
   `BODY_CAPS.composition = 1048576`; the logbook touches on add / edit and
   tombstones on delete (opening does not touch); the API accepts the kind
   unchanged; `tests/logbook.test.mjs` covers the envelopes and
   `tests/e2e/accounts-sync.mjs` runs a two-device round trip. Last-write-wins
   on the whole document (design §8.5e).
5. **Logbook link.** `goalId` on a composition; `list.js` search by title /
   composer; *practice this* starts the clock (picker mode `composition`);
   `placeForGoal` gains compositions; goal page shows its composition; deleting
   a goal clears the link; account export includes compositions; account
   deletion wipes them (tombstones through the existing path).
6. Ship loop; screenshots; a sync E2E run against production with two E2E
   accounts.

**Done when:** a piece written on the iPad opens on the phone after sign-in,
carries its dynamics, and *practice this* logs minutes against it.

## Phase 4 — export (vector PDF with scaling, add to Scores, MusicXML) — MVP complete

**Goal:** a composition leaves Chopinly as a printable PDF, lands in the Scores
library in one tap, and round-trips into Sibelius as MusicXML.

1. **Vendor.** `dev/vendor-pdflib.mjs` fetches pinned `pdf-lib` and
   `@pdf-lib/fontkit` tarballs from npm, copies their ESM builds + LICENSEs to
   `vendor/pdflib/`, writes `VERSION`; `fonts/Bravura.otf` added (the OFL
   licence already ships); `_headers` for `/vendor/*` as pdf.js has;
   `tests/sw.test.mjs` extended to require every file under `vendor/pdflib/`.
2. **`export/pdf.js`.** `toPdf(doc, { page: "letter" | "a4", staffMm, margins,
   header })`: lazy `import()`; `layout()` at the print S for the printable
   width; page the systems; header + page numbers; walk the layout primitives
   into pdf-lib calls; embed Bravura (subset) and a text font (Fraunces is
   already shipped); return bytes. Tests: page count for a 40-bar piece at each
   staff size; the PDF's font list includes Bravura; a system never splits.
3. **`export/musicxml.js`.** Serialiser per design §10.2. Golden-file tests for
   a fixture with every feature of P0–P3; the output validates against the
   MusicXML 4.0 XSD in a one-off local check (documented in the test).
4. **UI.** `exportsheet.js`: page size, staff space, margins, header toggle, a
   live page-1 preview; *Save PDF* (share sheet on iOS via `navigator.share`
   with a file, download elsewhere), *Add to Scores* (store the blob, `addScore`
   with title / composer / tag `compose`, toast with *open*), *Save MusicXML*.
   `trimBars` before export.
5. **Public story.** `docs/COMPOSE_QA.md` (the iPad checklist), README section,
   `content/tools/compose.md` tool page (rebuild site, `site.test`), legal:
   nothing new leaves the device (exports are user-initiated files) — confirm
   the privacy table needs no change.
6. **E2E.** Export a fixture piece to PDF (assert `%PDF` + page count via a
   tiny parser), add to Scores → the score opens in the reader; MusicXML
   download assertion.
7. Ship loop; screenshots of the export sheet and the resulting score in the
   reader. Leif opens the MusicXML in Sibelius.

**Done when:** a piece written in Compose prints correctly from a PDF on Letter
and A4, is readable in Scores, and opens in Sibelius with pitches, rhythms,
ties, tuplets, key / time / clef changes and dynamics intact.

## Phase 5 — voices (up to four per staff, cross-staff notes) — LANDED v86 (WSHED-120, 2026-09-14)

Designed in [`COMPOSE_VOICES_DESIGN.md`](COMPOSE_VOICES_DESIGN.md) and landed as written in one
release (its phases V0–V4 together): sparse voices per bar (`null` slots, voice 1 always),
`place(…, voice)`, `setVoice` / `swapVoices` / `crossStaff` / `hideRest`, per-voice ties / slurs /
hairpins, stems and rests by voice, collisions and shared unison heads, per-voice and cross-staff
beams, editor-only tints (`--voice-2..4` per skin), the `1 2 3 4` switcher at the left of the Notes
rail with auto-follow, hold for the voice menu, `⌘1–4`, `⌘⇧↑/↓`. §12 of the design lists the
as-built differences. A golden layout fixture proves single-voice pieces are unchanged.

## Follow-ups (cards after the MVP, not phases)

- MIDI export (design §10.3).
- Playback on the shared clock with the metronome pill.
- More staves, lyrics, repeats — each its own design note.

## 4. Order, risk, and what could send a phase back

- **P0 is deliberately thin** so the verdict is about feel, not features. If
  Leif's pass changes the tap rule, the grid rule, or the rails' layout, P1
  absorbs the change before it starts; the design doc is updated in the same PR.
- **Riskiest engineering:** the layout's column model across two staves (P0)
  and tuplet / beam interaction (P1). Both are pure and fuzz-tested before any UI
  touches them.
- **Riskiest UX:** the touch policy on real iPad hardware (P0). Playwright
  cannot emit a Pencil; the E2E covers the rules, Leif covers the glass.
- **`setTime` spilling content (P2)** is the one op that moves notes between
  bars; it asks first and is fully undoable.
- **PDF font embedding (P4)** depends on fontkit handling Bravura's OTF; if
  subsetting fails, the fallback is embedding the whole font (~1 MB per PDF) —
  a size cost, never a fidelity cost. Raster is not a fallback.
