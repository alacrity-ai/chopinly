---
name: Metronome
order: 1
route: metronome
title: "Free online metronome — keeps time behind a locked screen | Chopinly"
description: "A free online metronome for piano practice: 20–300 BPM, accents and subdivisions, four click voices, tap tempo, tempo markings, and a beat that keeps going when your phone screen locks. No ads, no sign-up, works offline."
short: "A pendulum on the Web Audio clock; accents, subdivisions, tap tempo; survives a locked screen."
h1: "The metronome"
lede: "A metronome that keeps honest time — on the audio clock, not a JavaScript timer — and keeps clicking when you lock your phone to save the battery."
cta: "Open the metronome"
---

## What it does

Set a tempo from 20 to 300 beats per minute with the dial, the nudge buttons or **tap tempo**, and the pendulum swings to it. Choose the meter (one to twelve beats), mark any beat as an **accent**, a normal beat, or **muted**, and add **subdivisions** of two, three or four to hear the eighths, triplets or sixteenths under each beat. Four click voices — wood, clave, beep and tick — cover a quiet practice room and a loud one. Classical tempo markings (adagio, andante, allegro and the rest) are shown against the number so you can set "andante" without looking it up.

## Why it doesn't drift

Most browser metronomes schedule each click with a JavaScript timer. Timers get throttled the moment the tab is hidden or the phone's screen turns off, and the click stumbles. Chopinly instead renders **one full bar of clicks into an audio buffer** and loops that buffer on the browser's audio thread. The seam between bars is exact to within half a sample — about ten microseconds, the same every bar — so the beat is as even as the sound card's clock. Change the tempo or the meter while it's running and the new bar takes over at the next beat, never mid-click.

Because the loop lives on the audio thread and is routed through a media element, the metronome keeps playing when you **lock the screen** on iOS or Android, and the lock-screen controls can pause and resume it. Your practice clock keeps counting too — it works from timestamps, not from a running timer.

## Tempo goes into the logbook

When the practice clock is running on a piece, the metronome shows a **practice** button. Tap it and the current tempo is stamped onto that goal, so the goal's page builds a **tempo sparkline** over time — the honest record of the Chopin étude climbing from 60 to 112. That is the difference between a metronome and a practice assistant.

## How to practice with it

- Start slow enough that you can play the passage **three times in a row without a mistake**, then raise the tempo a few clicks at a time.
- Put the click on the **off-beat** or on beat two and four once a passage is secure; it exposes rhythm you were leaning on the click to supply.
- Use **subdivisions** to fix uneven sixteenths, then take them away.
- Mute a beat or two of every bar and see whether you land back on the click; if you don't, your internal pulse is drifting, and that is what the metronome is for.

There is a longer piece on this in the blog: [how to practice with a metronome](/blog/how-to-practice-piano-with-a-metronome).

## Details

- Runs in any modern browser; installs to a phone's home screen like an app; works offline.
- No ads, no account, no tracking. The settings are remembered on your device.
- Free, and the source is public.
