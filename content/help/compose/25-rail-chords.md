---
slug: rail-chords
title: "The Chords rail"
section: rails
order: 10
summary: "Chord symbols over the staff — Am, B7/A, Bm7(♭5), E7alt. — built from a root, a quality and a bass."
keywords: [chord, chords, chord symbol, harmony, lead sheet, root, quality, slash, bass, minor, seventh, diminished, half-diminished, alt, add9, sus4, jazz]
---

![The Chords rail.](/img/help/rail-chords.png)

## A symbol in three taps

The button at the left of the rail is **the chord symbol you are building** — it starts as *Am*. Tap a **root** (C D E F G A B), add **♯** or **♭** if it needs one, tap a **quality** — *m*, *7*, *maj7*, *m7(♭5)*, *dim7*, *sus4*, *add9*, *7alt.* and the rest scroll sideways — and the symbol is armed. Then tap the beat it goes over.

Every rail tap re-arms it, so a lead sheet is: tap the beat, change the root, tap the next beat. The symbol stays armed until you tap its button again or press Escape.

## Slash chords

Tap **/** and the next root you tap is the **bass** — *B7/A*, *Am/G*. ♯ and ♭ then change the bass. Tap **/** again to drop the bass.

## Typing one

**type…** takes anything the rail does not have: `Bm7(b5)/A`, `F#dim7`, `Bbmaj7/A`, `C(add9)`. A `b` straight after the root letter is a flat; inside the quality, `b5` and `#9` become ♭5 and ♯9. Whatever you type is kept exactly as written — `ø7` stays `ø7`.

## Where they sit

Chord symbols live on the **half-beat slots** like dynamics and text, above the staff you tapped (the top one, nearly always). Every symbol in a system sits on **one line**, clear of the highest note, slur and fingering in it — so a run of symbols reads across the page. A bracketed alteration after a number is set small and raised: Bm7⁽♭⁵⁾. A tempo mark or a rehearsal letter in the same system moves up above them.

## Changing them

They behave like any mark. In Select mode a tap or a lasso takes them; with chord symbols selected **the rail retypes them** instead of arming: a root replaces each root, a quality each quality, ♯ / ♭ alter each one's own letter, **/** then a root sets the bass. Drag one sideways to move it slot by slot; `↑` `↓` lift it off the line; `Delete` removes it.

Chord symbols are written to [MusicXML](help:musicxml) as harmony and read back in, and they print in the [PDF](help:export-pdf). Playback does not sound them — they describe the harmony; the notes play it.
