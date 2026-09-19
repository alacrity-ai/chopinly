---
slug: rail-form
title: "The Form rail"
section: rails
order: 7
summary: "Barlines, repeats, endings, jumps, rehearsal marks, tempo marks, and the bars themselves."
keywords: [form, barline, repeat, ending, volta, segno, coda, dc, ds, da capo, dal segno, fine, rehearsal, tempo mark, allegro, bar, measure, insert, delete, pickup, simile, bar repeat]
---

![The Form rail.](/img/help/rail-form.png)

Form belongs to **bars**, not to beats. So every button here arms a cursor and the **next tap on a bar** acts; the same button on the same bar removes it; `Esc` cancels; each change is one undo step.

## Barlines

**barline** sets the bar's closing line: double, final, or a repeat. Hold it for the repeat that *opens* a bar, and for a repeat count — `×2` up to `×9` — when a section should go round more than twice. The last bar of a piece always draws final whatever you do.

## Endings

**ending** puts a first-time bracket over a run of bars; hold it to choose the number, up to nine. Endings never overlap, and each number is unique inside its repeat.

## Signs and jumps

**sign** places a segno, a coda, a *To Coda* or a *Fine*. **jump** places the instruction: *D.C.*, *D.S.*, *D.C. al Fine*, *D.S. al Fine*, *D.C. al Coda*, *D.S. al Coda*. One jump to a bar.

Playback unrolls all of it. The playhead still points at the bar in the score, so it jumps back at a repeat and forward at a *D.S.* — exactly what a player does.

## Rehearsal marks

**rehearsal** stamps a boxed mark on a bar. They letter themselves: the first is A, the next B, then C, and after Z comes AA — insert one in the middle and everything after it re-letters. Hold the button for a **word** instead (*Trio*) or for numbers.

## Tempo marks

**tempo-mark** writes what the paper says: a metronome mark, a word like *Allegro*, or both. **tempo-unit** is the note the mark is counted in — hold it for an eighth or a dotted quarter instead of the plain quarter, for `♩. = 60` in a compound metre.

Playback follows written tempo marks. The tempo on [the Transport rail](help:rail-transport) is the speed you audition at; this is the speed the music *says*.

## Bar repeats

**simile** marks a bar as `%` — play the bar before again — or a two-bar repeat. Writing anything into the bar is the way out of it.

## Inserting and deleting bars

**bar-insert** puts an empty bar **before** the bar you tap. **bar-delete** takes the bar you tap, with everything it carried.

Compose keeps the rest of the piece honest around them. A span ending in a deleted bar ends at the previous bar instead; endings and later spans shift along; a key, time or clef change the bar carried stays in force from the next bar; ties and slurs into the gap are cleaned. The last bar of a piece cannot be deleted.

The editor always keeps one empty bar after the music to write into, and **trims it away on export**, so no stray measure reaches the PDF.

## Pickup

**pickup** makes a partial bar — an anacrusis that opens the piece, or the short bar that completes one.

It **cuts the silence the bar already has**. Tap it on an opening bar and the shared rest at the *front* goes; on a closing bar, the rest at the *back*. So write the pickup's notes first, then stamp it: in 12/8 a piece that starts on beat four becomes a one-beat bar, and the beaming, the rests and the tap grid all count from the barline that follows.

Tap it again on a short bar to fill it back up. A bar that is empty, is in the middle of a phrase, or has a note where the silence would be cut is refused, unchanged.

A pickup exports as an implicit bar 0, the way Dorico, MuseScore and Finale write one, and imports the same way.
