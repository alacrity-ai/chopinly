# Chopinly — practice assistant

A piano practice assistant PWA. Tools so far: a **metronome** (sample-accurate
Web Audio scheduling, four synthesized click voices, tap tempo, per-beat
accent/mute, subdivisions, a brass pendulum phase-locked to the audio clock)
a **pitch pipe** (ring of 12 notes, sustained reed tone, octave + A4
calibration with live retune), a **tuner** (mic + autocorrelation pitch
detection, cents dial), and **sight singing** — a training app with a real
engraved staff (Bravura/SMuFL), tonic-chord count-in, and octave-agnostic
pitch+rhythm judging with a gold/green/bronze/red grade per note — and a
**logbook**: a goal-attributed practice tracker. Press play, say what you're
working on, and it quietly builds your practice history: time per goal per
day, a searchable library of what you practice (pieces · technique · other),
a dated notes thread per goal whose last line greets you when you press play
again, and a history that reconstructs what you actually did. Sight-singing
results and metronome tempos log themselves. Installable and fully offline;
tools live at `#/<tool-id>` behind the navbar dropdown.

**Live:** https://chopinly.com (legacy alias: https://metronome.apps.lalalimited.com)

## Run locally

No build step — the repo is the site:

```bash
python3 -m http.server 8080   # then open http://localhost:8080
npm test                      # node --test (judge, corpus, staff, logbook)
```

## Architecture

Static vanilla-ES-module PWA with a tool shell. Logbook v2 design + plan:
[`docs/LOGBOOK_V2_DESIGN.md`](docs/LOGBOOK_V2_DESIGN.md) ·
[`docs/LOGBOOK_V2_IMPLEMENTATION.md`](docs/LOGBOOK_V2_IMPLEMENTATION.md)
(v1, superseded: `LOGBOOK_DESIGN.md` / `LOGBOOK_IMPLEMENTATION.md`).

Static vanilla-ES-module PWA with a tool shell. A tool is
`{ id, name, glyph, mount(rootEl, ctx), unmount() }`; adding tool #2 (drone,
tuner, practice log…) = one folder under `js/tools/` + one entry in
`js/registry.js` — the shell grows a tab strip automatically. Full rationale,
palette, and audio-engine design: [`docs/DESIGN.md`](docs/DESIGN.md).

## Deploy

Cloudflare Pages on the shared LaLa Solutions account
(`wrangler pages deploy . --project-name woodshed` — the Pages project keeps its
original name); custom domains `chopinly.com` + `www.chopinly.com` (zone
`chopinly.com`; www → apex is a client-side redirect in `index.html` — Pages
`_redirects` can't match hostnames and no token has the Rulesets scope) and the legacy alias `metronome.apps.lalalimited.com`. See
`claude_ops/docs/sops/cloudflare-deploys.md`.
