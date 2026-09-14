# Chopinly — Compose: expressions as first-class things (WSHED-122)

Companion to [`COMPOSE_DESIGN.md`](COMPOSE_DESIGN.md) (§4 data model, §6 layout,
§8 editor) and [`COMPOSE_VOICES_DESIGN.md`](COMPOSE_VOICES_DESIGN.md). This note
replaces §8.5f of the main design (the v85 expression rail, WSHED-118), where a
dynamic, a hairpin and a text were **attributes of a note** (`ev.dyn`,
`ev.hairpin` start / stop flags, `ev.text`). Leif, 2026-09-14:

> These things should be attached to a beat (for dynamics and text), and for
> hairpins, they would have a start beat and an end beat … we should probably
> support the & of a beat as well … they must be selectable … deleted and
> dragged around horizontally in time.

The design below was expressed back to Leif and agreed before anything was
built. §9 records where the code differs from the text.

## 0. What changes for the musician

- A dynamic, a text or a hairpin **lives on a beat, or the & of a beat**, not on
  a note. In 4/4 a bar has eight slots for an `mf`: 1, & of 1, 2, & of 2 … A slot
  need not hold a note.
- **Placing** works like Key / Time / Clef: tap the mark on the rail, a ghost
  follows the pen and snaps to the nearest slot of the nearest staff, the tap
  places it. A hairpin takes three taps: `<` (or `>`), the slot it starts on,
  the slot it ends on.
- **Selecting** works like notes: in Select mode a tap or a lasso takes it,
  delete removes it, undo brings it back.
- **Moving** works like a rest's vertical drag, turned sideways: drag a mark
  along the staff and it slides slot by slot, across barlines and system
  breaks. A hairpin shows two end handles when selected; its body drags both
  ends, a handle drags one.
- Nothing about notes changes: moving, retyping or deleting a note leaves the
  marks where they are.

## 1. Data model (schema `v: 3`)

Each bar carries an `expressions` list beside its `clefChanges`:

```js
measures[b] = {
  …,
  clefChanges?: [ { staff, at, clef } ],
  expressions?: [                                   // sorted by at, then staff, then kind
    { id, kind: "dyn",     staff, at, value: "mf" },          // pp p mp mf f ff
    { id, kind: "text",    staff, at, value: "rit." },        // ≤ 40 characters, whitespace collapsed
    { id, kind: "hairpin", staff, at, dir: "cresc" | "dim", end: { bar, at } },
  ],
}
```

- `at` is ticks from the bar start on the **expression grid** — half of the
  time signature's unit: `exprGrid(time) = WHOLE / time.unit / 2`. In 4/4 the
  grid is an eighth (8 slots), in 3/4 an eighth (6 slots), in 6/8 a sixteenth
  (12 slots). A slot is `0 ≤ at < capacity`, `at % grid === 0`.
- A hairpin is stored on the bar its **start** is in; `end` names any later
  slot, in the same or a later bar, and `end` must be strictly after the start
  in absolute ticks.
- **One dynamic and one text per staff per slot.** Placing another on the same
  slot replaces it (the arriving one owns the slot).
- **Hairpins on a staff never overlap.** A new hairpin owns its range: any
  hairpin on that staff that overlaps it is removed.
- `id` comes from `eid()` like an event id; ids are unique across events and
  expressions, so a selection key is just the id.
- The note-level fields `dyn`, `hairpin`, `text` are **gone** from the event.
  `validate` rejects them on a v3 document.

### 1.1 Upgrade from v1 / v2

`upgrade(doc)` (engine.js) is idempotent and runs at the two boundaries where a
document enters the editor: opening a composition, and a version arriving from
another device through sync (`logbook.on`). It also runs in the export sheet
and the page planner, which take the editor's document. Rules:

- `ev.dyn` on a note → `{ kind: "dyn", staff, at: onset of the note, value }`.
  The onset is snapped **down** to the grid (a tuplet member's onset may not
  sit on it).
- `ev.text` on any event → `{ kind: "text", … }` at its onset, the same way.
- `ev.hairpin` start / stop pairs (matched positionally per voice as before,
  `hairpinEnd`) → one `{ kind: "hairpin", dir, at: start onset, end: { bar,
  at: stop onset } }`. A stop at the same slot as its start (a hairpin over a
  single short note) is pushed one slot later; a half without its other half is
  dropped, as `cleanHairpins` dropped it before.
