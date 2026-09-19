---
slug: gestures
title: "Gesture mode"
section: editor
order: 5
summary: "Six strokes that save a trip to Select — lasso, strike, four chevrons, and the hold."
keywords: [gesture, gestures, chevron, arrowhead, lasso, strike, stroke, shape, hold, delete, accidental]
---

Gesture mode is **off until you turn it on** — a lasso appearing mid-placement is new behaviour, so a device opts in. The switch is in [Options ▾](help:options) under *Input*, and it is remembered per device.

With it on, the common moves stop needing a trip to Select. Everything below works in **Place and Select**, drawn with a Pencil, a mouse, or — in Touch mode — a finger that **slides at once** (a finger that holds first is aiming, not drawing).

## Drag to lasso

A stroke on empty staff draws a freehand path under the tip. Lifting closes it and selects everything inside. A stroke that never travelled is still the tap it always was, so plain placing is untouched.

![A loop takes everything inside it.](figure:gesture-lasso)

## Strike to delete

A line drawn through **selected** noteheads or dynamics deletes them, in one undo step. Rests come back in their place, as always.

![A line through selected notes deletes them.](figure:gesture-strike)

Only *selected* things can be struck. That is the safety: a lasso can never delete, and a stroke across notes you have not chosen selects nothing and takes nothing. A stroke counts as a line — rather than a loop — when it ends far from where it started, or encloses almost no area.

## The four chevrons

A compass. One axis for **time**, one for **pitch spelling**. Which way you drew it does not matter, and no stroke can read as two shapes.

### › and ‹ — the value

![A right chevron takes the next shortest value.](figure:gesture-chevron-right)

![A left chevron takes the next longest.](figure:gesture-chevron-left)

**›** is shorter, **‹** is longer — on the palette the shorter values sit to the right, so the sign points along the rail. The ladder runs double whole · whole · half · quarter · eighth · sixteenth · 32nd · 64th, the main row and the ▾ row together.

**With notes selected**, each note steps one rung **from its own value**, keeping its dots, exactly as if you had tapped that button on the rail — so a sixteenth stepped longer becomes an eighth and eats the sixteenth rest beside it. A note already at the end of the ladder stays while the others move; only when none can move do you get a nudge. **With nothing selected** the armed value steps instead.

### ∧ and ∨ — the accidental

![An up chevron raises the accidental.](figure:gesture-chevron-up)

![A down chevron lowers it.](figure:gesture-chevron-down)

Every selected pitch moves one step: ♭♭ · ♭ · ♮ · ♯ · ♯♯. The **letter never changes** — a C♯♯ stays a C♯♯, it never becomes a D — and the engraver decides what is actually drawn, so a sign appears only where the pitch differs from what is in force. No courtesy accidentals are invented; the ♮ on the Notes rail is still how you ask for one on purpose.

Each pitch steps from its own alteration, so a chord of C♯ and E♭ becomes C♯♯ and E♮ in one stroke. **With nothing selected** the chevrons step the one-shot armed accidental instead, and the next note you place carries it.

## Hold two seconds

In Place mode, holding in one spot without travelling summons the [Favorites palette](help:favorites) to your hand — or moves it there if it is already out.

![Hold two seconds and Favorites comes to your hand.](figure:gesture-hold)

## What wins

At the lift, Compose reads the stroke in this order: **chevron, then strike, then lasso**. A deliberate shape beats a strike, so an ∧ drawn across your selected notes edits them rather than crossing them out.

A grab always starts on a notehead and a gesture always starts on empty staff, so dragging a cluster and striking through it can never collide.

With Gesture off, every mode behaves exactly as it did before.
