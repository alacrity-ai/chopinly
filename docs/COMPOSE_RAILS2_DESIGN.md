# Compose — the rails filled out (WSHED-127, v98)

Leif (2026-09-15): "There are 3 rails that I think could probably use a few more buttons … Think on
this, and then give your proposal" → "Land the majority of what you're suggesting, one release for
all of them." This is the design; §9 records what was built. The items left for their own
rounds are in §10.

## 0. Principles

1. **Hold menus before new squares.** Every rail is one lane on a phone. A family of variants goes
   behind a hold on the square it varies (ppp behind pp, 15ma behind 8va, the pedal styles behind
   Ped.); a new square is added only for a new *kind* of thing (sf, u.c., %, the three marks, the two
   engraving overrides).
2. **Placed, heard, exported, imported.** The standard the last four rounds set: nothing lands that
   playback ignores or MusicXML loses, and the design says what "heard" means for each.
3. **Reuse the kinds we have.** A sudden dynamic is a dynamic; a dashed text line is a span like a
   hairpin; hand marks are text expressions; the marks join `MARKS`; the ornaments' playback is the
   same note walker. Every addition is an optional field on an existing record.
4. **Additive, no schema bump.** A v3 piece without any of this is unchanged; an older app ignores the
   new fields. Nothing on the open path changes.

## 1. Model (schema v3, additive)

```js
// dynamics: the six, the extremes, and the sudden ones
DYNAMICS = ["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff"]   // levels, softest first
SUDDEN   = ["sf", "sfz", "sfp", "fp", "rfz"]                                   // an accent on the slot's notes
{ id, kind: "dyn", staff, at, value }        // value from either list
{ id, kind: "hairpin", …, niente?: true }    // from / to nothing: a small circle at the closed tip
{ id, kind: "textline", staff, at, end, text, endText? }   // "cresc. – – –", "una corda … tre corde"
{ id, kind: "ottava", …, size?: 15 }         // 15ma / 15mb (absent = 8)
{ id, kind: "pedal", …, style?: "sign" | "sost" }          // Ped. ✱ (no line) / Sost. Ped. (absent = the line)
// form
measure.barline?: { start?, end?, times?: 2…9 }            // times only with end: "repeat" (absent = 2)
measure.form: [{ kind: "tempo", bpm, text?, unit?: { base: 2 | 4 | 8, dots: 0 | 1 } }]  // ♪ = / ♩. = (absent = quarter)
measure.form: [{ kind: "rehearsal", text?: "Trio", style?: "number" }]                   // a word, or numbers; absent = letters
measure.simile?: 1 | 2                                      // %: this bar (these two bars) play the bar(s) before
// notes
MARKS += ["portato", "breath", "caesura", "invertedTurn", "delayedTurn"]
ev.trill?: { line?: true, alter?: -1 | 0 | 1 }   // only with "trill" in ev.art: the wavy extension, the accidental over tr
ev.stem?: "up" | "down"                          // an engraving override of the automatic direction
ev.beam?: "break"                                // this note starts a new beam group
// grace chords: toggleGrace(…, { chord: true }) stacks the pitch on the last grace
```

Invariants (`validate`): a dyn value from `DYN_VALUES`; a textline's text non-empty, ≤ `TEXT_MAX`,
`endText` likewise; `size` 15 or absent; `style` from the two; `times` 2–9 only on a repeat end; a
tempo `unit` from the three bases with 0 / 1 dots; a rehearsal `text` ≤ 12 letters (`style` and `text`
never together); a simile bar holds only rests in every voice, has a bar (two bars) before it of the
same capacity, and a two-bar simile's second bar exists, holds only rests, and carries no simile of
its own; `trill` only with the trill mark; `stem` / `beam` on notes; the turn family (turn,
invertedTurn, delayedTurn) is exclusive on a note.

## 2. Engine (`engine.js`)

- `addExpression` / `setExpressionValue` accept every `DYN_VALUES` entry.
- `addSpan` accepts `niente` (hairpin), `size` (ottava), `style` (pedal), `text` / `endText`
  (textline); `addTextLine(doc, { staff, bar, at, end, text, endText })` is the front. `SPAN_NAME`
  gains "a text line". `putExpr` / `moveExpressions` / `cleanExpressions` / `moveSpanEnd` are already
  generic over `SPAN_KINDS`.
- `setBarline(doc, bar, { start, end, times })`: `times` is kept only with a repeat end.
- `toggleFormMark`: a tempo mark compares `unit` too; a rehearsal mark with another `text` / `style`
  replaces (like a tempo with another value).
