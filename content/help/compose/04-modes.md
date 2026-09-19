---
slug: modes
title: "Place, Select and Pan"
section: editor
order: 2
summary: "Three modes, and what a pointer does in each of them."
keywords: [mode, place, select, pan, modes, escape, esc, arm, armed]
---

Compose has exactly three modes. The switch on the Controls rail shows the two you choose between; **Place** is where you are when neither is lit.

![The three modes and the ways between them.](figure:modes-triangle)

## Place

The default, and where you spend your time. A value is armed on the Notes rail, and a tap on the staff places it.

- A tap on **empty staff or a rest** places the armed value at the nearest slot and pitch.
- A tap on a **notehead** grabs it at once — it selects, and a vertical drag re-pitches it by staff step, sounding each one. The release commits. The mode and the armed value are untouched, so the next tap elsewhere still places.
- A tap at an **existing note's slot but a different pitch** joins the chord.
- A **long press** on empty staff draws a marquee, so you can select without leaving Place.
- **Hold two seconds** in one spot and the [Favorites palette](help:favorites) comes to your hand.

## Select

Reached by the switch, by `v`, by `Esc`, or by tapping the armed duration on the palette a second time — which clears the arming, and clearing the arming *is* Select. There is no armed value, so nothing places.

- A tap **selects** a note, a rest, a whole chord by its stem, or a mark; a second tap toggles it.
- A pointer down on **empty staff that moves** draws a freehand lasso; lifting selects everything inside it.
- The same grab-and-drag on a notehead works here too.
- A tap on empty staff that never moves **clears** the selection.

With a selection, every palette and rail button acts on it instead of arming. That is the one rule behind every button in Compose — see [selecting, moving, deleting](help:selection).

## Pan

The hand. One finger or the pen pans; two fingers pinch to zoom. **Nothing places and nothing selects** while you are in it, which is what makes it safe to shove the page around with your whole hand. Leave Pan and the score is pinned again.

`h` switches to Pan, the switch switches back. A mouse wheel scrolls in every mode.

## Getting out

`Esc` is the general way back: it clears a listening favorite slot, then an armed cursor, then a paste, then a selection, and finally toggles between Select and Place. Press it enough times and you are in a known state.
