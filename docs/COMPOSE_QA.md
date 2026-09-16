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

## The rails filled out (WSHED-127, v98)
- [ ] Dynamics: hold **pp** → ppp / pppp, hold **ff** → fff / ffff; **sf ▾** → sfz on a beat: the note there jumps two steps louder, the level after is unchanged; fp: an f attack, then p. Hold **<** → *cresc.* – – – (dashed words to the end tap) and *from nothing* (a ring at the tip; playback from silence). Text ▾ has più f, meno f, sub. p, poco a poco, sempre, leggiero, sotto voce, sim.
- [ ] rit. / rall. / accel. text is heard: the tempo ramps to 70 % (130 %) until *a tempo*, the next tempo mark or the end of the following bar, then the tempo before it resumes. A fermata holds its note 1.5×; a caesura pauses half a beat after its note.
- [ ] Form: Barline ▾ has repeat ×3 / ×4 (the "3×" over the barline; playback passes three times). Hold **♩=** → ♪ / ♩ / ♩. / 𝅗𝅥, the button shows it, the next tempo mark uses it (♪ = 120 plays as ♩ = 60). Hold **A** → numbers / a word (Trio). **%** on an empty bar after a full one: the sign on both staves, no rest; hold for two bars (the sign on the barline with a 2); playback repeats the bar(s) before; a note placed into the bar clears the sign; a bar with notes is refused.
- [ ] Piano: hold **8va** → 15ma (two octaves: the heads draw fourteen steps lower), hold **8vb** → 15mb. Hold **Ped.** → Ped. ✱ (signs, no line) / Sost. Ped. (the sign and a line); the choice is remembered. **u.c.** by two taps: *una corda* … dashes … *tre corde*, below the dynamics; notes under it play softer. **r.h.** / **l.h.** land as text; hold r.h. for m.d./m.g. or m.d./m.s.
- [ ] Notes +: portato (a dash with a dot) hugs the head; breath ' and caesura // sit after the note at the staff's top; **Orn ▾** on a selection: trill with a wavy line to the next note, tr♯ / tr♭ / tr♮ (the accidental over tr), inverted turn, turn after the note. Play: trills alternate in thirty-seconds, mordents and turns as written. **flip** flips the stems (again on set stems → automatic), **break** breaks the beam before the note (again → joins). Hold **Grace** → chord: taps stack on the last grace.
- [ ] Export PDF: every sign above is on paper (the % and the two-bar sign, the ✱, the dashed lines, the ring, the wavy trill line, the 15ma). Export MusicXML → Sibelius / MuseScore show them; import back keeps them (stems are written but not read; beam breaks are not written).

## The Rest toggle is gone (v99)
- [ ] The Notes rail ends at the accidentals: no Rest button, and `r` does nothing. Delete on a selection turns notes into rests; a tapped-out bar is rests already.

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
- [ ] (v104, WSHED-133) The preview is the page: the systems it shows are the systems that page of the PDF carries — a size or margin that pushes a system to page 2 takes it off the preview of page 1 and a pager appears (‹ page 1 of 2 ›); step to page 2 and see it there with the running head. A tempo word over the first bar, a pedal line under the last system: visible in the preview and in the PDF, never in a margin.
- [ ] (v104) The PDF ends at the music: no empty bar after the last one you wrote (the editor keeps one to write into; the file does not).
- [ ] Save PDF → *Save to device* lands in Files (Downloads); *Share…* offers AirDrop / Mail / Files. In the home-screen app the download lands too.
- [ ] Add to Scores → the piece opens in the reader with ink; change a note, send again → the same score, new pages, bookmarks kept.

## MusicXML (WSHED-119)
- [ ] File ▾ → Export MusicXML → *Save to device* / *Share…* gives *Composer – Title.musicxml*.
- [ ] Open that file in **Sibelius** (File → Open): pitches, rhythms, chords, ties, tuplets, both voices, the cross-staff note, key / time / clef changes, articulations, ornaments, dynamics, hairpins, text and the tempo are all there.
- [ ] Open it in MuseScore or Dorico if to hand: the same.
- [ ] Export the piece from Sibelius as MusicXML (compressed `.mxl` and uncompressed) → Chopinly → *import* on the compositions list: it opens as a new composition tagged *imported* with the bars intact; the toast names the bar count. Play it.
- [ ] Import a piece with something Compose does not hold (a repeat, lyrics, a grace note): it still imports; the omission is only logged.
- [ ] Import a file that is not MusicXML (a PDF renamed): a toast says why and nothing is added.

## The rails facelift (WSHED-128, v100)

