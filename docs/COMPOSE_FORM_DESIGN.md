# Compose — the Form rail (WSHED-124, v95)

Leif (2026-09-14): "we don't have double bars for good section divides. We also don't have repeats.
We also don't have D.C., coda, d.c. al coda … Perhaps we need another rail for those type of form
markers? … include tempo changes in that rail." This is the design; §9 records what was built.

## 0. Principles

1. **Form belongs to bars, not beats.** A barline is a property of the bar; an ending is a run of
   bars; a sign, a jump, a rehearsal letter and a tempo mark sit on a bar (at its start or its end
   by their nature). So the rail's taps target **bars** — like Key and Time, unlike the beat-level
   Clef and the half-beat expressions.
2. **The music you hear is the form.** Playback unrolls repeats, endings and jumps into passes and
   follows tempo marks; the playhead still points at the bar in the score, so it jumps back at a
   repeat and forward at *D.S.*
3. **Additive, no schema bump.** Three optional fields on the measure; a v3 piece without them is
   unchanged, and an older app ignores them. Nothing on the open path changes.
4. **Same tap grammar as the utility rail.** Every Form button arms a cursor; the next tap on a bar
   places; the same button on the same bar again removes; Esc cancels; every change is one undo
   step.

## 1. Model (schema v3, three new optional measure fields)

```js
measure.barline?: { start?: "repeat", end?: "double" | "final" | "repeat" }
measure.ending?:  { n: 1, end: 5 }        // on the ending's FIRST bar; bracket over bars first…end (indices, inclusive)
measure.form?:    [ { kind: "segno" | "coda" | "toCoda" | "fine" | "dc" | "ds" | "dcAlFine" | "dsAlFine" | "dcAlCoda" | "dsAlCoda" | "rehearsal" | "tempo", bpm?, text? } ]
```

- `barline.end` is the bar's closing barline; the last bar of the piece is always drawn final
  regardless. `barline.start` is a repeat sign opening the bar. Both may be present.
- `ending`: `n` 1–9; `end ≥` the bar; endings never overlap; `n` is unique inside its repeat span.
- `form`: at most one mark of each kind per bar and at most one **jump** (`dc` … `dsAlCoda`) per
  bar. `tempo` carries `bpm` (20–300, integer) and an optional `text` (≤ 20 chars, "Allegro").
  Marks are sorted by kind name. Rehearsal letters are not stored: the nth rehearsal mark in the
  piece reads A, B, C … (Z then AA).
- Invariants (`validate`): kinds and ranges as above; `ending.end` inside the piece; no overlaps;
  `dc`-family exclusivity. `trimBars` keeps bars an ending or a mark uses. `setTime` re-cuts bars
  by tick; bar-level form stays with its bar index (a re-cut moves notes, not sections).

## 2. Engine (`engine.js`)

- `setBarline(doc, bar, { start, end })` — `start: "repeat" | null`, `end: kind | null`; absent
  keys keep what is there; both cleared → the field goes.
- `setEnding(doc, first, n, last)` — the bracket; the same `n` already starting on `first` → off;
  overlap with another ending → Nudge; `last < first` → Nudge.
- `toggleFormMark(doc, bar, mark)` — the same kind there → off (a `tempo` with a different value or
  text replaces; a jump replaces another jump); returns the same document when nothing changes.
- `formMarksOf(doc)` — every mark with its bar, in order.
- `unroll(doc)` → `[{ bar, pass }]`, the performance (§4).
- `tempoMap(doc)` → `[{ bar, bpm }]` per bar, from `doc.tempo` until the first tempo mark.

## 3. Rail (`rails.js`, lane `form`, Rails ▾ row "Form · repeats · tempo", off by default)

