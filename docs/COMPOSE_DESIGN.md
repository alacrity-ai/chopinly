# Chopinly — Compose: tap-driven music notation (WSHED-114)

**Status:** draft for Leif's review, 2026-09-13. Decisions Leif delegated are made
below (§2) and are the plan unless he objects.
**Brief:** *"I recently spent quite a bit of money on a music notation app for my
iPad … it's supposed to use the Apple Pencil to recognise if I'm writing an eighth
note, a quarter, a rest, a triplet … and it just fails. Overly complex, fails to
recognise the notes I'm laying down. I think we can build a basic music notation
component into Chopinly. Keep it basic, but extendable."*
**Confirmed by Leif:** tool name **Compose**; four rails (control, palette,
utility, expression); a **Rest toggle**, not a rest palette; key / time / clef
changes **anywhere in the piece**; piano grand staff by default; the score must
**never scroll or zoom while a palm rests on the glass**; PDF export with basic
scaling first, MusicXML / MIDI later; **Phase 0 lands note placement alone** so
the ergonomics can be judged before anything deeper is built.
**Companion:** [`COMPOSE_IMPLEMENTATION.md`](COMPOSE_IMPLEMENTATION.md) (phased plan).

## 0. Principles

1. **Nothing is guessed.** No handwriting or gesture recognition, ever. A tap
   places exactly the armed duration at exactly the slot and pitch under the
   stylus. The musician's intent is in the palette; the staff only confirms it.
2. **A bar always adds up.** Every measure sums to its time signature. Gaps are
   rests, rests are real events, and placing a note consumes the rest under it.
   Nothing can be half-written; undo is a snapshot; export is a walk.
3. **Placing is the product.** Arm, tap, done. The palette is one tap away; the
   ghost shows where a note will land before it lands; the sound confirms it.
   Everything else may take two taps.
4. **Selection first, then the button.** With a selection, every palette and
   rail button acts on it — duration, dot, tie, tuplet, accidental,
   articulation, dynamic. Without one, a palette button arms the next placement.
   One rule for every button.
5. **The score holds still.** In edit modes nothing pans or zooms. Scrub is a
   deliberate mode; in it, nothing places.
6. **It is Chopinly.** A composition is a piece; a piece is a goal. Vanilla ES
   modules, no build step, one deploy, one sync engine, the merge rule in one
   file, every new module in the service worker precache, copy in register (no
   "document", "canvas", "object", "annotation" in UI text).
7. **Basic, but extendable.** The model is shaped like MusicXML so voices,
   instruments, lyrics, repeats and export are additions, never migrations.

## 1. What the musician gets