- A rail never wraps. Turn every rail on (⠿ Rails ▾) and narrow the window, or open on a phone: each rail stays one line and slides sideways under a finger; a fade shows on the side there is more. Nothing widens the page.
- Groups, not tiles: note values, dot · tie · tuplet, accidentals, marks, ornaments, dynamics, hairpins, signs, pedals, octave lines, fingers, hands, stems and beams each sit in one bordered group with hairlines between. Undo / redo, delete / copy / cut / paste, the transport and zoom are borderless icons. Select / Pan is a switch.
- A hold dot (lower-right corner) marks every button that opens a menu on a hold: pp, ff, both hairpins, A, ♩= tempo, %, Ped., 8va, 8vb, r.h., the tuplet, Grace.
- The palette rails carry a caption at the left (NOTES, KEY · TIME, DYNAMICS, FORM, PIANO, MARKS) that stays while the rail slides; none at phone width.
- At phone width no picker is a bare chevron: Key shows ♯♭, Time 𝄴, Clef 𝄞, Barline a double bar, Ending "1.", Jump "D.S.".
- A menu opened from a rail near the right edge (Rails, File, or a hold on a scrolled rail) stays inside the screen; scrolling the rail closes it.
- A button that needs a selection is dim in its ink, its tile intact; select a note and it lights.
- All five skins: the groups, fades, captions and hold dots follow the skin's panel and ink colours.

## Pen | Touch (WSHED-129, v101)

- On an iPad or a phone a second switch sits beside Select / Pan: **Pen | Touch** (a nib, a fingertip). On a desktop with no touch it is not there.
- Touch: a finger tap on an empty beat places the armed note; in Select mode a finger landing near a head grabs it and a drag re-pitches it, a finger stroke around heads lassoes them, a tap near a rest or a dynamic selects it.
- Touch, Place mode: hold a finger on the staff for half a second — the ghost lifts above the fingertip; slide, and it follows; lift, and the note lands where the ghost was. A quick tap lands under the finger.
- Pen: fingers behave as before (a clean tap or a narrow one-finger grab; a wide or moving or second contact does nothing).
- A fresh device starts in Touch. The first Pencil stroke on the score flips the switch to Pen and toasts "Pencil — fingers rest now"; set it back to Touch and the next Pencil stroke leaves it alone. The setting survives a reload.
- Pan is the same in both: one finger scrolls, two zoom, nothing places.

## Gesture mode v1 (WSHED-130, v102)

- A Gesture toggle sits after Pen | Touch on the control rail; off until you switch it on; remembered on the device.
- On, Place mode: drag on empty staff and a lasso draws; lift and what is inside is selected; a lasso around nothing clears the selection. The armed note stays armed and a plain tap still places.
- On: select some notes and draw a line through them — they become rests (undo brings them back). The same through a selected dynamic removes it. A line through unselected notes changes nothing.
- Touch mode: slide a finger at once and it draws a lasso; hold it half a second first and it aims (v101).
- Off: a drag in Place mode does nothing, as before. Select and Pan are unchanged either way.

## Gesture v2 — the chevrons (WSHED-131, v103)

- Gesture on: draw an up arrowhead (∧) on empty staff and the palette arms the next shorter value (quarter → eighth → sixteenth …); a V (∨) walks back up (eighth → quarter → half …). A toast names the value; at either end it says "already the shortest / longest".
- Select some notes first and the chevron retypes them (as a palette tap does) and arms the value.
- A line, a loop, a flat or lopsided stroke is not a chevron: lasso and strike behave as before.
- Works with the Pencil, a mouse, or a finger in Touch (slide at once). Gesture off: unchanged.


## Undo on a fresh score (WSHED-136)

- [ ] New score, one tap, wait a second (the save), undo: the bar is a whole rest again; redo brings the note back. Reload the score, tap once, wait, undo: the same. (Before v104 the first edit of a session could never be undone once it had saved.)

## Fingering air (WSHED-135, v106)

- [ ] Finger a stem-down note on the upper staff and a stem-up note on the lower: the digit sits clear of the head (about half a space of daylight), not touching it. Finger a stem-up upper note: the digit sits a space above the stem tip. A chord's digits stack 1.25 S apart. Export PDF: the same on paper.

## Beams (WSHED-134, v105)

- [ ] Sixteenth armed: tap F5, F5, C4, F5 on one beat. Stems down; the two beams are a tight band (thinner than v104, closer together); the C4's head sits well clear of the lower beam with bare stem between. Thirty-second armed, the same shape: three beams, the C4 still clear. Mirror it (C4, C4, F5, C4): stems up, the F5 clear.
- [ ] Eighth pairs look exactly as before. Export PDF: the same on paper.

## Bars — insert and delete (WSHED-132, v104)
- [ ] Rails ▾ → Form → the bars group: **insert** then tap bar 3 → an empty bar 3, the old bar 3 is bar 4; **delete** then tap it → gone; undo / redo each one step.
- [ ] Delete a bar carrying a key or time change → the next bar shows the change; delete bar 1 → the new bar 1 carries the signatures.
- [ ] Delete the empty last bar → gone; write in the new last bar → a fresh empty bar is appended as before.
- [ ] A hairpin ending in a deleted bar now ends in the bar before; one starting there is gone; an ending bracket over it shrinks.
- [ ] The last bar of a piece refuses to go (a nudge).
- [ ] (fixed in v104) Open a piece, place one note, wait a second, undo → the note goes (it used to stay once the save had run).