- `setSimile(doc, bar, n)`: `n` 1 / 2 / null; the same `n` there → off; a bar (or its pair) with a
  note → Nudge "empty the bar first"; nothing before it → Nudge. `place` and `paste` into a simile bar
  clear the sign first (writing a note is the natural way out of a %).
- `simileSource(doc, bar)` → the bar whose notes a simile bar plays (through chains of %).
- `articulate` knows the five new marks; the turn family is exclusive. `setTrill(doc, evIds, { line?,
  alter? })` sets the trill mark when absent and toggles the option (the same option on every note →
  off); clearing the trill mark clears `ev.trill`.
- `setStem(doc, evIds, dir)` (`"up"` / `"down"` / null) and `beamBreak(doc, evIds)` (toggle).
- `toggleGrace(…, { chord: true })`: the pitch joins the last grace's chord (already there → leaves it).
- `unroll`: a repeat end with `times` n sends the cursor back n − 1 times (the ending rule is unchanged:
  the ending numbered p plays on pass p).
- `tempoMap` folds the unit in: a mark's quarter-bpm is `bpm × unitTicks / PPQ`.

## 3. Playback (`play.js`)

- **Velocities.** `VEL` covers the ten levels (pppp 0.2 … ffff 1.0). A sudden dynamic spikes the notes
  at its slot on its staff: sf / sfz / rfz two steps above the level in force (cap 1), fp / sfp an f
  attack and the level in force becomes p from the next note; the level after sf / sfz / rfz is
  unchanged. A niente hairpin ramps from / to 0.05. A textline whose text starts with *cresc* / *dim* /
  *decresc* ramps like the hairpin of that direction. Notes under a textline whose text starts with
  *una corda* (through *tre corde*) sound at 0.8 of their velocity.
- **The clock.** `timeline` still emits `tempos` per performance tick; now inside a bar too:
  - a **rit. / rall. / ritard.** text at a slot ramps the tempo linearly to 0.7 of the bpm in force,
    an **accel. / stringendo** to 1.3, from its slot to the first of: an *a tempo* text at or after it,
    the next tempo mark, the end of the following bar, the end of the piece; the ramp is stepped every
    half beat; after it the tempo in force resumes (a rit. without *a tempo* snaps back at its end —
    the phrase after it is in tempo, as it is played);
  - a **fermata** holds its note: the note's span plays at bpm / 1.5, so everything sounding lasts 1.5×;
  - a **caesura** cuts its note a thirty-second early and plays that thirty-second at bpm / 5 — a half
    beat of silence, the playhead still in the bar.
- **Ornaments** (engraved only until now): a **trill** alternates main / upper neighbour in
  thirty-seconds for the note's length (the upper neighbour: the next letter in the key, `trill.alter`
  overriding); a **mordent** plays main – upper – main (a lower mordent main – lower – main), the first
  two a thirty-second each; a **turn** plays upper – main – lower – main in four equal parts; an
  **inverted turn** lower – main – upper – main; a **delayed turn** holds the first half, then the four.
  A note shorter than three thirty-seconds plays plain. An ornamented note ends a tie chain like a
  tremolo. **Portato** sounds three-quarters of the length; a **breath** shortens the note by a sixteenth
  (never under a thirty-second).
- **Simile.** A pass over a simile bar plays the source bar's notes at that bar's performance time; the
  playhead shows the simile bar.

## 4. Rails (`rails.js`)

| Rail | Button | Does |
|---|---|---|
| Dynamics | hold **pp** → ppp, pppp; hold **ff** → fff, ffff | arm that dynamic (the rows are dyn squares) |
| | **sf ▾** — sf, sfz, sfp, fp, rfz | arm a sudden dynamic; tap the slot |
| | hold **<** → hairpin / *cresc.* – – – / from nothing (o<); hold **>** → hairpin / *dim.* – – – / to nothing (>o) | arm; two taps |
| | text ▾ chips gain più f, meno f, sub. p, poco a poco, sempre, leggiero, sotto voce, sim. | as before |
| Form | Barline ▾ gains "repeat ×3", "repeat ×4" pictures | a repeat end with `times` |
| | hold **♩=** → ♪ ♩ ♩. 𝅗𝅥 | the beat unit of the next tempo mark (shown on the button; remembered per device) |
| | hold **A** → letters / numbers / a word… | the rehearsal style; a word asks for it |
| | **%** (hold → two bars) | arm; tap an empty bar (the same again → off) |
| Piano | hold **Ped.** → Ped. ___| / Ped. ✱ / Sost. Ped. | the pedal style for the next pedal (remembered) |
| | hold **8va** → 8va / 15ma; hold **8vb** → 8vb / 15mb | the size for the next line (remembered) |
| | **u.c.** | arm *una corda … tre corde*: two taps like a pedal |
| | **r.h.** **l.h.** (hold → r.h./l.h., m.d./m.g., m.d./m.s.) | arm that text; tap the beat |
| Notes + | **Orn ▾** — tr with line, tr♯, tr♭, tr♮, inverted turn, turn after the note | on the selection |
| | **portato**, **breath** ', **caesura** // | marks on the selection |
| | **flip stem**, **break beam** | on the selection: the stems flip (every one already set → back to automatic); the beam breaks before each selected note (again → joins) |
| | hold **Grace** gains "chord — stack on the last grace" | with it on, a tap adds the pitch to the last grace instead of a new one |

