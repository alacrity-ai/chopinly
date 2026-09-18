// Layout pins for paper (docs/COMPOSE_LAYOUT_DESIGN.md, WSHED-156): breaks / keeps on barlines, weights in a row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadUmd } from "../dev/lib/umd.mjs";
import { newComposition, validate } from "../js/lib/compose/model.js";
import { place, insertBar, deleteBar, trimBars } from "../js/lib/compose/engine.js";
import { layoutComposition, PIN_FLOOR } from "../js/lib/compose/layout.js";
import { planPages, renderPdf } from "../js/lib/compose/export/pdf.js";
import { setBreak, setWeight, lockRow, releaseBars, clearPins, pinCount, pinSummary, rowLocked, weightFor, scalesWith, roundWeight, tightRows } from "../js/lib/compose/pins.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const Q = { base: 4, dots: 0, rest: false }, X = { base: 16, dots: 0, rest: false };
/** `bars` bars of quarters in both hands; `dense` bars are sixteenths throughout. */
function piece(bars = 16, dense = []) {
  let d = newComposition({ id: "p", title: "Pins", now: 1 });
  for (let b = 0; b < bars; b++) {
    const fine = dense.includes(b), n = fine ? 16 : 4, arm = fine ? X : Q;
    for (let q = 0; q < n; q++) { d = place(d, { bar: b, staff: 0, ticks: q * (PPQ * 4 / n), step: 4 + (q % 3) }, arm).doc; }
    for (let q = 0; q < 4; q++) d = place(d, { bar: b, staff: 1, ticks: q * PPQ, step: 2 }, Q).doc;
  }
  return trimBars(d);
}
const PAPER = { unit: 5, width: 540, pins: true }; // about a Letter page at 7 mm staves
const rows = (L) => L.hit.systems.map((s) => s.bars.map((b) => b.index + 1));
const strip = (L) => JSON.stringify(L, (k, v) => (["room", "scale", "capped", "cap", "pinned", "tight", "stretch", "fixed", "weight", "brk"].includes(k) ? undefined : v));

test("no pins: paper lays out exactly as the screen does at that width — the pins option alone changes nothing", () => {
  const d = piece(16, [9]);
  const a = layoutComposition(d, { unit: 5, width: 540 }), b = layoutComposition(d, PAPER);
  assert.equal(strip(a), strip(b));
  assert.deepEqual(tightRows(b), []);
  assert.ok(b.hit.systems.every((s) => !s.pinned && s.bars.every((hb) => hb.weight === 1 && hb.brk === null)));
});

test("the editor's layout ignores pins entirely", () => {
  const d = piece(16), pinned = setWeight(setBreak(d, 1, "break"), 0, 1.6);
  const noLay = (L) => JSON.stringify(L, (k, v) => (k === "lay" ? undefined : v)); // the layout carries its measures; everything it computed must match
  assert.equal(noLay(layoutComposition(pinned, { unit: 5, width: 540 })), noLay(layoutComposition(d, { unit: 5, width: 540 })));
});

test("Leif's example: breaks after bars 4, 8 and 11 give 1–4 / 5–8 / 9–11, and the rest still flows", () => {
  const d0 = piece(16, [9]);
  const auto = rows(layoutComposition(d0, PAPER));
  let d = d0; for (const b of [3, 7, 10]) d = setBreak(d, b, "break");
  validate(d);
  // the automatic layout would put more than four of these on a row, so a break is doing the work
  const L = layoutComposition(d, PAPER), r = rows(L);
  assert.deepEqual(r.slice(0, 3), [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11]], `auto was ${JSON.stringify(auto)}`);
  assert.deepEqual(r.flat(), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.equal(r[3][0], 12);
  for (const s of L.hit.systems.slice(0, -1)) assert.ok(Math.abs(s.bars.at(-1).x1 - L.hit.systems[0].bars.at(-1).x1) < 1e-6, "every full row is justified to the same right edge");
  assert.deepEqual(pinCount(d), { breaks: 3, keeps: 0, weights: 0, total: 3 });
  assert.equal(pinSummary(d), "3 breaks");
  assert.equal(pinSummary(d0), "automatic");
});

