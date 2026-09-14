# Compose — Multi-voice design (up to four voices per staff, cross-staff notes)

**Status:** LANDED as written in **v86** (2026-09-14, WSHED-120, every phase V0–V4 in one
release) — Leif's call: "land the spec as written". Companion to
[`COMPOSE_DESIGN.md`](COMPOSE_DESIGN.md) and [`COMPOSE_IMPLEMENTATION.md`](COMPOSE_IMPLEMENTATION.md).
§12 lists where the build differs from the text, and what is still open.

**Why.** Compose is locked to voice 1 of each staff. That cannot express an inner
line under a melody, two-part counterpoint on one staff, a held bass under moving
tenor notes, or the left hand rising into the top staff. Every notation app has
voices; most make them the clunkiest thing in the app. This design's aim is that a
pianist adds a second voice without ever thinking about "modes".

---

## 0. Principles (the ergonomic contract)

1. **The voice follows the pen.** Tapping a note makes its voice the active one.
   Retyping, dotting, tying, articulating, deleting — all act on the note's own
   voice. The switcher mostly *shows* the voice; the musician rarely presses it.
2. **One place to look.** The voice switcher is on the **Notes rail**, at its left
   end, before the durations: `1 2 3 4`. Unused voices are dim; the active one is
   lit in its colour. It is the one new control. No modes, no "voice entry state".
3. **A tap places into the active voice, exactly where it is tapped.** The grid
   rule, the nudge rule and palm safety are unchanged. In a voice that has nothing
   in that bar yet, the tap creates the voice for the bar: the note lands, and the
   bar's remaining time in that voice becomes rests — the same normaliser that
   keeps voice 1 honest keeps every voice honest.
4. **Nothing is ever silently rewritten.** Moving notes into a voice that already
   has a note at that onset is refused with a bar flash, never merged, never
   truncated (the house rule from §0 of the main design).
5. **Colour tells the voices apart while editing; ink is ink on paper.** When a
   staff has more than one voice anywhere in the piece, voices 2–4 tint (skin
   tokens). Export (PDF, MusicXML) is monochrome.
6. **Standard engraving decides the rest.** Stems: voice 1 up, 2 down, 3 up, 4
   down whenever a bar has more than one voice; single-voice bars keep the
   "far from the middle line" rule. Beams follow stems. Rests of voice 1 sit
   high, voice 2 low. Ties and slurs curve away from the voice's stems.
7. **A silent voice draws nothing.** A bar in which voice 2 has no notes has no
   voice 2 — no whole-bar rest cluttering it. The moment its last note goes, the
   voice leaves that bar.
8. **Cross-staff is a note property, not a voice.** The left hand rising into the
   top staff stays voice 1 of the lower staff; the note is *drawn* on the upper
   staff (`cross: -1`). Beams span the gap. Playback, ties and the logbook are
   unchanged.

## 1. What the musician gets

