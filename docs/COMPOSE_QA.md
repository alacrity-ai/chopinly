# Compose — the iPad and phone checklist (WSHED-114)

The automated suite (`tests/e2e/compose.mjs`, 25 steps in headless Chromium with an iPad user
agent and touch) proves the mechanics on every release, and `npm test` the engine, layout, playback
and both exports. These are the things only a real device tells you. Run on the iPad (Safari,
installed to the home screen) with the Pencil, and on the phone; tick, or file the finding on the
phase's card (WSHED-115 … 122).

## Placing and editing (WSHED-115 / 116)
- [ ] Pencil tap lands the armed value on the line or space under the tip; a finger tap does the same; a palm on the glass places nothing.
- [ ] Tap a note's beat again → a chord; drag a head with the Pencil → it re-pitches live; the palette on a selection retypes it.
- [ ] Lasso with the Pencil selects a phrase; delete, copy, cut, paste (tap where it goes), undo and redo behave.
- [ ] A value that does not fit flashes the bar and changes nothing.
- [ ] Dots, ties (same pitch next), a triplet from three selected eighths, sharps / flats / naturals on a selection.
- [ ] Zoom − / + and pinch; Pan mode scrolls with one finger; the Notes rail stays one row in landscape.

## Changes and marks (WSHED-117 / 118 / 122)
- [ ] Key ▾ then tap a bar: the signature and the cancelling naturals appear; Time ▾ → 3/4 then tap: the bars re-cut, a spill asks first.
- [ ] Clef ▾ (seven clefs) then tap a beat: the change sits on that beat and holds from there.
- [ ] Staccato / accent / tenuto / fermata, trill / mordents / turn, gliss., a rolled chord, a slur — each on a selection, each visible and centred on the head.
- [ ] Dynamics and text land on the beat or half-beat tapped; a hairpin takes three taps (button, start, end) and stretches across a barline.
- [ ] A mark can be tapped, lassoed, dragged sideways across bars, lifted or lowered in whole steps, deleted, undone.

## Form (WSHED-124)
- [ ] Rails ▾ → Form. Barline ▾ → `:|` then tap bar 8: repeat dots on both staves; `|:` on bar 5; `‖` on bar 4; `|.` on the last bar. The same picture on the same bar again clears it.
- [ ] Ending ▾ → 1., tap bar 7 then bar 8; 2., tap bar 9 twice: two brackets with their numbers, the first closed at the repeat.
- [ ] Segno on bar 3, Jump ▾ → D.S. al Coda at bar 12, To Coda at bar 6, coda sign on bar 13, Fine somewhere: each lands where tapped; the same tap removes; undo restores.
- [ ] Rehearsal A on bar 1, B on bar 9; ♩= → "Adagio 60" → tap bar 9: the word and the metronome mark sit above the bar.
- [ ] Play: the repeat plays twice with ending 1 then ending 2; the playhead jumps back; from the D.S. the music returns to the segno, skips ending 1, jumps at To Coda; Adagio slows the bar it starts at.
- [ ] Export PDF: barlines, brackets, signs and words are on paper. Export MusicXML → Sibelius shows the repeats, endings and jumps; Sibelius → import keeps them.

## Piano (WSHED-125)
- [ ] Rails ▾ → Piano. Ped., tap beat 1 of bar 1 on the lower staff, tap beat 1 of bar 2: *Ped.* and a line with an up-hook under the lower staff. Ped. again, tap beat 1 of bar 2 then beat 3: the join becomes a notch (a retake).
- [ ] 8va, tap the first note of bar 3 on the upper staff, tap its last note: *8va* with a dashed line and a hook; the heads under it draw an octave lower, ledger lines gone; play — the pitch is the same. 8vb on the lower staff likewise (an octave higher).
- [ ] Select a chord, tap **3**: a 3 on every head; tap **3** again: gone. Nothing selected, tap **2**, then tap three noteheads in turn: each gets a 2 and the button stays lit; tap one of them again: its 2 goes; Esc disarms. Upper-staff digits sit above the notes, lower-staff digits below; a chord's digits stack in the notes' order.
- [ ] In Select mode a pedal or octave line selects, drags in time, lifts by whole steps, stretches by its end handle; Delete removes it; undo restores.
- [ ] Play a bar under a pedal: the notes ring until the pedal lifts.
- [ ] Export PDF: the lines, signs and digits are on paper (the octave line dashed). Export MusicXML → Sibelius shows the pedal, the octave line and the fingering; Sibelius → import keeps them.

## Notes + (WSHED-126)
- [ ] Rails ▾ → Notes +. Eighth armed, Grace on (lit): tap just left of a note at a step above it: a small slashed eighth with a slur to the note; tap the same spot: gone; two taps at different steps: two graces under one beam. Sixteenth armed: the grace is a sixteenth. Hold Grace → plain: no slash. Esc turns Grace off.
- [ ] Select a note, Trem ▾ → 2: two bars on the stem; 2 again: gone; on a whole note the bars sit above the head. Play: the note re-strikes in sixteenths.
- [ ] Marcato and staccatissimo on a selection: the wedge above, the teardrop beside the head; the same again clears.
- [ ] Play a bar with a slashed grace: it sounds just before the beat and the previous note ends early; a plain grace takes the first half of its note.
- [ ] Drag a graced note up a step: the grace moves with it. Export PDF: graces, beams, slashes, slurs and tremolo bars are on paper. Export MusicXML → Sibelius shows them; Sibelius → import keeps them.

## Voices (WSHED-120)
- [ ] `voice ▾` → 2, tap: the second voice's stems point down; rests of the two voices sit apart; a rest drags up or down.
- [ ] ⌘⇧↑ / ↓ (or the menu) sends a note to the other staff and its beam follows.

## Playback (WSHED-115 v70, 118)
- [ ] Play from the rail with the screen locked-off: sound continues; the playhead follows the notes; the tempo pill types a value.
- [ ] A crescendo is audible from its start to its end; a slurred run plays without gaps.

## Cloud (WSHED-117 v81, 122 v93)
- [ ] Write on the iPad, open the same piece on the phone: it arrives after a sync. Open it on the phone **without editing**, then edit on the iPad: the iPad's version wins everywhere (opening is never an edit).

## Export (WSHED-121)
- [ ] File ▾ → Export PDF: the preview shows page 1 at the chosen size; − / + change the page count; Letter / A4 and the margins re-plan.
- [ ] Save PDF → *Save to device* lands in Files (Downloads); *Share…* offers AirDrop / Mail / Files. In the home-screen app the download lands too.
- [ ] Add to Scores → the piece opens in the reader with ink; change a note, send again → the same score, new pages, bookmarks kept.

## MusicXML (WSHED-119)
- [ ] File ▾ → Export MusicXML → *Save to device* / *Share…* gives *Composer – Title.musicxml*.
- [ ] Open that file in **Sibelius** (File → Open): pitches, rhythms, chords, ties, tuplets, both voices, the cross-staff note, key / time / clef changes, articulations, ornaments, dynamics, hairpins, text and the tempo are all there.
- [ ] Open it in MuseScore or Dorico if to hand: the same.
- [ ] Export the piece from Sibelius as MusicXML (compressed `.mxl` and uncompressed) → Chopinly → *import* on the compositions list: it opens as a new composition tagged *imported* with the bars intact; the toast names the bar count. Play it.
- [ ] Import a piece with something Compose does not hold (a repeat, lyrics, a grace note): it still imports; the omission is only logged.
- [ ] Import a file that is not MusicXML (a PDF renamed): a toast says why and nothing is added.
