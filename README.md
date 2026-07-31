# Woodshed — practice assistant

A piano practice assistant PWA. Tools so far: a **metronome** (sample-accurate
Web Audio scheduling, four synthesized click voices, tap tempo, per-beat
accent/mute, subdivisions, a brass pendulum phase-locked to the audio clock)
a **pitch pipe** (ring of 12 notes, sustained reed tone, octave + A4
calibration with live retune), and a **tuner** (mic + autocorrelation pitch
detection, cents dial, same A4 calibration). Installable and fully offline;
tools live at `#/<tool-id>` behind the navbar dropdown.

**Live:** https://metronome.apps.lalalimited.com

## Run locally

No build step — the repo is the site:

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

## Architecture

Static vanilla-ES-module PWA with a tool shell. A tool is
`{ id, name, glyph, mount(rootEl, ctx), unmount() }`; adding tool #2 (drone,
tuner, practice log…) = one folder under `js/tools/` + one entry in
`js/registry.js` — the shell grows a tab strip automatically. Full rationale,
palette, and audio-engine design: [`docs/DESIGN.md`](docs/DESIGN.md).

## Deploy

Cloudflare Pages on the shared LaLa Solutions account
(`wrangler pages deploy . --project-name woodshed`); custom domain
`metronome.apps.lalalimited.com`. See `claude_ops/docs/sops/cloudflare-deploys.md`.
