# Ear training — design (WSHED-81, 2026-09-05)

**Ear training** sits beside Sight singing in the lessons group. Exercises share
a run shell; the first is **pitch training**. Later exercises (intervals, chords)
are a folder each with their own question generator and judge.

## Pitch training

1. **Set up** on one card, **begin**. No settings page.
2. **The reference** plays and its key lights as a target (the tonic; C for
   beginners, a white-key tonic in the middle octave otherwise). *Reference*
   replays it any time during an answer.
3. **Listen**: the question plays — one note, several one after another
   (520 ms each), or a chord held 1.1 s. The keyboard is dimmed and inert.
4. **Play it back**: the keyboard is **one octave** (the C below the tonic to the
   C above — fat keys on a phone) and a press counts **by pitch class**: the
   question plays C6, any C is right. The range setting is where the questions
   come from, not how many keys you see. Every press sounds and is **judged
   immediately** — green for right, red for wrong. A wrong press ends the
   question with partial credit for the notes so far; the missing notes light as
   targets and the answer plays. *Hear it again* replays the question.
5. **Results**: percent of notes, stars (≥ 90 / 70 / 50 %), questions fully
   right, one sentence about the most common miss as intervals above the tonic
   (*you heard the major sixth as a fifth 3 times*), the setup sentence, **again**
   (same setup, new seed) or **change the setup**.

Runs land in the logbook like sight-singing lessons: a note on the running goal,
else an auto segment on the built-in **Ear training** goal (`BUILTIN_EARTRAINING`;
`logbook.addAuto` takes the `builtin` to credit). A day's drills fold into one
segment on that goal (LOGBOOK_V2_DESIGN §12), so a sitting is one session, not
ten. Every run is kept in
`ws.eartraining.runs` and listed under **drills**.

## The setup card

| row | chips | note |
|---|---|---|
| level | beginner · intermediate · advanced · custom | presets set every row; touching a row flips to custom |
| notes | in the key · all twelve | |
| range | one octave · two · four · whole piano | whole piano hidden on a phone (< 700 px) |
| how many at once | 1 · 2 · 3 · 4 · 5 | |
| played | one after another · together | greyed at 1 |
| reference | every question · once at the start · never | never = absolute pitch |
| questions | 10 · 20 · 35 | |

An italic sentence restates the setup: *C major, one octave around middle C,
single notes, a reference before each question, 10 questions.* Remembered.

## Module

`js/lib/eartraining/pitch.js` is pure and tested: `OPTIONS`, `LEVELS`,
`levelOf`, `cleanSetup`, `rangeMidi`, `describe` / `shortDescribe`, `rng`
(mulberry32), `generate(setup, seed)`, `judgePress`, `scoreRun`, `starsFor`,
`missLine`. A run is reproducible from (setup, seed): `#/eartraining/pitch/run?seed=7&setup=beginner`
is the test seam. `js/tools/eartraining/pitchrun.js` drives the keyboard module
(`light("target" | "correct" | "wrong")`) and the piano voice.

## Layout

Portrait: stage card, then the one-octave keyboard (≈ 48 px keys on a phone).
Landscape under 560 px tall: the stage collapses to one line and the keyboard is
sized from the remaining height (`calc((100dvh - 16rem) * 8 / 5.2)`), so the
run never scrolls.

## Answering on your piano (WSHED-86, 2026-09-06)

The drill has a **mic** button in its transport row (next to *hear it again*
and *reference*): a toggle, lit when on, remembered (`ws.eartraining.mic`) so
the next drill starts the same way. It is not a setup option — a button that
clearly toggles is enough. With it on, the real instrument answers.

`js/lib/pitch/mic.js` (the tuner's stream, now with `all: true` for unvoiced
frames and RMS) feeds `js/lib/eartraining/listen.js`:

- `createNoteTracker({ a4, stable, onsetRatio, quietFrames, settleFrames })`
  turns pitch samples into presses. A note presses when the same nearest
  semitone is heard on 2 consecutive frames (~100 ms). Rounding to the nearest
  semitone is the wiggle room (±50 cents) for a piano that isn't quite in tune;
  the tuner's A4 calibration is honored. A different note presses as soon as it
  is stable; the *same* note presses again only after real silence (4 frames)
  or a re-strike (an RMS jump of 2.2× once the attack has settled), so a
  decaying sustain never answers twice. Pure, node-tested.
- Presses count **by pitch class**, exactly like the screen keys (the exact-
  octave idea was tried and scrapped the same day).
- **The mic never hears the app itself.** Every sound the app makes hushes the
  mic until it has faded plus 350 ms: the question and the reveal, the
  *reference* button, *hear it again*, and a screen key (hushed while held,
  then the hold-off). Only the **answer** phase listens at all.
- The stage shows *heard · E4* with a pulsing mic glyph; denied → "microphone
  denied — answer on the keys" and the run goes on. The logbook line ends in
  "on the piano" when the mic answered.
- E2E seam: `window.__etMic.feed({ freq, rms })` (Playwright can't play a
  piano); the suite runs on a **silent** fake mic (`tests/fixtures/silence.wav`)
  because Chromium's default fake device hums a tone.

On-device caveat: some iOS versions lower or re-route playback while the mic is
open; headphones are the safe path.