test("a keep pulls the next bar onto the row, past the automatic break — and past six bars", () => {
  const d0 = piece(16), auto = rows(layoutComposition(d0, PAPER)), n = auto[0].length;
  const d = setBreak(d0, n - 1, "keep");
  const r = rows(layoutComposition(d, PAPER));
  assert.equal(r[0].length, n + 1);
  let many = d0; for (let b = 0; b < 7; b++) many = setBreak(many, b, "keep");
  assert.equal(rows(layoutComposition(many, { unit: 3, width: 1200, pins: true }))[0].length >= 8, true);
});

test("a row kept past what fits is tight; the same row unpinned never is", () => {
  let ten = piece(16); for (let b = 0; b < 9; b++) ten = setBreak(ten, b, "keep");
  const crammed = layoutComposition(ten, PAPER); // ten bars of quarters on one row: about half their natural spacing — Leif's call, not the engraver's (v119)
  assert.equal(crammed.hit.systems[0].bars.length, 10);
  assert.ok(crammed.hit.systems[0].scale < 0.8 && crammed.hit.systems[0].scale > PIN_FLOOR);
  assert.deepEqual(tightRows(crammed), []);
  let d = piece(24); for (let b = 0; b < 23; b++) d = setBreak(d, b, "keep");
  const L = layoutComposition(d, PAPER);
  assert.deepEqual(tightRows(L), [0]);
  assert.ok(L.hit.systems[0].bars.some((hb) => hb.scale < PIN_FLOOR));
  assert.deepEqual(planPages(d, {}).tight.length > 0, true);
  assert.deepEqual(tightRows(layoutComposition(clearPins(d), PAPER)), []);
});

test("a weight gives its bar more of the row and the row stays justified; weights never move a bar to another row", () => {
  const d0 = piece(16, [9]), L0 = layoutComposition(d0, PAPER);
  const at = L0.hit.systems.findIndex((s) => s.bars.some((hb) => hb.index === 9)), before = L0.hit.systems[at];
  const d = setWeight(d0, 9, 1.5); validate(d);
  const L = layoutComposition(d, PAPER), after = L.hit.systems[at];
  assert.deepEqual(rows(L), rows(L0));
  const w = (s, i) => { const hb = s.bars.find((x) => x.index === i); return hb.x1 - hb.bodyX0; };
  assert.ok(w(after, 9) > w(before, 9) * 1.15);
  for (const hb of before.bars) if (hb.index !== 9) assert.ok(w(after, hb.index) < w(before, hb.index));
  if (!after.capped) assert.ok(Math.abs(after.bars.at(-1).x1 - before.bars.at(-1).x1) < 1e-6);
  // the notes inside the weighted bar spread with it
  const cols = (s) => s.bars.find((x) => x.index === 9).cols;
  assert.ok(cols(after).at(-1).x - cols(after)[0].x > cols(before).at(-1).x - cols(before)[0].x);
});

test("weightFor: the weight a drag asks for lands the bar on the width asked for", () => {
  const d0 = piece(16, [9]), L0 = layoutComposition(d0, PAPER);
  for (const row of L0.hit.systems.filter((s) => s.bars.length > 1)) {
    const k = 0, hb = row.bars[k], want = hb.stretch * hb.scale * 1.2;
    const w = weightFor(row, k, want);
    const L = layoutComposition(setWeight(d0, hb.index, w), PAPER), nb = L.hit.systems.flatMap((s) => s.bars).find((x) => x.index === hb.index);
    assert.ok(Math.abs(nb.stretch * nb.scale - want) < want * 0.01, `row of bar ${hb.index + 1}: wanted ${want}, got ${nb.stretch * nb.scale}`);
    const predicted = scalesWith(row, k, roundWeight(w) ?? 1), real = L.hit.systems.find((s) => s.bars.includes(nb)).bars.map((x) => x.scale);
    predicted.forEach((p, i) => assert.ok(Math.abs(p - real[i]) < 1e-9));
  }
});

