# Chopinly — design (WSHED-1)

**Chopinly** (renamed from *Woodshed*, jazz slang for the place you go to practice,
on 2026-09-04 — WSHED-46) is a piano practice assistant PWA. Tool #1 is a metronome. The design below is the contract the
implementation follows.

- Live host: `chopinly.com` (Cloudflare Pages; legacy alias `metronome.apps.lalalimited.com`)
- Repo: `~/lets-get-rich/woodshed` · persona `leifktaylor` (Alacrity)
- Audience: a pianist with the phone propped on the music desk. One job:
  a rock-steady, pleasant beat with zero friction.

---

## 1. Architecture — the tool shell

The app is a **static, no-build-step PWA** (vanilla ES modules). No framework,
no bundler: the deployable artifact *is* the repo. That keeps deploys trivial
(`wrangler pages deploy .`), diffs honest, and the door open for future tools.

```
index.html                 one page; shell chrome + <main id="tool-root">
css/app.css                tokens + shell + tool styles
js/app.js                  shell: renders nav from the registry, mounts the
                           active tool, owns wake-lock + settings persistence
js/registry.js             TOOLS = [metronome]  ← tool #2 is one import + entry
js/lib/audio.js            shared AudioContext + master gain (lazy, unlock-safe)
js/lib/store.js            namespaced localStorage settings (ws.<tool>.<key>)
js/tools/metronome/
  index.js                 the tool object {id, name, glyph, mount, unmount}
  engine.js                lookahead scheduler (the clock)
  voices.js                synthesized click voices
  ui.js                    DOM + pendulum renderer
manifest.webmanifest, sw.js, icons/
```

