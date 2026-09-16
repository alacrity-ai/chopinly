# Compose — the Piano rail (WSHED-125, v96)

Leif (2026-09-15): "let's add pedal, 8va (and 8vb), and fingering to a keyboard/piano rail (new)".
This is the design; §9 records what was built.

## 0. Principles

1. **Pedal and octave lines are spans on the half-beat grid, like hairpins.** They start and end on a
   slot of a staff, two taps place them, they select, drag, nudge, stretch by an end handle and delete
   exactly as a hairpin does. The expression machinery (`putExpr`, `moveExpressions`, `cleanExpressions`,
   the hit tester, the split over a system break) is generalised over a *span kind* rather than copied.
2. **An octave line changes the drawing, never the pitch.** The model keeps the sounding pitch; the
   engraver draws the heads an octave lower under an *8va* and an octave higher under an *8vb*. Playback,
   MusicXML pitches, transposition by drag and the accidental memory are untouched; removing the line puts
   the heads back where they sound.
3. **The pedal is heard.** Every note under a pedal span sounds until the pedal lifts (or its own end,
   whichever is later).
4. **Fingering belongs to the pitch**, like a tie and an accidental: one digit per notehead, so a chord
   carries one per note. A practice tool wants fingering entered fast: a digit stays armed and each tap on
   a head stamps it.
5. **Additive, no schema bump.** Two new expression kinds and one optional pitch field; a v3 piece
   without them is unchanged; the open path does not change.

## 1. Model (schema v3, additive)

```js
// in measure.expressions, beside dyn / text / hairpin
{ id, kind: "pedal",  staff, at, end: { bar, at }, dy? }
{ id, kind: "ottava", staff, at, end: { bar, at }, dir: 1 | -1, dy? }   // 1 = 8va (above), −1 = 8vb (below)
// on a note's pitch
{ step, octave, alter, tie?, acc?, finger?: 1 … 5 }
```

- `SPAN_KINDS = ["hairpin", "pedal", "ottava"]` in model.js. A span ends after it starts, on its end
  bar's grid; **spans of one kind on one staff never overlap** (a new one owns its range; the ones it
  overlaps go). Different kinds may overlap freely (a hairpin under a pedal is normal).
- A pedal that starts on the slot where the previous pedal on that staff ends is a **retake** — a model
  fact the engraver reads off adjacency, not a flag.
- `finger` is an integer 1–5 on a note's pitch; anything else fails `validate`. Rests never carry one.
- Invariants added to `validate`: the span rules above for the two new kinds; `ottava.dir` is ±1;
  `finger` as stated.

## 2. Engine (`engine.js`)

- `addSpan(doc, { kind, staff, bar, at, end, dir? })` → `{ doc, id }` is the one span placer;
  `addHairpin` stays as it is (it calls it), `addPedal` and `addOttava` are the two new fronts.
- `moveSpanEnd(doc, id, which, slot)` generalises `moveHairpinEnd` (kept as an alias).
- `moveExpressions`, `removeExpressions`, `nudgeExpressionY`, `cleanExpressions`, `expressionsOf`
  (`absEnd`) and `findExpression` treat every span kind alike; `setExpressionValue` still refuses spans.
- `finger(doc, items, n)` — `items` are `{ ev, pi }` (a head) or `{ ev }` (every pitch of the note);
  `n` 1–5 stamps, `null` clears; when every named pitch already carries `n` the call clears them (the
  toggle the rail wants). A rest in the items → Nudge. Returns the same document when nothing changes.
- `spansOf(doc, kind, staff)` → the spans of one kind on a staff with absolute ticks, sorted (the
  engraver and the timeline use it).

## 3. Rail (`rails.js`, lane `piano`, Rails ▾ row "Piano · pedal · 8va · fingering", off by default)

| Button | Arms | Then |
|---|---|---|
| **Ped.** (Bravura `keyboardPedalPed`) | a pedal | tap where it starts, tap where it ends (the staff of the first tap) |
| **8va**, **8vb** (Bravura `ottavaAlta`, `ottavaBassaVb`) | an octave line | the same two taps; 8va lands above the staff, 8vb below |
| **1 2 3 4 5** | a finger | with heads selected: stamps them at once (the same digit on all → cleared); else the digit stays armed and every tap on a head stamps it; the armed digit again → off |