Toasts name what landed as the other rails do ("sfz on beat 3 of bar 2", "cresc. line from … to …",
"repeat ×3 on bar 8", "♪ = 120 from bar 1", "Trio on bar 9", "% on bar 3", "una corda from … to …",
"trill with a line", "stems flipped", "beam broken before 2 notes").

## 5. Layout and paint

- **Dynamics:** the new Bravura glyphs (`dynamicPPPP` … `dynamicFFFF`, `dynamicSforzando1`,
  `dynamicSforzato`, `dynamicSforzandoPiano`, `dynamicFortePiano`, `dynamicRinforzando2`) through
  `dynGlyph`, on the expression line like the six.
- **Niente:** a 0.3 S circle at the closed tip; the lines start 0.4 S from it.
- **Text line:** on the staff's expression line (where a hairpin goes): the text in italics at x1, dashes
  from the text's end to x2 (`cp-textline`, dashed like the octave line), the end text after x2 when
  there is one. Split over a system break like a hairpin: the text on the first piece, the end text on
  the last. Hit-tested and handled as a span (`spans(L)` carries `type: "textline"`).
- **15ma:** the heads shift fourteen steps; the signs `quindicesimaAlta` / `quindicesimaBassaMb`.
- **Pedal styles:** sign style draws *Ped.* at the start and ✱ (`keyboardPedalUp`) at the lift with no
  line (a retake: ✱ then *Ped.* side by side); sostenuto draws *Sost. Ped.* (`keyboardPedalSost`) and
  the line.
- **Tempo unit:** the metronome note of the unit (`met8th` / `metQuarter` / `metHalf`) and a dot after
  it when dotted. **Repeat times:** "3×" in the form lane, right-aligned at the bar's end (over a jump
  word when one shares the bar). **Rehearsal:** the box takes the label's width (a word, a number, a
  letter). **Simile:** the whole-bar rest is not drawn; `repeat1Bar` centred in the bar on each staff
  (`repeat2Bars` centred on the barline between the pair, with "2" above it).