- The old fields are deleted; `v` becomes 3. A document already at v3 is
  returned as is (same object).

### 1.2 Invariants (added to `validate`)

6. Every expression sits on its bar's grid, on a staff the bar has; a hairpin's
   `end` names a bar that exists and a slot strictly after its start; the list
   is sorted; no two dynamics (or texts) share a staff and slot; no two
   hairpins on a staff overlap.

## 2. Engine (`engine.js`)

Every op clones, returns the new document, and throws a `Nudge` on refusal
(the document is then untouched — no half-measures).

| Op | What it does |
|---|---|
| `exprGrid(time)` (ticks.js) | The slot size for a metre. |
| `exprSlot(doc, bar, ticks)` | The nearest slot to a tick of a bar: `{ bar, at }`; the tail of the last slot rolls into the next bar (last bar: clamps to its last slot). What the ghost and the drop use. |
| `addExpression(doc, { kind: "dyn" \| "text", staff, bar, at, value })` → `{ doc, id }` | Places one; replaces the same kind on that staff and slot. Refuses an off-grid `at`, a bad value, an empty text. |
| `addHairpin(doc, { staff, bar, at, dir, end: { bar, at } })` → `{ doc, id }` | Places one; refuses `end ≤ start`; removes overlapping hairpins on the staff. |
| `moveExpressions(doc, ids, delta)` | Slides every named expression by `delta` ticks (any sign), each landing on its destination bar's grid (a hairpin: both ends). Refuses when any would leave the piece ("as far as it goes") — nothing moves. Arriving ones own their slot / range like a fresh placement. |
| `moveHairpinEnd(doc, id, which: "start" \| "end", { bar, at })` | Re-anchors one end; refuses a collapsed span. |
| `setExpressionValue(doc, ids, value)` | Retypes the named dynamics (a dynamic name) or texts (a string); a mixed list is refused. |
| `removeExpressions(doc, ids)` | Drops them; unknown ids are ignored; nothing matched → the same document. |
| `findExpression(doc, id)` → `{ bar, index, x }` or null | Lookup by id. |
| `expressionsOf(doc)` → `[{ bar, x, abs, absEnd? }]` | Every expression with absolute ticks, in time order — what layout and playback walk. |
| `cleanExpressions(doc)` | Drops what is off its bar's grid or past its capacity, hairpins whose end bar is gone (or whose span collapsed), resolves duplicates by keeping the later entry, sorts. Called by `setTime`, `trimBars`, `upgrade`. |

`setTime` carries expressions through a re-flow by absolute tick the way it
carries clef changes (`putClef`); what falls off the new grid is snapped down
to it. `trimBars` treats a bar that holds an expression, or that a hairpin ends
in, as used (`isEmptyBar` stays about notes: an expression alone does not stop
the trailing empty bar from being appended, so there is always a bar to write
into). `remove` / `toRests` / `setVoice` / `paste` never touch expressions;
`clipFrom` copies notes only.

## 3. Layout (`layout.js`)

After `drawn` is built, every expression is placed from `expressionsOf(doc)`:

- **x** — the slot's x inside its bar, interpolated between the bar's columns
  exactly as `hit.js`'s `xOfTicks` does (a slot with no column of its own sits
  proportionally between its neighbours). A dynamic's ink is centred at
  `x + 0.59` (half a black notehead), so a dynamic under a note is under its
  head; a text starts at `x`; a hairpin runs from `x(start)` to `x(end) +
  1.18`, shortened at either end that meets a dynamic on the same staff and
  slot (starts 2.3 after the slot / ends 0.7 before it, as v85 did).
- **y** — the expression line of the staff: `max(staff bottom + 2.6, lowest
  thing + 1.6)` over the drawn things of that staff in the bar whose sounding
  span covers the slot (any voice); a hairpin takes the max over its whole
  span, per system half. Text sits above: `min(staff top − 2.3, highest thing
  − 1.3 − ornament room)` over the things sounding at its slot.
- A hairpin across a system break becomes two open halves (`half: "out"` /
  `"in"`) as before, with `x2` at the system's last barline and `x1` at the
  next system's first bar body.
- Output entries carry the expression's `id`, `bar`, `at`, `staff`, `system`
  (and `end` for a hairpin), so the painter can group them and `hit.js` can
  find them: `L.dynamics`, `L.hairpins`, `L.texts`.