Every button is a `.cp-sq` square; the armed one is lit (`aria-pressed`). A half-placed span shows the
rubber band a hairpin shows. Toasts: "pedal from beat 1 of bar 3 to beat 1 of bar 4", "8va from … to …",
"finger 3", "finger 3 cleared".

## 4. Layout (`layout.js`)

- **Ottava shift.** Before the column pass, the octave lines are collected per drawn staff with absolute
  ticks. A note whose onset lies inside one on its drawn staff has its steps shifted by −7 (8va) or +7
  (8vb); everything downstream (ledgers, stems, beams, collisions, accidentals' x) follows the shifted
  steps. The accidental memory is keyed by the pitch, so it is unaffected.
- **Octave line** (`L.ottavas`): the sign at the span's start x, then a dashed line to the end x with a
  1 S hook toward the staff. *8va* runs on the text line above the staff (`min(staffTop − 2.6, aboveOf −
  1.0)` over what it covers); *8vb* on a line below (`max(staffBottom + 2.6, belowOf + 1.0)`), below the
  dynamics if any share the range (+1.8). Split across systems like a hairpin (`half`), the sign only on
  the first piece, the hook only on the last.
- **Pedal line** (`L.pedals`): *Ped.* at the start x, then a line from the sign's right edge to the end x
  with a 1 S up-hook at the release; y = the staff's expression line + 2.2 (under the dynamics). A retake
  draws the join as a **notch** (down-up V) instead of hook + sign. Split across systems like a hairpin.
- **Fingers** (`L.fingers`): a digit per head at the head's centre x; upper staff above the note
  (baseline at `aboveOf − 1.0`, each next 1.25 S higher), lower staff below (baseline at
  `belowOf + 1.0 + 0.91`, the digit's ink height, each next 1.25 S lower), so the ink clears a head's
  edge by half a space and a stem tip by a whole one (v106, WSHED-135; v105 had the ink touching the
  head: `aboveOf − 0.5` / `belowOf + 1.45`, Leif: "crammed right up against the notes"). A chord's digits keep the notes' own order — the digit nearest the staff belongs to the head
  nearest it — as fingering is printed. `aboveOf` / `belowOf` include the digits, so text and expression
  lines clear them.
- `dy` lifts a pedal or octave line whole, like a hairpin.

## 5. Paint (`paint.js`), screen (`render.js`), paper (`export/pdf.js`)

- A pedal: group `cp-expr` kind `pedal` — the *Ped.* glyph (scale 0.85), a polyline `cp-pedal-line`
  (line, hook, notch).
- An octave line: group `cp-expr` kind `ottava` — the sign glyph (scale 0.8), a polyline
  `cp-ottava-line` (dashed on screen by CSS, dashed on paper by `borderDashArray`).
- Fingers: glyph `cp-finger` per digit (Bravura `fingering1–5`, ink-centred, scale 0.9). Not
  selectable — the head is.
- New glyphs baked into `export/bravura.js`: `keyboardPedalPed` U+E650, `ottavaAlta` U+E512,
  `ottavaBassaVb` U+E51C, `fingering1–5` U+ED11–ED15.

## 6. Hit and the editor (`hit.js`, `editor.js`)

- `thingAt` / `things` answer `pedal` and `ottava` like `hairpin`, with `-start` / `-end` handles on a
  selected one; the editor's `EXPR_TYPES` grows, `selectedHairpins` becomes `selectedSpans`,
  `isHandle(type)` replaces the two literal checks, `moveSpanEnd` replaces `moveHairpinEnd`.
- Pending kinds `pedal` and `ottava` follow the hairpin's three-tap path (`start` then `end`); pending
  `finger` is applied on a tap that lands on a head (`thingAt` first) and **stays armed**; a tap that
  lands on nothing says "tap a notehead".
- Keyboard: none new (digits are durations).

## 7. Playback (`play.js`)

`timeline` builds, per staff, the pedal segments in **performance ticks** (a span cut per bar of each
pass, adjacent pieces merged), then every note whose onset lies inside a segment sounds until at least
the segment's end. A re-struck pitch under the pedal ends with the pedal like the first. Octave lines
change nothing.

## 8. MusicXML (`musicxml.js`)

| Document | MusicXML |
|---|---|
| pedal | `<direction placement="below"><direction-type><pedal type="start" line="yes"/></direction-type><staff>n</staff></direction>` at the start, `type="stop"` at the end (inserted at their ticks like wedges; a retake exports as stop + start on one tick) |
| ottava 8va | `<direction placement="above"><direction-type><octave-shift type="down" size="8" number="1"/>…` at the start, `type="stop"` at the end (MusicXML's *down* = written an octave below sounding = 8va) |
| ottava 8vb | the same with `type="up"`, `placement="below"` |
| finger | `<notations><technical><fingering>3</fingering></technical></notations>` on that pitch's `<note>` |

Import reads all of these back: `pedal` start / stop / change (change = stop + start), `octave-shift`
down / up / stop (size 15 is read as 8 with a warning), `fingering` 1–5 (others ignored). The wedge
matcher is generalised to a span matcher per kind and number.

## 9. Tests

- Engine: a pedal and an ottava placed, overlap of one kind replaces, kinds coexist, ends refused,
  `finger` stamp / toggle / clear / rest refused, `validate` refuses bad values, `cleanExpressions` after
  a re-cut.
- Layout: heads under an 8va sit 7 steps lower (an 8vb 7 higher); the pedal line below the dynamics line;
  a retake notch; fingers above on the upper staff and below on the lower, chord stacking; a span split
  over a system break.
- Play: a note under a pedal sounds to the pedal's end; a note starting after it is untouched.
- MusicXML: a piece with all three round-trips exactly; a foreign file's `pedal type="change"` and
  `octave-shift` are read; the golden fixture is unchanged.
- E2E: Rails ▾ → Piano; a pedal by three taps; an 8va over bar 1 (the heads move up… i.e. draw lower);
  a finger on a selected head and by armed tap; the same digit clears; export → import keeps them.

## 10. As built (v96, 2026-09-15)

- Everything in §1–§9 landed as written, with these decisions made while building:
  - **Span ends.** A pedal's range is `[start, end)`: the line lifts 0.5 S before the end slot, so "tap
    where it lifts" reads as the beat the foot comes up. An octave line covers its end slot as well
    (`[start, end]`): "tap the first note it covers, then the last" — the line runs 1.5 S past the end
    slot's x and the head there is shifted too. A hairpin is unchanged.
  - **The below-staff stack.** Under the lower staff the order is dynamics line → *8vb* (+1.7 when a
    dynamic or hairpin shares the range) → pedal (+2.0 under dynamics, +1.8 more under an *8vb*, else
    +0.6). The system gap is a fixed 10 S, so the deepest stack under a high *8va* on the next system can
    touch it — the same limit hairpins have.
  - **A retake** is read off adjacency in the layout (`pedals` on one staff and system whose end slot is
    the next one's start): the first draws a V notch instead of its hook, the second starts 0.5 S after
    the notch with no sign. Across a system break both pieces keep the plain hook / sign.
  - **Fingers** are Bravura's `fingering1–5` at scale 0.9 so paper and screen match (the PDF painter has
    one text face, italic). A chord's digits keep the notes' order (§4).
  - **Import** reads `<pedal type="change">` as stop + start on one tick, and a direction that snaps past
    the end of the last bar lands on the first slot of the bar added after it (a `late` list; the same
    path now serves a dynamic at the very end of any bar, which v94 placed one bar late).
  - The rail's Ped. / 8va / 8vb buttons are `.cp-sq` squares showing the Bravura signs; the digits are
    serif bold.
- Tests: `tests/compose-piano.test.mjs` (spans placed / replaced / coexisting / refused / moved /
  validated; fingering stamp / toggle / clear / rest refused / range / re-cut; layout shift by seven
  steps, lines, retake, finger stacking, hit testing; playback under the pedal; MusicXML round trip +
  a foreign file with a pedal change, an octave-shift and a 15ma). The golden layout and MusicXML
  fixtures are unchanged. E2E: the piano step (27 steps in all).

## 11. Not in this round (WSHED-123)

15ma / 15mb; una corda / tre corde; pedal styles (Ped. ✱ text style); fingering substitutions (3–1);
hand marks (r.h. / l.h.).
