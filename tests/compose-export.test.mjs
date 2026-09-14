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
  assert.equal(one.pages.length, 1); assert.equal(one.doc.measures.length, 9, "trailing empty bars trimmed to one past the last note");
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
  assert.equal((t.match(/\/Subtype \/Form/g) ?? []).length, 6, "one form XObject per distinct glyph: brace, G clef, F clef, the digit 4, black head, and the whole rest of the trailing empty bar");
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