| Button | Arms | Tap on a bar |
|---|---|---|
| **Barline ▾** — pictures `𝄀 𝄁 𝄂 𝄆 𝄇 𝄆𝄇` | single / double / final / repeat start / repeat end / both | sets the bar's `end` (double, final, repeat) or `start` (repeat start); *both* = repeat end here **and** repeat start on the next bar; single clears both |
| **Ending ▾** — 1. 2. 3. | the number | first tap = first bar, second tap = last bar (the same bar twice = one bar); the same number starting there again → off |
| **𝄋** segno, **𝄌** coda | the sign | on the bar's start; again → off |
| **Jump ▾** — D.C., D.C. al Fine, D.C. al Coda, D.S., D.S. al Fine, D.S. al Coda, To Coda, Fine | the mark | on the bar's end; the same → off; another jump → replaced |
| **A** rehearsal | a rehearsal mark | on the bar's start; letters run A, B, C … in score order; again → off |
| **♩=** tempo | asks `120` or `Allegro 120` | on the bar's start; the same → off; a different value → replaced |

The armed thing shows on its picker (`aria-pressed`, a value label) and the bar under the pen is
highlighted like a key change (`showTarget`). Toasts say what landed ("repeat end on bar 8",
"D.C. al Coda at the end of bar 16", "♩ = 120 from bar 9").

## 4. Playback (`play.js`)

`unroll(doc)` walks the bars with a cursor and a small state:

- **Repeats.** A `barline.end === "repeat"` on bar *e* sends the cursor back to the nearest bar at
  or before *e* with `barline.start === "repeat"` (else bar 0, or the bar after the previous repeat
  end), once: the span plays twice. Nested repeats are not modelled (the nearest start wins).
- **Endings.** Entering a bar that starts an ending numbered *n* on pass *p* ≠ *n* skips to the bar
  after the ending's last bar. The last ending of a span has no repeat barline and plays on the
  last pass.
- **Jumps** fire the first time their bar is left, never after a jump has been taken: `dc` → bar 0,
  `ds` → the bar with the segno (else bar 0); *al Fine* stops at the next `fine`; *al Coda* jumps
  from the next `toCoda` to the bar with the `coda` sign. Repeats are not taken after a jump
  (the convention). `fine` and `toCoda` do nothing before a jump.
- A guard stops the walk at 8 × the bar count passes.

`timeline(doc)` returns notes in **performance ticks** plus `passes: [{ bar, pass, perfStart,
docStart, len }]`, `total` (performance) and `tempos: [{ at, bpm }]` (performance ticks). The
player keeps time in performance ticks with a piecewise tempo (`secondsAt(perf)` /
`perfAt(seconds)`), and its public surface stays in document ticks: `position` maps the current
pass back to its bar (the playhead jumps back on a repeat), `seek(docTick)` goes to the first pass
containing that bar. Rew / ff / the slider are unchanged.

## 5. Layout and paint (`layout.js`, `paint.js`)

- **Room:** a bar with a repeat start gets 1.6 S before its first column; double / final / repeat
  ends add 1.0 S to the tail pad.
