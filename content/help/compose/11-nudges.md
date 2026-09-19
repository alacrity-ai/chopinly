---
slug: nudges
title: "When an edit is refused"
section: editor
order: 9
summary: "The bar flashes, a sentence appears, and nothing changed — what each one means."
keywords: [nudge, refused, error, flash, cannot, wont, problem, troubleshooting, too long, help]
---

Compose has a standing rule: **a refused edit changes nothing**. Not part of it, not a truncated version of it, not the neighbours quietly rewritten to make room. The bar flashes, a short sentence appears, and the piece is exactly as it was. No undo step is spent.

This is on purpose. Silently altering what you did not ask about is the class of surprise that makes a notation app untrustworthy.

Here are the sentences you are most likely to meet.

## "too long for this bar"

You asked several notes to become a longer value and at least one of them will not fit. It is **all or nothing**: if one cannot grow, none of them do.

The way through is a **tie across the barline** — select the note, press `t` or the tie button, and the value continues into the next bar honestly. Or shorten something else in the bar first.

## "tie needs the same pitch next"

A tie joins two soundings of the *same* pitch. With one note selected, Compose looks for the next note of that pitch in the same staff — across a barline is fine. If the next note is a different pitch, there is nothing to tie to. Select both notes explicitly, or fix the pitch.

A slur is the other thing you may want: it is on [the Key · time · clef · marks rail](help:rail-keys), and it joins *different* pitches.

## "pick a note for the accidental"

You used ∧ or ∨ with only rests or marks selected. Accidentals belong to pitches.

## "already the shortest" · "already the longest" · "already double sharp"

A chevron took you off the end of a ladder. Nothing to do — you are at the edge.

## "that beat already has a note"

You tried to place a rest where a note is. Delete the note instead; the rest appears by itself, because a bar always adds up.

## "write the pickup first" · a pickup refused

The *Pickup* button cuts the silence a bar already has. An **empty** bar has nothing to cut, a bar in the middle of a phrase is not an opening or a closing bar, and a bar whose chosen end starts with a *note* has no silence there to remove. Write the pickup's notes first, then stamp it. See [the Form rail](help:rail-form).

## "voices run 1 to 4"

Four voices a staff is the limit.

## "that one can't be a favorite"

Some buttons are not shortcuts to anything — the modes, undo, the menus, zoom, play. See [the Favorites palette](help:favorites).

## Nothing happened at all

If a **finger** does nothing on the score, you are in **Pen** mode, where a finger is treated as a palm. Switch to Touch in [Options](help:options).

If a **gesture** does nothing, Gesture mode is off — it is off until you turn it on.

If the score **scrolls instead of placing**, you are in Pan. Tap Select ∣ Pan to come back.
