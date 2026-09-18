# Compose — the Layout step (WSHED-156, v118)

Leif (2026-09-18): "Now that I'm actually submitting these PDFs to students … it would be nice to
explicitly define what measures should be on what rows (1–4 on row 1, 5–8 on row 2, 9–11 on row 3
because measure 10 happens to be extremely dense) and how wide each specific measure is relative
to its row." And on the ergonomics: "make sure this works with both pen and touch … no need to have
separate modes for each" and "a barline is only a handful of pixels thick — make sure the click
area is wider than the visual barline."

This is the design and the implementation plan; §9 records what was built.

## 0. Principles

1. **Pins over the automatic layout, not a second export mode.** The engraver keeps deciding; a pin
   is one override. A piece with no pins lays out exactly as before — byte for byte, the golden
   layout untouched. Pin three barlines and the other sixty bars still flow by themselves.
2. **Paper only.** The editor wraps to the width of the screen, so "bars 1–4 on row 1" has no
   honest meaning there. Pins are read only when the layout is asked for paper
   (`layoutComposition(doc, { pins: true })`, which `planPages` passes). The editor never passes it.
3. **Edited on the page itself.** The Layout view shows the plan's own pages through the same
   painter as the export preview (WSHED-133): what you arrange is what prints.
4. **Pins ride their bar.** They live on the measure, so inserting or deleting bars elsewhere does
   not shift them, they sync with the piece, and an older app ignores them. Additive — no schema
   bump, nothing on the open path changes.
5. **One input path.** Pointer events, no pointer-type branch: a finger, a Pencil and a mouse do
   the same thing. No Pen | Touch switch in this view.