- **Barlines:** single = the thin line; double = two thin lines 0.5 S apart; final = thin + thick;
  repeat end = dots (Bravura `repeatDots`, origin on each staff's bottom line) + thin + thick;
  repeat start = thick + thin + dots at the bar's body start. All span both staves. The piece's
  last bar keeps its automatic final barline unless it has a repeat end.
- **Form lane:** `y = staffTop[0] − 3.2` (baseline) for signs (scale 0.75, the coda 0.4 lower), the rehearsal box (text
  size 1.2 in a 1.8 S square, left edge at the bar's start), the tempo mark (word in italics, then
  `♩ = n` with the quarter as the Bravura metronome glyph at scale 0.55; the word's width is
  estimated at 0.55 S per character), and the end marks (*Fine*, *To Coda*, *D.C. al Fine* …
  right-aligned at the bar's end, italics, size 1.15). Several things on one bar's start stack
  left to right: rehearsal, sign, tempo — starting past the ending number when the bar opens an ending.
- **Endings:** a bracket at `y = staffTop[0] − 5.6` (inside the first system's top pad) from the first bar's body start to the last
  bar's end, with a 1 S hook down at the open end (and at the close when a repeat ends the
  ending), the number "1." inside; split across systems like a hairpin (`half: "out" | "in"`).
- Screen and PDF share the painter; new glyphs are baked into `export/bravura.js`.

## 6. MusicXML (`musicxml.js`)

| Document | MusicXML |
|---|---|
| `barline.start: "repeat"` | `<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>` |
| `barline.end` | `<barline location="right"><bar-style>light-light \| light-heavy</bar-style>[<repeat direction="backward"/>]</barline>` |
| `ending { n, end }` | `<ending number="n" type="start"/>` in the first bar's left barline, `type="stop"` (repeat ends it) or `"discontinue"` in the last bar's right barline |
| `segno`, `coda` | `<direction><direction-type><segno/></direction-type><sound segno="…"/>`, coda likewise |
| `toCoda`, `fine`, jumps | `<words>` ("To Coda", "Fine", "D.C. al Fine" …) with `<sound tocoda / fine / dacapo / dalsegno>` |
| `rehearsal` | `<rehearsal>A</rehearsal>` |
| `tempo` | `<words>Allegro</words>` + `<metronome><beat-unit>quarter</beat-unit><per-minute>n</per-minute></metronome>` + `<sound tempo="n"/>` |

Import reads all of these back; the words *D.C.*, *D.S.*, *al Fine*, *al Coda*, *To Coda*, *Fine*
are recognised case-insensitively with or without dots; a later `<metronome>` / `<sound tempo>`
becomes a tempo mark on its bar (the first one stays the piece's starting tempo).

## 7. Tests

- Engine: barlines, endings (overlap refused), marks (toggle / replace), trim keeps used bars,
  validate refuses bad values.
- `unroll`: a plain repeat, first and second endings, D.C. al Fine, D.S. al Coda, a form that
  loops is cut by the guard; `timeline` totals and pass mapping; `tempoMap`.
- Layout: room reserved, dots on both staves, bracket split across systems.
- MusicXML: a form piece round-trips exactly; the golden file is unchanged (no form).
- E2E: the Form lane appears from Rails ▾; a repeat end + first/second endings + D.C. al Fine +
  tempo placed by taps; the same tap removes; playback's playhead visits bar 1 twice; export → import
  keeps the form.

## 8. Not in this round (WSHED-123)

rit. / accel. that change playback; selecting a form mark to drag or delete it (remove = the same
tap); nested repeats; repeats after a D.C.; repeat counts other than two.

## 9. As built (v95, 2026-09-14)

- Everything in §1–§7 landed as written, with these decisions made while building:
  - `unroll` and `tempoMap` live in `engine.js` (pure form logic); `play.js` adds `clockOf(tempos)` for
    seconds ↔ performance ticks and `timeline(doc, { tempo })` takes the editor's starting tempo.
  - After a jump, an ending that contains a repeat barline is skipped (the repeat is not taken) and the
    later ending plays; the pass counter returns to 1 when the last ending of a span closes, so a
    second repeat later in the piece starts clean. A second jump is never taken, so a form that only
    loops ends by itself; the 8 × bars guard is a backstop.
  - The tempo word's width is estimated at 0.63 S per character (Fraunces italic at 1.15 S); the
    metronome note is the Bravura metronome glyph at scale 0.55. On paper every text uses the italic
    face (the PDF painter has one text face), so rehearsal letters and ending numbers are italic there.
  - The Barline picker's *both* sets a repeat end on the tapped bar and a repeat start on the next; a
    picture tapped on a bar that already has it clears it (single always clears both ends).
  - The Form lane's buttons are `.cp-sq` squares like every other glyph button; the rail is off by
    default and remembered per device with the others.
- Tests: `tests/compose-form.test.mjs` (barlines, endings, marks, trim, unroll ×2, tempo map + clock,
  timeline passes / tempos / ties across a jump, layout lane + brackets, MusicXML round trip + other
  programs' words); the golden layout and MusicXML fixtures are unchanged (no form in them). E2E: the
  form step places a repeat, two endings, D.C. al Fine, Fine, segno, rehearsal A and Adagio ♩ = 60 by
  tap, removes and undoes one, checks the unrolled passes, and exports → imports the form.
