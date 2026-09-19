---
slug: rail-piano
title: "The Piano rail"
section: rails
order: 8
summary: "Pedal, octave lines, hand marks and fingering."
keywords: [piano, pedal, sustain, sostenuto, ottava, 8va, 8vb, 15ma, octave, fingering, finger, hand, mano, text line, cresc]
---

![The Piano rail.](/img/help/rail-piano.png)

## Pedal

**pedal** is a span on the same half-beat grid the [dynamics](help:rail-dynamics) use: tap the button, tap the slot it starts on, tap the slot it lifts. It selects, drags, stretches by an end handle and deletes exactly like a hairpin.

Hold the button for the styles: the plain **Ped. ✱** sign with no line, or **Sost. Ped.** for the middle pedal.

A pedal that starts where the last one ended is drawn as a **retake** — Compose reads that off the music, there is no flag to set.

**It is heard.** Every note under a pedal span sounds until the pedal lifts.

## Octave lines

**ottava** draws *8va* above or *8vb* below; hold for **15ma** and *15mb*.

An octave line **changes the drawing, never the pitch**. The model keeps what sounds, and the engraver draws the heads an octave out of the way. Playback, MusicXML, transposing by drag and the accidental memory all see the real pitch, and removing the line puts the heads back where they sound. That is the opposite of transposing the notes by hand, which is what makes it safe.

## Text lines

**textline** is a dashed span with a word at its start and, if you want, another at its end: *cresc. – – –*, *una corda …… tre corde*. Two taps, like a hairpin.

## Hand marks

**hands** stamps *m.d.* and *m.s.* — which hand takes the passage. They are text, placed on a slot.

## Fingering

**finger** arms a digit, 1 to 5. Then **each tap on a notehead stamps it**, and the digit stays armed, so a whole passage is fingered without going back to the rail between notes. A chord carries one digit per notehead, because fingering belongs to the pitch, like a tie or an accidental.

Tap the same digit on a head again to take it off. `Esc`, or the digit on the rail, disarms.