## 4. Hit testing (`hit.js`)

`things(L)` adds `{ type: "dyn" | "text" | "hairpin", ev: id, bar, staff, x, y
}` for every expression (a hairpin's anchor is its midpoint; a split hairpin is
one thing). `thingAt(L, x, y)` tries heads, rests and stems first (they are
small and sit on the staff), then expressions:

- a dynamic: within 1.2 S sideways and 0.9 S vertically of its centre;
- a text: from `x − 0.3` to `x + 0.6 × characters`, 1.1 S above the baseline to
  0.3 below;
- a hairpin: within 0.9 S of its line between `x1` and `x2`; within 1.0 S of an
  end it is that end's handle — `type: "hairpin-start"` / `"hairpin-end"` (only
  when the hairpin is already selected, so a first tap selects the whole thing).

## 5. Paint and render

`paint.js` wraps each expression in `p.group("cp-expr cp-expr-<kind>", { ev:
id })`, so the SVG painter registers it in `groups` and `setSelection` lights it
(`.cp-expr.sel` fills with `--hi`) and the PDF painter, which ignores group
data, draws it as ink. The overlay gains `showHandles(points | null)`: two
small circles at a selected hairpin's ends. Ghosts (`showGhost`) gain three
shapes: `{ dyn, x, y }` (the glyph), `{ text, x, y }` (italic words), `{
hairpin: dir, x1, x2, y }` (the rubber band from the placed start to the
pointer's slot; when the pointer is on another system the band runs open to the
start system's end).

## 6. The editor (`editor.js`, `rails.js`)

### 6.1 Arming and placing

`pending` gains three kinds beside key / time / clef:

- `{ kind: "dyn", value }`, `{ kind: "text", value }` — the rail button (or a
  text chip / the typed words + *set* / Enter) arms it; the same button again
  disarms. `changeTarget` resolves the pointer to `{ bar, staff, at }` through
  `exprSlot` on the nearest staff; the ghost shows the mark on that staff's
  expression line; the tap calls `addExpression` and **clears the pending**, as
  a clef does (tap the button again for another).
- `{ kind: "hairpin", value: dir, start: null | { bar, staff, at } }` — the
  first tap on the staff fills `start` (toast: *now tap where it ends*), the
  ghost becomes the rubber band; the second tap calls `addHairpin` and clears
  the pending. The end takes the start's staff. Escape, the button again, or a
  mode change cancels.
- Pending keeps its other rules: it cancels a drag / lasso / paste, leaves Pan,
  and `.arming` on the view.

### 6.2 Selecting

An expression's selection key is its id (no `:pi`). `select`, the lasso,
`pruneSelection`, `deleteSelection` (events through `remove`, expressions
through `removeExpressions`, one undo step) and `R.setSelection` all treat it
like an event id; the voice does not follow an expression. `selFacts` gains
`exprs` (every selected thing is an expression) and `dyns` / `texts` (all of
one kind) so the rails can enable retyping.

### 6.3 Moving

`headUnder` returns an expression thing in Select mode (like a rest), so pen /
mouse / finger down on one grabs it. The drag is horizontal: `grabMove` maps
the pointer to a slot with `exprSlot`, computes the delta in absolute ticks
from the grabbed thing's original slot, and previews `moveExpressions(base,
ids, delta)` — an all-expressions selection travels as a cluster. A handle
(`hairpin-start` / `hairpin-end`) previews `moveHairpinEnd`. A refused step
holds at the last good one; release commits base → preview as one undo step;
a clean tap on a selected expression deselects it, as for a note. ← / → on an
expression-only selection nudge one slot (`moveExpressions` by the grabbed
bar's grid); a refused nudge nudges back with the sentence.

### 6.4 The rail

The expression lane keeps its shape (pp … ff · < > · text ▾) but the buttons
are always enabled: with nothing selected they **arm**; with an
all-dynamics (all-texts) selection a dynamic (chip / typed text) **retypes**
through `setExpressionValue` and arms nothing. `aria-pressed` shows the armed
one; the text menu's *clear the text* row goes (delete removes a text). The
`arming` view state shows the crosshair cursor as for a clef.

## 7. Playback (`play.js`)

`velocities(doc)` walks each staff's notes in time order beside the staff's
expressions in absolute ticks: a dynamic at `t` sets the level for notes at or
after `t`; a hairpin starting at `t0` ramps from the level in force at `t0` to
the first written dynamic at or after its end `t1` (else one step up / down),
notes inside `[t0, t1)` interpolate, and the level holds at the target from
`t1` on. A dynamic in any voice of the staff applies to the staff, as before.

## 8. Tests

- **engine:** placing / replacing on a slot, off-grid refusal, hairpin overlap
  ownership and collapsed-span refusal, move across bars and its clamps, handle
  moves, retype, remove, `exprSlot` rolling into the next bar, `upgrade` on a
  v2 document (every mark lands at its note's onset; a start/stop pair becomes
  one hairpin; idempotent), `setTime` carrying by tick, `trimBars` keeping a
  bar a hairpin ends in, `validate` refusing the old fields on v3.
- **layout:** positions (under the head when a note is there; between columns
  when not), the expression line clearing a low note, the split across a
  break, `things` / `thingAt` finding each kind and a selected hairpin's
  handles.
- **play:** the velocity test rewritten against slots (a dynamic between two
  notes applies to the second).
- **golden fixture:** the builder places the same marks at the same slots
  through the new ops; only the `dynamics` / `hairpins` / `texts` entries of
  `compose-golden.json` change (the diff is checked by hand when regenerating).
- **E2E:** the expression step rewritten — arm `f`, tap beat 1; `<`, tap beat
  2, tap bar 2 beat 1; *rit.* on the & of 3; Select: tap the dynamic, drag it
  one slot right, ← nudges it back, delete; the typed text; Escape cancels a
  half-placed hairpin; the rail's buttons stay squares.

## 9. As built (v91, 2026-09-14)

Where the code differs from, or sharpens, the text above:

- **Grid helpers.** `exprGrid` lives in ticks.js; the engine adds `slotOfAbs(doc,
  abs)` (the slot at or before an absolute tick) and `nextSlot(doc, slot)`
  beside `exprSlot`. Moves and the upgrade snap **down** with `slotOfAbs`.
- **Ownership on arrival** is one helper, `putExpr`: a dynamic / text drops the
  same kind on its staff and slot, a hairpin drops every hairpin on its staff
  whose span overlaps — used by `addExpression`, `addHairpin`,
  `moveExpressions` and `moveHairpinEnd` alike, so a moved mark behaves exactly
  like a fresh placement.
- **A dynamic's x** is the slot's x + 0.59 (half a black notehead of 1.18),
  which is where a note's head centre was under v85 — the golden fixture's
  numbers did not move at all (the fixture was regenerated only because the
  drawn notes lost their `dyn` / `hairpin` / `text` keys; zero value diffs).
- **A hairpin over more than two systems** draws a `half: "both"` segment
  (open at both ends) through each middle system; v85 drew nothing there.
- **The layout result carries two closures** for the ghost: `L.exprLine(si,
  staff, a, b)` and `L.textLine(si, staff, a)` — the same functions the
  placed marks use, so the ghost lands exactly where the mark will.
- **A whole-bar rest** counts as sounding for its whole bar when the expression
  line looks for what sits under a slot.
- **The rail** always enables the six dynamics, the two hairpins and *text ▾*;
  with an all-dynamics (all-texts) selection they retype through
  `setExpressionValue` instead of arming. The text button shows the armed
  words in place of *text*; the *clear the text* row is gone (Delete removes
  a text). Enter / *set* / Escape in the text box blur it, so the next pen
  tap — and Escape — reach the staff.
- **Pending clears after one placement** (as a clef does); a hairpin's first
  tap keeps the pending with `start` filled. A tap on a selected hairpin's
  handle without a drag does nothing (a tap on a selected note deselects).
- **`isEmptyBar` is still about notes** (so a bar holding only an `mf` does
  not force a trailing bar); `trimBars` keeps a bar a mark sits in or a
  hairpin ends in.
- **Schema.** `logbook.updateComposition` accepts `v` so an upgrade writes the
  measures and the version together; the editor upgrades on open and on a
  remote version; `validate` accepts v1 / v2 (marks on notes) and refuses the
  old fields only on v3.
- **Removed:** `dynamic`, `hairpin`, `hairpinEnd`, `cleanHairpins`,
  `exprText` from engine.js; `DYNAMICS` / `HAIRPINS` now live in model.js
  (re-exported by the engine).
