# Compose — MusicXML export and import (WSHED-119, v94)

Compose keeps a piece as the document in `COMPOSE_DESIGN.md` §4. This is the mapping between
that document and **MusicXML 4.0 part-wise**, both ways, as built in `js/lib/compose/musicxml.js`
(`toMusicXml`, `fromMusicXml`) with `js/lib/compose/xml.js` (a small XML reader — the same one in
the browser and in node, so a test proves what the app does) and `js/lib/compose/mxl.js` (the
compressed `.mxl` container). Export is a serialiser: the model was shaped after MusicXML, so every
field has a home. Import is a translation: MusicXML says far more than Compose can hold, so the
reader keeps what the document can express, refuses what would corrupt a bar, and drops the rest —
each rule is below.

## 0. Principles

1. **Ticks are the truth.** `<divisions>` is written as `6720` (the PPQ), so every `<duration>`
   is our tick count. On import `<duration>` is scaled by the file's own divisions and used only for
   the cursor (where a note starts); the length of a note comes from `<type>` + `<dot>` +
   `<time-modification>`, the way engravers write it. A note with no `<type>` is split into tied
   plain values.
2. **A bar always adds up.** Every voice of every staff sums to the bar's capacity. Gaps a file
   leaves are filled with the metre's standard rests; a note that would overlap the next note of
   its voice refuses the whole import with the bar number (no half-imported piece).
3. **Marks go where the engine would put them.** Expressions snap to the half-beat grid, hairpins
   keep the earlier one on a staff, ties are re-derived (`cleanTies`), slurs paired (`cleanSlurs`),
   and the result must pass `validate` before it becomes a composition.
4. **Nothing leaves the device.** Both directions are files the musician chooses: *Export
   MusicXML* saves or shares a `.musicxml`; *import MusicXML* on the compositions list reads a
   `.musicxml`, `.xml` or `.mxl` from Files. The privacy table is unchanged.

## 1. Export — document → MusicXML

```
<score-partwise version="4.0">
  <work><work-title>title</work-title></work>
  <identification><creator type="composer">composer</creator>
    <encoding><software>Chopinly v94</software><encoding-date>YYYY-MM-DD</encoding-date>
      <supports element="accidental" type="yes"/> …</encoding></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">…</measure>…</part>
</score-partwise>
```