**Tool contract:** a tool is a module exporting
`{ id, name, glyph, mount(rootEl, ctx), unmount() }` where `ctx` gives it the
shared audio context factory, the settings store scoped to its id, and a
`setRunning(bool)` callback (drives the shell's wake-lock). **Adding tool #2**
(drone, tuner, practice log…) = drop a folder in `js/tools/`, add one entry in
`registry.js`. With >1 tool the shell automatically shows a tab strip; with one
tool it stays chromeless.

**Why no build step:** this app is ~a dozen small modules. ES modules over HTTP/2
are fine at this scale, nothing to install, nothing to go stale. If a future
tool genuinely needs deps, Vite can be layered on then without moving files.

## 2. Metronome — feature set

| Area | Decision |
|---|---|
| Tempo | 20–300 BPM, integer. Big numeral + Italian marking (Grave → Prestissimo) |
| Adjust | ±1 / ±5 buttons, drag on the numeral (fine), slider, keyboard (↑↓ ±1, ←→ ±5), **tap tempo** (median of last 4 taps, gaps >2s reset) |
| Meter | 1–12 beats per bar. Beat 1 accented by default; **tap any beat dot to cycle accent → normal → muted** (odd-meter & clave-style patterns fall out for free) |
| Subdivision | quarter · eighth · triplet · sixteenth; subdivision clicks play quieter |
| Voices | 4 synthesized: **Wood** (woodblock), **Clave** (high rosewood tick), **Beep** (soft sine), **Tick** (filtered-noise mechanical click). Accent = pitch+gain lift |
| Volume | master gain slider, persisted |
| Transport | one big Start/Stop; Space toggles |
| Practice-room niceties | screen **wake lock** while running (re-acquired on tab return); settings persist across sessions |

## 3. Audio engine — why it won't drift, and why it survives a locked screen

**Until WSHED-85** the engine was the canonical lookahead scheduler: a 25 ms
timer scheduling every click in the next 120 ms at exact AudioContext times.
Sample-accurate while the page runs — but iOS suspends the page's JavaScript
when the screen locks, and Android throttles background timers to once a
second, so the clicks stopped or stuttered the moment a player locked the
phone to save power.

**Now (2026-09-05)** the beat lives on the audio thread:

1. `bar.js` (pure) lays out one bar — every click's time and kind for the
   current tempo, meter, accents/mutes and subdivision. The bar is rounded to a
   whole number of samples (≤ half a sample, ~10 µs, the same every bar: beats
   stay perfectly even, the tempo is off by a few parts per million).
2. `renderBar` synthesizes that bar with the existing voices into an
   `OfflineAudioContext`, rendering 0.2 s past the end and **folding the tail
   onto the bar start**, so the loop seam carries the last click's decay.
3. The buffer loops on an `AudioBufferSourceNode` — no JS timer keeps time.
4. A settings change re-renders and **swaps at the next beat boundary**: the
   new source `start(T, offset)`s at the beat it should be on, the old one
   `stop(T)`s, both sample-accurate. A knob still feels immediate.
5. The clicks run through a `MediaStreamAudioDestinationNode` into a hidden
   playing `<audio playsinline>`; the platform treats the page as playing media
   (like a music app) and keeps the audio alive behind the lock screen.
   `navigator.audioSession.type = "playback"` where Safari offers it. If the
   sink can't start, the direct path stays.
6. **Media Session**: "Metronome · 96 bpm / Chopinly" with play/pause on the
   lock screen; the engine's `onchange` keeps the transport button honest.

`pointer()` (dots + pendulum) is computed from the audio clock and the loop
anchor in force, so visuals still follow the *audio*, never a second timer.
The media-element path may add a few tens of ms of output latency; if the dots
visibly lead the click on a device, a fixed visual offset is the fix.

Voices are pure Web Audio synthesis (oscillators, noise buffers, bandpass,
exponential decay envelopes) — no samples, no asset loading, fully offline.

## 4. Visual direction — "inside the piano"

Everything on screen is derived from piano materials; no generic dashboard
styling.

**Palette — skin tokens (WSHED-71).** Every color in `css/app.css` is a custom
property from one block, so a *skin* is one block of values; translucent
variants are `color-mix()`ed from the base tokens where they are used, and
canvas code reads tokens via `token()` in `js/lib/skins.js`. The user's choice
is a device setting (`ws.shell.skin`, never synced), applied as `data-skin` on
`<html>` by an inline head script before first paint; `color-scheme` and
`theme-color` follow it. The default skin is **Ebony**:

| token | Ebony | role |
|---|---|---|
| `--bg` / `--bg-panel` / `--bg-raised` / `--bg-edge` | `#191410` / `#1e1913` / `#26201a` / `#3a3128` | case interior; cards and sheets; control surfaces; hairlines |
| `--fg` / `--fg-dim` / `--fg-on-accent` | `#eee5d3` / `#a2947d` / `#191410` | aged ivory (primary text); secondary text; type on an accent button |
| `--accent` / `--accent-bright` | `#c9a35c` / `#e3c284` | brass: pedals / pendulum weight — the action accent (start, active states) |
| `--hi` | `#ecc766` | gold: a nailed note, the sweet-spot band |
| `--ok` / `--rough` | `#8fae82` / `#9a6b3f` | sage and bronze grade tiers |
| `--red` | `#b0463c` | felt: the **downbeat** color only (and missed / delete) |
| `--band-*`, `--series-*`, `--scrim`, `--shadow-*`, `--staff-line`, … | see the block | practice bands, chart palette, and the small stuff |

The other skins, in picker order:

| skin | ground / type / accent | why |
|---|---|---|
| **Green Piano** | paper white `#f6f3ec` / black / `#00b06a` | the first white-label appearance for studios and teachers |
| **Nocturne** | OLED black `#050507` / silver / periwinkle `#a6b3ff`, pale-moon gold for nailed | the practical one: the late session under a dim stand light; black pixels are off on an OLED phone |
| **Manuscript** | parchment `#eee3c8` / sepia ink / fountain-pen blue `#2f4f8f`, gilt for nailed | the scholarly one: the autograph score as an interface; red stays the teacher's pencil |
| **Neon** | midnight indigo `#120f24` / lavender-white / magenta `#ff4fa3`, cyan for nailed | the whimsical one: Rhodes-and-arcade energy for students who find the piano case too serious |

To add a skin: one more `:root[data-skin="…"], .skin-…` block and one entry in
`SKINS` (`js/lib/skins.js`) — the picker's swatch is drawn from the block
itself. The landing page and the legal pages keep their own fixed styling.

Dark by intent: a glowing white rectangle next to sheet music is hostile;
this sits quietly on the music desk.

**Type.** Tempo markings in engraved scores are italic serif — so the display
face is **Fraunces** (self-hosted woff2; fallback Didot/Georgia): the huge BPM
numeral in roman, the marking (*Andante*) in italic. Controls/captions use the
system sans stack. Two voices, each with a reason.

**Signature element: the pendulum.** A brass arm with a weighted bob sweeping
a shallow arc, **phase-locked to the AudioContext clock** (angle computed per
frame from the current beat phase — not a CSS loop, so it can never drift from
the sound). One full sweep per beat, downbeat swings through with a felt-red
flash at bottom-dead-center. It's the one animated, memorable thing; the rest
of the UI holds still. `prefers-reduced-motion` swaps it for a dot-pulse only.

**Beat dots** under the pendulum: one per beat in the bar; filled = accent
(felt red), ring = normal (ivory), hollow-dim = muted; the current beat lifts.

**Layout** (portrait-first):

```
Woodshed ······················ (tabs appear when >1 tool)
        ╭───── pendulum arc ─────╮
        │      brass arm + bob    │
            ● ○ ○ ○   beat dots
                 112              ← Fraunces numeral
             ♩ = Andante          ← italic marking
      [−5] [−1]  ──slider──  [+1] [+5]
      meter 4 ▾ · subdiv ♩ ▾ · voice Wood ▾ · vol ──
                ( ▶ start )        [tap tempo]
```

**Copy** stays in the subject's register: *start / stop / tap tempo*, meters as
plain numbers, markings in Italian. No filler.

## 5. PWA posture

- `manifest.webmanifest`: standalone, portrait-primary, theme/background
  `#191410`, 192/512 + maskable icons (brass pendulum glyph on ebony).
- **Service worker: network-first, cache fallback**, versioned cache name.
  Installable and fully offline (a metronome must work in a basement practice
  room), but never serves stale UI when online — this dodges the CF-Pages
  immutable-asset/stale-shell traps we've been bitten by. No `404.html` in the
  output (it kills Pages SPA fallback).
- Wake lock owned by the shell, requested only while a tool reports running.

## 6. Tool #2 — pitch pipe (WSHED-5), and the navbar (WSHED-4)

With a second tool the shell's header became a **navbar**: brand left, a
dropdown top-right rendered from the registry (menuitemradio semantics,
Escape/click-outside close), plus **hash routing** — each tool is a screen at
`#/<tool-id>` with a shareable URL.

The **pitch pipe** mirrors the physical object: 12 notes in a ring, tap to
sound a sustained tone, tap again to stop. Center readout shows note (sharp ·
flat) + frequency; octave (2–6) and **A4 calibration** (430–450, default 440)
retune a *sounding* note live via `setTargetAtTime`, so you can sweep while
tuning. Timbre: two saws detuned 6 cents (reed beating) through a gentle
lowpass with a soft attack — sustained, steady, no vibrato. Wake lock while
sounding.

**Tool #3 — tuner (WSHED-6)**, the pitch pipe's inverse: mic →
`MediaStreamSource` → `AnalyserNode` (fftSize 4096, echo-cancel/noise-suppress/
AGC off) → autocorrelation with parabolic interpolation (`detect.js`, pure and
node-tested), ~10 readings/s with an RMS silence gate. Display is a **cents
dial** in the pendulum's visual family: ±50¢ arc, ticks every 10¢, a needle
that eases to the smoothed reading — ivory normally, **brass within ±5¢**,
felt-red beyond 25¢. Same A4 calibration control as the pitch pipe. Mic tracks
are released on stop; denial shows guidance instead of a broken screen.

## 7. Verification bar

Local smoke before deploy: page serves, manifest + sw fetch 200, start/stop
works, all four voices audible, tap tempo sane, dots editable, settings survive
reload. Deploy isn't done until the same checks pass on the final host.


## 7. Tool #5 — Logbook (WSHED-23 → v2 in WSHED-29)

The practice tracker. v1 (WSHED-23, 2026-08-30) was a daily log with goals
attached; four days of use showed the goal object asked for too much and the
clock never touched the goals. **v2 (WSHED-29, 2026-09-04)** is
goal-attributed: play → *what are you working on?* → the clock runs against
that goal; switch splits a sitting into per-goal segments; goals are type +
name with a dated notes thread; Today and History are derived from segments.
Full design: [`LOGBOOK_V2_DESIGN.md`](LOGBOOK_V2_DESIGN.md); plan:
[`LOGBOOK_V2_IMPLEMENTATION.md`](LOGBOOK_V2_IMPLEMENTATION.md).

## 8. Accounts + cloud sync (WSHED-48, 2026-09-04)

Passwordless email-code sign-in, D1-backed entity sync of the Logbook, the navbar account button, and the `/welcome` landing. See [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md).