| | |
|---|---|
| Switcher | `1 2 3 4` at the left of the Notes rail. Tap: that voice is active for placement. With a selection, tap: the selected notes **move** to that voice (refused if the target voice already sounds at any of those onsets). Hold: the voice menu — *swap 1 ↔ 2 in these bars*, *move to voice…*, *cross to the upper / lower staff*. Keys: `Cmd/Ctrl 1–4`. |
| Place | Tap the staff: the armed duration lands in the active voice at the tapped slot. In an empty voice the bar gains that voice (note + padding rests). Tap on an existing rest of the active voice: as today. Tap on a slot where the *other* voice has a note: places in the active voice beside it (a second voice at the same onset is exactly the point). |
| Select | Tapping a head selects it and makes its voice active (the rail's switcher moves). Lasso takes heads of any voice; the last head lassoed sets the active voice. Every selection-driven action (retype, dot, tie, tuplet, accidental, marks, slur, dynamics, delete, copy) acts per note in its own voice. |
| Paste | The phrase lands in the active voice; a phrase copied from two voices keeps its voice offsets (voice 1 → active voice, voice 2 → active + 1, capped at 4). |
| Rests | A voice's padding rests draw in the voice's colour, offset (voice 1 high, 2 low, 3 high + small, 4 low + small). A rest can be **hidden** (voice menu → *hide rest*) for the engraver's "voice starts mid-bar" look; hidden rests still count and still take taps. |
| Stems · beams | By voice when the bar has > 1 voice (1 up, 2 down, 3 up, 4 down); beams per voice; a chord is one voice. |
| Collisions | Same onset in two voices: a second or unison offsets voice 2's head to the right of voice 1's stem (headW); a unison of equal duration shares one head with two stems (V4 polish). Accidentals stack across both voices' heads in one column. |
| Cross-staff | Select notes, voice menu → *cross to the upper staff* (or lower). The note draws on the other staff with its own ledger lines; a beam group with notes on both staves draws one beam between them; the stem points toward the beam. Tap it where it is drawn to select it. |
| Playback | Voices merge into one timeline; ties and slurs are per voice; dynamics apply to the staff. |
| Undo | Whole-document snapshots as today — a voice move or swap is one step. |
| Sync · export | Same document, `schema v: 2`; MusicXML `<voice>` and `<staff>` map 1:1; PDF draws what the screen draws, in ink. |

Not in this design: more than four voices, voices on a third staff, part
extraction, independent time signatures per voice.

## 2. Decisions delegated (with the reasoning)

| Decision | Choice | Why |
|---|---|---|
| Sparse or full voices? | **Sparse per bar.** `staves[si].voices[k]` exists in a bar only if it has a note there; voice 1 always exists. A present voice is a full bar (sum = capacity). | The normaliser and every invariant stay exactly as they are; empty secondary voices never draw whole-bar rests; the model is honest — a bar's voices are the voices sounding in it. |
| Where the active voice lives | **Editor state, remembered per device** (`ws.compose.armed.voice`), reset to 1 on open. | Like the armed duration. A piece opened tomorrow starts in voice 1. |
| Auto-follow on selection | **Yes, always.** | The single biggest ergonomic win; it turns "switch voice, then act" into "tap, act". |
| Tap on a slot the other voice occupies | **Places in the active voice.** | Two voices at one onset is the whole purpose; refusing would force a mode. |
| Move to voice with a collision | **Refuse with a bar flash.** | House rule: never rewrite the neighbour. The musician deletes or moves the other note first. |
| Stems in a single-voice bar | **Unchanged** (far-from-middle). | A piece that never uses voice 2 looks exactly as it does today. |
| Rest visibility | **Drawn, hideable per rest.** | Engravers hide "before the voice starts" rests, but a hidden rest that still takes taps is what keeps placement predictable. |
| Colours | **Editor only; skin tokens `--voice-2..4`.** Voice 1 stays `--fg`. | Paper is monochrome; the screen needs the hint. |
| Cross-staff scope | **Per note, ±1 staff, drawn on the other staff, owned by its voice.** | Matches MusicXML `<staff>` and how pianists think ("this note is on the top staff, played by the left hand"). |
| Accidental memory for a crossed note | **Per drawn staff.** | The reader sees the accidental where the note is drawn; that is the memory that matters. |
| Voices in copy / paste | **Preserved as offsets from the phrase's lowest voice.** | A two-voice phrase pasted into an empty bar should still be two voices. |
| Fourth voice | Supported in the model from V0, on the switcher from V2. | Rare on piano, cheap once 2 works; the switcher shows `3 4` dim until used. |

## 3. Data model (schema `v: 2`)

```js
measure.staves[si].voices            // [v1, v2?, v3?, v4?] — index = voice − 1; a missing entry = silent in this bar
event.cross?: -1 | 1                 // drawn on the staff above / below its owner (piano: −1 from the lower staff, +1 from the upper)
event.hidden?: true                  // a rest that counts but does not draw (voice starts mid-bar)
```

Migration v1 → v2: none needed — every v1 document already has `voices: [v1]`
per staff. `validate` gains: every present voice sums to the bar's capacity;
`voices.length ≤ 4`; a `cross` only where the target staff exists; only rests
may be `hidden`.

Invariants kept by the engine after every edit (extending §4.2 of the main design):

- Voice 1 exists in every bar of every staff.
- A present voice k ≥ 2 has at least one note in that bar; a voice left with only
  rests is removed from the bar (`compactVoices`).
- Ties, slurs, hairpins pair within one voice (the staff sequences in
  `cleanTies` / `cleanSlurs` / `cleanHairpins` become per-voice sequences).

## 4. Engine

Every operation already threads `f.voice` through `find()`; today it is always
0. The changes:

| Operation | Change |
|---|---|
| `place(doc, slot, armed, voice)` | `slot` gains `voice`; when the voice is absent in the bar, create it as one bar-spanning rest, then place as today. |
| `remove` / `toRests` | After normalising: `compactVoices(bar)` removes secondary voices that became all rests. |
| `setVoice(doc, ids, voice)` | Move notes between voices at the same onset and staff: refused if the target voice sounds at any of those onsets (or a tuplet group would be split); otherwise the source's time becomes rests, the target gains the notes (creating the voice in that bar if needed); both re-normalised; `compactVoices`. |
| `swapVoices(doc, bars, a, b)` | Exchange two voices in whole bars (stems and colours follow). |
| `crossStaff(doc, ids, dir)` | Toggle `ev.cross` (±1 toward `dir`, refused past the outer staff). |
| `hideRest(doc, ids)` | Toggle `hidden` on rests. |
| `clipFrom` / `paste` | Phrases carry `dVoice`; paste maps voice offsets onto the active voice, capped at 4; a collision refuses the whole drop (bar flash), never a partial paste. |
| Fuzz | The existing fuzzes gain a random voice per op; the invariant checker asserts every present voice sums to capacity and voice 1 exists. |

## 5. Layout

- **Columns** come from the union of onsets across staves *and voices*
  (`onsetMap` keyed by tick, as today; each column's `evs` may hold up to four
  events per staff).
- **Stems:** `stemFor(ev)` — in a bar whose staff has > 1 voice: up for voices
  1 and 3, down for 2 and 4; else the current rule. Stem length for 3 and 4 is
  the same; their heads may sit further from the middle, so the beam pass
  clamps beam height per voice.
- **Rests:** voice 1 +1 space (whole-bar and inner rests alike), voice 2 −1,
  voice 3 +2, voice 4 −2; single-voice bars: unchanged. `hidden` rests are
  omitted from `drawn` but present in the hit table (they still take taps).
- **Collisions at one column:** for each staff, sort the column's events by
  voice; if voice 2's top head is within a second of voice 1's bottom head (or
  a unison), offset voice 2's x by `headW + 0.1` (to the right of the stem-up
  stem). Voices 3/4 offset further the same way. Accidentals: one stacking pass
  over all heads of the column on that staff (the existing `accCol` walk).
