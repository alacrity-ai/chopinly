# HANDOFF: Sight Singing feature — full context rehydration

Written 2026-08-01 by the agent, for the agent, before a context compaction.
Read this + `docs/SIGHTSINGING_PLAN.md` + `docs/STAFF_DESIGN.md` and you know
everything about this feature. Repo: `~/lets-get-rich/woodshed` (GitHub
`alacrity-ai/woodshed`, persona `leifktaylor`, Alacrity world).

## What Woodshed is (30s)

Leif's piano practice assistant PWA. Live at
**https://metronome.apps.lalalimited.com** (CF Pages project `woodshed` →
`woodshed-l9v.pages.dev`, shared LaLa account, deploy via vendored wrangler in
trello-clone + agentsecrets `cloudflare_api_token`/`cloudflare_account_id`).
Static, no build step, vanilla ES modules, `package.json type:module`. Tools
via a registry (`js/registry.js`): metronome, pitch pipe, tuner (category
"tools") and **sight singing** (category "training") — navbar dropdown renders
a rule between categories. Hash routing `#/<tool-id>`. Network-first SW
(`sw.js`, cache `woodshed-v4`, precache SHELL list — **add new files there**).
kbRelay board **WSHED**; epic **WSHED-7**, sub-tickets 8–13, feedback batch
**WSHED-14**. All in In Review (Leif moves to Done). I work as `u_claude`,
reviewer `u_leif`.

## The feature (user experience)

