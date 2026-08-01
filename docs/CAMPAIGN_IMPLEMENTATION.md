# Campaign & Challenge — implementation plan

Step-by-step build order for docs/CAMPAIGN_DESIGN.md. Each step is a ticket;
each leaves the tool shippable.

## 0. Current shape (v1.2)

`js/tools/sightsinging/ui.js` is one screen: settings strip + staff + runner
logic (count-in, live grading, pitch lane, results) all in `buildUI`. The
corpus is 18 melodies in `melodies.js` with `deal(difficulty, lastId)`.

## 1. Corpus expansion (pure data — no UI risk)

New layout: `js/tools/sightsinging/corpus/` — `classic.js` (the original 18,
retempoed), `book1.js` … `book5.js` (18 campaign melodies each), `index.js`
(merges, validates once in dev, exports `MELODIES`, `byId`, `pool(filter)`).
`melodies.js` keeps its public API (`toTimeline`, `deal`, `validateCorpus`)
and re-exports from the corpus so nothing upstream breaks.

- Every melody gains nothing new structurally — same format — but tempos now
  genuinely vary (see MUSICAL_DESIGN.md §3) and every melody carries its
  campaign position implicitly via `corpus/campaign.js`:
  `BOOKS = [{ id, title, blurb, lessons: [{ id, title, melodies: [ids] }] }]`.
- `deal(difficulty, lastId)` grows an options form:
  `deal({ difficulty, clefs, exclude })` for challenge; old signature kept.
- Node tests: validator over the full corpus (measure fill, range-per-clef,
  ends-on-tonic where flagged), campaign table integrity (every referenced id
  exists, no melody in two lessons, 90 distinct), tempo-variety assertion
  (≥8 distinct tempos per book span).

## 2. Runner extraction (refactor, zero behavior change)

Split `ui.js`:

- `runner.js` — `createRunner(root, ctx, callbacks)` owning everything from
  "here is one melody" down: staff, count-in, bus, live grading, pitch lane,
  hear-it, stop, per-melody verdict. Callback `onVerdict(melody, verdict)`;
  the host decides what happens next. The `__WS_FAKE_SING` seam lives here.
- `ui.js` — becomes the mode shell: sub-hash router
  (`#/sightsinging[/campaign|/challenge|/run]`), landing view, and the
  playlist driver (interstitial → next melody → set summary).

E2E must pass unchanged after this step (same selectors: `#ss-start`,
`#ss-lane`, `.ss-running`, `#ss-results` live in the runner).

## 3. Landing + challenge mode

- Landing view (two cards, resume lines from `store`).
- Challenge config view; writes `challenge-cfg`, deals N distinct melodies
  via `pool()`, hands the playlist to the driver.
- Set summary for challenge (per-melody list, average, again/settings).
- New store keys per design doc.

## 4. Campaign mode

- `campaign.js` data (from step 1) + map view: book sections, lesson
  medallions, star stickers, locked/current/done states, lesson detail
  panel, begin → playlist.
- Star award on the set summary (staggered stamp animation, reduced-motion
  safe), `campaign` store writes (best-of only).
- Resume logic: first lesson without ≥1★ is "current".

## 5. Polish + land

- SW: add all new module files to SHELL, bump CACHE.
- Icons/copy pass, phone-width sweep, reduced-motion sweep.
- E2E additions (fake seam): challenge 3-melody drill start→summary;
  campaign lesson complete → stars persisted (localStorage inspected);
  back-button routing landing↔campaign↔run.
- Deploy + prod smoke + handoffs.

## Test seams

- `window.__WS_FAKE_SING` unchanged (per-melody outcome).
- New: `window.__WS_FAKE_SET = ["perfect","flat",...]` — consumed one per
  melody by the playlist driver so a whole set can be scripted in E2E.

## Risks

- ui.js refactor regressions → step 2 changes no behavior and is gated on
  the existing E2E passing verbatim.
- 90 hand-written melodies with fill errors → validator throws loudly at
  dev-load + node test over the whole corpus; nothing renders unvalidated.
- Scope creep in the map visuals → medallions are plain CSS circles +
  absolutely-positioned stars; no canvas, no SVG paths beyond a dotted
  connector line.