- **Beams:** per voice; the existing beam pass keys groups by `(staff, voice)`
  instead of `staff`. A beam whose notes have `cross` values on both staves is
  drawn once, between the staves: its y is computed from the stem tips of both
  sides (a straight beam through the gap), stems from each head toward it.
- **Cross-staff notes:** `drawStaff = staff + (cross ?? 0)`; heads, ledgers,
  accidentals and rests use `drawStaff`'s geometry; the event keeps `staff` for
  hit results, ties, slurs and playback. Ties and slurs between a crossed and an
  uncrossed note curve between the drawn positions.
- **Ties · slurs · hairpins · dynamics:** unchanged in shape; the "head side /
  stem side" decision uses the voice's stem rule; dynamics stay per staff on the
  expression line below the staff.
- **Hit tables:** `slotAt` returns the staff (drawn staff for a tap between the
  staves is decided as today by nearest lines); the editor supplies the voice.
  `thingAt` returns `{ ev, voice, staff }` for a head — the drawn head's position
  is what is tested, so crossed notes select where they appear.

## 6. Rendering

`.cp-ev` gains `data-voice`; CSS `.cp-v2 .head, .cp-v2 .stem, .cp-v2 .beam,
.cp-v2 .rest { fill/stroke: var(--voice-2) }` (and 3, 4). Each skin defines
`--voice-2..4` in its token block (`docs/DESIGN.md` §4) — hues that read on
every ground. Voice 1 draws in `--fg`. Export ignores voice classes.

