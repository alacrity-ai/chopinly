import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadUmd } from "../dev/lib/umd.mjs";
import { planPages, renderPdf, exportOptions, outlineOps, STAFF_MM, PAGES, MARGINS, DEFAULTS } from "../js/lib/compose/export/pdf.js";
import { BRAVURA } from "../js/lib/compose/export/bravura.js";
import { SYS_H, BLOCK_H } from "../js/lib/compose/layout.js";
import { newComposition } from "../js/lib/compose/model.js";
import { place, hideRest, nudgeRest } from "../js/lib/compose/engine.js";
import { G, timeDigit, tupletDigit } from "../js/lib/staff/glyphs.js";
import { goldenDoc } from "./fixtures/compose-golden.mjs";
import { PPQ } from "../js/lib/compose/ticks.js";

const ROOT = new URL("..", import.meta.url).pathname;
const libs = {
  PDFLib: loadUmd(ROOT + "vendor/pdflib/pdf-lib.min.js"),
  fontkit: loadUmd(ROOT + "vendor/pdflib/fontkit.umd.min.js"),
  fonts: { regular: readFileSync(ROOT + "fonts/Fraunces-Regular.ttf"), italic: readFileSync(ROOT + "fonts/Fraunces-Italic.ttf") },
};
const Q = { base: 4, dots: 0, rest: false };
/** A 40-bar piece: a quarter on every beat of both staves. */
function longPiece(bars = 40) {
  let d = newComposition({ id: "long", title: "Long", now: 1 });
  for (let b = 0; b < bars; b++) for (let q = 0; q < 4; q++) { d = place(d, { bar: b, staff: 0, ticks: q * PPQ, step: 4 + (q % 3) }, Q).doc; d = place(d, { bar: b, staff: 1, ticks: q * PPQ, step: 2 }, Q).doc; }
  return d;
}
const text = (bytes) => Buffer.from(bytes).toString("latin1");
const pageCount = (bytes) => (text(bytes).match(/\/Type \/Page(?!s)/g) ?? []).length;

test("every glyph the engraver can ask for has a baked outline (Bravura 1000 upm, black head 1.18 S wide)", () => {
  const cps = new Set();
  for (const s of Object.values(G)) for (const ch of s) cps.add(ch.codePointAt(0).toString(16));
  for (let n = 0; n <= 9; n++) { cps.add(timeDigit(n).codePointAt(0).toString(16)); cps.add(tupletDigit(n).codePointAt(0).toString(16)); }
  for (const cp of cps) assert.ok(BRAVURA.glyphs[cp]?.d, `U+${cp} has no outline — run dev/bake-bravura.mjs`);
  assert.equal(BRAVURA.upm, 1000);
  assert.equal(BRAVURA.glyphs.e0a4.a, 295, "the black head's advance is 295 units = 1.18 staff spaces, the layout's HEAD_W");
});

test("outlineOps: absolute M/L/C/Q/Z become PDF path operators (quadratics as cubics), scaled, then a fill", () => {
  const ops = outlineOps("M0 0L10 0Q10 10 0 10Z", 2).split("\n");
  assert.deepEqual(ops, ["0.000 0.000 m", "20.000 0.000 l", "20.000 13.333 13.333 20.000 0.000 20.000 c", "h", "f"]);
  assert.throws(() => outlineOps("M0 0A1 1 0 0 0 1 1", 1), /unexpected/);
});

test("exportOptions: unknown values fall back to the defaults", () => {
  assert.deepEqual(exportOptions({}), DEFAULTS);
  assert.deepEqual(exportOptions({ page: "tabloid", staffMm: 3, margins: "huge", header: 0 }), { ...DEFAULTS, header: false });
  assert.deepEqual(exportOptions({ page: "a4", staffMm: 2.5, margins: "wide", header: true }), { page: "a4", staffMm: 2.5, margins: "wide", header: true });
});

