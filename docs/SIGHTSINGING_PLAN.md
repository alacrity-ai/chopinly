# Sight Singing — implementation plan (WSHED epic)

Woodshed's first **training** app (vs. the utility tools). The user gets a
melody on a real staff, is counted in with the tonic chord, sings it, and every
note is judged on **pitch and rhythm together** (octave-agnostic), ending in a
scored, color-graded results view with a satisfaction gradient: **nailed (gold)
→ good (green) → rough (bronze) → missed (red)**.

## 1. Why this decomposition

The metronome contributed the *clock*, the tuner the *ear*. Sight singing
composes them and adds the *eye* (notation) plus a *referee* (judge). Each new
capability lands as a **reusable module under `js/lib/`**, not inside the tool —
the staff will be reused by the chord notebook, the melody player by ear
training, the mic-pitch lib is shared with the tuner today.

```
js/lib/music.js            pitch/key math: parse "F#4", key signatures,
                           diatonic staff positions, tonic triads
js/lib/staff/              notation component — see docs/STAFF_DESIGN.md
  layout.js                melody → measures → systems → glyph coordinates
  render.js                coordinates → SVG; per-note handles for
                           highlight/grade states
js/lib/pitch/              extracted from the tuner (which is refactored onto it)
  detect.js                autocorrelation (moved, unchanged, node-tested)
  mic.js                   mic lifecycle → stream of {t, midiFloat} samples
js/lib/melody-player.js    schedules a melody (or chord) on the shared audio
                           clock; exposes a timeline for UI highlighting
js/tools/sightsinging/
  index.js                 tool descriptor (category: "training")
  melodies.js              the corpus (see §3)
  judge.js                 pure scoring engine (node-tested)
  ui.js                    setup → count-in → sing → results
```

**Registry gains categories.** A tool declares `category: "tools" | "training"`;
the navbar dropdown renders a rule between groups. One-line change per existing
tool.

## 2. Melody format — the keystone

One declarative object drives rendering, playback, and judging:

```js
{
  id: "d2-g-leaps", title: "Thirds in G", difficulty: 2,   // 1..3
  clef: "treble",            // treble | bass | alto | soprano
  key: "G", mode: "major",   // → key signature + tonic triad
  time: [3, 4],              // 2/4, 3/4, 4/4
  tempo: 76,                 // default; user can override
  notes: [                   // sequential; durations in 16th units
    { p: "G4", d: 4 },       // quarter
    { p: "B4", d: 6 },       // dotted quarter
    { p: "A4", d: 2 },       // eighth
    { r: true, d: 4 },       // rest (breath) — rendered, silent, not judged
    { p: "G4", d: 8, tie: true }, // tied into the next note (same pitch)
    { p: "G4", d: 4 },
  ],
}
```

Durations: 16=whole, 12=dotted half, 8=half, 6=dotted quarter, 4=quarter,
2=eighth. Notes must exactly fill measures (validated at load — a composing
error throws loudly in dev rather than rendering garbage).

A preprocessing pass produces two parallel views: **drawn units** (every
notehead, for the renderer) and **sung units** (tied notes merged, rests
dropped — what the player plays and the judge judges). Grades map back from
sung units onto all their drawn noteheads.

## 3. The corpus

16–20 hand-composed melodies, each 4–8 measures, ending on the tonic, in
comfortable singing ranges per clef (treble ≈ C4–E5, bass ≈ G2–C4, C-clefs
between):

- **Difficulty 1** — stepwise diatonic motion, quarters/halves/wholes, C/G/F
  major, treble clef, 4/4.
- **Difficulty 2** — leaps of 3rds–5ths, eighth pairs and dotted quarters,
  keys to 3 accidentals, minor keys, bass clef enters, 3/4 and 2/4.
- **Difficulty 3** — larger leaps, ties across barlines, chromatic neighbor
  tones (accidentals), alto and soprano clefs, denser rhythm.

## 4. The exercise flow

1. **Setup strip**: difficulty (1/2/3/any), strictness (relaxed/standard/strict),
   count-in click during singing (on/off), tempo nudge. "New melody" deals a
   random melody at the chosen difficulty (never the same one twice in a row).
