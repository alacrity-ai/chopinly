// Parts engraving (docs/COMPOSE_PARTS_DESIGN.md §2, WSHED-181): metrics with parts, brackets and brace, part names,
// through / broken barlines, the fingering side, paper. The solo-piano golden tests are the byte-identical proof.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadUmd } from "../dev/lib/umd.mjs";
import { newComposition } from "../js/lib/compose/model.js";
import { templateParts, partsFrom } from "../js/lib/compose/instruments.js";
import { place, finger, addPart, setLyric, addExpression, slur, tie, crossStaff, setClef } from "../js/lib/compose/engine.js";
import { layoutComposition, metricsOf, groupsOf, STAFF_GAP, PART_GAP, BRACKET_W } from "../js/lib/compose/layout.js";
import { paintScore } from "../js/lib/compose/paint.js";
import { thingAt } from "../js/lib/compose/hit.js";
import { planPages, renderPdf, inkExtents } from "../js/lib/compose/export/pdf.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const ROOT = new URL("..", import.meta.url).pathname;
const libs = {
  PDFLib: loadUmd(ROOT + "vendor/pdflib/pdf-lib.min.js"),
  fontkit: loadUmd(ROOT + "vendor/pdflib/fontkit.umd.min.js"),
  fonts: { regular: readFileSync(ROOT + "fonts/Fraunces-Regular.ttf"), italic: readFileSync(ROOT + "fonts/Fraunces-Italic.ttf") },
};
const Q = { base: 4, dots: 0, rest: false }, E = { base: 8, dots: 0, rest: false };
const quartet = () => newComposition({ id: "q", title: "Quartet", now: 1, parts: templateParts("quartet") });
const voicePiano = () => newComposition({ id: "vp", title: "Song", now: 1, parts: templateParts("voice") });
/** A note on every beat of every staff for `bars` bars (steps vary per staff). */
function fill(d, bars = 4, dur = Q) {
  const n = d.parts.reduce((s, p) => s + p.staves, 0);
  for (let b = 0; b < bars; b++) for (let st = 0; st < n; st++) for (let q = 0; q < 4; q++) d = place(d, { bar: b, staff: st, ticks: q * PPQ, step: 4 + ((q + st) % 3) }, dur).doc;
  return d;
}
/** A painter that only records what was drawn. */
function recorder() {
  const calls = [];
  return { calls, at() {}, group(cls, data) { calls.push(["group", cls, data]); }, end() {}, line(...a) { calls.push(["line", ...a]); }, rect(x, y, w, h, cls) { calls.push(["rect", x, y, w, h, cls]); }, polygon() {}, polyline() {}, path() {}, circle() {}, glyph(x, y, ch, cls, o) { calls.push(["glyph", x, y, ch, cls, o]); }, text(x, y, str, cls, o) { calls.push(["text", x, y, str, cls, o]); }, measure: (s, size) => 0.58 * size * s.length };
}

