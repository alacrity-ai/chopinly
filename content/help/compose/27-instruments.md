---
slug: instruments
title: "Instruments and parts"
section: editor
order: 10
summary: "A string quartet, voice and piano, a choir — any set of instruments on any number of staves, from a template or built up one at a time."
keywords: [instruments, parts, staves, staff, quartet, choir, satb, voice and piano, ensemble, score, bracket, brace, add an instrument, remove, rename, organ, guitar, violin, viola, cello, flute, oboe, clarinet, bassoon, horn, trumpet, trombone, tuba]
---

![A string quartet: four named staves under one bracket.](/img/help/instruments-score.png)

## What a piece is for

A new piece is a piano on its grand staff unless you say otherwise. The **for ▾** picker beside the title when you start one offers *Piano*, *Voice and piano*, *String quartet*, *Choir (SATB)* and *Guitar* — or *choose…*, which starts a piano and opens the Instruments sheet so you can build the set yourself.

Every instrument has its own staves, its default clef (a viola opens in alto clef, a cello in bass) and its name. Names stand before the first line of the score, abbreviations before the others; a piece with one instrument prints no name at all. Instruments of a family — strings, winds, brass, voices — share a **bracket**; a keyboard keeps its **brace**; barlines run through a family and break between families, the way a printed score does.

## The Instruments sheet

![The Instruments sheet.](/img/help/instruments-sheet.png)

**File ▾ → Instruments…** (or the *instruments* row in the piece's details) opens the sheet. Each row is one instrument:

- the **name** and the **abbreviation** — tap, type, and leave the field;
- the **instrument** — tap the line that names it to pick another from the catalogue; an empty part offers to take the new instrument's clefs, a part with notes keeps the clefs it has;
- **1 · 2 · 3** — how many staves it has. A staff is added below with the instrument's next clef; the last staff is removed only when it holds nothing but rests;
- the **arrows** move it up or down the score; the **bin** removes it, after asking when it holds notes. The last instrument stays.

**+ add an instrument** appends one from the catalogue. A piece holds up to twelve instruments on sixteen staves — a wind quintet, a string orchestra, a hymn with organ.

Every change is one undo step, so an instrument removed by mistake comes straight back with its music.

## Writing for them

Notes go on any staff the way they always have. A note crosses only to another staff of its *own* instrument — a cello cannot borrow the viola's staff. The pedal and *una corda* belong to the keyboard: on a violin staff they are refused, and when the piece has no keyboard at all the Piano rail's pedal buttons go dark. Fingering sits above the first staff of an instrument and below its others, as it does on the piano.

Everything else — dynamics, hairpins, text, chord symbols, lyrics, tempo, repeats — is per staff or per score exactly as before.

## What you hear and what prints

**Every instrument plays with the piano's sound for now.** Playback walks every staff; a second, sustained sound is on the list.

Transposing instruments — clarinet, horn, trumpet — and the guitar are written **at concert pitch**: what you see is what sounds. A tenor sings from a plain treble clef.

On paper a tall score asks for a smaller staff. The export sheet proposes 6.4 mm for three staves or more and 5.6 mm from six; a size that would run off the page is refused, and the fine print names the largest that fits. See [exporting a PDF](help:export-pdf).

## MusicXML

A score from MuseScore, Sibelius, Dorico or Finale opens with **every part** — names, abbreviations, instruments, clefs and all its staves — and goes back out the same way, one part per instrument with the brackets marked. See [MusicXML in and out](help:musicxml).
