---
slug: layout
title: "The Layout editor"
section: keeping
order: 3
summary: "Say which bars share a row and how wide each one is — on the paper, not on the screen."
keywords: [layout, pin, pins, break, keep, row, system, width, weight, lock, reset, paper, page, justify]
---

The engraver decides the layout, and is right most of the time. When it is not — bar 10 is dense and wants more room, or you want bars 1–4 on the first row because that is the phrase — the Layout editor lets you say so.

![The Layout editor: the plan's own pages, with a handle on every barline.](/img/help/layout-view.png)

Open it from the **Layout** row at the top of [the export sheet](help:export-pdf).

## Pins, not a second layout

A pin is **one override** of an automatic decision. A piece with no pins lays out exactly as it always did. Pin three barlines and the other sixty bars still flow by themselves.

Pins are **paper only**. The editor wraps to the width of your screen, where *"bars 1–4 on row 1"* has no honest meaning, so the editor never reads them — only the export does. And they **ride their bar**: insert or delete a bar elsewhere and they do not shift, they sync with the piece, and an older copy of the app simply ignores them.

## What you can pin

![A break, a keep, and a bar given more width.](figure:layout-pins)

- **Break here** — the row ends at this barline, always.
- **Keep together** — the row may *not* end here; this bar and the next share a row.
- **A width** — how much of its row a bar takes, relative to the others.

## Working in it

The pages are the export's own pages, stacked and scrolling, drawn by the same painter. `−` and `+` zoom them; a phone needs it.

**Every barline has a handle** — invisible, at least a fingertip wide, the height of the grand staff. A barline is a hair thick; its target is not.

- **Tap** a handle for its menu: *Break here*, *Keep together*, and *Reset this bar's width* when it has one. Whichever is already set reads as *Remove the break* or *Remove the keep*.
- **Drag** a handle sideways and the bar to its left takes the width under your pointer; the rest of the row gives or takes in proportion and stays justified. One undo step per drag. The drag stops rather than squeezing a bar past what is readable.
- **The chip in the left margin** of each row locks the row: *Lock this row* pins exactly these bars together whatever happens around them, and *Release this row* takes every pin off them again.

A **finger, a Pencil and a mouse all do the same thing** here. There is no Pen ∣ Touch switch in this view, and a finger that starts on a handle can still scroll the pages.

## The marks

A break shows a small ⏎ flag above the barline, a keep shows a link arc over it, and a weighted bar gets a rule under it with its percentage. They are drawn beside the page, never in it — **they cannot print**.

If a row will not fit at the widths you have asked for, the row is marked as tight. Nothing is silently squeezed.

**Reset** in the bar takes every pin off the piece and returns it to automatic.
