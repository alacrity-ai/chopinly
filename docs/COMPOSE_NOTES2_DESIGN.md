# Compose — the extended Notes rail (WSHED-126, v97)

Leif (2026-09-15) on grace notes: "wouldn't it be like a toggle, utilizing our existing note
durations in the notes pane? … the notes rail is already full … an extended notes rail … where we
can add grace notes, and additional note concepts like tremolo, etc." This is the design; §9 records
what was built.

## 0. Principles

1. **Grace is a modifier on the armed duration**, like the dot and the tuplet: with Grace on, the
   palette's value is the grace's value and a tap places a grace instead of a note. The second Notes
   lane holds the toggle because the first is full.
2. **A grace note belongs to the note it precedes.** It takes no time of the bar, so it cannot be an
   event of the voice (every voice must add up to the bar). It is stored *on the principal* — the
   MusicXML shape too — so `validate`, tuplets, ties, sums, `retype`, `setTime` and the clipboard see
   nothing new.
3. **Tremolo and the two marks are note attributes** like `art`, `arp` and `gliss`: one op on the
   selection, the same again clears.
4. **Additive, no schema bump.** Two optional note fields (`graces`, `trem`), two new mark names.

## 1. Model (schema v3, additive)

```js
// on a note event
{ …, graces?: [ { base: 8 | 16 | 32, pitches: [ { step, octave, alter } ], slash?: true } ], trem?: 1 | 2 | 3 }
// MARKS gains "marcato" and "staccatissimo"
```

- `graces` is non-empty when present, in playing order (left to right); each grace has one or more
  pitches (a grace chord), a base of 8 / 16 / 32, and `slash: true` for an acciaccatura. `GRACE_BASES`,
  `TREM_MAX = 3` in model.js. A rest never carries either.
- Invariants (`validate`): graces only on notes, each with pitches Compose can spell, a base from
  `GRACE_BASES`; `trem` an integer 1–3 on a note.

## 2. Engine (`engine.js`)

- `graceAt(doc, { bar, staff, ticks, voice })` → the note of that voice at or after the tick on the
  staff (crossing bars), or null — the target a tap names.
