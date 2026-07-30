# Woodshed — design (WSHED-1)

**Woodshed** (jazz slang for the place you go to practice) is a piano practice
assistant PWA. Tool #1 is a metronome. The design below is the contract the
implementation follows.

- Live host: `metronome.apps.lalalimited.com` (Cloudflare Pages)
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

## 3. Audio engine — why it won't drift

`setInterval`/`setTimeout` clicks jitter with main-thread load. We use the
canonical **lookahead scheduler**: a coarse 25 ms timer that, on each pass,
schedules every click falling in the next 120 ms *on the AudioContext clock*
(`osc.start(t)` at exact times). Scheduling is sample-accurate even if the UI
thread hiccups.

Every scheduled beat also pushes `{time, beat}` onto a queue; a
`requestAnimationFrame` loop consumes it when `ctx.currentTime` passes, so the
visuals are driven by the *audio* clock, never a second timer.

Voices are pure Web Audio synthesis (oscillators, noise buffers, bandpass,
exponential decay envelopes) — no samples, no asset loading, fully offline.

## 4. Visual direction — "inside the piano"

Everything on screen is derived from piano materials; no generic dashboard
styling.

**Palette**

| token | hex | source |
|---|---|---|
| `--ebony` | `#191410` | case interior, warm near-black (background) |
| `--ebony-raised` | `#26201a` | control surfaces |
| `--ivory` | `#eee5d3` | aged key ivory (primary text) |
| `--ivory-dim` | `#a2947d` | secondary text |
| `--brass` | `#c9a35c` | pedals / pendulum weight — the action accent (start, active states) |
| `--felt` | `#b0463c` | red bushing felt — the **downbeat** color only |

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

## 6. Verification bar

Local smoke before deploy: page serves, manifest + sw fetch 200, start/stop
works, all four voices audible, tap tempo sane, dots editable, settings survive
reload. Deploy isn't done until the same checks pass on the final host.
