---
slug: rail-notes
title: "The Notes rail"
section: rails
order: 4
summary: "Voices, values, dot, tie, tuplet and accidentals — the rail you live on."
keywords: [notes, palette, duration, value, whole, half, quarter, eighth, sixteenth, dot, tie, tuplet, triplet, accidental, sharp, flat, natural, voice, chord]
---

![The Notes rail: the voice picker, the values, dot, tie, tuplet, accidentals.](/img/help/rail-notes.png)

## Voice

`voice 1 ▾` at the left. Up to four voices on each staff, for an inner line under a melody or two-part counterpoint on one hand.

**The voice follows the pen**: tapping a note makes its voice the active one, and retyping, tying, deleting all act on that note's own voice. The picker mostly *shows* you where you are. `⌘/Ctrl` `1`–`4` switches.

A voice that has nothing in a bar simply is not there — no stray whole-bar rest cluttering the staff. Voices 2 to 4 are tinted on screen so you can tell them apart; **ink on paper is ink**, and the export is monochrome. Stems and rests follow standard practice: voice 1 up and high, voice 2 down and low.

`⌘/Ctrl` `⇧` `↑` `↓` sends a note to the other staff without changing its voice — the left hand rising into the treble.

## The values

Whole, half, quarter, eighth, sixteenth, and a `▾` for the double whole, 32nd and 64th. Tap to arm; tap with a selection to retype it. Tap the armed one again and the arming clears, which puts you in Select.

`1`–`7` on a keyboard, and the [chevrons](help:gestures) step the ladder.

## Dot

Cycles none · dotted · double dotted. With a selection it dots everything selected, and undots when all of them are already dotted. A dot is a retype, so the all-or-nothing fit rule applies. `.`

## Tie

A tie joins two soundings of the **same pitch**. One note selected ties to the next note of that pitch in the staff — across a barline included. Two adjacent same-pitch notes selected ties those. A chord ties every pitch that has a match. All tied already, and it unties. `t`

Ties are re-derived after every edit, so one whose pitches no longer match simply goes.

For *different* pitches you want a slur, on [the Key · time · clef · marks rail](help:rail-keys).

## Tuplet

Tap for a triplet; **hold** for a duplet, quintuplet, sextuplet or septuplet.

With a selection it wraps that run — rests included — as *n in the time of m*. With nothing selected it arms: the first tap into plain rests opens a whole group, filled with tuplet rests, and each tap after that fills it. A tap inside an existing group takes that group's ratio whatever is armed. Delete every note of a group and it dissolves back into plain rests.

## Accidentals

♯ ♭ ♮, with ♯♯ and ♭♭ behind the `▾`.

With pitches selected they respell them. With nothing selected they arm **one-shot**: the next note you place carries the accidental and the button clears itself.

Pressing the accidental a pitch already has takes it back to the key. Pressing one the key already implies makes it a **cautionary**, and again hides it. Chords stack their accidentals into columns automatically.

The [∧ and ∨ chevrons](help:gestures) step a pitch through the whole ladder without touching the rail.
