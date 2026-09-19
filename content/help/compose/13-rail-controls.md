---
slug: rail-controls
title: "The Controls rail"
section: rails
order: 2
summary: "Undo, redo, the mode switch, the clipboard and zoom."
keywords: [controls, control, undo, redo, zoom, clipboard, copy, cut, paste, delete, bin, trash, select, pan]
---

![The Controls rail.](/img/help/rail-controls.png)

## Undo and redo

Every committed edit is one step: a placement, a delete, a retype, the drop of a drag, a rail action, a whole drag in the Layout editor. Two hundred steps are kept. `⌘/Ctrl` `Z` and `⌘/Ctrl` `⇧` `Z`.

Undo history belongs to the open editor, not to the piece — closing it and coming back starts a fresh stack. Everything up to that point is already saved.

Tempo is deliberately **not** undoable; it is a property of the piece, like its title.

## Select ∣ Pan

The mode switch. Neither lit is Place. See [Place, Select and Pan](help:modes).

## The clipboard

**Delete** (the bin) removes the selection and leaves rests. **Copy**, **cut** and **paste** take and drop a phrase — paste arms a cursor and the next tap drops it. [Selecting, moving, deleting](help:selection) has the detail.

## Zoom

`−` and `+` step the staff size. Compose **re-draws at the new size** rather than scaling a picture, so glyphs stay crisp and the systems re-wrap to the width — what you see is still what will print. Your zoom is remembered per device.

In Pan you can also pinch.
