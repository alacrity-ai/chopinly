# Compose — chord symbols, and the rest of the Libertango round

**Cards:** WSHED-166 (chord symbols), WSHED-167 (open / cross-system glissando), WSHED-168 (clefs on the half beat),
WSHED-169 (subtitle), WSHED-170 (engraving fixes the transcription found). **Found by:** WSHED-165 — transcribing
*Libertango* (Piazzolla, as played by Ayatoshi Oikawa), 160 bars from 23 screenshots, Leif's second transcription
(2026-10-07). Leif's standing reason for these transcriptions: *find what Compose cannot represent and build it.*

Every decision below says which rail it lives on (or why none), and how it is tested.

---

## Part 1 · Chord symbols (WSHED-166)

### 1 · Model

A chord symbol is an **expression** — the WSHED-122 family (`measure.expressions`, half-beat slots, `dy` nudge):

```js
{ id, kind: "chord", staff, at, root: { step: "B", alter: 0 }, q: "m7(♭5)", bass?: { step: "A", alter: 0 } }
```

- **Root and bass are structured** — MusicXML wants root-step / root-alter / bass, and a later transpose needs them.
- **The quality is the text as engraved** (≤ `CHORD_Q_MAX` = 16 chars): `m7(♭5)` and `ø7` are both kept as written.
  A quality is a spelling more than a chord type.
- `validate` checks the shape. One chord symbol per staff and slot, like a dynamic or a text.
- Being an expression, it gets the rest of the machinery for free: Select / lasso / drag in time / `↑ ↓` lift / delete / undo,
  `moveExpressions`, `cleanExpressions`, `setTime` re-flow, `trimBars`.

`js/lib/compose/chordsym.js` (pure):
- `parseChord(text)` reads a typed symbol. A `b` straight after the root letter is a flat; `b5` / `#9` inside a quality become `♭5` / `♯9`; `/X` is a bass.
- `chordText` turns a symbol back into one line of text.
- `qualityRuns(q)` gives the engraved runs: a bracketed alteration straight after a digit is raised.
- `CHORD_QUALITIES` is the rail's list.
- `xmlKind` / `qualityFromXml` map a quality to and from a MusicXML kind.

The engine's `chordOf(value)` accepts a typed string or a record.
- `addExpression({ kind: "chord", value })` places one.
- `setExpressionValue(ids, part)` retypes a selection. A *part* changes only what it names:
  - `{ q }` keeps each root;
  - `{ root: { alter } }` keeps each letter;
  - `{ bass: undefined }` drops the bass.

### 2 · The Chords rail — a NEW rail

**Decision: a new rail, not a hold menu on Expression.** A chord symbol is a vocabulary of its own: 12 roots × ~30 qualities × an optional bass. A hold menu can't hold that, and a typed field alone does not suit the pen.