## 7. The editor and the rails

### 7.1 The switcher (Notes rail, far left)

```
┌ notes rail: [1][2][3][4] │ 𝅝 𝅗𝅥 ♩ ♪ 𝅘𝅥𝅯 ▾ │ • ⌒ 3 │ ♯ ♭ ♮ ▾ │ Rest ┐
```

- Four square buttons (`cp-sq`, so the rail stays a grid). The active voice is
  `aria-pressed` and painted in its voice colour; voices that exist somewhere in
  the piece are full ink; the rest are dim. Phone width: `3 4` collapse behind a
  `▾` until used.
- **Tap** (no selection): sets the active voice for placement; toast "voice 2 —
  tap the staff" the first time in a session.
- **Tap** (with a selection): `setVoice` on the selection; refused → bar flash
  and the toast "voice 2 already sounds there". The selection stays selected
  after a move so a wrong move is one tap back.
- **Hold:** the voice menu (a `cp-menu` popover): *move to voice 1 · 2 · 3 · 4*,
  *swap 1 ↔ 2 in these bars*, *cross to the upper staff*, *cross to the lower
  staff*, *hide rest*. Rows are enabled by what the selection allows.
- **Keys:** `Cmd/Ctrl 1–4` = tap; `Cmd/Ctrl Shift ↑ / ↓` = cross-staff.

### 7.2 Follow rules

- Selecting a head (tap or lasso) sets the active voice to that head's voice
  (lasso: the last head hit). The switcher animates to it (the same stamp motion
  as the list highlight).
- Clearing the selection keeps the active voice.
- Place mode: a tap on a rest of the active voice places as today; a tap on a
  rest that belongs to another voice places into the *active* voice at that
  slot (the rest is not the target — the slot is). This is the one rule that
  keeps "tap where you want the note" true across voices.
- Undo restores the document, not the active voice.

### 7.3 Ghosts and feedback

The ghost note wears the active voice's colour, so the musician sees which
voice a tap will land in before lifting the pen. The bar flash for a refused
move is the existing nudge.

## 8. Playback

`timeline` walks every present voice of every staff; ties and slur depth are
tracked per `(staff, voice)`; velocities per staff as today. Two voices on one
pitch at one onset re-strike (the existing "offs first at equal times" rule).

## 9. Phases (each shippable, each with tests and an E2E step)

| Phase | Lands | Tests |
|---|---|---|
| **V0 — model + engine (2 voices)** | sparse voices, `place(…, voice)`, `compactVoices`, `setVoice`, per-voice ties / slurs / hairpins, validate; fuzz with random voices | engine + fuzz; layout unchanged for single-voice pieces (golden layout diff of the corpus) |
| **V1 — layout + switcher** | stems / rests by voice, collision offsets, per-voice beams, colours, the `1 2` switcher with auto-follow, move-to-voice, keys | layout tests (stems, rest offsets, collisions), E2E: place a second voice, auto-follow, move refused on collision |
| **V2 — voices 3 and 4, voice menu** | `3 4` on the switcher, swap, hide rest, paste with voice offsets | engine (swap, paste offsets), E2E |
| **V3 — cross-staff** | `cross`, drawing on the other staff, cross-staff beams, selection where drawn, MusicXML `<staff>` | layout (beam between staves), E2E: LH phrase rising into the top staff |
| **V4 — polish** | shared unison heads, per-voice slur side refinements, phone-width switcher collapse | pixel checks like v82/v83 |

Estimated order of work: V0 and V1 are the bulk (the layout's column and beam
passes are the deepest change since P0). V3 is the piece Leif named (the left
hand rising) and depends only on V0 + the beam pass of V1.

## 10. What could send this back

- The **per-voice sequence** change (ties/slurs/hairpins keyed by voice) touches
  every clean pass — done first, under fuzz, before any UI.
- **Column width** with four events per staff: `colWidth` is per column; a column
  with voice 2 sixteenths under voice 1 halves needs the shortest voice's spacing
  — it already uses the shortest onset gap, so this should hold; the corpus
  golden diff is the tripwire.