test("planPages: systems page in order without splitting, page 1 keeps the header's room, bigger staves mean more pages, Letter and A4", () => {
  const doc = longPiece();
  let prev = 0;
  for (const page of Object.keys(PAGES)) for (const margins of Object.keys(MARGINS)) for (const staffMm of STAFF_MM) {
    const plan = planPages(doc, { page, staffMm, margins, header: true });
    const n = plan.L.systems.length;
    assert.ok(n >= 4, `${staffMm} mm: ${n} systems`);
    assert.equal(plan.pages[0].first, 0); assert.equal(plan.pages[plan.pages.length - 1].last, n - 1);
    for (let i = 1; i < plan.pages.length; i++) assert.equal(plan.pages[i].first, plan.pages[i - 1].last + 1, "contiguous pages");
    const availS = plan.height / plan.S;
    for (const p of plan.pages) {
      const usedS = p.top + (p.last - p.first) * SYS_H + BLOCK_H + 3;
      assert.ok(usedS <= availS + 1e-9, `${page} ${margins} ${staffMm} mm: page ${p.first}–${p.last} needs ${usedS.toFixed(1)} S of ${availS.toFixed(1)}`);
      if (p.last < n - 1) assert.ok(usedS + SYS_H > availS, "the page is as full as it can be");
    }
    if (plan.pages.length > 1) assert.ok(plan.pages[0].top > plan.pages[1].top, "the title block takes more room than the running head");
    if (page === "letter" && margins === "normal") { assert.ok(plan.pages.length >= prev, "pages never shrink as the staff grows"); prev = plan.pages.length; }
  }
  const noHeader = planPages(doc, { header: false });
  assert.equal(noHeader.pages[0].top, 3, "no header: only the air above the first staff");
  const one = planPages(goldenDoc(), {});
  assert.equal(one.pages.length, 1); assert.equal(one.doc.measures.length, 8, "the file ends at the last bar with music: no stray empty bar (v104)");
});

test("renderPdf: a real vector PDF — page count, Fraunces subsets embedded, Bravura outlines as form XObjects, no raster images, title metadata", async () => {
  const plan = planPages(longPiece(), { staffMm: 2.5, page: "a4" });
  const bytes = await renderPdf(plan, libs, { title: "Étude Dvořák", composer: "Bohuslav Martinů", now: new Date(0) });
  assert.equal(text(bytes).slice(0, 5), "%PDF-");
  assert.equal(pageCount(bytes), plan.pages.length);
  assert.ok(plan.pages.length >= 2, "the long piece at 2.5 mm needs more than one page: " + plan.pages.length);
  const t = text(bytes);
  assert.match(t, /\/BaseFont \/Fraunces-Regular/, "Fraunces Regular embedded");
  assert.match(t, /\/BaseFont \/Fraunces-Italic/, "Fraunces Italic embedded");
  assert.equal((t.match(/\/FontFile2 /g) ?? []).length, 2, "two TrueType programs embedded");
  assert.ok(bytes.length > 20_000 && bytes.length < 110_000, `four pages of outlines plus two font subsets (the whole faces alone are 157 KB): ${bytes.length} bytes`);
  assert.equal((t.match(/\/Subtype \/Form/g) ?? []).length, 5, "one form XObject per distinct glyph: brace, G clef, F clef, the digit 4, black head — no trailing empty bar, so no whole rest (v104)");
  assert.doesNotMatch(t, /\/Subtype \/Image/, "vector only");
});