| Document | MusicXML | Notes |
|---|---|---|
| bar 1 `key` / `time` / `clefs` | `<attributes>` with `<divisions>6720`, `<key><fifths>`, `<time>`, `<staves>2`, `<clef number="1|2">` | later bars carry only the changes they hold |
| `clefChanges [{staff, at, clef}]` | `<attributes><clef number="n">` at that tick | the cursor is moved there with `<backup>` / `<forward>` and back (§1.1) |
| clef names | treble G2 · soprano C1 · mezzo C2 · alto C3 · tenor C4 · baritone F3 · bass F4 | |
| `tempo` | bar 1: `<direction><metronome><beat-unit>quarter</beat-unit><per-minute>` + `<sound tempo>` | the player's bpm is the quarter |
| voice `k` of staff `si` | `<voice>` = `k + 1 + 4·si` | Finale / Sibelius convention: staff 1 voices 1–4, staff 2 voices 5–8 |
| a note event | `<note>` per pitch, `<chord/>` from the second on, `<pitch>` step / alter (when ≠ 0) / octave, `<duration>` = ticks (tuplet ratio included), `<type>`, `<dot/>`×n, `<voice>`, `<staff>` | pitches low to high, as stored |
| `ev.cross ±1` | `<staff>` = the drawn staff | the voice number stays the home staff's |
| a rest | `<note><rest/>` (`measure="yes"` for a whole empty bar), `<duration>`, `<type>` | `hidden` → `print-object="no"` |
| `restY` | `<rest><display-step>/<display-octave>` | the automatic place (§6.6 of the design: the middle line, one voice; the voice's own step with several) shifted by `restY`, spelled in the clef in force |
| `dur.tuplet {n, in}` | `<time-modification><actual-notes>n<normal-notes>in`; `<notations><tuplet type="start|stop">` on the group's first / last event | groups are contiguous in a voice |
| `pitch.tie` | `<tie type>` on the note + `<notations><tied type>` | `both` writes stop then start |
| accidentals | `<accidental>` when the engraver would draw one: the pitch's `alter` differs from the key's alteration for that letter or the bar's memory of that pitch; `acc: "show"` forces it, `acc: "hide"` suppresses it, a tied-in note never shows one | the same rule as `layout.js` §6.4, so paper and file agree |
| `art` | `<articulations>` staccato / accent / tenuto; `<fermata/>`; `<ornaments>` trill-mark, **inverted-mordent** (our `mordent`, SMuFL short trill, no line), **mordent** (our `lowerMordent`, the line through it), turn | |
| `slurs [{id, at}]` | `<slur type="start|stop" number="1–6">` | numbers are recycled per staff as slurs close |
| `gliss: "start"` | `<glissando type="start" line-type="wavy">` on the note and `type="stop"` on the next note of the voice | |
| `arp` | `<arpeggiate>` on every pitch of the chord, `direction="up|down"` when it has one | |
| `expressions` `dyn` | `<direction placement="below"><dynamics><mf/>` + `<staff>` | at its slot's tick |
| `text` | `<direction placement="above"><words>` | |
| `hairpin` | `<wedge type="crescendo|diminuendo" number="staff+1">` at the start, `type="stop"` on the end bar at the end tick | |
| `dy` (steps, up) | `relative-y` = `dy × 5` tenths on the dynamics / words / wedge | a hint; readers that ignore it lose only the nudge |

### 1.1 Order inside a measure

`<attributes>` first. Then, per staff, per present voice: `<backup>` to the bar's start when the
cursor is not there, then the voice's events in order. The staff's first voice also carries the
staff's **inserts** — its clef changes, directions and wedge stops — each emitted before the first
event whose onset is at or after the insert's tick; an insert inside an event (a hairpin ending on
an off-beat under a half note) is reached with `<backup>`, written, and the cursor is put back with
`<forward>`, so its time is exact and no reader has to honour `<offset>`. The cursor ends every
bar at the capacity. Both staves' inserts land in the same measure element, which is what a
two-staff part is.

## 2. Import — MusicXML → document

Accepted: `score-partwise` and `score-timewise` (folded to part-wise first), UTF-8 (a BOM is
skipped), plain or compressed (`.mxl`: the zip's `META-INF/container.xml` names the root file;
without one the first `.musicxml` / `.xml` entry is taken; entries are stored or deflated — inflated
with `DecompressionStream("deflate-raw")`, which every current browser and node have).

**Which part.** The first part with two or more staves supplies staves 1–2 (an organ's pedal staff
is dropped). Otherwise the first two single-staff parts become the upper and lower staff (a
right-hand / left-hand pair). A lone single-staff part fills the upper staff and the lower staff
rests. Anything else in the file is ignored.

