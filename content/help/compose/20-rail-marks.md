---
slug: rail-marks
title: "Grace · tremolo · marks"
section: rails
order: 9
summary: "Grace notes, tremolo, trill lines, the rarer articulations, and two engraving overrides."
keywords: [grace, acciaccatura, appoggiatura, tremolo, trill, portato, breath, caesura, turn, stem, beam, marks, ornament, slash]
---

![The Grace · tremolo · marks rail.](/img/help/rail-marks.png)

The second Notes lane, for what would not fit on the first.

## Grace notes

**grace** is a modifier on the armed value, like the dot: turn it on, and the value armed on [the Notes rail](help:rail-notes) becomes the *grace's* value — an eighth, a sixteenth or a 32nd. Tap the staff and a grace lands **before the note it precedes** instead of taking time of its own.

Hold the button for the **slash** — the acciaccatura — and for clearing every grace off the selection.

**grace-chord** adds another pitch to the grace you just placed, so a grace can be a chord.

A grace note takes no time from the bar, so it never disturbs the sum. It is stored on the note it belongs to, which is also how MusicXML says it.

## Tremolo

**trem** stamps one, two or three beams on the selected notes. The same count again clears it. Playback plays it out.

## Trills and the rarer marks

**art** here carries what the first marks group did not have room for: the **trill line** — the wavy extension after a `tr`, with an accidental over it when the trill is not diatonic — and **portato**, **breath**, **caesura**, the **inverted turn** and the **delayed turn**.

They work like every other mark: with a selection they stamp it, the same one again takes it off, and playback hears them.

## Two engraving overrides

Compose decides stems and beam groups by standard practice, and is right almost always. For the times it is not:

**stem** forces a note's stem up or down. **beam** breaks the beam group at the note, so a new group starts there.

Both are overrides of a good default, not settings to manage — use them where the music means something the rules cannot know, and leave them alone everywhere else. They travel into the PDF and into MusicXML.