test("paper leaves hidden rests out and follows a dragged rest; an empty piece prints its eight bars", async () => {
  let d = place(newComposition({ id: "h", title: "H", now: 1 }), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc; // n4 r4 r2
  const forms = async (doc) => (text(await renderPdf(planPages(doc, {}), libs, { title: "H" })).match(/\/Subtype \/Form/g) ?? []).length;
  const shown = await forms(d);
  const [, r4, r2] = d.measures[0].staves[0].voices[0];
  const hiddenBoth = await forms(hideRest(d, [r4.id, r2.id]));
  assert.equal(shown - hiddenBoth, 2, "the quarter and the half rest each had one outline; hidden, neither is drawn"); // whole-bar rests elsewhere still draw the whole rest
  assert.equal(await forms(nudgeRest(d, [r4.id], -4)), shown, "a moved rest is still drawn");
  const empty = planPages(newComposition({ id: "e", title: "E", now: 1 }), {});
  assert.equal(empty.doc.measures.length, 8);
  const bytes = await renderPdf(empty, libs, { title: "Manuscript" });
  assert.equal(pageCount(bytes), 1);
});

// --- the plan measures the ink and routes every painter (WSHED-133, v104) ---
import { inkExtents } from "../js/lib/compose/export/pdf.js";
import { TOP_PAD, systemAt } from "../js/lib/compose/layout.js";
import { toggleFormMark, addPedal, addOttava, addExpression, setEnding } from "../js/lib/compose/engine.js";
import { paintScore } from "../js/lib/compose/paint.js";

/** The long piece with ink hanging outside the staves: a tempo word over bar 1, an ending bracket, a pedal line, an 8vb, a dynamic under every system's first bar. */
function decorated() {
  let d = longPiece(24);
  d = toggleFormMark(d, 0, { kind: "tempo", bpm: 72, text: "Adagio" });
  d = setEnding(d, 2, 1, 3);
  for (let b = 0; b < 24; b += 2) d = addPedal(d, { staff: 1, bar: b, at: 0, end: { bar: b + 1, at: 3 * PPQ } }).doc;
  d = addOttava(d, { staff: 1, bar: 4, at: 0, dir: -1, end: { bar: 5, at: 3 * PPQ } }).doc;
  for (let b = 0; b < 24; b += 3) d = addExpression(d, { kind: "dyn", staff: 0, bar: b, at: 0, value: "ff" }).doc;
  return d;
}
/** Every primitive's y, through a recording painter — what the painters see. */
function inkYs(L) {
  const ys = [], skip = { n: 0 };
  const p = { group(cls) { if (skip.n || /\bcp-hidden\b/.test(cls)) skip.n++; }, end() { if (skip.n) skip.n--; }, circle() {},
    line: (x1, y1) => { if (!skip.n) ys.push(y1); }, rect: (x, y) => { if (!skip.n) ys.push(y); }, polygon: (pts) => { if (!skip.n) ys.push(pts[0][1]); }, polyline: (pts) => { if (!skip.n) ys.push(pts[0][1]); },
    path: (segs) => { if (!skip.n) ys.push(segs[0][2]); }, glyph: (x, y) => { if (!skip.n) ys.push(y); }, text: (x, y) => { if (!skip.n) ys.push(y); } };
  paintScore(L, p);
  return ys;
}

test("inkExtents: what hangs above the first staff and below the last, per system — the tempo word and the ending on system 1, the pedal lines below", () => {
  const plan = planPages(decorated(), { staffMm: 1.8 });
  const ink = inkExtents(plan.L);
  assert.equal(ink.length, plan.L.systems.length);
  assert.ok(ink[0].above > 5, `the ending bracket lane (5.6 S) and the tempo word rise above system 1: ${ink[0].above.toFixed(1)} S`);
  assert.ok(ink[0].below > 3, `a pedal line hangs under system 1: ${ink[0].below.toFixed(1)} S`);
  for (const e of ink) { assert.ok(e.above >= 0 && e.below >= 0 && e.left >= 0 && e.right >= 0); assert.ok(e.above < 12 && e.below < 12, "nothing absurd"); }
  const plain = inkExtents(planPages(longPiece(4), {}).L);
  assert.ok(plain[0].above < ink[0].above && plain[0].below < ink[0].below, "a plain piece hangs less");
});

test("planPages keeps every page's ink inside the printable box — first system under the header, last system's pedal above the margin — at every size, page and margin", () => {
  const d = decorated();
  let checked = 0;
  for (const page of Object.keys(PAGES)) for (const margins of Object.keys(MARGINS)) for (const staffMm of STAFF_MM) for (const header of [true, false]) {
    const plan = planPages(d, { page, staffMm, margins, header });
    const availS = plan.height / plan.S, n = plan.L.systems.length;
    assert.equal(plan.pages[0].first, 0); assert.equal(plan.pages[plan.pages.length - 1].last, n - 1);
    plan.pages.forEach((p, k) => {
      if (k) assert.equal(p.first, plan.pages[k - 1].last + 1, "contiguous");
      const headS = (header ? (k ? 22 : 66) : 0) / plan.S;
      const topInk = p.top - plan.ink[p.first].above, botInk = p.top + (p.last - p.first) * SYS_H + BLOCK_H + plan.ink[p.last].below;
      assert.ok(topInk >= headS - 1e-9, `${page} ${margins} ${staffMm} ${header}: page ${k + 1}'s first ink (${topInk.toFixed(1)} S) is under the header (${headS.toFixed(1)} S)`);
      assert.ok(botInk <= availS + 1e-9, `${page} ${margins} ${staffMm} ${header}: page ${k + 1}'s last ink (${botInk.toFixed(1)} S) is inside ${availS.toFixed(1)} S`);
      if (p.last < n - 1) { const nextBot = p.top + (p.last + 1 - p.first) * SYS_H + BLOCK_H + Math.max(3, plan.ink[p.last + 1].below); assert.ok(nextBot > availS, "the page is as full as it can be"); }
      for (let i = p.first; i <= p.last; i++) assert.equal(plan.pageOf(i), k);
      checked++;
    });
  }
  assert.ok(checked > 100);
  // the case Leif hit (2026-09-15): narrow margins fit on one page, normal margins need two — the plan says so and the routing follows it
  const narrow = planPages(longPiece(14), { staffMm: 2.0, margins: "narrow" }), normal = planPages(longPiece(14), { staffMm: 2.0, margins: "normal" });
  assert.ok(normal.pages.length >= narrow.pages.length, `${narrow.pages.length} vs ${normal.pages.length}`);
});

test("pageAt: every primitive the painters draw lands on the page of its system — the same routing the preview and the PDF share", () => {
  const plan = planPages(decorated(), { staffMm: 2.2, margins: "wide" });
  assert.ok(plan.pages.length >= 2, "more than one page: " + plan.pages.length);
  const n = plan.L.systems.length, ys = inkYs(plan.L);
  assert.ok(ys.length > 500);
  const perPage = plan.pages.map(() => 0);
  for (const y of ys) { const k = plan.pageAt(y); assert.equal(k, plan.pageOf(systemAt(y, n))); assert.ok(k >= 0 && k < plan.pages.length); perPage[k]++; }
  assert.ok(perPage.every((c) => c > 0), "every page carries ink: " + perPage.join(","));
  assert.equal(systemAt(TOP_PAD, n), 0); assert.equal(systemAt(TOP_PAD + SYS_H * (n - 1) + BLOCK_H + 8, n), n - 1);
  // the ink on a page, drawn at that page's dy, sits inside the page: from under the header to above the bottom margin
  plan.pages.forEach((p, k) => {
    const onPage = ys.filter((y) => plan.pageAt(y) === k).map((y) => y + p.dy);
    const headS = (k ? 22 : 66) / plan.S;
    assert.ok(Math.min(...onPage) >= headS - 1.5, `page ${k + 1}: ${Math.min(...onPage).toFixed(1)} S under ${headS.toFixed(1)}`); // a glyph's anchor may sit a touch above its ink's top
    assert.ok(Math.max(...onPage) <= plan.height / plan.S + 1e-9, `page ${k + 1}: ${Math.max(...onPage).toFixed(1)} S inside ${(plan.height / plan.S).toFixed(1)}`);
  });
});