| MusicXML | Document | Rule |
|---|---|---|
| `<divisions>` | — | scales every `<duration>` to ticks (may change per bar) |
| `<key><fifths>` | `key` on the bar | mode ignored; a mid-bar key change applies at the barline |
| `<time>` | `time` on the bar | `beats` like `2+3` are summed; `beat-type` must be 1–32; `<senza-misura>` refuses |
| `<clef>` | `clefs` at the barline, `clefChanges` inside the bar | by sign + line (an `<clef-octave-change>` is dropped: treble⁸ reads as treble); percussion / TAB clefs refuse; an inside change snaps down to the beat |
| `<note>` | a note or rest event | `<grace>` notes are skipped; `<cue>` notes are ordinary; `print-object="no"` rests are `hidden` |
| `<chord/>` | joins the previous note's pitches | sorted low to high |
| `<pitch>` | `{ step, alter, octave }` | `alter` kept as spelled (−2…2; a microtone refuses); `<accidental>` on a pitch the key already implies → `acc: "show"` |
| `<type>` + `<dot>` + `<time-modification>` | `dur` | breve … 64th; `128th` and shorter refuse; a rest or note without a type is split by its duration into plain values (a note's pieces tied) |
| `<time-modification>` | `dur.tuplet` | groups follow `<tuplet type="start|stop">` when the file writes them, else a run of the same ratio is one group (split where the plain sum reaches a whole number of the group's unit); a ratio our ticks cannot hold (9:8 sixteenths) refuses with the bar |
| `<voice>` + `<staff>` | the voice's **home staff** in that bar is where most of its notes sit; a note on the other staff gets `cross` | voice indices are assigned per staff in order of first appearance; a fifth voice on a staff refuses |
| `<tie>` / `<tied>` | `pitch.tie` then `cleanTies` | a tie with no same pitch next is dropped, as after any edit |
| `<slur number>` | `ev.slurs` pairs | matched by number per part; one crossing voices is dropped by `cleanSlurs` |
| `<articulations>`, `<fermata>`, `<ornaments>` | `art` | the table in §1, reversed; unknown marks dropped |
| `<glissando type="start">`, `<slide>` | `gliss: "start"` | only when the next event of the voice is a note |
| `<arpeggiate>` | `arp` | `direction` up / down, else plain |
| `<rest><display-step>` | `restY` | the offset from the automatic place, within ±12 |
| `<direction><dynamics>` | `dyn` | pp p mp mf f ff as they are; ppp/pppp → pp, fff/ffff → ff, sf sfz fz rf rfz sffz fp → f; others dropped |
| `<wedge>` | `hairpin` | crescendo / diminuendo start → stop, matched by `number` per staff; a start without a stop is dropped |
| `<words>` | `text` | whitespace folded, 40 characters |
| `<metronome per-minute>` or `<sound tempo>` | `tempo` | the first one in the piece, 20–300 |
| direction time | the cursor + `<offset>` | snapped to the nearest half-beat slot |
| a short bar (`implicit="yes"`, a pickup) | rests at the **front** of bar 1, at the end elsewhere | Compose bars are always full |
| `<work-title>` / `<movement-title>`, `<creator type="composer">` | title, composer | the file name when the title is missing |

Ignored on purpose: repeats, endings, lyrics, harmony, pedal and octave-shift lines, breath marks,
fingerings, tremolos, transposition, stem and beam hints, page and system breaks, colours and
positions other than `relative-y` on expressions. A file with none of what Compose holds (no notes
at all) still imports as empty bars.

After the bars are built: `normalizeBar` (standard rest groupings), `cleanTies`, `cleanSlurs`,
`cleanExpressions`, one empty trailing bar, `validate`. A validation failure is reported as the
import's sentence, never as a half-composition.

## 3. The user's path

- **Export:** File ▾ → *Export MusicXML* on the editor's header rail. The file is
  *Composer – Title.musicxml*; where a share sheet exists the same *Save to device / Share…*
  choice as Save PDF (`js/tools/compose/savefile.js`, shared with the export sheet), else a
  download. Trailing empty bars are trimmed first, like the PDF.
- **Import:** the compositions list gains *import* next to *composition*: a file picker for
  `.musicxml`, `.xml`, `.mxl` (several at once). Each file becomes a new composition (title and
  composer from the file, tag `imported`), a toast says how many bars came in, and the editor opens
  on the last one. A refused file says why in a toast and nothing is added.

## 4. Tests

- `tests/compose-musicxml.test.mjs`: the golden piece (`tests/fixtures/compose-golden.mjs`, every
  P0–P3 feature) serialises byte-for-byte to `tests/fixtures/compose-golden.musicxml` (regenerate
  on purpose with `node -e 'import("./tests/fixtures/compose-golden.mjs").then(m => m.writeXml())'`);
  the golden piece round-trips (export → import → the same measures up to ids); a voices piece
  round-trips with cross-staff notes, hidden and dragged rests; pickup bars, timewise scores,
  two single-staff parts, tuplets without `<tuplet>` notations, unsupported tuplets, overlapping
  notes, an `.mxl` built in the test; the XML reader's entities, CDATA, comments and a BOM.
- One-off XSD check (2026-09-14): `xmllint --noout --schema musicxml.xsd` against the W3C
  MusicXML 4.0 schema passes on the golden export and on a voices export.
- E2E (`tests/e2e/compose.mjs`): File ▾ → Export MusicXML downloads a `.musicxml` whose root is
  `score-partwise`; importing that download on the list makes a second composition with the same
  bars; an `.mxl` imports too.