2. **Start** → mic permission (shared `mic.js`) → **count-in**: one full measure
   of clicks with the **tonic triad** sustained beneath (root positioned near
   the melody's register) → singing begins; the current note carries a brass
   highlight; optional click keeps ticking.
3. **Judging** (details §5) runs on the collected samples when the last note
   ends → **results**: every notehead colored by tier, score % in Fraunces,
   tier counts (e.g. "5 nailed · 3 good · 1 rough · 1 missed"), plus
   **hear it** (melody playback with a moving highlight — also available
   before/instead of singing, for practice) and **sing it again** / **new
   melody**.

## 5. Judge design (pure, node-tested)

Input: sung-unit timeline `[{t0, t1, midi}]` (seconds, latency-compensated by a
fixed ~130 ms), sample stream `[{t, midi}]` (floats from `mic.js` at ~10–15 Hz),
strictness multiplier.

- **Octave agnosticism**: per sample, error = distance from target *pitch
  class*, folded to ±600 cents (`err = ((sample − target + 6) mod 12) − 6`, in
  semitones → cents). Singing the written G an octave down scores identically.
- **Per sung unit**: samples falling in `[t0 + 60ms, t1]`;
  `coverage` = fraction of those samples within the pitch tolerance;
  `precision` = median |cents error| of the in-tolerance samples.
  Coverage is the rhythm axis (late entry, early release, wrong duration all
  reduce it); precision is the pitch axis.
- **Tiers** (base ceilings below; the strictness dial multiplies them —
  **relaxed ×2.0, standard ×1.5, strict ×1.0** since the v1.1 feedback pass):
  - **nailed** — precision ≤ 15¢ and coverage ≥ 0.75
  - **good** — precision ≤ 45¢ and coverage ≥ 0.55
  - **rough** — precision ≤ 90¢ and coverage ≥ 0.30
  - **missed** — otherwise (includes silence)
- **Score** = weighted mean (nailed 100, good 75, rough 40, missed 0).

Test seam: the exercise loop reads samples through one callback, and a
`window.__WS_FAKE_SING` hook ("perfect" | "octave-down" | "flat" | "silent")
synthesizes the sample stream from the melody itself — full E2E through the
real UI, count-in, judge and results with deterministic outcomes, no mic.

### v1.1 live feedback (WSHED-14)

Rhythm-game feedback landed after Leif's first sessions: each note is judged
**the moment its window closes** (tier color + pop bounce on the notehead
mid-song); while running, the settings strip hides and a **pitch lane** shows
live cents deviation — centerline = target, comet dot + fading trail, gold
glow ≤15¢ / sage ≤45¢ / bronze ≤90¢ / felt beyond, ♯ above / ♭ below. All run
audio routes through a per-run gain bus so stop silences instantly.

## 6. Ticket map (all under the epic)

| Ticket | Delivers | Verified by |
|---|---|---|
| Staff component | `lib/music.js` + `lib/staff/` + Bravura glyphs | node tests (key sigs, positions, measure split) + Playwright screenshots across clefs/keys/rhythms |
| Melody corpus | format validator + 16–20 melodies | validator over the whole corpus in node |
| Playback + mic lib | `melody-player.js`; `lib/pitch/` extraction, tuner refactored onto it | tuner regression smoke; player timeline math in node |
| Judge | `judge.js` | node tests: perfect/octave/flat/late/silent synthetic performances |
| Sight singing tool | ui.js flow + registry categories + dropdown rule | Playwright E2E via the fake-sing seam |
| Polish + land | gamification pass, SW v4, deploy, live verify | live smoke + screenshots on the ticket |

## 7. Risks / mitigations

- **Bravura download fails** → fallback path-drawn glyph set (uglier but
  functional); decision recorded in the staff doc.
- **Mic latency variance** → fixed compensation + coverage windows are
  forgiving at the head of each note; strictness dial absorbs the rest.
- **Singing through note boundaries** (portamento) → coverage windows start
  60 ms late, and tiers only need partial coverage.
- **Low-end phones + O(n²) autocorrelation** → already proven fine in the
  tuner at the same cadence.