- **Auto-follow surprises:** tapping a voice-2 note then placing lands in voice
  2 — intended, but the switcher must move visibly so it never feels like a
  mode the musician did not choose. The ghost's colour is the second safeguard.

## 11. Open questions for Leif

1. Should a **bar with only voice 1** also get the voice-1-up stem rule the moment
   another bar of the piece has voice 2 (consistent stems through a passage), or
   only bars that actually hold two voices? (Design says: only bars with > 1
   voice. Engravers differ.)
2. Padding rests of voices 2–4: **drawn by default** (this design) or hidden by
   default with a *show rests* toggle?
3. The switcher: **numbers** `1 2 3 4` (this design) or the traditional
   engraver's colours only, with the number on hold?
4. Cross-staff on the **voice menu** (this design), or its own `↑ ↓` pair on the
   Utility rail?

## 12. As built (v86) — where the code differs from the text above

- **Absent voices are `null` slots.** `voices[k]` for a voice that is silent in the bar is `null`
  (never a trailing one), so voice 3 can exist without voice 2. `voicesOf`, `voiceIn`, `usedVoices`
  in `model.js`; `compactVoices` / `ensureVoice` in `engine.js`. A v1 document validates as v2.
- **Ties and glissandi are adjacent-only within the voice** (`nextEvent`): a voice absent from the
  next bar has nothing to tie to. A one-note slur or hairpin reaches the voice's next note anywhere
  later (`nextNote`), rests and silent bars skipped. Slurs, hairpins and ties are re-derived per
  (staff, voice) — `seqOf(doc, staff, voice)`; `slurEnd` / `hairpinEnd` take the voice.
- **Slurs and ties in a bar with more than one voice curve outward** — voice 1 (and 3) above,
  voice 2 (and 4) below — not merely "away from the stem": away-from-the-stem put voice 2's slur
  through voice 1's heads on the first screenshot. A single-voice bar is unchanged.
- **A crossed note's stem points home** (drawn on the upper staff → down) when it is not beamed;
  a beam whose notes sit on both staves runs flat through the gap with every stem toward it
  (`makeCrossBeam`); a beam whose notes are all crossed keeps the home-pointing direction.
- **Hidden rests draw faint on screen** (`.cp-hidden`, 28 %), so they can be picked and shown
  again; they still count and still take taps. Paper (P4 export) leaves them out.
- **A plain tap in Select mode picks the rest (or stem) under it** — before, only a lasso could
  select a rest, which the *hide rest* row needs.
- **Rests placed into a voice that is not in the bar do nothing** (`action: "none"`): a silent voice
  draws nothing, so there is nothing to place.
- **Paste:** two clip voices that the cap folds onto one target voice refuse the whole drop
  ("those overlap"); within one voice a paste overwrites its region as before (P0 behaviour).
- **The active voice is session state**, reset to 1 on open (the text said "remembered per device,
  reset on open" — the second half makes the first moot).
- **Phone width:** the ▾ opens the same voice menu; its *voice 3* / *voice 4* rows activate a voice
  when nothing is selected and move the selection when something is.
- **Accidentals** of every voice in a column stack in one column per drawn staff and stand left of
  everything the column owns there (`h.accX`), so a colliding voice's offset never puts a sharp
  over another voice's head.
- **Not built:** MusicXML `<voice>` / `<staff>` — export itself is WSHED-119; `crossStaff` and
  `hideRest` are ready for it. The §11 questions were answered by landing the text as written
  (stems by bar, rests drawn, numbers, cross-staff on the menu + `⌘⇧↑/↓`).
- **Tests:** engine (sparse voices, per-voice ties, setVoice / swap / cross / hide, paste offsets,
  setTime per voice, a 4,000-edit fuzz across four voices), layout (stems, rest offsets,
  collisions + shared unison, per-voice beams and slur sides, cross-staff drawing and beams,
  hidden rests), playback (voices merge, per-voice ties and legato), and a **golden layout**
  (`tests/fixtures/compose-golden.json`, written by the v85 engraver) that proves a single-voice
  piece lays out exactly as before. E2E: `tests/e2e/compose.mjs` "voices" step + the phone-width
  switcher check.