6. **A refused edit changes nothing** (Leif's standing rule). Nothing is silently squeezed.

## 1. Model (schema v3, one new optional measure field)

```js
measure.lay?: { brk?: "break" | "keep", w?: number }
```

- `brk` is about the barline that **closes** the bar. `"break"`: the row ends here. `"keep"`: the
  automatic layout may not end a row here (this bar and the next share a row). Absent: automatic.
- `w` is the bar's **weight** in its row's justification: 1 = natural (absent), `LAY_W_MIN` 0.4 …
  `LAY_W_MAX` 3, stored rounded to 0.01. Relative, so it survives Letter ↔ A4 and staff-size steps.
- An empty `lay` is never stored. `validate` checks the shape.
- `trimBars` does not count a pin as "used": a pin on a trailing empty bar never lengthens the file.
- `deleteBar`: a `"break"` on the deleted bar moves to the bar before it when that bar has no `brk`
  of its own (the row still ends where it did); a `"keep"` and a weight go with the bar.
  `insertBar` needs nothing — the new bar has no pins and its neighbours keep theirs.
- `setTime`, paste, retype never touch `lay`.
- MusicXML: not written, not read (a `<print new-system>` round trip can come later — WSHED-123).

## 2. The engraver (`layout.js`, only when `pins: true`)

**Packing.** The greedy packer is unchanged except at the decision "does the next bar start a new
row?", where `prev` is the last bar already on the row:

| `prev.lay.brk` | decision |
|---|---|
| `"break"` | the row ends — always |
| `"keep"` | the next bar joins — always (past `MAX_BARS_PER_SYSTEM` too) |
| absent | as before: the row ends when six bars are on it or the next does not fit at natural width |

Weights do **not** take part in packing: a width drag never pushes a bar off its row (it would be
a second, hidden way to set breaks — and the pages would reflow under the pen).

**Justification.** A bar's width is `stretchW · scale · w + fixedW`. The row's `scale` is
`room / Σ(stretchW · w)` with the same caps as before (1.25 on the last row, 10). With every
`w = 1` the arithmetic is the old arithmetic (the extra term is an exact zero). Everything inside
the bar that used `sys.scale` uses the bar's own `b.scale = sys.scale · w`.

**Tight rows.** `PIN_FLOOR = 0.8`: a pinned row (a keep, a break or a weight on any of its bars)
in which some bar's `scale` falls under the floor is marked `sys.tight = true`. A row without pins
is never tight (a single enormous bar on its own row is today's behaviour and stays).

**What the layout reports** for the Layout view, on `L.hit.systems[i]`: `room`, `scale`, `capped`,
`tight`, `pinned`, and on each of its bars `stretch` (the natural stretchable width), `fixed`,
`weight`, `scale`.

## 3. Operations (`js/lib/compose/pins.js`, pure, returns a new document)

- `setBreak(doc, bar, "break" | "keep" | null)`
- `setWeight(doc, bar, w | null)` — clamps, rounds, stores nothing at 1
- `lockRow(doc, first, last)` — `"break"` on the bar before `first` (when there is one) and on
  `last`, `"keep"` on every bar between: the row is exactly these bars whatever happens around it
- `releaseBars(doc, first, last)` — drops every pin on the bars, and the `"break"` that opened the
  row on the bar before `first`
- `clearPins(doc)`, `pinCount(doc)` → `{ breaks, keeps, weights }`
- `weightFor(row, k, width)` — the weight that gives bar `k` of a layout row the stretch width
  `width`, the others' weights held: justified rows `w = T·A / (s·(room − T))` with `A` the others'
  `Σ s·w`; a capped last row `w = T / (s · cap)` until it fills.
- `tightRows(L)` → the indices of the rows that do not fit.

## 4. The Layout view (`js/tools/compose/layoutview.js`)

Opened by a **Layout** row in the export sheet (above the size row; its hint reads the pin count:
"automatic" or "3 breaks · 1 width"). Full screen over the sheet.

```
┌───────────────────────────────────────────────────────────────┐
│ Done   ↶ ↷      3 breaks · 1 width · 2 pages      − +   Reset │
├───────────────────────────────────────────────────────────────┤
│        ┌─────────────────── page 1 ──────────────────┐        │
│   ▣    │ 𝄞 ─────│──────│──────│─────⏎               │        │
│        │ 𝄢 ─────│──────│──────│─────                │        │
│   ▣    │ …                                           │        │
```

- **Pages** stacked, scrolling vertically, each the plan's page (`renderPage` + `plan.pageAt`),
  the header text as the PDF sets it. `− +` zooms the pages (fit → 1.5× → 2× → 3×; a phone needs it).
- **Barline handles.** Over every barline of every row an invisible rect, the full height of the
  grand staff plus 1.5 S above and below, and **at least 44 CSS px wide** — narrowed only so two
  handles never overlap (each takes at most 45 % of the narrower neighbouring bar). `touch-action:
  pan-y`, so a finger that starts on a handle still scrolls the pages vertically.
  - **Tap** (travel under 6 px) → a menu at the barline: *Break here* / *Keep together* (the one in
    force shows as *Remove the break* / *Remove the keep*), *Reset bar N's width* when it has one.
    The final barline of the piece offers only the width item.
  - **Drag sideways** → bar N (left of the barline) takes the width under the pointer; the rest of
    the row gives or takes in proportion; the row stays justified. Live, one repaint per frame, one
    undo step per drag. The drag stops where any bar of the row would go under `PIN_FLOOR`, and at
    the weight clamps.
- **Row handles.** In the left margin of each row a 44 px chip (a lock when the row is locked,
  a dot when it has pins, a ring when automatic). Tap → *Lock this row* / *Release this row*.
- **Marks, screen only** (an overlay group in the page SVG — never in `paint.js`, so they cannot
  print): a break = a small ⏎ flag above the barline; a keep = a link arc over it; a weighted bar =
  a rule under the bar with its percentage.
- **Refusals.** Any edit is tried on a copy: if the new layout has a tight row that was not tight
  before, the row flashes and nothing changes ("bars 9–13 do not fit on one row").
- **Red rows.** A row that is tight on arrival (the staff size, page or margins changed since it
  was pinned) is tinted red with a *Release this row* button beside it. The export sheet shows the
  same count in its fine print and **disables Save PDF / Add to Scores while any row is red**.
- **Undo / redo** inside the view (its own stack, ⌘Z / ⇧⌘Z). **Reset** clears every pin (asks).
- **Done** hands the document back to the sheet, which re-plans and tells the editor
  (`onDoc(next)` → the editor's `commit`): one editor undo step for the whole sitting; saved and
  synced like any edit. Esc = Done.

## 5. Export sheet changes (`exportsheet.js`)

`openExportSheet({ id, doc, primary, onDoc })`; `doc` becomes a `let`. A *layout* row with the
Layout button and the pin summary; the fine print gains "· N rows do not fit" and the actions are
disabled while it is non-zero. `paper.__plan` still carries the plan for the E2E.

## 6. Implementation plan

1. `model.js`: `LAY_BREAKS`, `LAY_W_MIN/MAX`, `validate` for `measure.lay`.
2. `layout.js`: `pins` option — packer table, weighted justification, `b.scale`, `tight`, the row
   report on `hit.systems`. Golden layout must not move.
3. `pins.js` + `engine.js` `deleteBar` carry. Add to the SW precache.
4. `export/pdf.js`: `planPages` passes `pins: true`; the plan carries `tight` (row indices).
5. `layoutview.js` + CSS `.cp-lay-*`; `exportsheet.js` row, `onDoc`, red-row gate; `editor.js`
   passes `onDoc: commit`.
6. Tests: `tests/compose-pins.test.mjs` (no-pin identity against the unpinned layout, break / keep
   packing, Leif's 4-4-3 example, weights keep the row justified, `weightFor` round trip, tight
   flag, ops, `deleteBar` carry, `validate`, `trimBars`, the editor layout ignoring pins, a PDF with
   pins renders). E2E step "v118: the Layout step" — a **finger** taps a barline and breaks, a
   **pen** drags a width, a **mouse** locks a row; handle width ≥ 44 px asserted; refusal; red row
   gate; undo; persistence after a reload; no page widening.
7. Release v118 (`sw.js` CACHE + `js/version.js`), `COMPOSE_QA.md` checklist, HANDOFF §4.58.

## 7. Decided here (say the word to change)

- **Pins, not modes** (Leif agreed in chat). **The export sheet, not a rail** (agreed).
- The break belongs to the bar that **ends** the row (the barline you tap), not the bar that
  starts the next — it is what the hand points at, and `deleteBar` can carry it back one bar.
- Weights never change which bars share a row.
- The floor is 0.8 of natural spacing; below it a row is refused / red rather than squeezed.
- One editor undo step per Layout sitting.
- Pins are stored with the piece, not per device and not per page size. A pinned row that stops
  fitting at another size turns red instead of being quietly re-flowed.

## 8. Not in this round

Page-break pins (the same menu can carry *Start a new page* later), the distance between systems
(fixed at 10 S), MusicXML `<print new-system>`, dragging a whole bar between rows (the barline
menu does the same in one tap).

## 9. As built (v118, 2026-09-18)

Landed as written, with these particulars:

- **Files.** `js/lib/compose/pins.js` (operations, `weightFor`, `scalesWith`, `pinSummary`, `rowLocked`),
  `js/tools/compose/layoutview.js` (the view, and `planPageSvg` — the page painter the export sheet's
  preview now shares), `layout.js` (`pins` option, `PIN_FLOOR`, the row report on `hit.systems` — only when
  `pins` is on, so the screen layout's shape is untouched), `export/pdf.js` (`planPages` passes `pins: true`,
  the plan carries `tight`), `model.js` (`validate`), `engine.js` (`deleteBar` carries a break back),
  `exportsheet.js` (the *layout* row, `onDoc`, the red-row gate), `editor.js` (`onDoc` → `commit` + `flush`).
  CSS `.cp-lay-*`. Both new modules are in the SW precache.
- **Handles are HTML buttons over the page**, not SVG: they are reused by bar index across repaints, so the
  one under a pointer is never torn out mid-drag (iOS stops delivering a gesture whose target left the
  document). 44 px wide (`HANDLE_PX`), at most 45 % of the narrower neighbouring bar, the height of the
  grand staff; `touch-action: pan-y`. A small brass grip dot sits on top of every barline so a finger with
  no hover can see where to take hold; it fills in when the barline or its bar carries a pin.
- **The menu opens on `click`**, the last event of a tap, so the click iOS synthesises can never land on
  the menu it just opened (the v110 Favorites lesson); the click that ends a drag is swallowed.
- **A drag** re-plans and repaints once per frame (`planPages` of a 16-bar piece ≈ 2–3 ms here); it stops at
  the floor and the weight clamps; one undo step. `pointercancel` (the browser took the touch for a
  vertical scroll) restores the row. Arrow keys on a focused handle step the weight by 0.05.
- **Refusals compare tight rows by their first bar**, before and after: an edit that makes a *new* tight
  row is refused; one that leaves an already-red row red is allowed (so a red row can be worked on).
- **Removing a break can be refused too** — when the row after it is locked, un-breaking would pull the
  whole locked group up. The toast says so; release the row first.
- **Reset** asks by turning into "Reset every pin?" for three seconds (no dialog). **Esc** closes the menu,
  then the view (= Done), and never reaches the sheet beneath.
- A red row is scrolled into view when the view opens.
- Tests: `tests/compose-pins.test.mjs` (12); E2E step "v118: the Layout step" — finger tap, pen drag
  (synthetic `pointerType: "pen"`), mouse click, handle / tab / menu-row sizes, refusal, undo / redo,
  persistence, the editor's rows untouched, the red-row gate and release. 41 steps, ~91 s local.