| | Compose (MVP) |
|---|---|
| Open | Compose → *new composition* → a blank piano score: treble + bass, C major, 4/4, eight empty bars, the quarter already armed. The first tap places a note. |
| Rails | **Control:** undo · redo · Select · Scrub · delete · zoom. **Palette:** whole · half · quarter · eighth · sixteenth · *more* (double whole, 32nd, 64th) · dot · tie · tuplet · ♯ ♭ ♮ · **Rest** toggle. **Utility** (drops down from the palette): key · time · clef · fermata · staccato · accent · tenuto · trill · mordent · turn · glissando. **Expression** (second drop-down): pp p mp mf f ff · < > hairpins · text. |
| Place | Arm a duration, tap a staff: the note lands on the nearest line or space at the nearest slot of that duration. A ghost follows the stylus before the tap. The note sounds as it lands. |
| Rests | Rest on + eighth armed = an eighth rest. Deleting anything leaves rests behind. A bar's rests are always drawn in standard groupings. |
| Chords | Tap a different pitch at an existing note's slot: the pitch joins the chord. Same duration for the whole chord. |
| Select | Tap a note to select it (a rest or a chord's stem too, in Select mode). Drag over notes (Select mode) for a range; tap more to add. Tap empty staff to clear. |
| Re-pitch | Drag a selected note up or down: it moves by staff step, sounding each new pitch. Horizontal drags are ignored. Arrow keys do the same. **A cluster:** when every selected thing is a notehead, grabbing any one of them drags them all by the same steps, sounding the moving cluster; if one would collide or run off the staff the whole cluster holds. |
| Retype | With a selection, tap a duration: every selected note becomes that duration (and it is the armed duration now, Place mode). All or nothing: if any one cannot fit, that bar flashes and nothing changes anywhere. A selection holding rests (or marks) is refused with a hint — rests are the gaps, not things to retype. **Rest** with a selection turns the selected notes into rests of the same length and leaves the toggle itself alone. |
| Dot · tie · tuplet | Apply to the whole selection; tap again to remove. Tie needs a same-pitch neighbour (or two selected). Tuplet defaults to a triplet; hold for duplet / quintuplet / sextuplet / septuplet. |
| Copy · cut · paste | Copy takes the selection as a **phrase**: each note or rest with its duration, pitches, offset from the earliest selected onset and staff relative to the topmost; partial chords copy just the selected pitches; the clipboard lives for the session and travels between compositions. Cut is copy + delete. **Paste arms a cursor**: a ghost of the whole phrase follows the pen, snapped to the grid of its first duration; tap to drop; the tapped staff becomes the phrase's top staff (a two-staff phrase keeps its staves). The drop **replaces** what is under it (overlapping things go whole), appends bars past the end, and refuses a note that would straddle a barline (bar flash; the cursor stays armed). The pasted notes stay selected, so a cluster drag transposes them at once. Cmd/Ctrl C · X · V on a desk. |
| Hear it | The transport rail plays the piece from the playhead at its tempo (saved with the piece); the slider and a bar back / forward seek; Space plays and pauses, Home stops. |
| Bars | A new empty bar appears when the last one gets its first note. Trailing empty bars beyond one are trimmed on export. |
| Key · time · clef | Insert a change at any bar from the utility rail; it holds until the next change. Cautionary accidentals and courtesy signatures follow standard practice. |
| Scrub | Finger pans, pinch zooms, nothing places. Leave Scrub and the score is pinned again. A mouse wheel always scrolls (a desk has no palm). |
| Keep | Every edit is saved on this device at once. With an account (P3), compositions sync through the logbook like everything else, and a composition can be *practiced* like a score. |
| Export | A vector PDF, Letter or A4, staff size and margins as sliders, title and composer at the top. *Add to Scores* drops the PDF into the library in one tap. MusicXML follows for the Sibelius round-trip; MIDI after. |

Not in the MVP: more than one voice per staff, more than two staves, cross-staff
beams, lyrics, chord symbols, repeats and endings, playback with tempo, MusicXML
import, parts, sharing.

## 2. Decisions Leif delegated

| Question | Decision | Why |
|---|---|---|
| Engraver | **Our own**, in `js/lib/compose/`, reusing `js/lib/music.js` (pitch, keys, clefs, steps) and the Bravura glyph table extracted from the sight-singing staff into `js/lib/staff/glyphs.js`. Not VexFlow. | The sight-singing staff already proves the approach: SMuFL glyphs as SVG text, geometry as primitives, one unit S. VexFlow would add a 700 KB dependency to vendor, a second coordinate system, and an SVG we do not control — which matters because the PDF exporter (§10) walks our SVG subset. The layout in `js/lib/staff/layout.js` stays the sight-singing renderer; Compose gets a grand-staff engraver rather than bolting chords, two staves and beam groups onto a single-melody layout. |
| Time base | **Ticks, 6720 per quarter** (960 × 7). A duration is `{ base, dots, tuplet }` (`base` = 1 whole … 64); `ticks()` resolves it. | Integers for every value the palette can make: dots to two and tuplets 2 / 3 / 5 / 6 / 7 down to the 64th (a 64th is 420, a triplet eighth 2240, a septuplet sixteenth 960). 960 alone cannot divide by 7, so septuplets would have needed rounding — which breaks the bar-adds-up invariant. Sixteenth-units, as the sight-singing staff uses, cannot express 32nds or tuplets. |
| Rests | **Explicit events** in the model, normalised after every edit into standard groupings. | The layout, the tap grid, MusicXML and MIDI all need rests as things. Deriving them from gaps at render time makes every consumer re-derive the same rules. The engine owns the invariant instead: `normalize(measure)` merges and splits rests into the fewest standard rests aligned to beats. |
| Tap → slot | Inside a rest, the tap snaps to the **grid of the armed duration** (a whole rest with an eighth armed offers eight slots). On an existing note's slot, the tap **joins the chord**; on that note's own head, it **selects**. | Onset-only snapping would make a note on the "and" of one impossible until an eighth rest already sat there. The armed grid is exactly what the musician means. The ghost shows the snap so nothing surprises. |
| Palette on a selection | **Acts on the selection and becomes the armed value.** Quarter selected, tap half: it is a half now, and the next placement is a half. To arm without editing, tap empty staff first (clears the selection). | Leif asked for a call. This is the Dorico / Sibelius convention, and it makes every rail button obey principle 4. The alternative — palette never touches a selection — forces a second "change duration" control that does the same thing. |
| Retype that overflows | **Refused** with a bar flash and a haptic. Never truncated, never pushed into the next bar. | Silently altering neighbours is the class of surprise the brief complains about. A tie across the barline is the honest way to cross it, and it is one tap. |
| Tie | One note selected: ties to the **next same-pitch note** in the same staff (across a barline included); two adjacent same-pitch notes selected: ties them. A chord ties every pitch that has a match. Otherwise a hint: *tie needs the same pitch next*. | Unambiguous, and covers the by-far-common case in one tap. Slurs are not ties and are out of scope. |
| Tuplet | Applies to the selection's events: **n in the time of m** where n defaults to 3 and the total stays in the bar. Default triplet on tap; hold for 2 / 5 / 6 / 7. A tuplet is a property of a run, drawn with a bracket and number. | Matches how musicians think ("make these three a triplet"). Arming a tuplet before placing (Sibelius style) is also supported: with tuplet on and an eighth armed, each tap places a triplet eighth until the group closes. |
| Chords | A chord is **one event with several pitches**, the MusicXML `<chord/>` shape. Duration, dots, tuplet and articulations live on the event; accidental and tie live on the pitch. | The brief's "dot the whole chord" is one field write. Seconds, stem side and accidental stacking are layout concerns. |
| Voices | **One voice per staff in the UI; the model has `voices[]`** from day one, index 0 used. | Zero cost now, no migration later. |
| Staves | **Grand staff only** in the UI; the model is `parts[] → staves[]`. | Same reasoning. A single-staff instrument later is `staves.length === 1`. |
| Bars | Start with **eight empty bars**; a new bar is appended when the last bar receives its first event; trailing empty bars beyond one are trimmed on export and on close. | An empty page with no bars gives the musician nothing to tap; an infinite scroll of empty bars is noise. |
| Measures per system | Ideal widths from the **union of onsets across both staves** (a bar's columns are shared by the staves), packed 1–6 per system, justified; last system not stretched past ×1.25 (the sight-singing rule). | Both staves must align tick for tick. Computing widths per staff and then reconciling is how engraving bugs are born. |
| Screen | **Wrapped systems** at the viewport width, stacked vertically, exactly as the PDF will page them. Zoom scales S (8–22 px). | What you edit is what you print. Horizontal scrolling would make page turns on the iPad a different layout from the export. |
| Palm safety | In **edit modes** the score accepts: pen down/move/up; a **single** finger tap (down/up within 300 ms and 10 px with no other touch active). Everything else — multi-touch, wide contacts, finger drags — is discarded. `touch-action: none` on the score. In **Scrub**, one finger pans, two pinch, the pen pans too, and nothing places. | The reader's tap rule already lives in Scores. A resting palm is a wide, long, moving contact that fails every test. A phone without a stylus still gets tap-to-place. |
| Sound | The existing piano voice (`js/lib/keyboard/piano.js`) auditions a placed note and each step of a drag; chords sound together. No metronome coupling, no playback in the MVP. | Already built, polyphonic, offline. |
| Undo | **Snapshots** of the measures array per committed edit, capped at 200, structured-cloned. Drag re-pitch commits once on release. | Compositions are tens of KB; a snapshot is cheaper and safer than inverse commands. |
| Persistence | Compositions live in the **logbook document** (`compositions[]`), saved on every committed edit (debounced 300 ms). **P3** adds sync as kind `composition` with a 256 KB body cap. | The logbook is the one store with migration, sync and account wipe. Ink proved a big-bodied kind works. |
| PDF | **Vector**: our SVG subset → PDF through a vendored `pdf-lib` + `fontkit` with a Bravura OTF loaded only at export. Letter / A4, staff space 1.6–2.2 mm, margins, title and composer. | The SVG the engraver emits is a closed set — lines, rects, polygons, cubic paths, Bravura text, plain text — so a walker of ~200 lines covers all of it. Raster at 300 dpi would print fine but it is a half-measure and Leif has vetoed those. |
| Tool placement | New tool `compose`, category **`library`**, listed **after Scores**. Routes `#/compose` (list) and `#/compose/<id>` (editor). | Scores and Compose are the sheet-music group. |
| Copy | *composition*, *bar*, *note*, *rest*, *place*, *arm*, *Scrub*, *Select*. Not *document*, *canvas*, *object*, *insert mode*. | House style. |

## 3. Architecture

```
chopinly.com (Pages project "woodshed")
├── /app                          the shell; Compose is one more tool in the registry
├── js/lib/staff/glyphs.js        Bravura codepoints, one table shared by the sight-singing staff and Compose
├── js/lib/compose/
│     ticks.js                    PPQ, duration ↔ ticks, tuplet maths, bar capacity, beat groups, standard rest splits (pure)
│     model.js                    schema v1: newComposition(), ids, validate(), clone()
│     engine.js                   every edit as a pure function doc → doc: place, remove, retype, setPitch, addPitch,
│                                 toggleRest, dot, tie, tuplet, accidental, articulate, dynamic, text,
│                                 setKey / setTime / setClef, appendBar, trimBars, normalize — throws Nudge("sentence")
│     history.js                  undo / redo snapshot stack
│     layout.js                   doc → systems → staves → coordinates in S; columns per bar (union of onsets),
│                                 beams, tuplet brackets, ties, accidentals, rests, brace, barlines, hairpins
│     hit.js                      (x, y) → { bar, staff, ticks, step } via the layout's columns; nearest note / rest / stem
│     render.js                   layout → SVG (Bravura text + primitives); selection + ghost as class toggles / overlay
│     sound.js                    audition(pitches) on the piano voice
│     export/pdf.js               P4, lazy: SVG subset → PDF (vendored pdf-lib + fontkit, Bravura OTF)
│     export/musicxml.js          P4: doc → MusicXML 4.0 part-wise
├── js/tools/compose/
│     index.js                    { id: "compose", name: "Compose", category: "library" }
│     ui.js                       router: list ↔ editor
│     list.js                     compositions: new, open, rename, delete; P3 search + goal link
│     editor.js                   the score host: modes, pointer policy, ghost, selection, keys, save
│     rails.js                    control + palette rails; the drop-down host
│     utility.js                  P2: key / time / clef pickers, articulations, ornaments, glissando
│     expression.js               P3: dynamics, hairpins, text
│     exportsheet.js              P4: page size, staff size, margins, preview, save / add to Scores
├── js/lib/logbook.js             + compositions[] (P0 local; P3 kind `composition`)
├── js/lib/merge.js               P3: KINDS + composition, BODY_CAPS.composition = 262144
├── vendor/pdflib/                P4: pdf-lib.esm.js · fontkit.esm.js · LICENSE · VERSION
└── fonts/Bravura.otf             P4: loaded at export only (the woff2 stays the screen font)
```

The data layer never touches the DOM. `engine.js` and `layout.js` are pure and
node-tested; `js/tools/compose/*` is the UI. The merge rule stays in
`js/lib/merge.js`.

## 4. Data model

### 4.1 The composition (schema `v: 1`, logbook `compositions[]`)

```js
{
  id, v: 1, title, composer?, goalId?, createdAt, updatedAt, openedAt,
  parts: [{ id: "p1", name: "Piano", staves: 2 }],
  measures: [
    {
      n: 1,                                   // 1-based, display only; order is the array
      key?:  { fifths: -3 },                  // present only where a change happens (bar 1 always)
      time?: { beats: 4, unit: 4 },           // same
      clefs?: { 0: "treble", 1: "bass" },     // per staff index, same
      staves: [                               // one entry per staff of the (single) part
        { voices: [ [ /* events */ ] ] },
        { voices: [ [ /* events */ ] ] },
      ],
      marks?: [ { kind: "text", at: 0, text: "rit." } ]   // P3: bar-level text
    },
  ],
}
```

An **event** (one voice slot):

```js
{ id, kind: "note" | "rest",
  dur: { base: 4, dots: 0, tuplet?: { n: 3, in: 2, id } },   // base: 1 2 4 8 16 32 64 (0 = double whole)
  pitches?: [ { step: "C", alter: 0, octave: 4, tie?: "start" | "stop" | "both", acc?: "show" | "hide" } ],
  art?: ["staccato", "accent", "tenuto", "fermata", "trill", "mordent", "turn"],
  gliss?: "start" | "stop",
  dyn?: "pp" | "p" | "mp" | "mf" | "f" | "ff",                 // P3
  hairpin?: "cresc-start" | "cresc-stop" | "dim-start" | "dim-stop",   // P3
}
```

- `alter` is the spelled accidental (−2…2); `acc: "show"` forces a cautionary,
  `"hide"` suppresses one the key implies. Display is otherwise computed (§6.4).
- `tie` lives on the pitch (MusicXML `<tie>`), so a chord can tie some notes.
- `tuplet.id` groups the events of one bracket; `n` in the time of `in`.
- `gliss` on an event starts / ends a glissando line to the next event.
- Pitch is never a MIDI number; spelling survives every round trip.

### 4.2 Invariants the engine keeps

1. `Σ ticks(events)` of every voice of every staff of every bar `===
   capacity(time in force)`. Enforced by `normalize` after every edit; a
   violation is a thrown bug, never a rendered state.
2. Rests are in standard groupings: a fully empty bar is one whole-bar rest;
   gaps split at beat boundaries into the fewest rests, longest first.
3. Bar 1 carries `key`, `time`, `clefs`. Later bars carry only changes.
4. A tuplet's events are contiguous in one voice and sum to `n × unit`.
5. Ties pair `start`/`stop` on the same spelled pitch in consecutive events of
   the same staff (across bars allowed).

### 4.3 Per-device settings (`ws.compose.*`)

`zoom` (S in px), `armed` (`{ base, dots, rest, tuplet }` — restored per
session), `fingerPlaces` (bool, default true), `lastId`.

### 4.4 D1 (P3)

`entities.kind` gains `composition`; no schema change. `BODY_CAPS.composition =
262144` in `js/lib/merge.js`, shared with the Functions. A composition larger
than that refuses to back up with a sentence, like ink.

## 5. Ticks and durations (`ticks.js`)

- `PPQ = 6720` (`WHOLE = 26880`). `ticks({ base, dots, tuplet })` = `(WHOLE / base) ×
  (2 − 2^−dots) × (tuplet ? in / n : 1)`; `base 0` = 2 × WHOLE.
- `capacity({ beats, unit })` = `beats × WHOLE / unit`.
- `beatGroups(time)` → the beam grouping boundaries: simple metres group by
  the beat unit; compound (`beats % 3 === 0`, `beats > 3`) group by dotted
  beats; `2/2` by halves. A beam never crosses a group.
- `splitRest(ticks, at, time)` → the standard rest run for a gap starting at
  `at`: each rest starts on a multiple of its own size (a half rest on beat 3,
  never on beat 2), longest first; in compound metres a rest also stays inside
  its dotted group. A gap that is the whole bar is one whole rest in any metre.
- `grid(armed, time)` → the slot size the tap snaps to inside a rest.

## 6. Layout (`layout.js`)

Everything in **S** (one staff space; default 12 px on screen, scaled by zoom;
the PDF chooses its own S in mm). Steps are half-spaces from line 1, as in
`music.js`. Glyphs are Bravura at `font-size = 4S`.

### 6.1 Grand staff geometry

- Two staves, top line of the bass staff **8S** below the bottom line of the
  treble staff (leaves room for three ledger lines each side).
- A brace (`U+E000`) at the system's left edge spanning both staves; barlines
  span both staves; the final barline is thin-thick.
- Systems stacked with **10S** between the bass staff of one and the treble of
  the next; **6S** top padding on the first (title space is the export's job).
- Leading symbols per system: clef per staff, key signature per staff, time
  signature on system 1 and wherever it changes.

### 6.2 Columns

For each bar, the **union of onsets** across both staves' voices forms the
columns. Each column gets an ideal width `w = 2.5 + 1.05 × log2(ticks / 240)`
(the sight-singing curve with ticks) plus accidental padding (1.4S per stacked
accidental) and dot padding (0.9S). A bar's ideal width is the sum plus barline
padding. Systems pack greedily, 1–6 bars, then justify by scaling column widths
(leading symbols keep natural width). Mid-bar key / time / clef changes are
columns of their own.

### 6.3 Noteheads, stems, chords

- Head glyph by `base` (double whole, whole, half, black). Stem 3.5S, longer so
  far-ledger notes reach the middle line. Direction: single note — down at or
  above the middle line; chord — decided by the note farthest from the middle.
- Chord seconds: the lower note of a second sits on the stem's normal side, the
  upper flips to the other side. Accidentals stack right-to-left, top-down, with
  the usual zig-zag when they collide.
- Ledger lines per note; dots in spaces; a chord's dots align to a column.

### 6.4 Accidentals

Per bar per staff: the key's alterations, then a memory of `letter+octave →
alter` set by each drawn accidental; a pitch draws one when its `alter` differs
from the effective one (naturals included), not when tied in; `acc` overrides.
Reset at the barline (courtesy accidentals in the following bar are `acc:
"show"`, which the engine sets when a tie crosses).

### 6.5 Beams, flags, tuplets

- Eighths and shorter beam with neighbours in the same beat group and voice;
  rests break a beam; a lone one gets a flag. Primary beam 0.5S thick; secondary
  beams for sixteenths and finer, with partial beams at the ends of a group.
- Beam slope from the outer noteheads, clamped to ±1S; stems extend to reach it.
- Tuplet: a bracket over (or under, with the stems) the run, the number in
  Bravura tuplet digits centred; the bracket is omitted when the run is one
  beamed group (the number sits on the beam).

### 6.6 Rests

Standard glyphs to the 64th; whole-bar rest centred on the bar hanging from
line 4; others centred on the middle line; a dotted rest gets its dot.

### 6.7 Ties, glissandi, hairpins, articulations, dynamics, text

- Ties: cubic Bézier from head to head, curving away from the stem; split with
  stubs across a system break (the sight-singing rule).
- Glissando: a straight line head to head with *gliss.* along it.
- Hairpins (P3): two lines from the start column to the stop column below the
  staff; a hairpin continues across a system break with an open end.
- Articulations sit at the notehead side opposite the stem (fermata always
  above); ornaments above the staff; dynamics below the staff at the column,
  text above at the column.

### 6.8 Hit tables

The layout emits, per system, per bar: `x0, x1`, the column list `[{ ticks, x
}]`, and per staff `topY`. `hit.js` maps a point to `{ system, bar, staff,
ticks: piecewise-linear between neighbouring columns, step: round((topY + 4 −
y) × 2) }`, and separately answers "which drawn thing is under this point":
notehead (pitch), rest, stem (chord), nothing.

## 7. The engine (`engine.js`)

Every operation takes the document and returns a new one (structured clone of
the touched bar; the rest shared), or throws `Nudge(sentence)` which the UI shows
as a flash + toast and never records. `normalize` runs on every touched bar.

### 7.1 Operations

| op | rule |
|---|---|
| `place(doc, { bar, staff, ticks, step }, armed)` | Snap `ticks` to `grid(armed)` inside the rest under it. Consume rests from that onset totalling `ticks(armed)`; if a note sits at the onset and it is not a rest, this is `addPitch` instead. Not enough rest ahead → Nudge *no room in this bar*. Rest armed → the event is a rest. Last bar touched → `appendBar`. |
| `addPitch(doc, eventId, pitch)` | Adds the pitch to the chord (same spelled pitch → no-op, selects instead). |
| `remove(doc, ids)` | Removes pitches (from chords) or whole events; freed ticks become rests. |
| `retype(doc, ids, dur)` | Shorter → the difference becomes rests after it; longer → consumes following rests in the bar or Nudge *too long for this bar*. |
| `setPitch(doc, pitchIds, deltaSteps)` | Moves by staff step within the staff's clef, spelling from the key (a step up from B in C major is C, from B♭ in F major is C). |
| `toggleRest(doc, ids)` | Note ↔ rest, keeping the duration. |
| `dot(doc, ids, dots)` | Retype with dots (same overflow rule). |
| `tie(doc, ids)` | §2 tie rule; toggles off when already tied. |
| `tuplet(doc, ids, n)` | Wraps the run: the events' total must be `n × unit`; rewrites their `dur.tuplet` and re-fills. Toggle off restores plain durations when they fit, else Nudge. |
| `accidental(doc, pitchIds, alter)` | Sets `alter`; ♮ sets 0 with `acc: "show"` when the key would hide it. |
| `articulate(doc, ids, art)` / `dynamic` / `hairpin` / `text` | Toggles the mark. |
| `setKey / setTime / setClef(doc, bar, value)` | Writes the change on that bar; `setTime` re-normalises every following bar until the next change: content is kept, overflowing bars spill into new bars (the one place content moves — with a confirm sheet stating how many bars it touches). |
| `clipFrom(doc, items)` / `paste(doc, clip, { bar, ticks, staff })` | The phrase and its drop (§1 *copy · cut · paste*): clear the covered region per touched (bar, staff), write the phrase, fill gaps with rests, normalise; Nudge on a barline straddle. |
| `appendBar / trimBars` | §2. |

### 7.2 Guards

Durations the palette cannot make (dots beyond two, tuplet ratios outside 2 / 3 /
5 / 6 / 7) are refused at the engine with a Nudge, so the model never holds a
non-integer tick count; `ticks()` throws on any non-integer as a last guard.

## 8. The editor (`editor.js`, `rails.js`)

### 8.1 Screen

```
┌ control rail: ↶ ↷ │ Select  Scrub │ 🗑 │ −  + ─────────────── title ┐
├ palette rail: 𝅝 𝅗𝅥 ♩ ♪ 𝅘𝅥𝅯 ▾ │ • ⌒ 3 │ ♯ ♭ ♮ │ Rest ● │ ⌄ (utility) ┤
│ (utility / expression rail slides in under the palette when open)     │
│                                                                       │
│   ╭── 𝄞 ───────────────────────────────────────────────────────╮     │
│   │                                                             │     │
│   ╰── 𝄢 ───────────────────────────────────────────────────────╯     │
│   (systems stack; the viewport scrolls only in Scrub / with a wheel)  │
└───────────────────────────────────────────────────────────────────────┘
```

Rails are fixed; the score fills the rest. On a phone the palette wraps to two
rows; the utility / expression rails become sheets.

### 8.2 Modes

| mode | what a pointer does |
|---|---|
| **Place** (default; any duration armed) | tap on staff → `place`; **pointer down on a notehead grabs it at once** (selected, and a vertical drag re-pitches by staff step, sounding each; release commits; a clean tap on an already-selected note lets it go) — the mode and the armed duration are untouched, so the next tap elsewhere still places; a rest (or a chord's stem) is where the next note goes, so a tap there places; long-press → marquee (Select mode for this gesture) |
| **Select** (armed duration cleared) | tap → select / toggle; the same grab-and-drag on a notehead; **pointer down on empty staff that moves more than a few px becomes a lasso** — a freehand path drawn under the tip; lifting closes it and selects everything whose anchor lies inside (noteheads one by one, rests, later marks), replacing the selection; a down that never moves is a tap that clears |
| **Scrub** | one finger / pen → pan; two fingers → zoom; nothing selects or places |

Tapping the armed duration again in the palette clears it (→ Select). Esc → Select.
Rest, dot and tuplet are **states** that persist across taps: *dotted eighth
armed* places dotted eighths until dot is turned off; *rest on* places rests
until it is turned off. Accidentals arm **one-shot**: the next placed note
carries the accidental, then the button clears.

### 8.3 Pointer policy (palm safety)

- The score element has `touch-action: none`, `user-select: none`, captures
  pointers.
- Edit modes accept a **pen** pointer fully; a **touch** pointer only as a
  single tap: `pointerdown` with no other active touch, `pointerup` within 300
  ms and 10 px, contact `width`/`height` under 40 px when reported — except that
  a single narrow finger landing **on a notehead** may grab and drag it (a second
  contact lets go and reverts). Anything else is dropped and cancels nothing (a
  palm landing mid-drag does not break a pen drag). A **mouse** behaves as a pen.
- `fingerPlaces` off (a setting) turns finger taps into select-only.
- Scrub uses the reader's swipe logic with inertia and pinch-to-zoom; zoom is
  applied by re-laying out at the new S (no CSS transform — text stays crisp).
- Ghost: on `pointermove` (pen / mouse) the hit table gives the slot and step;
  the ghost notehead draws at that position at 40 % in the armed shape. Touch
  has no hover; the ghost appears on `pointerdown` and the placement happens on
  `pointerup` at the *down* position (a wobble does not move it).

### 8.4 Selection

A set of ids: pitch ids (`event.id:index`) and event ids (rests, and whole
chords via the stem). Rendered as a class on the SVG groups (brass fill + halo,
as the sight-singing *current* state). Selection survives re-render (ids are
stable) and undo / redo (whatever still exists stays selected). Keyboard: ←/→ move to the previous / next event in the staff, ↑/↓
re-pitch, Shift+←/→ extend, Delete / Backspace remove, Cmd/Ctrl+Z / Shift+Z
undo / redo, `1`–`7` = 64th … whole (the MuseScore mapping), `.` dot, `r` rest,
`t` tie, `s` Scrub, `v` Select, `Esc` clear.

### 8.5 Sound

Placing sounds the pitch (a chord sounds together) for 250 ms; re-pitch drag
sounds each new step; selecting is silent. Volume follows the shell's audio
master. Mute toggle in the control rail overflow.

### 8.6 Saving

Every committed edit (place, remove, retype, drop of a drag, rail action) pushes
a history snapshot and schedules a logbook save (debounced 300 ms; flushed on
`pagehide`, on leaving the tool, and on undo/redo). Reopening restores the last
document and the per-device zoom. Undo history is per open editor, not saved.

### 8.5a Dots, ties, tuplets, accidentals as built (v72)

- **Dot** cycles the armed dots 0 → 1 → 2 → 0; with a selection it dots every selected note (a chord is one event) and, when all are dotted already, undots. A dot is a retype, so it obeys the overflow rule.
- **Tie** acts on the selection only (§2 rule): one note → the next same pitch in the staff, several → only between selected neighbours, all tied → untie. Ties are re-derived after every edit (`cleanTies`): a `start` survives only while the next event holds the same spelled pitch; the partner is `stop`; a tied-in pitch draws no accidental but sets the bar's accidental memory.
- **Tuplet** with a selection wraps that run (rests included); its plain total must be n × a plain value; a duplet takes room from the rests after it. Tap the button to arm a tuplet of the shown size, hold for 2 / 3 / 5 / 6 / 7. With a tuplet armed, the first tap in plain rests opens a whole group (n units of the armed base, filled with tuplet rests); a tap inside any tuplet's rests takes that group's ratio whatever is armed. A group whose notes are all deleted dissolves into plain rests. Groups travel whole through the clipboard; a paste that lands on part of a group replaces the whole group.
- **Accidentals** ♯ ♭ ♮ (𝄪 𝄫 behind the ▾) act on the selected pitches; without a selection they arm for the next placed pitch and clear after it (one-shot). Pressing the accidental a pitch already has takes it back to the key; an accidental the key already implies becomes a cautionary (`acc: "show"`), pressed again it hides. Chords stack accidentals into columns six steps apart.
- Keys: `.` dot, `t` tie.

### 8.5b The utility rail as built (v73)

A fourth lane, toggled by the **𝄞 …** button on the control rail (remembered per device), holds **‹ bar N ›** (the *target bar*: it follows the last tap, grab, lasso or drop, and the arrows move it), then **Key ▾ · Time ▾ · Clef ▾** pickers whose buttons show what is in force at that bar, then fermata · staccato · accent · tenuto · trill · mordent · turn · *gliss.* acting on the selection.

- **Key** (15 keys, C♭ … C♯ with relative minors) inserts a change at the target bar; picking the key already in force there removes an explicit change. Cancelled accidentals get naturals before the new signature; the same key/time re-appear as a courtesy at the end of a system when the next system opens with a change.
- **Time** (2/4 3/4 4/4 5/4 6/8 9/8 12/8 2/2 3/8 7/8, or *other…*) re-cuts the bars from the target bar to the next time change: notes that cross a new barline split into tied pieces (`decompose`: one plain / dotted value, else the fewest plain values); a tuplet that would cross refuses the change (bar flash); key and clef changes inside the stretch follow their tick; if content spills into new bars the editor asks first. Choosing the metre before the stretch simply rejoins it. Empty bars are stored as one rest that spans the bar when a value does (whole in 4/4, dotted half in 3/4 and 6/8), else the metre's standard split — always drawn as one whole-bar rest.
- **Clef** per staff (treble, bass, alto, tenor) at the target bar; pitches are absolute so nothing re-steps; a mid-piece clef draws at 80 %.
- **Marks** toggle on every selected note (all have it → off). Staccato, accent and tenuto hug the head on the side away from the stem, in a space; fermata and the ornaments go above the staff. **gliss.** draws a line with its label to the next note of the staff and vanishes if either end goes.

### 8.6 Transport (v70) and the rails' look (v71)

A third rail sits between the control rail and the palette: **stop · a bar back · play/pause · a bar forward · position slider (bar N of M) · tempo (♩= − / +, hold to repeat, tap the number to type)**. `Space` toggles play, `Home` stops. Playback (`play.js`) turns the document into a timeline of absolute-tick notes (ties merge into one sounding note), sequences them 180 ms ahead on the audio clock through the piano voice, and a playhead line on the overlay follows; the view scrolls only when the playing system leaves it. The tempo is saved with the piece (`tempo`, default 100, 20–300) and is *not* an undoable edit. Editing while playing re-sequences from the current position.

The rails are 3.4 rem tall (2.8 rem under 480 px), buttons and icons scale with them, and Bravura glyphs in buttons are centred on their **ink**, not their typographic box: `rails.js` measures each glyph with canvas `measureText` (font and ink bounding boxes) once Bravura has loaded and slides it by `--dy`, so a whole note, a quarter, a rest and a sharp all sit dead-centre whatever the button size. The tempo group is one pill; the position slider fills with the accent up to the playhead.

## 9. Rendering (`render.js`)

- One `<svg>` per composition, `viewBox` in px at the current S, `width: 100%`.
  Groups: `.cp-sys` per system → `.cp-staff` → `.cp-bar` → `.cp-ev[data-id]` →
  `.cp-head[data-pid]`, `.cp-stem`, `.cp-rest`, plus system-level `.cp-beam`,
  `.cp-tie`, `.cp-tuplet`, `.cp-hairpin`.
- **Full re-render on document change**, measured; a 32-bar piano piece is
  ~1,500 nodes and renders in a few ms. If a device shows > 16 ms, re-render
  per system (the layout is already per system). Ghost and marquee live in a
  separate overlay `<svg>` so pointer moves never touch the score's DOM.
- Colours from the skin tokens (`--fg`, `--staff-line`, `--hi`); the PDF walker
  forces black on white.
- CSS: `.cp-*` in `css/app.css`; Bravura via the existing `@font-face`.

## 10. Export (`export/`, P4)

### 10.1 PDF

- Vendored `pdf-lib` (MIT) + `@pdf-lib/fontkit` (MIT) as ES modules under
  `vendor/pdflib/`, imported only when the export sheet opens; `fonts/Bravura.otf`
  (OFL) fetched then and embedded subset.
- The exporter re-runs `layout()` at the print S (staff space in mm × 72 / 25.4
  pt) for the printable width, pages the systems (a system never splits), draws
  the title / composer header on page 1 and page numbers from page 2, then walks
  the layout's primitives directly (not the screen SVG): `line`, `rect`,
  `polygon` → `drawLine` / `drawRectangle` / path; ties and hairpins → SVG path
  strings via `drawSvgPath`; Bravura glyphs and text → `drawText` with the
  embedded fonts. Vector throughout.
- Controls in the export sheet: page size (Letter / A4), staff space (1.6 · 1.8
  · 2.0 · 2.2 mm), margins (narrow / normal / wide), header on/off; a live
  preview of page 1 as the same SVG scaled.
- *Save* hands the bytes to the share sheet / download; *Add to Scores* stores
  the PDF through `js/lib/scores/store.js` + `logbook.addScore` with the
  composition's title, composer and a `compose` tag, so the piece can be read
  and practiced in Scores at once.

### 10.2 MusicXML (P4)

`doc → MusicXML 4.0 part-wise`: one `<part>` with `<staves>2</staves>`,
`<divisions>6720</divisions>`, attributes on change bars, `<chord/>`, `<tie>` +
`<tied>`, `<time-modification>` + `<tuplet>`, `<articulations>`, `<ornaments>`,
`<glissando>`, `<dynamics>`, `<wedge>`, `<words>`. Because the model is shaped
after MusicXML this is a serialiser, not a translation. Import is out of scope.

### 10.3 MIDI (follow-up)

Type-1 SMF, one track per staff, ticks at `PPQ 6720`, ties merged, fixed velocity
per dynamic, no tempo map beyond a default 100 bpm. A follow-up card, not the MVP.

## 11. Logbook integration

- P0: `compositions[]` in the doc, `addComposition / updateComposition /
  removeComposition / composition(id) / compositions()`; migration fills `[]`.
- P3: `KINDS` + `composition`; `goalId` links a composition to a piece exactly
  as a score does (`placeForGoal` gains a third source); *practice this* on a
  composition starts the clock; deleting a goal clears the link. The account
  sheet's export includes compositions; account deletion wipes them.

## 12. Extension points (designed in, not built)

| later | what it touches |
|---|---|
| Voices | `voices[1]`; layout stems voice 1 down / voice 2 up; the UI gains a voice switch |
| Instruments / more staves | `parts[]`, `staves`; layout already takes N staves per system |
| Cross-staff beams | a beam whose events span staff indices |
| Lyrics · chord symbols | `event.lyric`, `event.harmony` (MusicXML shapes) |
| Repeats · endings | `measure.barline`, `measure.ending` |
| Playback | walk ticks → the piano voice on the shared clock; the metronome pill already exists |
| MusicXML import | the reverse walk into the same model |
| Stylus gestures | a layer that maps a recognised gesture to an engine op — the engine does not change |

## 13. Testing

- **node**: `ticks` (every palette duration is an integer; capacities; beat
  groups; rest splits), `engine` (every op + every Nudge; invariants hold after
  random edit sequences — a fuzz of 10,000 ops), `layout` (columns are the union
  of onsets; both staves share x per tick; beams never cross groups; packing
  under narrow / wide widths), `hit` (round trip: `xOf(ticksOf(x)) ≈ x`).
- **Playwright** (`tests/e2e/compose.mjs`, Chromium, iPad user agent for the
  touch policy): new composition → arm quarter → tap ×4 → four quarters in bar
  1 and bar 2 present; tap an existing head → selected; palette half → retyped;
  overflow → nudge and unchanged; undo ×2 / redo; rest toggle; a touch pointer
  with width 60 does nothing; Scrub pans; reload restores. Screenshots at phone
  and iPad widths attached to the card.
- **Leif's iPad pass** after P0 is the gate for everything after.
