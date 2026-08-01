# Staff component — design (WSHED epic)

A reusable, elegant music-notation renderer: `js/lib/staff/`. Scope is the
vocabulary sight singing needs, engraved properly, extensible later. Not a
general engraving engine — no chords-on-staff, no slurs (ties only), no
sixteenths, no multi-voice.

## 1. Glyphs: Bravura (SMuFL), primitives drawn

Real engraving quality comes from real engraving glyphs. We self-host
**Bravura** (Steinberg's SMuFL reference font, SIL OFL — license file shipped
alongside), and render *symbol* glyphs as SVG `<text>`; *geometry* (staff
lines, stems, beams, barlines, ledger lines, ties) is drawn as SVG primitives.
This is exactly how serious renderers work, and it keeps us no-build and
offline.

SMuFL registration makes positioning trivial: **1 em = 1 staff height**, and
every glyph's origin sits on its musical anchor (the G-clef curl centers on the
G line, noteheads sit on their line/space). So `font-size = 4 × S` and each
glyph is a single `<text x y>` at its anchor.

Codepoints used: gClef `U+E050`, cClef `U+E05C`, fClef `U+E062`; noteheads
whole/half/black `U+E0A2/E0A3/E0A4`; accidentals flat/natural/sharp
`U+E260/E261/E262`; time-sig digits `U+E080–E089`; augmentation dot `U+E1E7`;
8th flags up/down `U+E240/E241`; rests whole/half/quarter/8th
`U+E4E3/E4E4/E4E5/E4E6`.

**Fallback** (only if Bravura can't be fetched at build time): a hand-drawn
path set for the same anchors — functional, notably less beautiful; the API
doesn't change.

## 2. Coordinate system

Everything derives from one unit: **S = one staff space** (default 10 CSS px,
scalable). Staff height 4S. Vertical positions are **diatonic steps**: each
letter-name step = S/2. `music.js` maps pitch → absolute diatonic index
(C=0…B=6 per octave); the clef fixes which index sits on which line:

| clef | glyph anchor line (from bottom, 1–5) | reference |
|---|---|---|
| treble | 2 | G4 on line 2 |
| soprano | 1 | C4 on line 1 |
| alto | 3 | C4 on line 3 |
| bass | 4 | F3 on line 4 |

`y(pitch) = middleLineY + (refDiatonic − pitchDiatonic) × S/2` (per-clef ref).
Ledger lines (width 1.7 × notehead) at every line position beyond the staff.

## 3. Layout engine (`layout.js`)

Pipeline: `melody → measures → systems → x-positions`.

1. **Measure split**: notes are grouped by exact 16th-unit capacity of the time
   signature; a melody that doesn't fill measures exactly throws at load.
2. **Ideal widths**: a note's width grows sub-linearly with duration (the
   engraving convention): `w(d) = S × (2.5 + 1.05 × log2(d))`, d in 16ths.
   Accidentals add 1.4S to a note's left padding; dots 0.9S to the right.
   Measure width = notes + 1.6S barline padding either side.
3. **System packing**: greedy fill, 2–4 measures per system, wrapping when the
   ideal width exceeds the available width; a system's measures are then
   **justified** — leading symbols (clef, key, time) keep natural width, and
   note spacing scales by a per-system factor so every system ends flush.
   The final system is *not* stretched beyond ×1.25 (a half-empty last line
   reads better than four notes spread across the screen).
4. **Leading symbols**: system 1 gets clef + key signature + time signature;
   later systems get clef + key signature (standard practice).

## 4. Engraving rules

- **Stems**: up when the notehead is below the middle line, down when at or
  above it. Length 3.5S, extended so stems of far-ledger notes reach the
  middle line. Up-stems attach at the notehead's right edge; down-stems at the
  left. Whole notes have no stem.
- **8th flags/beams**: two consecutive 8ths *within the same beat* are beamed
  (a 0.5S-thick quadrilateral between stem ends, slope clamped to ±0.5S);
  lone 8ths get the Bravura flag glyph. No cross-beat beaming.
- **Ties**: cubic Bézier from just right of the first notehead to just left of
  the second, curving **opposite the stem**, rise ≈ 0.75S; across a system
  break, each half gets a tie stub curving toward its notehead.
- **Dots**: 0.55S right of the notehead, always in a *space* (a dot for a
  line-note shifts up S/2).
- **Accidentals & key signatures**: sharps order F C G D A E B, flats
  B E A D G C F, at the standard per-clef octave placements (tabulated in
  `music.js`). Inside a measure, standard accidental logic: draw an
  accidental only when the note's letter carries a different active
  alteration (key signature or earlier accidental in the measure); a natural
  cancels. Alterations reset at the barline.
- **Rests**: whole rest hangs from line 4, half rest sits on line 3 (glyph
  anchors handle this), quarter/8th centered on the middle line.

## 5. API

```js
renderMelody(container, melody, { unit = 10, width = container.clientWidth })
  → {
      svg,                       // the <svg> element (height grows with systems)
      count,                     // drawn-note count
      setState(i, state),        // "idle" | "current" | "nailed" | "good"
                                 //   | "rough" | "missed"  (drawn-note index)
      clearStates(),
    }
```

States are CSS classes on per-note `<g>` wrappers — rendering is done once;
grading/highlighting never re-layouts. The component is pure DOM/SVG: no
knowledge of audio, judging, or the exercise flow.

## 6. Look

Staff lines and stems in a soft ivory-dim (`#8d8070`-ish, 1.1px lines — dark
background, so *lighter-than-text* reads as etched, not harsh); glyphs in
ivory. Note states color the notehead (and its dot/flag): **current** = brass
with a soft glow halo; **nailed** = gold `#ecc766` with a faint shimmer halo;
**good** = sage `#8fae82`; **rough** = bronze `#9a6b3f`; **missed** = felt
`#b0463c`. All four grade colors are chosen to read at a glance on ebony and
to make the gradient *feel* like a medal scale, not an error report.
`prefers-reduced-motion` disables halos' animation, keeps colors.

## 7. Testing

- **node**: key-signature tables (all 15 majors + minors used), pitch→staff
  position per clef, measure splitting (throws on malformed), system packing
  under narrow/wide widths, accidental-per-measure logic.
- **Playwright screenshots**: a gallery route (`#/sightsinging` in dev deals
  fixed melodies) rendered across the four clefs, sharp and flat keys, dotted
  and tied rhythms, at phone and desktop widths — eyeballed for elegance
  before the tool ships; screenshots attached to the ticket handoff.