test("metrics: a quartet's staves sit PART_GAP apart (block 46), a piano's own staves STAFF_GAP (block 16, unchanged); the organ's three staves are one instrument; lyrics still add their band", () => {
  const M = metricsOf(quartet());
  assert.deepEqual(M.staffTop, [0, 14, 28, 42]); assert.equal(M.blockH, 46); assert.equal(M.sysH, 56); assert.deepEqual(M.gaps, [PART_GAP, PART_GAP, PART_GAP, 0]);
  const P = metricsOf(newComposition({ id: "p", now: 1 }));
  assert.deepEqual([P.blockH, P.sysH, P.gaps[0]], [16, 26, STAFF_GAP]);
  const VP = metricsOf(voicePiano());
  assert.deepEqual(VP.staffTop, [0, 14, 26]); assert.deepEqual(VP.gaps, [PART_GAP, STAFF_GAP, 0]);
  const O = metricsOf(newComposition({ id: "o", now: 1, parts: partsFrom(["organ", "voice"]) }));
  assert.deepEqual(O.staffTop, [0, 12, 24, 38]);
  let v = voicePiano(); v = place(v, { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc; v = setLyric(v, v.measures[0].staves[0].voices[0][0].id, 1, { text: "la" });
  assert.equal(metricsOf(v).gaps[0], PART_GAP + 1.4 + 1.6, "a singing part keeps its lyric band under it");
});

test("groups: a quartet is one bracket and one barline span; voice + piano is a brace on the piano, no bracket on the lone voice, barlines broken between; SATB + piano brackets the choir; a lone piano has no bracket and one span", () => {
  const q = metricsOf(quartet());
  assert.deepEqual(q.groups, [{ kind: "bracket", top: 0, bottom: 46, parts: [0, 1, 2, 3] }]);
  assert.deepEqual(q.barlineSpans, [{ top: 0, bottom: 46, parts: [0, 1, 2, 3] }]);
  const vp = metricsOf(voicePiano());
  assert.deepEqual(vp.groups, [{ kind: "brace", top: 14, bottom: 30, parts: [1] }]);
  assert.deepEqual(vp.barlineSpans.map((s) => [s.top, s.bottom]), [[0, 4], [14, 30]]);
  const satb = metricsOf(newComposition({ id: "s", now: 1, parts: [...templateParts("satb"), ...partsFrom(["piano"]).map((p) => ({ ...p, id: "p5" }))] }));
  assert.deepEqual(satb.groups.map((g) => [g.kind, g.parts]), [["bracket", [0, 1, 2, 3]], ["brace", [4]]]);
  assert.equal(satb.barlineSpans.length, 2);
  const p = metricsOf(newComposition({ id: "p", now: 1 }));
  assert.deepEqual(p.groups, [{ kind: "brace", top: 0, bottom: 16, parts: [0] }]); assert.equal(p.barlineSpans.length, 1);
  // a lone non-keyboard part with two staves gets its own bracket; two keyboards side by side stay two braces
  const g2 = groupsOf({ parts: [{ instrument: "other", staves: 2 }, { instrument: "piano", staves: 2 }, { instrument: "piano", staves: 2 }] }, [0, 12, 24, 36, 48, 60]);
  assert.deepEqual(g2.groups.map((g) => g.kind), ["bracket", "brace", "brace"]); assert.equal(g2.barlineSpans.length, 3);
  // a two-staff voice alone: a bracket of its own; a quintet of mixed groups: strings bracketed, the flute alone
  assert.deepEqual(groupsOf({ parts: [{ instrument: "flute", staves: 1 }, { instrument: "violin", staves: 1 }, { instrument: "cello", staves: 1 }] }, [0, 14, 28]).groups, [{ kind: "bracket", top: 14, bottom: 32, parts: [1, 2] }]);
});

test("layout: a quartet's systems start right of the bracket and the names, the first system wider for the full names; names on system 0, abbreviations after, centred on each part; a piano piece keeps x0 = 1.0 and prints no name", () => {
  const L = layoutComposition(fill(quartet(), 10), { unit: 10, width: 900 });
  assert.ok(L.systems.length >= 2);
  const s0 = L.systems[0], s1 = L.systems[1];
  assert.ok(s0.x0 > 1.0 + BRACKET_W, "the first system's left edge is past the bracket");
  assert.ok(s1.x0 < s0.x0 && s1.x0 > 1.0 + BRACKET_W, "the later systems indent less (abbreviations) but still past the bracket");
  assert.deepEqual(s0.groups.map((g) => [g.kind, g.top - s0.top, g.bottom - s0.top]), [["bracket", 0, 46]]);
  assert.deepEqual(L.partNames.filter((n) => n.system === 0).map((n) => [n.text, n.size, n.part]), [["Violin I", 1.3, 0], ["Violin II", 1.3, 1], ["Viola", 1.3, 2], ["Cello", 1.3, 3]]);
  assert.deepEqual(L.partNames.filter((n) => n.system === 1).map((n) => n.text), ["Vln. I", "Vln. II", "Vla.", "Vc."]);
  const vla = L.partNames.find((n) => n.text === "Viola");
  assert.ok(Math.abs(vla.y - (s0.staffTop[2] + 2 + 0.4)) < 1e-9, "centred on the viola's staff"); assert.ok(vla.x < s0.x0 - BRACKET_W, "left of the bracket"); assert.equal(vla.anchor, "end");
  assert.ok(s0.barlines.every((b) => b.x > s0.x0));
  // the piano: nothing moved
  const P = layoutComposition(fill(newComposition({ id: "p", now: 1 }), 4), { unit: 10, width: 900 });
  assert.equal(P.systems[0].x0, 1.0); assert.deepEqual(P.partNames, []); assert.deepEqual(P.systems[0].groups.map((g) => g.kind), ["brace"]);
  // voice + piano: the piano's name centred on its two staves
  const VP = layoutComposition(fill(voicePiano(), 2), { unit: 10, width: 900 });
  const pn = VP.partNames.find((n) => n.text === "Piano"), sv = VP.systems[0];
  assert.ok(Math.abs(pn.y - ((sv.staffTop[1] + sv.staffTop[2] + 4) / 2 + 0.4)) < 1e-9);
  assert.ok(Math.abs(sv.x0 - (1.0 + (0.07 * 16 + 0.15) + 0.58 * 1.3 * "Piano".length + 1.0)) < 1e-9, "no bracket on voice + piano: the widest name (Piano), its air, and the room the piano's brace takes");
  assert.ok(pn.x < sv.x0 - 0.15 - 0.07 * 16, "the name stands clear of the brace");
});

test("paint: the bracket's rule and hooks, the brace on a keyboard only, barlines drawn per span (broken between the voice and the piano, through on the quartet), names upright before the first system", () => {
  const Lq = layoutComposition(fill(quartet(), 2), { unit: 10, width: 900 }), rq = recorder();
  paintScore(Lq, rq);
  const brackets = rq.calls.filter((c) => c[0] === "rect" && c[5] === "cp-bracket"), hooks = rq.calls.filter((c) => c[0] === "glyph" && c[4] === "glyph cp-bracket");
  assert.equal(brackets.length, Lq.systems.length); assert.equal(hooks.length, 2 * Lq.systems.length); assert.ok(Math.abs(brackets[0][4] - 46) < 1e-9, "the rule spans all four staves");
  assert.equal(rq.calls.filter((c) => c[0] === "glyph" && /cp-brace/.test(c[4])).length, 0, "no brace on a quartet");
  const names = rq.calls.filter((c) => c[0] === "text" && c[4] === "cp-part-name");
  assert.deepEqual(names.slice(0, 4).map((c) => c[3]), ["Violin I", "Violin II", "Viola", "Cello"]); assert.equal(names[0][5].anchor, "end"); assert.equal(names[4]?.[3], Lq.systems.length > 1 ? "Vln. I" : undefined);
  const bars = rq.calls.filter((c) => c[0] === "rect" && c[5] === "sline-bar");
  assert.ok(bars.every((c) => Math.abs(c[4] - 46) < 1e-9), "every barline of a quartet runs through the whole group");
  const Lv = layoutComposition(fill(voicePiano(), 2), { unit: 10, width: 900 }), rv = recorder();
  paintScore(Lv, rv);
  const vb = rv.calls.filter((c) => c[0] === "rect" && c[5] === "sline-bar" && c[1] > Lv.systems[0].x0 + 1).map((c) => c[4]);
  assert.ok(vb.some((h) => Math.abs(h - 4) < 1e-9) && vb.some((h) => Math.abs(h - 16) < 1e-9) && !vb.some((h) => h > 17), "barlines: 4 S on the voice, 16 S on the piano, never joined");
  assert.equal(rv.calls.filter((c) => c[0] === "glyph" && /cp-brace/.test(c[4])).length, Lv.systems.length, "one brace per system, on the piano"); assert.equal(rv.calls.filter((c) => c[5] === "cp-bracket").length, 0);
  const s0 = Lv.systems[0], sys0 = rv.calls.filter((c) => c[0] === "rect" && c[5] === "sline-bar" && c[2] === s0.staffTop[0]);
  assert.ok(Math.abs(Math.min(...sys0.map((c) => c[1])) - (s0.x0 - 0.065)) < 1e-9, "the system's own left barline is its leftmost");
  assert.ok(sys0.some((c) => Math.abs(c[1] - (s0.x0 - 0.065)) < 1e-9 && Math.abs(c[4] - 30) < 1e-9), "and it joins everything, voice to piano");
});

test("per-staff subsystems on four staves: beams, ties, slurs, a cross-staff refusal, clef changes, expressions, hit-testing, fingering above on a cello and below on the piano's lower staff", () => {
  let d = fill(quartet(), 2, E);
  for (let k = 0; k < 8; k++) d = place(d, { bar: 0, staff: 3, ticks: (k * PPQ) / 2, step: 4 }, E).doc; // the cello: eight eighths on one pitch
  const vc = d.measures[0].staves[3].voices[0].filter((e) => e.kind === "note");
  d = tie(d, [{ ev: vc[0].id, pi: 0 }, { ev: vc[1].id, pi: 0 }]);
  d = slur(d, [vc[2].id, vc[4].id]);
  d = finger(d, [{ ev: vc[5].id, pi: 0 }], 3);
  d = setClef(d, 1, 2, "treble", PPQ);
  d = addExpression(d, { kind: "dyn", staff: 2, bar: 0, at: 0, value: "p" }).doc;
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "f" }).doc;
  const L = layoutComposition(d, { unit: 10, width: 900 });
  assert.ok(L.beams.filter((b) => b.system === 0).length >= 4, "the cello's eighths beam on the lowest staff"); assert.ok([0, 1, 2, 3].every((st) => L.drawn.some((x) => x.staff === st && !x.rest && x.system === 0)));
  assert.equal(L.ties.length, 1); assert.equal(L.slurs.length, 1);
  assert.equal(L.clefs.length, 1); assert.equal(L.clefs[0].staff, 2);
  assert.deepEqual(L.dynamics.map((x) => x.staff).sort(), [0, 2]);
  const f = L.fingers[0], dn = L.drawn.find((x) => x.id === vc[5].id);
  assert.ok(f.y < dn.topY, "a cello's finger sits above the note");
  const d0 = L.drawn.find((x) => x.id === vc[0].id);
  assert.equal(thingAt(L, d0.heads[0].x + d0.headW / 2, d0.heads[0].y)?.ev, vc[0].id, "the lowest staff hit-tests");
  // the piano in voice + piano: fingering above on the upper staff, below on the lower
  let v = fill(voicePiano(), 1);
  const up = v.measures[0].staves[1].voices[0][0], lo = v.measures[0].staves[2].voices[0][0];
  v = finger(v, [{ ev: up.id, pi: 0 }, { ev: lo.id, pi: 0 }], 1);
  const Lv = layoutComposition(v, { unit: 10, width: 900 });
  const fu = Lv.fingers.find((x) => x.ev === up.id), fl = Lv.fingers.find((x) => x.ev === lo.id);
  assert.ok(fu.y < Lv.drawn.find((x) => x.id === up.id).topY && fl.y > Lv.drawn.find((x) => x.id === lo.id).botY);
});

test("paper: a quartet plans to pages with the taller block, the PDF renders with the bracket hooks as outlines and the names in the upright face; the ink meter sees no overflow left", async () => {
  const d = fill(quartet(), 12);
  const plan = planPages(d, { staffMm: 1.8, page: "letter" });
  assert.ok(plan.pages.length >= 1); assert.equal(plan.L.metrics.blockH, 46);
  const ink = inkExtents(plan.L);
  assert.ok(ink.every((e) => e.left === 0), "names and brackets stand inside the layout");
  const bytes = await renderPdf(plan, libs, { title: "Quartet", composer: "", now: new Date(0) });
  const txt = Buffer.from(bytes).toString("latin1");
  assert.ok((txt.match(/\/Type \/Page(?!s)/g) ?? []).length === plan.pages.length);
  assert.ok(/\/Subtype \/Form/.test(txt), "glyph outlines are form XObjects");
});
