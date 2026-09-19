---
slug: rail-dynamics
title: "Dynamics · hairpins · text"
section: rails
order: 6
summary: "Everything that sits on a beat rather than on a note — and how to move it."
keywords: [dynamics, dynamic, hairpin, crescendo, diminuendo, text, forte, piano, mezzo, sforzando, niente, slot, beat, expression]
---

![The Dynamics · hairpins · text rail.](/img/help/rail-dynamics.png)

## They live on beats, not on notes

A dynamic, a text or a hairpin belongs to a **moment in the bar**, not to a notehead. In 4/4 a bar has eight places one can sit: each beat and each `&`. A slot need not hold a note at all.

![The eight slots of a 4/4 bar.](figure:slot-grid)

That is why deleting or retyping a note leaves your marks exactly where they were.

## Placing one

Tap the mark on the rail; a ghost follows the pen and snaps to the nearest slot of the nearest staff; the tap places it. A **hairpin takes three taps**: the `<` or `>`, then the slot it starts on, then the slot it ends on.

## Dynamics

`pp p mp mf f ff` on the rail. **Hold** any of them for the extremes — `pppp ppp fff ffff`. The **sf** button carries the sudden ones behind its own hold: *sf, sfz, sfp, fp, rfz*, which accent the notes on their slot rather than setting a level.

Playback obeys them.

## Hairpins

`<` and `>`. Hold for **niente** — a small circle at the closed tip, for a hairpin that grows from or fades to nothing.

Two hairpins of the same kind on one staff never overlap: a new one owns its range and any it overlaps give way. A hairpin under a pedal line is fine — different kinds overlap freely.

## Text

Type the words in the box and tap **set**, then tap the slot. Common ones are chips behind the `▾` — *rit.*, *accel.*, *a tempo* and the rest — one tap instead of typing.

A **text line** — *cresc. – – –*, with an optional word at its far end — is on [the Piano rail](help:rail-piano) with the other spans.

## Selecting, moving, deleting

Marks behave like notes. In Select mode a tap or a lasso takes one; `Delete` removes it; undo brings it back.

**Drag one sideways** and it slides slot by slot, across barlines and even across a system break. `←` and `→` nudge it a slot. `↑` and `↓` move it away from the staff, when the engraver's default sits somewhere you do not want.

A selected hairpin shows **two end handles**: dragging the body moves both ends together, dragging a handle moves that end alone.