test("weights are stored clamped, to a hundredth, and never as 1", () => {
  const d = piece(4);
  assert.equal(setWeight(d, 0, 1.004).measures[0].lay, undefined);
  assert.equal(setWeight(d, 0, 9).measures[0].lay.w, 3);
  assert.equal(setWeight(d, 0, 0.01).measures[0].lay.w, 0.4);
  assert.equal(setWeight(d, 0, 1.23456).measures[0].lay.w, 1.23);
  assert.equal(setWeight(setWeight(d, 0, 2), 0, null).measures[0].lay, undefined);
  assert.deepEqual(setBreak(setWeight(d, 0, 2), 0, "keep").measures[0].lay, { w: 2, brk: "keep" });
  assert.deepEqual(setBreak(setBreak(setWeight(d, 0, 2), 0, "keep"), 0, null).measures[0].lay, { w: 2 });
});

test("lock a row, release a row", () => {
  const d0 = piece(16), first = 4, last = 6;
  const d = lockRow(d0, first, last); validate(d);
  assert.equal(d.measures[3].lay.brk, "break"); assert.equal(d.measures[4].lay.brk, "keep"); assert.equal(d.measures[5].lay.brk, "keep"); assert.equal(d.measures[6].lay.brk, "break");
  assert.ok(rowLocked(d, first, last)); assert.ok(!rowLocked(d0, first, last));
  assert.ok(rows(layoutComposition(d, PAPER)).some((r) => r.join() === "5,6,7"));
  const back = releaseBars(setWeight(d, 5, 1.4), first, last);
  assert.equal(pinCount(back).total, 0);
  assert.ok(rowLocked(lockRow(d0, 0, 3), 0, 3), "the first row needs no break before it");
});

test("pins ride their bar: insertBar leaves them on it, deleteBar carries a break back one bar", () => {
  const d = setWeight(setBreak(piece(12), 3, "break"), 5, 1.5);
  const ins = insertBar(d, 1); validate(ins);
  assert.equal(ins.measures[4].lay.brk, "break"); assert.equal(ins.measures[6].lay.w, 1.5); assert.equal(ins.measures[1].lay, undefined);
  const del = deleteBar(d, 3); validate(del);
  assert.equal(del.measures[2].lay.brk, "break", "the row still ends where it did");
  assert.equal(del.measures[4].lay.w, 1.5);
  const kept = deleteBar(setBreak(d, 2, "keep"), 3);
  assert.equal(kept.measures[2].lay.brk, "keep", "a pin already on the bar before is not overwritten");
  assert.equal(deleteBar(setBreak(d, 3, "keep"), 3).measures[2].lay, undefined, "a keep goes with its bar");
});

test("validate refuses a malformed pin; trimBars does not count a pin as music", () => {
  const d = piece(4);
  for (const lay of [{}, { brk: "page" }, { w: 1 }, { w: 5 }, { w: "2" }, { brk: "keep", x: 1 }, null]) {
    const bad = structuredClone(d); bad.measures[1].lay = lay;
    assert.throws(() => validate(bad), /layout pin/);
  }
  let long = newComposition({ id: "t", now: 1 }); long = place(long, { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  assert.equal(trimBars(setBreak(long, 6, "break")).measures.length, 1);
});

test("a pinned piece exports: the plan follows the pins and the PDF renders", async () => {
  const ROOT = new URL("..", import.meta.url).pathname;
  const libs = { PDFLib: loadUmd(ROOT + "vendor/pdflib/pdf-lib.min.js"), fontkit: loadUmd(ROOT + "vendor/pdflib/fontkit.umd.min.js"), fonts: { regular: readFileSync(ROOT + "fonts/Fraunces-Regular.ttf"), italic: readFileSync(ROOT + "fonts/Fraunces-Italic.ttf") } };
  let d = piece(16, [9]); for (const b of [3, 7, 10]) d = setBreak(d, b, "break"); d = setWeight(d, 9, 1.4);
  const plan = planPages(d, {});
  assert.deepEqual(rows(plan.L).slice(0, 3), [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11]]);
  assert.deepEqual(plan.tight, []);
  const bytes = await renderPdf(plan, libs, { title: "Pins" });
  assert.ok(bytes.length > 2000);
  assert.ok(!Buffer.from(bytes).toString("latin1").includes("cp-lay"), "nothing of the Layout view reaches the file");
});