- `toggleGrace(doc, evId, { pitch, base, slash })` → `{ doc, added }`: a grace with that pitch already
  on the note is removed (`added: false`), else appended (`added: true`). Base outside `GRACE_BASES`
  → Nudge. `removeGraces(doc, evIds)` clears them (the rail's *clear graces* on a selection).
- `tremolo(doc, evIds, n)` — `n` 1–3 stamps; the same `n` on every selected note clears; `null` clears.
- `articulate` accepts the two new marks. `setPitch` on a whole note (every pitch) moves its graces by
  the same steps, so a dragged note keeps its ornament.

## 3. Rail (`rails.js`, lane `notes2`, Rails ▾ row "Grace · tremolo · marks", off by default)

| Button | Does |
|---|---|
| **Grace** (a small slashed eighth) | toggles grace placement: lit while on; the palette's value (eighth / sixteenth / thirty-second; any other value reads as an eighth) is the grace's value; **hold** for the two rows *slashed (acciaccatura)* / *plain (appoggiatura)* |
| **Trem ▾** — pictures of 1, 2, 3 strokes | on the selected notes; the same again clears |
| **marcato ^**, **staccatissimo ▾** | marks on the selection, like the utility rail's |

With Grace on, a tap on the staff adds a grace of the tapped pitch to the **next note of the armed
voice at or after the tap** on that staff; the same pitch again removes it; a tap with no note ahead
says "no note to grace". Grace stays on until tapped off (Esc turns it off too). Toasts: "grace to
the E5 on beat 2 of bar 3", "grace removed", "tremolo, 2 strokes", "tremolo cleared".

## 4. Layout (`layout.js`)

- **Room.** A column whose notes carry graces gets `gracePad = max over its notes of n × 1.5 S`,
  placed after the clef pad and before the arpeggio and accidental pads, so the graces stand left of
  everything the principal owns.
- **Grace notes** (`L.graces`): each at scale 0.6 — a black head (`headW × 0.6`), stem always up (2.4 S
  above the head), a small flag for a single grace (8th / 16th / 32nd), a small flat beam (1, 2 or 3
  levels) across a run of two or more, a slash through the stem for a slashed run (drawn on the first
  grace), ledger lines at the small width, accidentals (scale 0.6) by the same memory rule as notes —
  the graces enter the bar's memory before the principal. y from the staff's clef at the grace's onset.
- **A small slur** from the first grace's head to the principal's head (`L.graceSlurs`), below when the
  principal's stem is up, above otherwise.
- **Tremolo** (`L.trems`): `n` slanted bars (1.1 S wide, 0.35 S thick, rising to the right, 0.65 S apart)
  centred on the stem, starting 1.6 S from the head toward the tip (a beamed note: between head and
  beam; a stemless whole note: above the head, centred on it).
- The two marks join the articulation lane: staccatissimo hugs the head like staccato; marcato always
  above, like an ornament.

## 5. Paint

- `cp-grace` group per grace (head, stem, flag / beam, slash, ledgers, accidentals) — not selectable; the
  principal is. `cp-grace-slur` path; `cp-trem` polygons; the marks through `artGlyph`.
- New glyphs baked: `articMarcatoAbove/Below` U+E4AC/E4AD, `articStaccatissimoAbove/Below`
  U+E4A6/E4A7, `graceNoteSlashStemUp` U+E560 for the rail picture; tremolo bars are polygons.

## 6. Playback (`play.js`)

- A **slashed** run of `n` graces steals `n × PPQ/8` (a 32nd each) from before the principal: the
  previous notes of that voice are cut short by that much (never below a 64th); the graces sound in
  turn, the principal on its beat.
- A **plain** run takes the first half of the principal: the graces share `len / 2` evenly, the
  principal sounds from the middle for the other half.
- **Tremolo** `n` on a note of length `len` re-strikes it every `PPQ / 2^n` ticks (eighths, sixteenths,
  thirty-seconds), at least once.

## 7. MusicXML (`musicxml.js`)

| Document | MusicXML |
|---|---|
| grace `{ base, pitches, slash }` | before the principal: `<note><grace slash="yes"/><pitch>…</pitch><voice>v</voice><type>eighth</type><staff>s</staff></note>` (+ `<chord/>` notes for a grace chord) |
| `trem: n` | `<notations><ornaments><tremolo type="single">n</tremolo></ornaments></notations>` |
| marcato / staccatissimo | `<articulations><strong-accent/>` / `<staccatissimo/>` (import now keeps them apart from accent / staccato) |

Import attaches `<grace>` notes to the next non-grace note of the same voice (a grace with no note
after it in the bar is dropped with a warning); `<tremolo>` of type single (or none) 1–3 becomes
`trem`; a double / start / stop tremolo is skipped with a warning.

## 8. Tests

- Engine: toggle adds / removes by pitch, base refused, clear; tremolo stamp / toggle / clear; the
  marks; a dragged note takes its graces; validate refuses bad values.
- Layout: the pad, positions left of the accidentals, a beam over two graces, the slash, the slur;
  tremolo bars on the stem.
- Play: slashed graces before the beat and the previous note shortened; plain graces take half; a
  tremolo's re-strikes.
- MusicXML: round trip; a foreign grace chord and a `<tremolo>` read.
- E2E: Rails ▾ → Notes +; Grace on, a tap before a note adds a grace (drawn small), the same tap
  removes; Trem ▾ 2 on a selection draws bars; marcato on a selection; export → import keeps them.

## 9. As built (v97, 2026-09-15)

- Everything in §1–§8 landed as written, with these decisions made while building:
  - **Grace is a pending kind** (`{ kind: "grace", value: { slash } }`) like the other armed things, so Esc
    turns it off, the rail lights it, and head drags pause while it is on. It stays on after a placement.
  - **The tap's target** is the note of the armed voice at or after the tap on that staff, with a tolerance of
    a sixteenth before an onset (`graceAt`): a tap a hair past a note still means that note; the voice
    falls back to voice 1 where it is absent in the bar.
  - Slashed is the default (an acciaccatura is what a pianist usually means); the hold menu remembers the
    last choice while Grace is on.
  - Graces stand **right-aligned against the principal's accidentals and roll sign** in `gracePad` room
    (1.5 S each), stems up (2.4 S), a run beamed flat at the highest tip, a lone one flagged at 0.6 scale;
    the slash is a line through the first grace's stem; the slur is a small tie shape from the first grace
    to the principal's nearest head on the side away from the principal's stem. Graces take the ottava shift
    of their principal's staff.
  - Playback: a slashed run cuts the previous notes of its line to end `n × PPQ/8` before the beat (never
    under a sixty-fourth); a plain run and the principal split the principal's length in half; a tremolo
    note neither joins nor opens a tie.
  - Import attaches graces to the next note of the same voice and staff in the bar; `<tremolo>` other than
    `single` is skipped with a warning; `strong-accent` and `staccatissimo` are now their own marks (v94
    folded them into accent / staccato).
- Tests: `tests/compose-notes2.test.mjs` (target, toggle, chord grace, base refused, clear, drag carries
  graces, re-cut keeps them, validate; tremolo and marks; layout room / beam / flag / slash / slur /
  tremolo bars / marcato; playback timings; MusicXML round trip + a foreign grace chord and a two-note
  tremolo). Golden fixtures unchanged. E2E: the Notes + step (28 steps in all).

## 10. Not in this round (WSHED-123)

Two-note (between-notes) tremolo; portato; trills with an accidental; inverted turn; the extra
dynamics.