`#/sightsinging`: deal a melody (level any/1/2/3, never repeats last) → shown
on a real engraved staff → **start** → mic permission → 1 measure of clicks +
sustained tonic triad (status counts "1 2 3 4") → user sings; current note
highlighted brass; optional click continues (toggle) → **each note is graded
live** the moment its window closes (tier color + pop bounce mid-song) → final
results: score % (gold Fraunces), tier counts with medal dots, score words.
While running, the settings strip hides and a **pitch lane** appears: horizontal
centerline = target pitch, comet dot + fading trail = live cents deviation
(♯ above/♭ below, guides ±50¢), zone colors gold ≤15¢ (glow) / sage ≤45 /
bronze ≤90 / felt beyond. **hear it** plays the melody with moving highlight.
Grading is **octave-agnostic** (Leif's explicit requirement).

## File map (feature-relevant)

```
js/lib/music.js          parsePitch("F#4"), keyFifths(key,mode), keyAlterations,
                         keySignatureGlyphs(fifths,clef), staffStep(pitch,clef),
                         CLEFS {treble/soprano/alto/bass: glyph,line,bottom},
                         tonicTriad(key,mode,nearMidi), midiToFreq
js/lib/staff/layout.js   toMeasures (throws on bad fill/durations), layoutMelody
                         → {S, systems, drawn[], beams[], ties[]}; engraving
                         rules: stems, pairwise beat-bounded beams, dots,
                         measure-scoped accidentals, ledgers, justification
js/lib/staff/render.js   renderMelody(container, melody, {unit,width}) →
                         {svg, count, setState(i, state), clearStates, pulse(i)}
                         Bravura glyphs as SVG <text> (PUA literals in G map,
                         verified bytes); states are CSS classes n-current/
                         n-nailed/n-good/n-rough/n-missed; pulse = n-pop bounce
js/lib/melody-player.js  playMelody(getAudio, timeline) → {t0,endsAt,stop},
                         playChord(...,{out}), scheduleClick(getAudio,t,accent,dest)
                         — `out`/`dest` route through caller's bus (stop fix!)
js/lib/pitch/detect.js   autoCorrelate(buf,sr), noteFromFreq(freq,a4) (moved
                         from tuner; tuner imports from here now)
js/lib/pitch/mic.js      createMicPitch(getAudio) → {start(onSample), stop, active}
                         emits voiced {t: ctx.currentTime, freq, midi@440} @~85ms
js/tools/sightsinging/
  index.js               {id:"sightsinging", glyph:"♬", category:"training"}
  melodies.js            18 melodies (seq("G4:4 F#4:2~ r:8") notation; durations
                         in 16ths: 16,12,8,6,4,2), validateCorpus, toTimeline
                         (ties merged, rests dropped, seconds; units carry
                         drawn[] indices), deal(difficulty, lastId)
  judge.js               judge(units, samples, {strictness, latency, headGrace})
                         → {notes:[{tier,precision,coverage}], score, counts};
                         centsOff = octave-folded ±600¢; tiers by precision
                         (median matched |err|) × coverage (matched·0.085/window);
                         base ceilings [15,45,90]¢ × STRICTNESS
                         {relaxed:2.0, standard:1.5, strict:1.0} (v1.1 ladder —
                         shifted one notch easier at Leif's request);
                         coverage req [0.75,0.55,0.30]/strictness capped 0.9;
                         scores 100/75/40/0
  ui.js                  the whole flow; see "run lifecycle" below
fonts/Bravura.woff2      SMuFL reference font (247KB, SIL OFL, license file
                         alongside); @font-face in css; 1em = staff height
css/app.css              staff styles, grade colors (--gold #ecc766, --sage
                         #8fae82, --bronze #9a6b3f, --felt #b0463c), n-pop
                         keyframes (transform-box:fill-box), .ss-running hides
                         .ss-controls, .pitch-lane + zone-* classes
tests/*.test.mjs         24 node tests: staff(10) melodies(5) judge(9);
                         run `node --test tests/*.test.mjs`
dev/gallery.html         staff visual gallery (11 cases) — served locally only;
                         dev/ + tests/ excluded from deploys via .gitattributes
                         export-ignore (deploy = `git archive main`)
```

## Run lifecycle (ui.js internals — the tricky parts)

- `startRun()`: creates a **per-run gain bus** connected to master; ALL clicks
  + count-in chord route through it. `stopAll()` zeroes+disconnects the bus →
  instant silence (this was the WSHED-14 stop-bug fix; before, scheduled oscs
  had no handle and played out). `t0 = now+0.25`, `singStart = t0 + beats*spb`.
- `grades` = per-drawn-note tier array, live-filled; `paintUnit` restores
  highlighted notes to `grades[i] ?? idle`.
- `liveGrade(now)`: while `t > unit[gradedUpTo].t1 + latency + 0.12`, judge
  that single unit against samples-so-far, set tier + `staff.pulse(d)`.
  Latency 0.13s real mic / 0 fake. Final `finishRun()` re-judges everything
  (idempotent with live results) for the score.
- **Pitch lane**: `updateLane(now, unitIdx)` — latest sample fresh <0.3s →
  err = clamp(centsOff(sample, currentUnit.midi), ±100) → y = 36 − err·0.32 in
  a 300×72 viewBox; head dot at x=240, trail scrolls left 140px/s, 26 reused
  circles; zone class on `.pitch-lane` from |err|. Fake mode replays
  `fakeSamples` by clock via `fakeIdx` pointer.
- **Test seam**: `window.__WS_FAKE_SING` = "perfect"|"octave-down"|"flat"
  (−0.8 semi)|"silent" — skips getUserMedia, synthesizes samples from the
  timeline (t += 0.085 per unit). E2E asserts: perfect→100%/all gold (live
  gold appears BEFORE results), octave-down→100%, flat@standard→40% all
  bronze, silent→0%; controls hidden + lane zone-nailed mid-run; stop resets.
- `destroy()` → `stopAll()` (unmount safety). Wake lock via shell `setRunning`.

## Verification rig (reuse this)

- Node: `cd woodshed && node --test tests/*.test.mjs` (24 pass).
- Browser: Playwright lives in `~/lets-get-rich/browserbase_poc/node_modules`
  — scripts must be copied INTO that dir to resolve (`.smoke.mjs` pattern,
  delete after). Serve repo: `python3 -m http.server 8619` (kill with
  `fuser -k 8619/tcp`). Mic tests need launch args
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`
  (fake tone reads as ~G4). `await page.evaluate(() => document.fonts.ready)`
  before staff screenshots.
- Deploy: commit → push → `git archive main | tar -x -C dist` →
  `CLOUDFLARE_API_TOKEN=$(agentsecrets get cloudflare_api_token)
  CLOUDFLARE_ACCOUNT_ID=$(agentsecrets get cloudflare_account_id)
  ~/lets-get-rich/trello-clone/node_modules/.bin/wrangler pages deploy <dist>
  --project-name woodshed --branch main --commit-dirty=true`. Wait ~15-20s,
  verify on the custom domain (first-ever deploy of a new hostname can 000 for
  ~90s — not this project anymore). Bump `sw.js` CACHE + SHELL when adding files.

## Commit history (feature)

`b83bdc6` design docs · `5610634` staff+corpus (WSHED-8/9) · `2673083`
player/pitch-lib/judge/tool/SW-v4 (WSHED-10..13) · `c0ddb6e` v1.1 live
grading + pitch lane + ladder + stop fix (WSHED-14).

## Known limits / open threads

- Staff scope (deliberate): no sixteenths, no multi-voice, no slurs, no 6/8;
  beams are pairwise-within-beat only; d=3 (dotted 8th) renders but unused.
- Latency compensation is fixed 0.13s — Leif hasn't done a real-mic session
  yet; offered to make it calibratable if it feels off. Live grade appears
  ~0.25s after each note ends (window + lag must close); offered an
  "optimistic provisional color" if that feels laggy.
- Melodies are hand-composed (18); a generator is a natural next ticket.
- Tier thresholds/colors: gold/sage/bronze/felt; "current" = brass halo.
- Possible next tools Leif has mused about: **chord notebook** (should REUSE
  lib/staff), tempo trainer, practice log (see brainstorm in WSHED memory).

## Process contract (unchanged)

kbRelay: pick up → in_progress + note → work → review + handoff @leif
(reviewerUserId u_leif) with evidence/screenshots attached; **never move to
Done** — that's Leif's call. Commit as `leifktaylor` with the Claude trailer;
secret-scan diffs; secrets only via `$(agentsecrets get …)`.
