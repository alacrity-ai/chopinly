---
slug: selection
title: "Selecting, moving, deleting"
section: editor
order: 3
summary: "Tap, lasso, drag a cluster, retype, copy and paste — and the all-or-nothing rule."
keywords: [select, selection, lasso, drag, move, delete, copy, cut, paste, clipboard, retype, transpose, cluster]
---

## Selecting

A tap takes one thing: a notehead, a rest, a whole chord by its stem, a dynamic, a text, a hairpin. Tap more to add, tap again to drop. A tap on empty staff clears everything.

A **lasso** takes many: in Select mode, put the pointer on empty staff and draw a loop; lifting selects everything whose anchor lies inside. With [Gesture mode](help:gestures) on you can lasso in Place mode too, and in Place a **long press** draws a marquee without changing mode.

![A loop takes everything inside it.](figure:gesture-lasso)

`←` and `→` move the selection to the previous or next thing in the staff; `Shift` with them extends it.

## Moving

**Pitch.** Put the pen down on a selected notehead and drag up or down. It moves by staff step, sounding each one. Horizontal drags are ignored — a note's place in time belongs to its slot, not to your hand. `↑` and `↓` do the same thing, one step at a time.

**A cluster.** When everything selected is a notehead, grabbing any one of them drags them **all** by the same number of steps, sounding the moving cluster. If one of them would collide or run off the staff, the whole cluster holds — it never half-moves.

**A mark.** A dynamic, a text or a hairpin drags sideways along the staff, slot by slot, across barlines and system breaks. `←` and `→` nudge it; `↑` and `↓` move it away from the staff. A selected hairpin shows two end handles: the body drags both ends, a handle drags one.

## Retyping

With a selection, tap a duration and every selected note becomes that value — and that value is armed for the next placement too. Dot, tie, tuplet, accidentals, articulations and dynamics all work the same way: with a selection they act on it, without one they arm.

**It is all or nothing.** If any one of the notes cannot fit at the new value, that bar flashes and **nothing changes anywhere**. Never truncated, never pushed into the next bar. A tie across the barline is the honest way to cross one, and it is a single tap.

A selection that holds rests is refused with a hint. Rests are the gaps, not things to retype.

## Deleting

`Delete` or `Backspace`, or the bin on the Controls rail. What went becomes a rest, because a bar always adds up. With [Gesture mode](help:gestures) on, a stroke through *selected* notes deletes them too.

## Copy, cut, paste

**Copy** takes the selection as a phrase: each note and rest with its value, its pitches, its offset from the earliest onset, and its staff relative to the topmost. A partial chord copies only the pitches you picked. The clipboard lives for the session and travels between compositions. **Cut** is copy and delete.

**Paste arms a cursor.** A ghost of the whole phrase follows the pen, snapped to the grid of its first value. Tap to drop; the staff you tap becomes the phrase's top staff. The drop **replaces** what is under it, appends bars past the end, and refuses a note that would straddle a barline — the bar flashes and the cursor stays armed. What you pasted stays selected, so one cluster drag transposes it all.

`⌘/Ctrl` + `C`, `X`, `V` on a desk.
