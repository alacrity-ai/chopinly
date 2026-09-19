---
slug: rails
title: "How the rails work"
section: rails
order: 1
summary: "One grammar behind every button on every rail — arm it, or act on the selection."
keywords: [rail, rails, button, buttons, grammar, arm, armed, hold, menu, caption, lane, scroll]
---

There are eight rails. Whichever you have showing, every button on them obeys the same three rules.

![One rail: its caption, its buttons, and a corner that means "hold for more".](figure:anatomy-rail)

## 1 · Selection first, then the button

**With something selected**, a button acts on it. **With nothing selected**, it arms the next placement.

Quarter note selected, tap *half*: it is a half now, and the half is armed for your next tap. To arm without editing, tap empty staff first — that clears the selection.

This one rule covers duration, dot, tie, tuplet, accidental, articulation, dynamic, everything. There is no second "change this" control anywhere in Compose.

## 2 · Some things arm a cursor instead

Key, time, clef, the expressions, the form marks, fingering and grace notes do not act on a selection — they are *placed*. Tap the button and it arms; a ghost follows the pen; the next tap on the staff or the bar puts it there. The same button on the same place again removes it. `Esc` or the button again disarms.

Rails that work this way say so on each button: *"then tap the bar it starts on"*.

## 3 · States stick, accidentals do not

**Dot**, **tuplet** and the rest toggle are *states*: a dotted eighth stays armed until you turn the dot off. **Accidentals are one-shot**: ♯ arms, the next note you place carries it, and the button clears itself.

## Hold for the variants

A family of variants lives behind a **hold** on the button it varies, not behind another square — every rail is one lane on a phone, and squares are expensive. Hold *pp* for the extremes, *8va* for 15ma, *Ped.* for the pedal styles, the tuplet for duplets and quintuplets. A small corner chevron marks a button that has more behind it, and a `▾` opens the same menu with a tap.

Rows inside those menus can be captured into [Favorites](help:favorites) like any other button.

## The lane

A rail is **one line, always**. When it does not fit it scrolls sideways under your finger; it never wraps to a second line, because a rail that grows would steal the score's height without asking. The caption at the left — *NOTES*, *FORM*, *DYNAMICS* — stays put while the buttons slide under it, so you always know which rail you are looking at.

## Showing and hiding

[Options ▾](help:options) has the checklist. Controls, Transport and Notes are on to start with. Your choice is remembered per device, and is not synced — which rails you show is a habit of the device, not of the piece.

## The eight

[Controls](help:rail-controls) · [Transport](help:rail-transport) · [Notes](help:rail-notes) · [Key · time · clef · marks](help:rail-keys) · [Dynamics · hairpins · text](help:rail-dynamics) · [Form](help:rail-form) · [Piano](help:rail-piano) · [Grace · tremolo · marks](help:rail-marks)
