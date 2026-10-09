---
slug: overview
title: "What Compose is"
section: start
order: 1
summary: "Music notation by tapping — nothing is guessed, and every bar adds up."
keywords: [compose, notation, start, intro, what, piano, grand staff, instruments, parts, quartet]
---

Compose is music notation you write by **tapping**. You arm a value on the Notes rail — a quarter, an eighth, a dotted half — and tap the staff. The note lands on the nearest line or space at the nearest slot of that value, and you hear it as it lands.

![The Compose editor: the header, the rails, and the score below them.](/img/help/editor.png)

## Two promises

**Nothing is guessed.** There is no handwriting recognition anywhere in Compose, and there never will be. A tap places exactly the value you armed at exactly the place you tapped. Your intent lives in the palette; the staff only confirms it. That is the whole reason this exists: a notation app that guesses wrong is slower than paper.

**A bar always adds up.** Every measure sums to its time signature, always. The gaps are rests, rests are real things, and placing a note eats the rest under it. Nothing can be half-written. If an edit would break that sum, it is **refused** and nothing changes — see [when an edit is refused](help:nudges).

## What you can write today

Any set of instruments — a piano on its grand staff, a string quartet, voice and piano, a choir — up to twelve on sixteen staves (see [instruments and parts](help:instruments)), with up to **four voices** on each staff and notes that cross between an instrument's own staves. Values from the double whole to the 64th, with dots, ties and tuplets. Chords, accidentals, articulations and ornaments. Key, time and clef changes anywhere in the piece. Dynamics, hairpins, text and pedal on the beat and the half-beat. Repeats, endings, jumps, rehearsal marks and tempo changes. Grace notes, tremolo and trills. Pickup bars.

It prints as a **vector PDF** — real outlines, not a picture of a page — which you can lay out bar by bar first, drop straight into your [Scores](app:scores) library, or send to a student. It reads and writes **MusicXML**, so a piece travels to Sibelius, MuseScore, Finale or Dorico and back.

## What is not here yet

A second instrument sound, transposing instruments at written pitch, printing one part alone, and MIDI export. (Chord symbols arrived with [the Chords rail](help:rail-chords), lyrics with [the Lyrics rail](help:rail-lyrics), ensembles with [instruments and parts](help:instruments).) The model is shaped like MusicXML, so each of those is an addition rather than a rewrite.

## Where to go next

- Never opened it before — [your first composition](help:first-composition).
- Want the lay of the land — [the editor screen](help:editor) and [Place, Select and Pan](help:modes).
- Looking for a button — [how the rails work](help:rails).
- Ready to print — [export a PDF](help:export-pdf) and [the Layout editor](help:layout).
