# Chopinly — Compose: tap-driven music notation (WSHED-114)

**Status:** draft for Leif's review, 2026-09-13. Decisions Leif delegated are made
below (§2) and are the plan unless he objects.
**Brief:** *"I recently spent quite a bit of money on a music notation app for my
iPad … it's supposed to use the Apple Pencil to recognise if I'm writing an eighth
note, a quarter, a rest, a triplet … and it just fails. Overly complex, fails to
recognise the notes I'm laying down. I think we can build a basic music notation
component into Chopinly. Keep it basic, but extendable."*
**Confirmed by Leif:** tool name **Compose**; four rails (control, palette,
utility, expression); no rest palette (a Rest toggle stood in until v99, when Leif had it removed: rests are what is left when a note goes, Delete makes one); key / time / clef
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
5. **The score holds still.** In edit modes nothing pans or zooms. Pan is a
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
| Rails | **Control:** undo · redo · Select · Pan · delete · zoom. **Palette:** whole · half · quarter · eighth · sixteenth · *more* (double whole, 32nd, 64th) · dot · tie · tuplet · ♯ ♭ ♮ · **Rest** toggle. **Utility** (drops down from the palette): key · time · clef · fermata · staccato · accent · tenuto · trill · mordent · turn · glissando. **Expression** (second drop-down): pp p mp mf f ff · < > hairpins · text. |
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
| Identity | Title, composer and tags, stored like a score's, edited in the same details modal (tap the title on the header; also how a new composition starts), browsed like the Scores library. |
| Slur | On the utility rail beside the articulations: the earliest selected note of a staff to the latest (one note: to the staff's next note, over rests); the same span again removes it. Slurs nest and may share a note as an end. Drawn on the head side (every stem up → under the heads, otherwise above), arched to clear what lies between, split at a system break like a tie. Notes under a slur play legato. |
| Key · time · clef | Pick the change on the utility rail, then tap where it goes (key and time: a bar; clef: a staff and a beat); it holds until the next change. Cautionary accidentals and courtesy signatures follow standard practice. |
| Pan | Finger pans, pinch zooms, nothing places (called *Pan* since v81 — the slider on the transport rail is what scrubs). Leave Pan and the score is pinned again. A mouse wheel always scrolls (a desk has no palm). |
| Keep | Every edit is saved on this device at once. With an account, compositions sync through the logbook like everything else (v81, no plan needed — see §8.5e); P3 lets a composition be *practiced* like a score. |
| Export | **v88:** a vector PDF, Letter or A4, staff size − / + (1.4–2.5 mm), margins, header, a live page-1 preview. *Add to Scores* drops the PDF into the library in one tap and later sends replace it in place. MusicXML follows for the Sibelius round-trip (WSHED-119); MIDI after. |

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
| Voices | **Up to four per staff since v86** ([`COMPOSE_VOICES_DESIGN.md`](COMPOSE_VOICES_DESIGN.md)): sparse per bar, the voice follows the pen, a `voice ▾` picker on the Notes rail (v90; the `1 2 3 4` squares wrapped the rail), cross-staff notes. | The model had `voices[]` from day one, so no migration. |
| Staves | **Grand staff only** in the UI; the model is `parts[] → staves[]`. | Same reasoning. A single-staff instrument later is `staves.length === 1`. |
| Bars | Start with **eight empty bars**; a new bar is appended when the last bar receives its first event; trailing empty bars beyond one are trimmed on export and on close. | An empty page with no bars gives the musician nothing to tap; an infinite scroll of empty bars is noise. |
| Measures per system | Ideal widths from the **union of onsets across both staves** (a bar's columns are shared by the staves), packed 1–6 per system, justified; last system not stretched past ×1.25 (the sight-singing rule). | Both staves must align tick for tick. Computing widths per staff and then reconciling is how engraving bugs are born. |
| Screen | **Wrapped systems** at the viewport width, stacked vertically, exactly as the PDF will page them. Zoom scales S (8–22 px). | What you edit is what you print. Horizontal scrolling would make page turns on the iPad a different layout from the export. |
| Palm safety | In **edit modes** the score accepts: pen down/move/up; a **single** finger tap (down/up within 300 ms and 10 px with no other touch active). Everything else — multi-touch, wide contacts, finger drags — is discarded. `touch-action: none` on the score. In **Pan**, one finger pans, two pinch, the pen pans too, and nothing places. | The reader's tap rule already lives in Scores. A resting palm is a wide, long, moving contact that fails every test. A phone without a stylus still gets tap-to-place. |
| Sound | The existing piano voice (`js/lib/keyboard/piano.js`) auditions a placed note and each step of a drag; chords sound together. No metronome coupling, no playback in the MVP. | Already built, polyphonic, offline. |
| Undo | **Snapshots** of the measures array per committed edit, capped at 200, structured-cloned. Drag re-pitch commits once on release. | Compositions are tens of KB; a snapshot is cheaper and safer than inverse commands. |
| Persistence | Compositions live in the **logbook document** (`compositions[]`), saved on every committed edit (debounced 300 ms). Synced as kind `composition` with a **1 MiB** body cap (v81; 100 bars of solid sixteenths on two staves measure ≈ 350 KB, so the 256 KB first planned was too tight). | The logbook is the one store with migration, sync and account wipe. Ink proved a big-bodied kind works. |
| PDF | **Vector**: our SVG subset → PDF through a vendored `pdf-lib` + `fontkit` with a Bravura OTF loaded only at export. Letter / A4, staff space 1.6–2.2 mm, margins, title and composer. | The SVG the engraver emits is a closed set — lines, rects, polygons, cubic paths, Bravura text, plain text — so a walker of ~200 lines covers all of it. Raster at 300 dpi would print fine but it is a half-measure and Leif has vetoed those. |
| Tool placement | New tool `compose`, category **`library`**, listed **after Scores**. Routes `#/compose` (list) and `#/compose/<id>` (editor). | Scores and Compose are the sheet-music group. |
| Copy | *composition*, *bar*, *note*, *rest*, *place*, *arm*, *Pan*, *Select*. Not *document*, *canvas*, *object*, *insert mode*. | House style. |

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

### 4.1 The composition (schema `v: 3` since v91 — v1 one voice per staff, v2 voices, v3 bar-level expressions; logbook `compositions[]`)

```js
{
  id, v: 1, title, composer?, goalId?, createdAt, updatedAt, openedAt,
  parts: [{ id: "p1", name: "Piano", staves: 2 }],
  measures: [
    {
      n: 1,                                   // 1-based, display only; order is the array
      key?:  { fifths: -3 },                  // present only where a change happens (bar 1 always)
      time?: { beats: 4, unit: 4 },           // same
      clefs?: { 0: "treble", 1: "bass" },     // per staff index, same (a change at the barline)
      clefChanges?: [ { staff: 1, at: 13440, clef: "tenor" } ],  // changes on a beat inside the bar (ticks; sorted); either kind holds until the next
      barline?: { start?: "repeat", end?: "double" | "final" | "repeat" },   // v95 (WSHED-124, COMPOSE_FORM_DESIGN.md): the bar's barlines
      ending?: { n: 1, end: 5 },                                              // v95: an ending bracket from this bar to bar index `end`
      form?: [ { kind: "segno" }, { kind: "tempo", bpm: 120, text: "Allegro" } ], // v95: signs, jumps (dc, dsAlCoda …), rehearsal, tempo marks on the bar
      expressions?: [ { id, kind: "dyn", staff: 0, at: 3360, value: "mf" },              // v91 (WSHED-122, COMPOSE_EXPRESSIONS_DESIGN.md): dynamics, text and
                      { id, kind: "text", staff: 0, at: 0, value: "rit." },              // hairpins live on half-beat slots of the bar, not on notes;
                      { id, kind: "hairpin", staff: 0, at: 0, dir: "cresc", end: { bar: 2, at: 0 } },  // a hairpin sits on the bar of its start
                      { id, kind: "pedal", staff: 1, at: 0, end: { bar: 1, at: 0 } },                   // v96 (WSHED-125, COMPOSE_PIANO_DESIGN.md): a pedal line, a span like a hairpin
                      { id, kind: "ottava", staff: 0, at: 0, dir: 1, end: { bar: 0, at: 20160 } } ],    // v96: 8va (dir 1) / 8vb (−1) — the heads draw an octave off, the pitch stays; a pitch may carry `finger: 1–5`
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
  slurs?: [ { id, at: "start" | "stop" } ],                    // v84: a slur is the pair sharing an id; several may start or end here
  arp?: "plain" | "up" | "down",                                // v83: a rolled chord
  // v85's dyn / hairpin / text on the event are gone since v91 (schema v3): see `expressions` on the bar; `upgrade()` lifts them
  // v97 (WSHED-126, COMPOSE_NOTES2_DESIGN.md): a note may carry `graces: [{ base: 8 | 16 | 32, pitches, slash? }]` (grace notes before it) and `trem: 1–3`
  // v98 (WSHED-127, COMPOSE_RAILS2_DESIGN.md): `trill: { line?, alter? }` with the trill mark, `stem: "up" | "down"`, `beam: "break"`; MARKS gains portato, breath, caesura, invertedTurn, delayedTurn;
  //   a dyn's value may be a sudden one (sf sfz sfp fp rfz) or an extreme (pppp ppp fff ffff); a hairpin may be `niente`; an ottava `size: 15`; a pedal `style: "sign" | "sost"`;
  //   a fourth span kind `textline { text, endText? }`; `barline.times`, a tempo mark's `unit`, a rehearsal mark's `text` / `style`, and `measure.simile: 1 | 2` (a % bar)
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
6. Expressions sit on their bar's half-beat grid, one dynamic / text per staff
   and slot, hairpins on a staff never overlapping, a hairpin's end after its
   start (COMPOSE_EXPRESSIONS_DESIGN.md §1.2).

### 4.3 Per-device settings (`ws.compose.*`)

`zoom` (S in px), `armed` (`{ base, dots, rest, tuplet }` — restored per
session), `input` (`"pen"` | `"touch"`, v101 — §8.5i; replaces the never-built
`fingerPlaces`), `penSeen` (bool — the one-time flip to Pen has happened), `gesture` (bool,
default off, v102 — §8.5j), `lastId`.

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
- Slurs (v84): a tie-shaped curve from the first note's head to the last's on the head side, control offset `h` from the span (1.2–3.2) raised to clear the heads and stem tips between (`arc` in layout.js); two halves across a system break.
- Hairpins (v85, re-based on slots in v91): two lines from the start slot
  (after a dynamic on it, if any) to the end slot on the expression line —
  below the staff and below whatever sounds inside the span (`exprLine`); a
  hairpin continues across a system break as open halves. Dynamics sit on the
  same line under their slot, ink-centred where a note's head centre would be;
  text sits above the staff over what sounds at its slot. A slot with no
  column of its own is interpolated between its neighbours (`xOfTicks`). See
  COMPOSE_EXPRESSIONS_DESIGN.md §3.
- Articulations sit at the notehead side opposite the stem (fermata always
  above); ornaments above the staff.

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
| `articulate(doc, ids, art)` | Toggles the mark. |
| `addExpression` / `addHairpin` / `moveExpressions` / `moveHairpinEnd` / `setExpressionValue` / `removeExpressions` | v91: dynamics, text and hairpins on half-beat slots (COMPOSE_EXPRESSIONS_DESIGN.md §2). |
| `slur(doc, ids)` / `cleanSlurs(doc)` / `slurEnd(doc, staff, ev, id)` | A slur from the earliest selected note to the latest (one: to the next note); id-paired entries; re-derived with the ties after every edit. |
| `setKey / setTime(doc, bar, value)` | Writes the change on that bar; `setTime` re-normalises every following bar until the next change: content is kept, overflowing bars spill into new bars (the one place content moves — with a confirm sheet stating how many bars it touches). |
| `setClef(doc, bar, staff, clef, at = 0)` | A clef change for one staff on a beat of a bar (`at` in ticks: 0 = the barline, else a beat of the metre — the dotted group in compound time). Holds for that staff until its next change; the clef already in force there removes the change on that beat; off the beat refuses. Pitches are absolute, so nothing re-steps. |
| `clipFrom(doc, items)` / `paste(doc, clip, { bar, ticks, staff })` | The phrase and its drop (§1 *copy · cut · paste*): clear the covered region per touched (bar, staff), write the phrase, fill gaps with rests, normalise; Nudge on a barline straddle. |
| `appendBar / trimBars` | §2. |

### 7.2 Guards

Durations the palette cannot make (dots beyond two, tuplet ratios outside 2 / 3 /
5 / 6 / 7) are refused at the engine with a Nudge, so the model never holds a
non-integer tick count; `ticks()` throws on any non-integer as a last guard.

## 8. The editor (`editor.js`, `rails.js`)

### 8.1 Screen

```
┌ control rail: ↶ ↷ │ Select  Pan │ 🗑 │ −  + ─────────────── title ┐
├ palette rail: 𝅝 𝅗𝅥 ♩ ♪ 𝅘𝅥𝅯 ▾ │ • ⌒ 3 │ ♯ ♭ ♮ │ Rest ● │ ⌄ (utility) ┤
│ (utility / expression rail slides in under the palette when open)     │
│                                                                       │
│   ╭── 𝄞 ───────────────────────────────────────────────────────╮     │
│   │                                                             │     │
│   ╰── 𝄢 ───────────────────────────────────────────────────────╯     │
│   (systems stack; the viewport scrolls only in Pan / with a wheel)  │
└───────────────────────────────────────────────────────────────────────┘
```

Rails are fixed; the score fills the rest. A rail is one line, always (v100, §8.5h):
when it does not fit it scrolls sideways under a finger, it never wraps.

### 8.2 Modes

| mode | what a pointer does |
|---|---|
| **Place** (default; any duration armed) | tap on staff → `place`; **pointer down on a notehead grabs it at once** (selected, and a vertical drag re-pitches by staff step, sounding each; release commits; a clean tap on an already-selected note lets it go) — the mode and the armed duration are untouched, so the next tap elsewhere still places; a rest (or a chord's stem) is where the next note goes, so a tap there places; long-press → marquee (Select mode for this gesture) |
| **Select** (armed duration cleared) | tap → select / toggle; the same grab-and-drag on a notehead; **pointer down on empty staff that moves more than a few px becomes a lasso** — a freehand path drawn under the tip; lifting closes it and selects everything whose anchor lies inside (noteheads one by one, rests, later marks), replacing the selection; a down that never moves is a tap that clears |
| **Pan** | one finger / pen → pan; two fingers → zoom; nothing selects or places |

Tapping the armed duration again in the palette clears it (→ Select). Esc → Select.
Rest, dot and tuplet are **states** that persist across taps: *dotted eighth
armed* places dotted eighths until dot is turned off; *rest on* places rests
until it is turned off. Accidentals arm **one-shot**: the next placed note
carries the accidental, then the button clears.

### 8.3 Pointer policy (palm safety)

- The score element has `touch-action: none`, `user-select: none`, captures
  pointers.
- A **pen** pointer is accepted fully in the edit modes; a **mouse** behaves as
  a pen. What a **touch** pointer may do is the Pen | Touch switch's call
  (v101, §8.5i):
  - **Pen** (the policy since v70): a touch counts only as a single tap —
    `pointerdown` with no other active touch, `pointerup` within 300 ms and
    10 px, contact `width`/`height` under 40 px when reported — except that a
    single narrow finger landing **on a notehead** may grab and drag it (a
    second contact lets go and reverts). Anything else is dropped and cancels
    nothing (a palm landing mid-drag does not break a pen drag).
  - **Touch**: the finger is the pen. The width guard is off; a tap places;
    in Select mode a finger on a head, rest or mark grabs it and a stroke on
    empty staff lassoes, with fingertip-sized hit targets; holding (500 ms) or
    sliding aims with a lifted ghost, and any lift before that is a tap under
    the finger. A second finger still lets go.
- **Gesture** on (v102, §8.5j): in Place mode a stroke on empty staff that travels
  is a lasso; in either edit mode a stroke through *selected* heads or dynamics
  is a strike that deletes them. A Touch-mode finger that slides at once draws a
  gesture; one held first aims.
- Pan uses the reader's swipe logic with inertia and pinch-to-zoom; zoom is
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
undo / redo, `1`–`7` = 64th … whole (the MuseScore mapping), `.` dot,
`t` tie, `h` Pan, `v` Select, `Esc` clear.

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

### 8.5b The utility rail as built (v73, re-cut v74)

A fourth lane, toggled by the **𝄞 …** button on the control rail (remembered per device), holds **Key ▾ · Time ▾ · Clef ▾** pickers (the clef menu: treble, soprano, mezzo, alto, tenor, baritone, bass), then fermata · staccato · accent · tenuto · trill · mordent · lower mordent (the one with the line through it, SMuFL *ornamentMordent*; the plain one is *ornamentShortTrill*) · turn · *gliss.* acting on the selection. There is no target-bar control: **a change is placed the way a paste is** — pick it, the cursor is armed (the picker or button lights, the score highlights the bar under the pointer or ghosts the clef on its beat), tap the score, and the change lands there. One tap applies and disarms; tapping the armed pick again, Esc, or Pan cancels; while a change is armed, taps neither grab nor lasso.

- **Key** (15 keys, C♭ … C♯ with relative minors): tap the bar it starts at. Picking the key already in force there removes an explicit change. Cancelled accidentals get naturals before the new signature; the same key/time/clef re-appear as a courtesy at the end of a system when the next system opens with a change.
- **Time** (2/4 3/4 4/4 5/4 6/8 9/8 12/8 2/2 3/8 7/8, or *other…*): tap the bar it starts at. Re-cuts the bars from there to the next time change: notes that cross a new barline split into tied pieces (`decompose`: one plain / dotted value, else the fewest plain values); a tuplet that would cross refuses the change (bar flash); key and clef changes inside the stretch follow their tick (a clef lands on the beat of the new metre at or before it); if content spills into new bars the editor asks first. Choosing the metre before the stretch simply rejoins it. Empty bars are stored as one rest that spans the bar when a value does (whole in 4/4, dotted half in 3/4 and 6/8), else the metre's standard split — always drawn as one whole-bar rest.
- **Clef**: tap the staff and the beat it starts on — the tap chooses the staff, the bar and the nearest beat (any of the four in 4/4; the two dotted groups in 6/8; the tail of the last beat means the next barline). A clef on a beat inside a bar is stored as `clefChanges` and draws small before that beat's column (at the bar's end when nothing starts on or after the beat); the staff reads in the new clef from that tick through every later bar until its next change. A note sounding across the change keeps its old-clef position. A change at the first bar of a system also draws small at the end of the previous system.
- **Marks** toggle on every selected note (all have it → off). Staccato, accent and tenuto hug the head on the side away from the stem, in a space; fermata and the ornaments go above the staff. **gliss.** draws a line with its label to the next note of the staff and vanishes if either end goes. **Slur (v84):** a button beside the articulations — see §1 *Slur*; `ev.slurs` id pairs so slurs nest and share ends. **Rolled chords (v83):** a picker next to *gliss.* — *rolled*, *rolled upward*, *rolled downward* — sets `ev.arp` on the selected notes (one roll per note; the same pick on notes that all have it clears it). The sign is a vertical wiggle of Bravura *wiggleArpeggiato* segments (+ an arrowhead for up / down) rotated 90°, standing left of everything the chord owns (accidentals, flipped heads) and reaching a space past its outer heads; the column widens by 1.4 for it. Playback rolls the pitches (up = low to high, down = high to low, plain = up) by at most a 32nd each, all ending together.

### 8.5c The header rail (v77)

A topmost lane holds **‹ back · title … File ▾ · Rails ▾**. **Rails ▾** is a checklist of every other lane (Controls, Transport, Notes, Key · time · clef · marks): unticking hides a lane, the choice is remembered per device (`ws.compose.rails`), and a new lane (the expression rail) joins the list when it lands. **File ▾** is the home of *Save to Scores as PDF · Export PDF · Export MusicXML · Export MIDI* — greyed until P4. Note glyphs in buttons anchor their **baseline** (the head's centre) to the button's centre line; rests and accidentals centre their ink.

### 8.5d Identity — title · composer · tags (v80)

A composition carries the same identity as a score: `title`, `composer`, `tags` (cleaned by the logbook exactly as a score's are), so *Save to Scores* (P4) copies them 1:1. The **details modal** (`js/tools/compose/details.js`) is the Scores details form — title, composer with suggestions, tags with the one-line rail and the all-tags sheet — built from the widgets shared in `js/tools/shared/catalog.js`, plus *delete*. Tapping the **title on the header** opens it (a rename updates the header; a delete leaves the editor); **new composition** opens the same modal empty and creates the piece on *start composing*. The **list** browses like the Scores library — search over title / composer / tag, sort recent / title / composer, group by composer, the tag rail — through the same shared widgets (`logbook.compositions({ q, tags, sort })` uses the scores filter and sort). Tag suggestions draw on scores and compositions together: one vocabulary across the library.

### 8.5e Cloud, the header line and the square buttons (v81)

- **Compositions follow the account.** Kind `composition` in `KINDS`; the whole document is the body (title, composer, tags, tempo, parts, measures), cap 1 MiB. Add, edit (measures, title, composer, tags, tempo) and delete go pending like everything else; **opening is not an edit** — `openedAt` alone bumps neither `updatedAt` nor the pending set, because the merge clock is `updatedAt` and a device that merely opened a piece must never outrank one that edited it offline. Two devices editing the same piece apart: last write wins on the whole document (as designed). No plan is required — the sync path has no storage gate; only cloud PDFs do.
- **The open editor follows too.** The editor writes through one `put` so it can tell its own saves from a version the sync engine swapped in; when a newer version lands while nothing is unsaved, it replaces the document (an undo step), re-lays out and says *updated from another device*; when a local edit is pending, the local one wins on its next save. A remote delete closes the editor; the list re-renders when the set of compositions changes.
- **Over the cap:** a piece too big to back up is still saved here, dropped from the push (once, with a console warning) and the editor says so once.
- **Header line:** *Composer – Title* when a composer is set, else the title.
- **Marks centred on ink (v82, Leif's review):** the layout gives a mark the head's centre; the renderer measures the glyph's ink once (canvas at 1000 px, cached per glyph after Bravura is in — `inkCentre` in render.js) and slides the `<text>` so the ink's centre lands there. A Bravura glyph's origin is its left side bearing, so the old start-anchored text sat half a glyph to the right. Until the font is in, the advance box is centred (`text-anchor: middle`) and the editor lays out again on `document.fonts.load`.
- **Glyph centring corrected (v83):** `centreGlyph` had the ink term's sign wrong — a glyph whose ink sits above its baseline (every ornament, the fermata, the rolled-chord sign) was slid up by its half-height instead of down. Symmetric glyphs (accidentals, rests, heads) hid it; 4× screenshot measurement showed the trill 13 px high and the rolled-chord sign clipped. Every glyph button now measures within 0.5 px of its centre.
- **Square buttons:** every icon- or glyph-only button carries `cp-sq` — one exact square (3.4 rem; 3 rem on the header; 2.8 rem at phone width) — so a rail reads as a grid; only the worded buttons (Select, Pan, rest, the pickers, *gliss.*) are wider.

### 8.5f The expression rail (v85, WSHED-118; re-based on slots in v91, WSHED-122)

A fifth lane in `RAILS` (off by default, a row in Rails ▾): **pp p mp mf f ff** · **crescendo / diminuendo** · **text ▾** (a popover of suggestions — rit., a tempo, accel., rall., cresc., dim., dolce, espress., legato, rubato, cantabile, marcato — and a box for your own). Since v91 the marks are first-class things on half-beat slots, placed by an armed cursor (a hairpin by three taps), selectable, deletable and draggable in time — the whole story is in [`COMPOSE_EXPRESSIONS_DESIGN.md`](COMPOSE_EXPRESSIONS_DESIGN.md). The lane lives in `rails.js` with the others. Playback: a note's velocity is the dynamic in force on its staff at its tick (mf until one is written); inside a hairpin the notes ramp to the next written dynamic, or one step up / down when none follows (`velocities` in play.js).

### 8.5g The Form rail (v95, WSHED-124)

Barlines (double, final, repeat start / end / both), endings 1.–3., segno, coda, the jumps (D.C.,
D.S., al Fine, al Coda, To Coda, Fine), rehearsal letters and tempo marks — every button arms a tap
on a **bar**, the same tap removes, and playback unrolls the form with a tempo map. Design and
as-built: `docs/COMPOSE_FORM_DESIGN.md`.

### 8.5h The rails facelift (v100, WSHED-128)

Leif reviewed the v99 rails: ~60 near-identical bordered tiles with nothing to group on, no
sign of which buttons hold a menu, no rail names, and rails that wrapped onto two or three
lines on a phone. He approved the whole list below and added the first rule.

- **A rail never wraps.** Each `.cp-rail` is `flex-wrap: nowrap; overflow-x: auto` with the
  scrollbar hidden, exactly the scores tag rail. It sits in a `.cp-lane` whose `::before` /
  `::after` paint a fade on the side there is more (`rails.js` sets `data-over="left right"`
  from `scrollLeft` on scroll and on resize). On a tablet or desktop nothing overflows and
  nothing changes; a phone or a portrait tablet slides. When the editor lights a button that
  is off the edge (`update()` → `reveal()`), the rail scrolls it into view.
- **Groups, not tiles.** Buttons sit in `.cp-group` containers: one border, hairlines between
  the segments, the lit segment fills to the edges. The `.cp-sep` separators are gone.
- **Trays for one-shot actions.** Undo / redo, delete / copy / cut / paste, the transport and
  the zoom buttons are borderless icons in a `.cp-tray`. Select / Pan is a two-segment switch.
- **Pickers** (Key, Time, Clef, Barline, Ending, Jump, voice, text …) keep their word and get a
  small chevron icon (`icon("chev")`) in place of the ▾ text glyph.
- **Hold dots.** Every button with a hold menu (`HOLDS`, the tuplet, Grace) carries `.cp-hold`,
  a dot in its lower-right corner.
- **Captions.** The six palette rails carry a `.cp-cap` (NOTES, KEY · TIME, DYNAMICS, FORM,
  PIANO, MARKS) that is `position: sticky; left: 0` so it stays put while the rail slides
  under it. Hidden at phone width.
- **Sizes.** `--cp-h: 3rem` (2.8rem under 480 px) on `.cp-rails`; a group is `--cp-h` + 2 px
  of border; every square is `--cp-h` wide. With all eight rails on at 1024 × 768 the stack
  went from 560 px to 489 px (71 px back to the score); at 768 × 1024 from 680 to 489; at
  390 × 844 from 855 (the whole screen) to 457.
- **Waiting, not dead.** A disabled button keeps its tile and dims only its ink
  (`color-mix` of `--fg` at 38 %).
- **Menus are fixed on the screen.** A scrolling rail would clip an absolutely positioned
  menu, so `.cp-more` is `position: fixed` and `toggle()` places it under its button when it
  opens: left-aligned in the left half of the screen, right-aligned in the right half, clamped
  inside the viewport, growing out of the button's middle (`--ox` sets the transform origin).
  A rail scroll or a resize closes it.
- **Phone.** A picker whose word is hidden shows a `.cp-pick-ic` glyph (♯♭, 𝄴, 𝄞, a double
  bar, "1.", "D.S.") so no picker is a bare chevron; once armed, the value stands in for both.
- **Motion.** Press scale 0.94, menus scale in over 120 ms; both off under
  `prefers-reduced-motion`.

### 8.5i The Pen | Touch switch (v101, WSHED-129)

Leif, 2026-09-15: without a Pencil (or a mouse) you could not place, lasso or move a note —
"if you are in a pinch and don't have a pencil, you can't do much". §8.3 always meant a
finger to work as a clean tap, a one-finger grab and a lasso; two pen-shaped rules defeated
it on a real iPad. The palm guard drops any contact wider than `PALM_PX` (40 px), and an
iPadOS fingertip reports a contact around that size, so most finger touches were thrown
away silently (the E2E's synthetic fingers were 3 px wide and never saw it). And a
notehead answers a hit only inside 0.75 S × 0.35 S — about 4 px tall at default zoom — which
a pen lands in and a finger cannot, so a finger missed the head and got a discarded drag.

- **The switch.** A second two-segment `.cp-switch` in the control rail beside Select / Pan:
  **Pen | Touch** (`icon("nib")`, `icon("finger")`; the words hide on a phone like Select /
  Pan). It exists only when `navigator.maxTouchPoints > 0` — a desktop rail is unchanged.
  It is a switch on the rail and not a settings menu because it is situational (the
  pencil dies mid-session), one tap, and visible: a user can see why a finger does or does
  not draw. A settings menu with one item is premature; at three settings the menu gets built.
- **Pen** is the v70 policy, unchanged (§8.3).
- **Touch** turns the finger into the pen. `trusted = input === "touch"` lifts the width
  guard on `pointerdown` and `pointerup`. In **Select** mode `thingAt` is asked with a
  tolerance of `FINGER_PX` (22 px) / S, so a head, rest, dynamic, text or span answers from
  a fingertip away (the nearest wins) — a finger grabs and drags a note it lands near, a
  plain tap selects it, a stroke on empty staff lassoes. In **Place** mode the staff is for
  placing: a finger grabs a head only when it lands right on it (the pen's box), because a
  fat target there would grab the note you are trying to add a third above. A second finger
  still lets go — it is the natural cancel, and a pinch never draws.
- **Hold and slide to aim.** A finger covers three staff spaces, so a tap alone means
  zooming in for a precise pitch. In Touch mode a tap lands under the finger as before, however
  slow — the 300 ms limit is a palm rule and there is no palm here; holding past `AIM_MS`
  (500 ms, a haptic and the ghost visibly jumping), or sliding past `TAP_PX`, turns the
  gesture into an **aim**: the ghost lifts `AIM_PX` (40 px) above the fingertip where it can
  be seen, follows the finger, and lifting places where the ghost is (`tapAt(x, y − AIM_PX)`).
  A lift before the aim starts never lands above the finger.
  The aim applies to every tap the editor knows — a note, an armed key / time / clef, an
  expression, a fingering, a paste. A second finger, a `pointercancel` or lifting off the
  staff cancels. In Pen mode a moved or held finger is dropped as before.
- **Default and memory.** `input` is remembered per device (`store`, beside `rails`). A
  device that has never seen a pen starts in **Touch**, so a phone or a pencil-less iPad
  works from the first tap. The first pen `pointerdown` on the score sets `penSeen` and, if
  the switch is on Touch, flips it to Pen once with a toast ("Pencil — fingers rest now.
  Tap Touch to draw by hand."). After that the switch belongs to the user and never moves on
  its own; a deliberate Touch is not undone by the next pencil stroke. The cost is one
  possible stray palm note before the first pencil stroke, which undo fixes.
- **Unchanged.** Pan (one finger pans, two pinch, in either setting), the mouse, the
  keyboard, the score's pinning in the edit modes.

### 8.5j Gesture mode v1 (v102, WSHED-130)

Leif, after v101: a toggle on the control rail for two quality-of-life strokes in Place mode,
so the common moves stop needing a trip to Select — drag to lasso, and a line through selected
things to delete them. Shapes that change the note type are v2 and are not here.

- **The toggle.** A single on/off `.cp-btn` (`icon("gesture")`, the word hidden on a phone) in
  its own one-segment `.cp-group.cp-setting` after Pen | Touch; `aria-pressed` shows the state
  in the quiet setting fill. Remembered per device (`gesture`), **off by default** — a lasso
  appearing mid-placement is new behaviour, so a device opts in.
- **Drag to lasso (Place mode).** With Gesture on, `pointerdown` on empty staff in Place mode
  starts the same `lassoState` Select mode uses (a pen or mouse at once; a Touch-mode finger the
  moment it slides past `TAP_PX`, before the `AIM_MS` hold — hold means aim, move means draw).
  Past `LASSO_PX` the path draws and the ghost hides; the lift selects what is inside, and
  nothing inside clears the selection, as in Select mode. A stroke that never travelled is the
  tap it always was: `lassoEnd` routes it to `tapAt` (a pen or mouse inside `TAP_MS`; a Touch-mode
  finger however slow), so a plain tap still places. The mode stays Place and the armed
  duration stays armed.
- **Strike to delete.** At the lift of any active lasso (Place or Select mode) with Gesture on,
  the path is tested against the **selected** heads and dynamics (`hit.js` `struck`: each path
  segment against each target's box by slab clipping; a head's box is 0.75 × 0.5 S, a
  dynamic's 1.2 × 0.9 S, both widened to the Touch-mode finger tolerance). Anything crossed is
  deleted in one undo step — heads through `remove` (rests come back), dynamics through
  `removeExpressions` — and leaves the selection; nothing crossed → the stroke is a lasso.
  Only selected things can be struck, so a lasso can never delete, and a stroke over
  unselected notes selects nothing: `hit.js` `isLine` calls a stroke a line when its end sits
  more than 45 % of its drawn length from its start (a closed loop ≈ 0, a line ≈ 1) or when its
  area is under 1 % of its perimeter² (a circle is ≈ 8 %, a square 6 %), and a line lassoes nothing —
  which also stops a near-straight Select-mode stroke from catching an anchor by a hair.
- **Grab vs gesture.** A grab still starts on a head (`headUnder`); a gesture starts on empty
  staff. Dragging a cluster and striking through it never collide.
- **Pen | Touch.** Pen mode: fingers rest, gestures come from the pencil or the mouse. Touch
  mode: slide at once → gesture; hold `AIM_MS` then slide → aim (v101).
- **Off** leaves every mode exactly as before; Pan is unchanged either way.

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

### 10.1 PDF — landed v88 (WSHED-121)

As built (the text below replaced the plan on 2026-09-14; the spike that decided it is on the card):

- **One description of the ink, two painters.** `js/lib/compose/paint.js` holds the drawing
  logic that used to live in `render.js` as painter calls (`line`, `rect`, `polygon`, `path`,
  `glyph`, `text`, `group`); `render.js` is the SVG painter (byte-identical output to before
  the split, checked on a feature-complete piece at two zooms) and `export/pdf.js` the PDF
  painter. Screen and paper cannot drift.
- **Bravura is not embedded — its outlines are baked.** `dev/bake-bravura.mjs` reads the
  OTF with fontkit at dev time and writes `export/bravura.js` (85 glyphs, 57 KB: every glyph
  `glyphs.js` names plus the time and tuplet digits, outlines in font units). The PDF painter
  draws each glyph as a **form XObject** (one per glyph per document) placed with a matrix, so a
  page of a thousand heads costs a thousand `Do`s, not a thousand outlines. Why: pdf-lib embeds a
  whole OTF mislabelled as TrueType, and MuPDF rejects fontkit's CFF subset of Bravura; outlines
  render everywhere and no music font ships at all.
- **Words are Fraunces, embedded as subsets** through vendored **pdf-lib 1.17.1 + @pdf-lib/fontkit
  1.1.1** (the self-contained UMD builds under `vendor/pdflib/`, loaded with `<script>` by
  `export/pdflib.js` the first time the sheet opens; `dev/vendor-pdflib.mjs` re-vendors). The
  faces are the **static** TrueType instances `fonts/Fraunces-Regular.ttf` / `-Italic.ttf`
  (OFL): fontkit's subsetter throws on the variable woff2 the screen uses. Diacritics survive.
- **Pages.** `planPages` re-runs `layoutComposition` at the print S (staff space in pt, from
  1.4–2.5 mm) for the printable width (Letter 612×792 or A4 595×842 pt, margins 10 / 15 / 20 mm),
  then pages the systems greedily — a system never splits; page 1 keeps 66 pt for the title
  block, later pages 22 pt for the running head (title · page number). The PDF painter routes
  every primitive to its page by the system band its y falls in. Trailing empty bars are trimmed
  first (`trimBars`); an empty piece prints its eight bars. Hidden rests and halos are skipped,
  voice tints are ink. `pdf.save({ useObjectStreams: false })`.
- **The sheet** (`js/tools/compose/exportsheet.js`): size − / + through the eight staff
  spaces with a readout in staff mm + page count; page, margins, header; a live **page-1
  preview** = the screen's own SVG at the print S inside a page-shaped SVG with the header as
  text; choices in `ws.compose.export`. Two columns from 720 px so the actions stay above the
  fold on an iPad on its side. *Save PDF* → where a share sheet exists a small choice, **Save to device** (an `<a download>` → Downloads / Files) or **Share…** (`navigator.share({ files })`), else the download straight away (v89 — Leif: the share sheet alone did not save); *Add to Scores* → `importFile(file, { title, composer, tags, replace })`.
- **Add to Scores semantics.** The composition remembers `scoreId`; the first send creates a
  score (title, composer, tags + `compose`, thumbnail, page cache like any upload); a later send
  of changed bytes **replaces the linked score's file in place** (`updateScore` now takes
  `pages` / `size` / `sha256`; the rendered pages are dropped, the thumbnail re-rendered;
  bookmarks, brushes and the goal link stay; the cloud copy shows as not-yet-uploaded because
  its hash no longer matches). Unchanged bytes hit the hash dedupe and reopen the same score.
- **Tests:** `tests/compose-export.test.mjs` renders real PDFs in node (the UMD bundles through
  `dev/lib/umd.mjs`): page counts per size and page, never-split, header room, fonts embedded,
  XObjects, hidden rests skipped; the E2E exports, downloads, adds to Scores, opens the reader
  and measures ink, then re-sends to prove replace-in-place.

### 10.2 MusicXML — landed v94 (WSHED-119), both ways

`js/lib/compose/musicxml.js`: `toMusicXml(doc)` serialises MusicXML 4.0 part-wise (one part,
`<staves>2</staves>`, `<divisions>6720</divisions>`, attributes on change bars, `<chord/>`,
`<tie>` + `<tied>`, `<time-modification>` + `<tuplet>`, `<voice>` = voice + 4 × staff, `<staff>`
from `ev.cross`, rest `display-step` / `display-octave` from `ev.restY`, articulations, ornaments,
glissando, arpeggiate, `<direction>`s — dynamics, wedges, words with `relative-y` from `dy` — reached
at their exact tick with `<backup>` / `<forward>`, accidentals by the engraver's own rule);
`fromMusicXml(text)` reads part-wise or time-wise scores (any program's) into a document that passes
`validate`, with `xml.js` (a small XML reader shared by browser and node) and `mxl.js` (the
compressed container). The mapping in both directions, what is refused (with the bar) and what is
dropped: **`docs/COMPOSE_MUSICXML_DESIGN.md`**. UI: File ▾ → *Export MusicXML* (save / share via
`js/tools/compose/savefile.js`, shared with the PDF); *import* on the compositions list (a file
picker for `.musicxml` / `.xml` / `.mxl`, several at once; each becomes a composition tagged
*imported*). Tests: `tests/compose-musicxml.test.mjs` (golden file `tests/fixtures/compose-golden.musicxml`,
round trips, other programs' shapes, the containers); the E2E exports, shares, imports plain and `.mxl`.

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
| Voices | landed v86 — see the voices design |
| Instruments / more staves | `parts[]`, `staves`; layout already takes N staves per system |
| Cross-staff beams | landed v86 — `ev.cross`, `makeCrossBeam` |
| Rest vertical offset (drag a rest out of another voice's way) | landed v87 — `ev.restY`, `nudgeRest`, ↑/↓ |
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
  overflow → nudge and unchanged; undo ×2 / redo; a touch pointer
  with width 60 does nothing; Pan pans; reload restores. Screenshots at phone
  and iPad widths attached to the card.
- **Leif's iPad pass** after P0 is the gate for everything after.