Left to right, one line that scrolls sideways (Leif's rule: a rail never wraps):

| control | does |
|---|---|
| **the symbol** (`Am`) | the symbol being built, drawn as it engraves. Tap = arm it (again = disarm). |
| **C D E F G A B** | the root (after **/**, the bass) |
| **♯ ♭** | the root's (or the bass's) accidental; the same again removes it |
| **maj m 7 maj7 m7 m7(♭5) dim dim7 aug sus4 7sus4 sus2 6 m6 add9 m(add9) 9 m9 maj9 7alt. 7♭9 7♯9 7♯11 11 m11 13 7♭5 7♯5 m(maj7) 6/9 5** | the quality |
| **/** | the next root tapped is the bass; again (with a bass) drops it |
| **type… ▾** | any symbol, typed (`Bm7(b5)/A`); Enter sets it |

The grammar is the one every rail shares:
- **Every tap re-arms.** A lead sheet is tap the beat, change the root, tap the next beat.
- An armed chord symbol **stays armed** after placing, unlike a dynamic: chord symbols come in runs.
- **With chord symbols selected, the rail retypes them** instead of arming (palette-on-selection retypes).

It is off by default, like every rail but Controls / Transport / Notes, and listed in Options ▾ → Rails as *Chord symbols*.

### 3 · Engraving

- **One baseline per system and staff.** Every chord symbol in a system sits on one line. That line is `CHORD_AIR` (1.1 S) above the highest ink over the staff (heads, stems, marks, fingerings, slur peaks, tuplet numbers, words, the 8va numeral), and never lower than `CHORD_Y` (2.8 S) above the top line. Gould: chord symbols read across the page as one line.
- **Size and face:** 1.45 S, upright Fraunces (paper: the regular face, not the italic that words use).
- **Accidentals** (root, bass and any ♭ / ♯ inside the quality) are Bravura glyphs. The serif face has no ♭ / ♯.
- **The raised alteration:** a bracket straight after a digit is set at 0.68 size and raised half the size (Bm7⁽♭⁵⁾). `Am(add9)` stays on the line, as in the source.
- **Measured, not estimated:** the painters measure each run. The new optional painter method `measure(str, size, cls)` uses canvas on screen and pdf-lib's font widths on paper. The layout's own width estimate `w` only sizes the hit box.
- **The form lane** (tempo, rehearsal, signs) moves above the chord line in a system that has both; ending brackets move above that.

### 4 · MusicXML

- **Out:** `<harmony>` with `<root>`, `<kind text="m7(♭5)">half-diminished</kind>`, `<bass>` and `<staff>`, at its tick among the staff's directions.
- **In:** read where the importer used to warn "chord symbols ignored". The quality comes from `text=` when present, else from the kind's usual spelling.
- Round trip: `tests/compose-musicxml` plus the transcription's `roundtrip.mjs`, which compares spellings.

Playback does not sound chord symbols: they describe the harmony, and the notes play it.

---

## Part 2 · The rest of the round

### 5 · Glissando with no landing, and across a break (WSHED-167) — existing button, now a hold menu

The **gliss.** button on the Key · time · clef · marks rail gets a hold menu:
- **to the next note** — `"start"`, as before;
- **up** — no landing (`"up"`);
- **down** — no landing (`"down"`).

The button then sets the last mode picked.

- **Model:** `ev.gliss ∈ GLISS = ["start", "up", "down"]`, validated. `cleanTies` drops only a `"start"` with no note after it.
- **Engraving:**
  - An **open gliss** rises (falls) up to 2.5 S. It runs over the room before the next thing on its staff in the bar, or to the barline, 2.2–6 S long, with *gliss.* along it when there is room.
  - **A gliss to a note on the next system** is drawn in two halves that meet half-way in pitch. The word goes on the outgoing half only.
- **MusicXML:** an open gliss is `<doit/>` (up) or `<falloff/>` (down), MusicXML's indeterminate slide off a note. Both ways.

### 6 · Clef changes on the half beat (WSHED-168) — Utility rail, finer grid

`clefChanges[].at` sits on the **expression grid** (half the metre's unit), not only on beats.
- In Libertango bar 2 the bass staff's treble clef must come after a chord held from beat ½: at beat 1½, not beat 1, which would re-read the chord.
- Covered by `validate`, `setClef`, the editor's clef cursor (snaps to half beats), `setTime` re-flow and the MusicXML import (a mid-bar clef lands on the slot at or before its note).

### 7 · Subtitle (WSHED-169) — no rail: the piece's identity

`composition.subtitle` is optional, 1–80 chars:
- edited in the details sheet under the title (the shared catalogue form's `subtitle: true` option — Scores do not have one);
- drawn centred under the title on page 1 (`headerBlock`), which moves the composer down;
- written to MusicXML as `<credit><credit-type>subtitle</credit-type>`, and read back from it or from a `movement-title` that differs from the work title.

### 8 · Engraving fixes the transcription found (WSHED-170)

| what | rule now |
|---|---|
| **Paper routes ink by system, not by height** | `paint.js` names each item's system (`p.at(system)`). The PDF painter, the ink meter and the preview route by it. Before, a staccato dot under a low ledger note, or a chord symbol high over the staff, landed on the neighbouring system's page. |
| **Paper parts systems by their ink** | `planPages` gives every system its own `dyOf(system)`. The gap is `SYS_GAP` (unchanged when nothing reaches out), or more where one system's lowest ink plus the next one's highest plus 1.2 S needs it. The preview translates each system by the same amount. |
| **Articulations in a two-voice staff go to the stem end** | Gould: the head side belongs to the other voice. Staccato under voice 2's beam, not into voice 1's whole note. |
| **A mid-system clef change shows only on the staff that changes** | it was redrawn on both |
| **A clef change at a barline stands before the barline** | the barline closing the previous bar moves past the clef; key and time stay after the barline |
| **A tuplet beams as one group** | a sextuplet over two beats is one beam with a bare 6, not 3 + 3 with brackets |
| **Beam join** (Marks rail: **beam** gets a hold menu, *break* / *join*) | `ev.beam = "join"` beams a note on from the one before across the beat. This is how half-bar groups of eighths in 4/4 are written, as many engravers do. |
| **One roll over two voices** | two voices' rolled chords in one column are one roll over both |
| **Tuplet numbers clear fingering** | the bracket's extent includes the fingering digits |

### Not built (on the card for Leif)
- **4/4 eighths beamed by the half bar by default.** Today `join` is explicit, and the transcription pipeline's `beamHalf` applies it. Making it the default would change how every existing piece looks, so it is Leif's call.
- **An ottava ending mid-beat** (Libertango bars 59, 99: an 8va that stops after a sixteenth). Spans live on the half-beat grid. A finer end would need a span grid of its own.
- **A unison head shared by two voices of different lengths** (bar 83). Compose shares a head only where the engine already does.
- **Fingering below the upper staff** (bar 39 prints its 1s under the septuplet). There is no per-digit placement yet.
- **The editor's own system spacing** stays uniform. Only paper parts systems by their ink, because the editor's hit-testing assumes the fixed `SYS_H`.

## Tests

- **Unit:** `compose-chords.test.mjs` covers the parser, validation, add / retype, layout (one baseline, raised alteration, form-lane lift), painting on the PDF, MusicXML both ways, open gliss / break halves, half-beat clefs, subtitle, beam join and tuplet beams, stem-side marks, the single-staff clef and the clef before the barline. Also `compose-export.test.mjs`: systems never overlap and never sit closer than `SYS_GAP`.
- **E2E** (`tests/e2e/compose.mjs`): arm a chord on the Chords rail and place it; retype the selection; undo; the gliss hold menu; a clef on an "and"; the subtitle in the details sheet.
- **Help:** a new article *The Chords rail* (`content/help/compose/25-rail-chords.md`) with its screenshot. The Keys, Marks, MusicXML, Overview, Editor and Export articles are updated.
