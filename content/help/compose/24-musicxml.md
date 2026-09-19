---
slug: musicxml
title: "MusicXML in and out"
section: keeping
order: 4
summary: "Take a piece to Sibelius, MuseScore, Finale or Dorico — and bring one back."
keywords: [musicxml, xml, mxl, import, export, sibelius, musescore, finale, dorico, interchange, open, file]
---

## Out

**File ▾ → Export MusicXML** writes a MusicXML 4.0 part-wise file and offers the same save-or-share choice the PDF does.

It is a full serialisation, not a sketch: both staves, all four voices, chords, ties, tuplets, cross-staff notes, articulations, ornaments, glissandi, rolled chords, grace notes, tremolo, trills, stem and beam overrides, dynamics, hairpins, text and text lines, pedal and octave lines at their exact tick, barlines, repeats, endings, jumps, rehearsal marks, tempo marks, bar repeats, rest offsets, fingering, and the accidentals spelled the way the engraver drew them.

Pitch is never a MIDI number anywhere in Compose, so **spelling survives the round trip**: a C♯♯ arrives as a C♯♯, not as a D.

A pickup goes out as an implicit bar 0 with the bars after it counting from 1 — how Dorico, MuseScore and Finale write one.

## In

**import** on the compositions list takes `.musicxml`, `.xml` and compressed `.mxl` files, several at once. Each becomes a new composition tagged *imported*, and the first one opens.

Compose reads part-wise and time-wise scores from any program. What it cannot represent it says so about, naming the bar, rather than quietly dropping it — and what it does drop is listed in the console for the file.

A bar every voice leaves short is kept as a short bar: the first bar, or one the file marks implicit, counted from the end as a pickup; any other from its start.

## What does not travel

Layout pins (see [the Layout editor](help:layout)) are not written or read — a page layout is a property of *your* paper, not of the music. Lyrics, chord symbols and parts are not in Compose yet, so a file carrying them arrives without them.

## MIDI

Not yet. MusicXML carries more and every one of those programs reads it.