- **Marks:** portato hugs the head like staccato (`articTenutoStaccato`); breath (`breathMarkComma`)
  and caesura (`caesura`) sit after the note at the staff's top line — the column widens 1.4 S to make
  room. Inverted turn (`ornamentTurnInverted`) above like a turn; a delayed turn is the turn glyph
  placed after the note. A trill with a line continues as `wiggleTrill` segments to the next note of
  the line (or the bar's end); a trill accidental is the small accidental (0.6) above the *tr*.
- **Stem override:** `x.ev.stem` wins over the voice / middle-line rule and over a beam's averaged
  direction (a run with any set stem takes that direction). **Beam break:** the run ends before the
  note.

## 6. MusicXML (`musicxml.js`)

| Document | MusicXML |
|---|---|
| the ten levels and the five sudden dynamics | `<dynamics><fff/>` … `<sfz/>` (all are elements of the schema); import folds ppppp → pppp, fffff → ffff, fz / sffz → sfz, rf → rfz, sfpp → sfp, pf → f |
| `niente` | `<wedge … niente="yes"/>` |
| textline | one direction with `<words>text</words>` and `<dashes type="start" number="n"/>`; at the end `<dashes type="stop"/>` (and `<words>endText</words>`); import pairs a `dashes` start with the words of its direction and a stop with any words of its direction |
| `size: 15` | `size="15"` (the 15ma warning goes away) |
| `style` | sign: `line="no" sign="yes"`; sost: `type="sostenuto"` … `type="stop"`; import reads both |
| `times` | `<repeat direction="backward" times="3"/>` |
| tempo `unit` | `<beat-unit>eighth</beat-unit><beat-unit-dot/>`; `<sound tempo>` in quarters; import reads the unit |
| rehearsal | `<rehearsal>Trio</rehearsal>`; import: one or two capitals → a letter mark, digits → number style, else the word |
| simile | `<attributes><measure-style><measure-repeat type="start" slashes="n">n</measure-repeat></measure-style></attributes>` on the first bar, `type="stop"` on the bar after; the bars carry their rests; import marks every bar inside the region |
| portato / breath / caesura | `<articulations><detached-legato/>`, `<breath-mark/>`, `<caesura/>` (detached-legato now imports as portato, not tenuto) |
| invertedTurn / delayedTurn | `<ornaments><inverted-turn/>`, `<delayed-turn/>` (no longer folded into turn) |
| `trill.line` / `trill.alter` | `<ornaments><trill-mark/><wavy-line type="start"/><wavy-line type="stop"/><accidental-mark>sharp</accidental-mark></ornaments>` |
| `stem` | `<stem>up</stem>` on the note when set (the file still says stems are not fully encoded); import ignores stems |
| `beam: "break"` | not exported (beams are not encoded, as before) |

## 7. Tests

`tests/compose-rails2.test.mjs`: validate for every new field; velocities (levels, sf spike, fp drop,
niente, textline ramp, una corda); the clock (rit. ramp and snap-back, a tempo, accel., tempo unit,
fermata hold, caesura pause); ornaments' note counts and pitches; portato and breath lengths; repeat
times in `unroll`; simile source, refusal, place clears it, timeline plays the source; layout (glyphs
for the new dynamics, niente circle, textline pieces, 15ma shift, pedal sign style, tempo unit, times,
rehearsal word, simile signs and no rest, marks' places, trill line and accidental, stem and beam
overrides, grace chord); MusicXML round trip of a piece with everything, and foreign reads (a measure
repeat, a sostenuto pedal, an eighth beat unit, dashes with words, an inverted turn, a wavy line). The
golden fixtures stay unchanged. E2E: one step over the four rails.

## 9. As built (v98, 2026-09-15)

- Everything in §1–§7 landed as written, with these decisions made while building:
  - **The tempo ramp** is read at each half-beat step's *end*, so the last step reaches the target exactly; a
    rit. that ends at the end of the following bar snaps back to the tempo before it there.
  - **A fermata slows the clock** over its note's span (bpm / 1.5) rather than lengthening the note, so every
    line sounding under it holds together and the playhead never leaves document time; a caesura does the same
    over its note's last thirty-second (bpm / 5) and cuts the note by that thirty-second.
  - **A two-bar repeat's second bar carries no field** (`simileTail`): the pair is one sign, the second bar is
    implied, and a chain of % signs resolves through `simileSource` to the plain bar before them. Writing a
    note into either bar of the pair clears the sign (`place`, `paste`); a re-cut of the metre (`setTime`) drops
    the sign on the bar right after the stretch.
  - **The una corda line goes above the pedal**: a text line sharing the range counts like a dynamic, so the
    pedal line (or Ped. ✱) drops under it as it does under a dynamic.
  - **A trill's accidental** sits 0.9 S above the tr's top so a flat's bowl clears it; the 15ma sign is
    Bravura's *15ma* (`quindicesimaAlta`, U+E515), the 15mb `quindicesimaBassaMb` (U+E51D).
  - **A repeat's `times` is stored only when it is not 2** and only on a repeat end (`setBarline` drops it
    with the repeat); the Barline ▾ pictures for ×3 / ×4 clear the repeat when tapped on a bar that already has
    that count.
  - **The hold menus** are the tuplet button's `hold` helper on every square that varies (pp, ff, the two
    hairpins, A, ♩=, %, Ped., 8va, 8vb, r.h.), registered as popups so a tap elsewhere closes them; a pedal
    style, a beat unit and the hands' language are remembered per device (`pedalStyle`, `tempoUnit`, `hands`).
  - The three span fronts (`addHairpin`, `addPedal`, `addOttava`) pass their options through; `trimBars`
    and `setTime` now treat every span kind alike (v96 had left pedal / octave line ends on the hairpin-only
    path).
  - MusicXML: a `<measure-style>` per region edge (a stop and a start may share a bar's `<attributes>`);
    `detached-legato` imports as portato (v94 folded it into tenuto); `inverted-turn` / `delayed-turn` are
    their own marks (v94 folded them into turn).
- Tests: `tests/compose-rails2.test.mjs` (8 tests: model, velocities, the clock, ornaments heard, form +
  bar repeats, piano, engraving, MusicXML both ways + a foreign file). Golden fixtures unchanged; three old
  assertions updated where the behaviour changed on purpose (fff is a dynamic; a 15ma is read as one). E2E:
  one step over the four rails (29 steps in all); the E2E now traps any NaN coordinate written to the SVG
  and names its painter.

## 10. Not in this round (WSHED-123)

Pickup bars (bar length per bar); finger substitutions (3–1); two-note tremolo; dashed slurs and
parenthesised courtesy accidentals (holds on the utility rail and the palette); cross-staff notes
already exist (voice ▾ → cross to the other staff, since v87).
