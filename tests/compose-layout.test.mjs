import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition } from "../js/lib/compose/model.js";
import { place, setClef, setKey, setTime, articulate, arpeggio, accidental, slur, addExpression, addHairpin, MARKS } from "../js/lib/compose/engine.js";
import { things } from "../js/lib/compose/hit.js";
import { layoutComposition, SYS_H, TOP_PAD } from "../js/lib/compose/layout.js";
import { slotAt, thingAt, ticksAt, xOfTicks, barAt } from "../js/lib/compose/hit.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const Q = { base: 4, dots: 0, rest: false }, E = { base: 8, dots: 0, rest: false }, X = { base: 16, dots: 0, rest: false };
const fresh = () => newComposition({ id: "c", now: 1 });

test("an empty piece lays out eight bars with a brace, both staves, and only whole-bar rests", () => {
  const L = layoutComposition(fresh(), { unit: 12, width: 1024 });
  assert.ok(L.systems.length >= 2);
  assert.equal(L.systems.reduce((n, s) => n + s.bars.length, 0), 8);
  assert.equal(L.drawn.filter((d) => d.rest && d.whole).length, 16);
  assert.ok(L.height > (TOP_PAD + SYS_H) * 12);
  assert.equal(L.systems[0].staffTop.length, 2);
  assert.ok(L.systems[0].staffTop[1] - L.systems[0].staffTop[0] === 12);
});

test("both staves share x per tick: a quarter on beat 2 in each staff draws at the same x", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: PPQ, step: 4 }, Q).doc;
  d = place(d, { bar: 0, staff: 1, ticks: PPQ, step: 4 }, Q).doc;
  const L = layoutComposition(d, { unit: 12, width: 1024 });
  const notes = L.drawn.filter((x) => !x.rest);
  assert.equal(notes.length, 2);
  assert.equal(notes[0].x, notes[1].x);
  // and the rests before them line up too
  const rests = L.drawn.filter((x) => x.rest && x.bar === 0);
  assert.equal(new Set(rests.filter((r) => r.base === 4).map((r) => r.x.toFixed(3))).size, 1);
});

test("beams: four eighths in one bar beam in pairs (beat groups), never across a beat; a lone eighth gets a flag; sixteenths get two beams", () => {
  let d = fresh();
  for (const t of [0, PPQ / 2, PPQ, PPQ * 1.5]) d = place(d, { bar: 0, staff: 0, ticks: t, step: 6 }, E).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 3 * PPQ, step: 6 }, E).doc;
  let L = layoutComposition(d, { unit: 12, width: 1024 });
  const notes = L.drawn.filter((x) => !x.rest && x.staff === 0).sort((a, b) => a.ticks - b.ticks);
  assert.deepEqual(notes.map((n) => !!n.beamed), [true, true, true, true, false]);
  assert.equal(L.beams.length, 2);
  for (const b of L.beams) assert.ok(Math.abs(b.y2 - b.y1) <= 1.0);
  let d2 = fresh();
  for (let i = 0; i < 4; i++) d2 = place(d2, { bar: 0, staff: 0, ticks: (i * PPQ) / 4, step: 6 }, X).doc;
  L = layoutComposition(d2, { unit: 12, width: 1024 });
  assert.equal(L.beams.length, 2); // primary + one full secondary across the four
});

test("chords: a second flips a head to the other side of the stem; the stem direction follows the farthest note", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 2 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 10, step: 3 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 10, step: 9 }, Q).doc;
  const L = layoutComposition(d, { unit: 12, width: 1024 });
  const n = L.drawn.find((x) => !x.rest);
  assert.equal(n.heads.length, 3);
  assert.equal(n.stem, "down"); // step 9 is farther from the middle line (4) than step 2
  assert.equal(n.heads.filter((h) => h.flip).length, 1);
});

test("hit tables: a point over a rest maps to its bar and a step; xOfTicks/ticksAt round-trip; thingAt finds a placed head", () => {
  const d = place(fresh(), { bar: 1, staff: 0, ticks: 0, step: 4 }, Q).doc;
  const L = layoutComposition(d, { unit: 12, width: 1024 });
  const { sys, bar } = barAt(L, 1);
  const x = xOfTicks(bar, PPQ * 2), y = sys.staves[0].topY + 2; // middle line of the treble staff
  const slot = slotAt(L, x, y);
  assert.equal(slot.bar, 1); assert.equal(slot.staff, 0); assert.equal(slot.step, 4);
  assert.ok(Math.abs(slot.ticks - PPQ * 2) < 60, `ticks ${slot.ticks}`);
  for (const t of [0, PPQ, 2 * PPQ, 3 * PPQ]) assert.ok(Math.abs(ticksAt(bar, xOfTicks(bar, t)) - t) < 1);
  const bass = slotAt(L, x, sys.staves[1].topY + 2);
  assert.equal(bass.staff, 1); assert.equal(bass.step, 4);
  const n = L.drawn.find((v) => !v.rest);
  const th = thingAt(L, n.heads[0].x + n.headW / 2, n.heads[0].y);
  assert.equal(th?.type, "head"); assert.equal(th.ev, n.id);
  assert.equal(thingAt(L, bar.x1 - 0.2, sys.staves[0].topY - 6), null);
});

test("packing: narrow widths give more systems; the last system is not stretched past 1.25", () => {
  const narrow = layoutComposition(fresh(), { unit: 12, width: 360 });
  const wide = layoutComposition(fresh(), { unit: 12, width: 1400 });
  assert.ok(narrow.systems.length > wide.systems.length);
  assert.ok(wide.systems[wide.systems.length - 1].scale <= 1.25 + 1e-9);
  for (const s of narrow.systems) for (const b of s.barlines) assert.ok(b.x * 12 <= 360 + 1, "a bar ran off the page");
});

test("lasso: a polygon around two heads selects exactly them; things() lists heads and rests with anchors", async () => {
  const { lasso, things, inside } = await import("../js/lib/compose/hit.js");
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: PPQ, step: 6 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 2 * PPQ, step: 8 }, Q).doc;
  const L = layoutComposition(d, { unit: 12, width: 1024 });
  const heads = things(L).filter((t) => t.type === "head");
  assert.equal(heads.length, 3);
  assert.ok(things(L).some((t) => t.type === "rest"));
  const [a, b] = heads;
  const poly = [{ x: a.x - 1, y: a.y - 1.5 }, { x: b.x + 1, y: b.y - 1.5 }, { x: b.x + 1, y: a.y + 1.5 }, { x: a.x - 1, y: a.y + 1.5 }];
  const got = lasso(L, poly);
  assert.deepEqual(got.map((t) => t.ev).sort(), [a.ev, b.ev].sort());
  assert.equal(inside(poly, a.x, a.y), true);
  assert.equal(inside(poly, heads[2].x, heads[2].y), false);
  assert.deepEqual(lasso(L, poly.slice(0, 2)), []);
});

test("a clef change on beat 3 draws a small clef before that beat's column; heads after it step in the new clef, heads before it in the old", () => {
  let d = setClef(fresh(), 1, 1, "tenor", 2 * PPQ);
  d = place(d, { bar: 1, staff: 1, ticks: 0, step: 4 }, Q).doc;        // D3 in bass (middle line)
  d = place(d, { bar: 1, staff: 1, ticks: 2 * PPQ, step: 4 }, Q).doc;  // A3 in tenor (middle line)
  const L = layoutComposition(d, { unit: 12, width: 1024 });
  assert.equal(L.clefs.length, 1);
  const c = L.clefs[0], heads = L.drawn.filter((x) => !x.rest && x.bar === 1).sort((a, b) => a.ticks - b.ticks);
  assert.equal(c.glyph, "cClef"); assert.equal(c.staff, 1); assert.equal(c.at, 2 * PPQ);
  assert.ok(c.x > heads[0].x && c.x < heads[1].x, `clef between the notes: ${heads[0].x} < ${c.x} < ${heads[1].x}`);
  assert.equal(heads[0].heads[0].step, 4); assert.equal(heads[1].heads[0].step, 4); // both on the middle line, in their own clefs
  // a clef change at the barline of the next system's first bar is shown as a courtesy at the end of the previous one
  let e = setClef(fresh(), 6, 0, "alto");
  const N = layoutComposition(e, { unit: 12, width: 900 });
  const sysOf = (bar) => N.systems.findIndex((s) => s.bars.some((b) => b.index === bar));
  if (sysOf(6) > 0 && sysOf(6) !== sysOf(5)) { const prev = N.systems[sysOf(6) - 1]; assert.ok(prev.courtesyLead?.clef, "courtesy clef"); assert.equal(prev.courtesyLead.staves[0].clef.glyph, "cClef"); }
});

test("courtesy key / time / clef at a system end sit on the staff: the staff lines run past the last barline under them and stay inside the width", () => {
  let d = setKey(fresh(), 6, 3); d = setTime(d, 6, { beats: 6, unit: 8 }).doc; d = setClef(d, 6, 0, "alto");
  const L = layoutComposition(d, { unit: 12, width: 1024 });
  const sysOf = (bar) => L.systems.findIndex((s) => s.bars.some((b) => b.index === bar));
  assert.ok(sysOf(6) > 0 && sysOf(6) !== sysOf(5), "bar 7 opens a new system");
  const prev = L.systems[sysOf(6) - 1], last = prev.barlines[prev.barlines.length - 1].x, c = prev.courtesyLead;
  assert.ok(c && c.clef && c.key && c.time, "all three courtesies");
  assert.ok(prev.endX > c.timeX + 2.5, `staff runs under the courtesy time (${prev.endX} > ${c.timeX + 2.5})`);
  assert.ok(prev.endX > last && prev.endX * 12 <= 1024, `end ${prev.endX} within the width`);
  for (const s of L.systems) if (!s.courtesyLead) assert.equal(s.endX, null);
});

test("the lower mordent (the one with the line through it) is a mark and lays out as an ornament above the staff", () => {
  assert.ok(MARKS.includes("lowerMordent") && MARKS.includes("mordent"));
  let d = newComposition({ id: "m", now: 1 });
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 4 }, { base: 4, dots: 0, rest: false, tuplet: null, alter: null }).doc;
  const ev = d.measures[0].staves[0].voices[0][0];
  d = articulate(d, [ev.id], "lowerMordent");
  assert.deepEqual(d.measures[0].staves[0].voices[0][0].art, ["lowerMordent"]);
  const L = layoutComposition(d, { unit: 10, width: 800 });
  const m = L.marks.find((x) => x.mark === "lowerMordent");
  assert.ok(m && m.above, "drawn above like the other ornaments");
  assert.ok(m.y < L.systems[0].staffTop[0], "above the top line");
});

test("a rolled chord gets a sign left of its accidentals spanning a space past its outer heads, and the column widens for it", () => {
  const A = { base: 4, dots: 0, rest: false, tuplet: null, alter: null };
  let d = newComposition({ id: "a", now: 1 });
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 2 }, A).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 8 }, A).doc;
  const ev = d.measures[0].staves[0].voices[0][0];
  d = accidental(d, [{ ev: ev.id, pi: 0 }], 1);                     // a sharp on the low note: the sign must stand left of it
  const before = layoutComposition(d, { unit: 10, width: 900 });
  assert.equal(before.arps.length, 0);
  d = arpeggio(d, [ev.id], "up");
  const L = layoutComposition(d, { unit: 10, width: 900 });
  assert.equal(L.arps.length, 1);
  const a = L.arps[0], dn = L.drawn.find((x) => x.id === ev.id);
  assert.equal(a.kind, "up");
  assert.ok(a.y1 > dn.botY && a.y2 < dn.topY, "spans past both outer heads");
  const accX = Math.min(...dn.heads.map((h) => h.x)) - 1.35;
  assert.ok(a.x < accX - 0.4, `left of the accidental (${a.x} vs ${accX})`);
  assert.ok(dn.x > before.drawn.find((x) => x.id === ev.id).x + 1, "the chord moved right to make room for the sign");
});

test("a slur arches on the head side (stems up → below, any stem down → above), clears the notes between, and splits at a system break", () => {
  const A = { base: 4, dots: 0, rest: false, tuplet: null, alter: null };
  let d = newComposition({ id: "s", now: 1 });
  for (const [t, st] of [[0, 2], [PPQ, 3], [2 * PPQ, 1], [3 * PPQ, 0]]) d = place(d, { bar: 0, staff: 0, ticks: t, step: st }, A).doc;  // all below the middle line: stems up
  const v = d.measures[0].staves[0].voices[0];
  d = slur(d, [v[0].id, v[3].id]);
  let L = layoutComposition(d, { unit: 10, width: 900 });
  assert.equal(L.slurs.length, 1);
  const s1 = L.slurs[0], first = L.drawn.find((x) => x.id === v[0].id), last = L.drawn.find((x) => x.id === v[3].id), peak = L.drawn.find((x) => x.id === v[2].id);
  assert.equal(s1.dir, "down", "all stems up → the slur goes under the heads");
  assert.ok(s1.y1 > first.botY && s1.y2 > last.botY, "starts and ends below the outer heads");
  assert.ok(s1.h >= 1.2 && s1.h <= 6);
  // the curve's belly (0.75 h below the chord line) must clear the lowest head between
  assert.ok((s1.y1 + s1.y2) / 2 + 0.75 * s1.h > peak.botY + 0.5, "clears the note in the middle");
  // a high note makes a stem-down note in the span → the slur flips above and clears the stem tips
  d = place(d, { bar: 0, staff: 0, ticks: PPQ, step: 12 }, A).doc;      // a high pitch joins the second note's chord → that chord stems down
  L = layoutComposition(d, { unit: 10, width: 900 });
  assert.equal(L.slurs[0].dir, "up");
  // a slur across a system break: two halves on two systems
  let e = newComposition({ id: "s2", now: 1 });
  for (let bar = 0; bar < 8; bar++) for (let q = 0; q < 4; q++) e = place(e, { bar, staff: 0, ticks: q * PPQ, step: 4 }, A).doc;
  const L1 = layoutComposition(e, { unit: 12, width: 700 });
  const breakBar = L1.hit.systems[1].bars[0].index;
  const a = e.measures[breakBar - 1].staves[0].voices[0][3], b = e.measures[breakBar].staves[0].voices[0][0];
  e = slur(e, [a.id, b.id]);
  const L2 = layoutComposition(e, { unit: 12, width: 700 });
  assert.deepEqual(L2.slurs.map((x) => x.half), ["out", "in"]);
  assert.ok(L2.slurs[0].system === 0 && L2.slurs[1].system === 1);
});

test("expressions (WSHED-122): a dynamic sits on the staff's expression line under its slot (with or without a note there), a hairpin runs between its slots clearing what sounds inside, text sits above; the hit tables find them and a selected hairpin's handles", () => {
  const A = { base: 4, dots: 0, rest: false, tuplet: null, alter: null };
  let d = newComposition({ id: "x", now: 1 });
  for (let q = 0; q < 4; q++) d = place(d, { bar: 0, staff: 0, ticks: q * PPQ, step: q === 1 ? -4 : 4 }, A).doc; // the second note hangs low
  const g = PPQ / 2;
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "f" }).doc;
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 1, at: 3 * g, value: "pp" }).doc;           // the & of 2 of an empty bar
  const hp = addHairpin(d, { staff: 0, bar: 0, at: 0, dir: "cresc", end: { bar: 0, at: 6 * g } }); d = hp.doc;
  d = addExpression(d, { kind: "text", staff: 0, bar: 0, at: 4 * g, value: "rit." }).doc;
  const L = layoutComposition(d, { unit: 10, width: 900 });
  const bot = L.systems[0].staffTop[0] + 4, top = L.systems[0].staffTop[0];
  const v = d.measures[0].staves[0].voices[0], hb0 = L.hit.systems[0].bars[0], hb1 = L.hit.systems[0].bars[1];
  assert.deepEqual(L.dynamics.map((x) => [x.dyn, x.bar, x.at]), [["f", 0, 0], ["pp", 1, 3 * g]]);
  const first = L.drawn.find((x) => x.id === v[0].id);
  assert.ok(Math.abs(L.dynamics[0].x - (first.x + first.headW / 2)) < 0.05, "under the head of the note on its slot");
  assert.ok(L.dynamics[0].y >= bot + 2.6, "below the staff");
  assert.ok(Math.abs(L.dynamics[1].x - (xOfTicks(hb1, 3 * g) + 0.59)) < 1e-9 && L.dynamics[1].x > hb1.x0 && L.dynamics[1].x < hb1.x1, "between the empty bar's columns, on its slot");
  assert.equal(L.dynamics[1].y, bot + 2.6, "nothing under it: the line itself");
  assert.equal(L.hairpins.length, 1);
  const h = L.hairpins[0], low = L.drawn.find((x) => x.id === v[1].id);
  assert.equal(h.kind, "cresc"); assert.equal(h.id, hp.id);
  assert.ok(h.x1 > L.dynamics[0].x, "starts after the dynamic on its slot");
  assert.ok(h.x2 > L.drawn.find((x) => x.id === v[3].id).x, "reaches its end slot");
  assert.ok(h.y > low.botY + 1, "clears the low note in the span");
  assert.equal(L.texts.length, 1); assert.equal(L.texts[0].text, "rit."); assert.ok(Math.abs(L.texts[0].x - xOfTicks(hb0, 4 * g)) < 1e-9);
  assert.ok(L.texts[0].y < top - 2, "above the staff");
  // hit: the things and the taps
  const ts = things(L).filter((t) => t.type !== "head" && t.type !== "rest");
  assert.deepEqual(ts.map((t) => t.type), ["dyn", "dyn", "text", "hairpin"]);
  assert.equal(thingAt(L, L.dynamics[0].x, L.dynamics[0].y - 0.3)?.ev, L.dynamics[0].id, "a tap on the dynamic");
  assert.equal(thingAt(L, L.texts[0].x + 0.5, L.texts[0].y - 0.4)?.type, "text");
  assert.equal(thingAt(L, (h.x1 + h.x2) / 2, h.y)?.type, "hairpin", "a tap on the hairpin's body");
  assert.equal(thingAt(L, h.x2, h.y)?.type, "hairpin", "its end is the body until it is selected");
  assert.equal(thingAt(L, h.x2, h.y, new Set([hp.id]))?.type, "hairpin-end", "selected: its end is a handle");
  assert.equal(thingAt(L, h.x1, h.y, new Set([hp.id]))?.type, "hairpin-start");
  assert.equal(thingAt(L, first.x + first.headW / 2, first.heads[0].y)?.type, "head", "a head wins over the dynamic below it");
  // across a system break: open halves, one thing
  let e = newComposition({ id: "x2", now: 1 });
  for (let bar = 0; bar < 8; bar++) for (let q = 0; q < 4; q++) e = place(e, { bar, staff: 0, ticks: q * PPQ, step: 4 }, A).doc;
  const L1 = layoutComposition(e, { unit: 12, width: 700 }), b1 = L1.hit.systems[1].bars[0].index;
  e = addHairpin(e, { staff: 0, bar: b1 - 1, at: 4 * g, dir: "dim", end: { bar: b1, at: 2 * g } }).doc;
  const L2 = layoutComposition(e, { unit: 12, width: 700 });
  assert.deepEqual(L2.hairpins.map((x) => [x.half, x.system]), [["out", 0], ["in", 1]]);
  assert.equal(things(L2).filter((t) => t.type === "hairpin").length, 1);
  assert.equal(thingAt(L2, L2.hairpins[0].x2, L2.hairpins[0].y, new Set([L2.hairpins[0].id]))?.type, "hairpin", "the open end at the break is no handle");
  assert.equal(thingAt(L2, L2.hairpins[1].x2, L2.hairpins[1].y, new Set([L2.hairpins[0].id]))?.type, "hairpin-end");
  // the ghost helpers agree with the placed marks
  assert.equal(L.exprLine(0, 0, 0, 1), L.dynamics[0].y);
  assert.equal(L.textLine(0, 0, 4 * g), L.texts[0].y);
});

test("golden: a piece that never uses a second voice lays out exactly as it did before multi-voice landed (every value the old engraver produced)", async () => {
  const fs = await import("node:fs");
  const { goldenLayout } = await import("./fixtures/compose-golden.mjs");
  const golden = JSON.parse(fs.readFileSync(new URL("./fixtures/compose-golden.json", import.meta.url), "utf8"));
  const diffs = [];
  const walk = (g, n, path) => {
    if (diffs.length > 12) return;
    if (Array.isArray(g)) { if (!Array.isArray(n) || n.length !== g.length) { diffs.push(`${path}: length ${g.length} → ${n?.length}`); return; } g.forEach((x, i) => walk(x, n[i], `${path}[${i}]`)); return; }
    if (g && typeof g === "object") { if (!n || typeof n !== "object") { diffs.push(`${path}: missing`); return; } for (const k of Object.keys(g)) walk(g[k], n[k], `${path}.${k}`); return; } // new keys are allowed; old ones must agree
    if (g !== n && !(typeof g === "number" && typeof n === "number" && Math.abs(g - n) < 1e-3)) diffs.push(`${path}: ${JSON.stringify(g)} → ${JSON.stringify(n)}`);
  };
  walk(golden.w1024, goldenLayout(1024), "w1024"); walk(golden.w700, goldenLayout(700), "w700");
  assert.deepEqual(diffs, []);
});

// --- P5 (WSHED-120): voices in the engraving ------------------------------------------------------
import { crossStaff, hideRest, setVoice, nudgeRest } from "../js/lib/compose/engine.js";
const V = (voice, base = 4) => [{ base, dots: 0, rest: false, tuplet: null, alter: null }, voice];
const put = (d, bar, staff, ticks, step, [armed, voice]) => place(d, { bar, staff, ticks, step, voice }, armed).doc;

test("two voices on one staff: voice 1 stems up and voice 2 down whatever the pitch; rests of the two voices sit high and low; a bar with voice 1 alone keeps the far-from-the-middle rule", () => {
  let d = put(fresh(), 0, 0, 0, 10, V(0));                 // a high note in voice 1: alone it would stem down
  let L = layoutComposition(d, { unit: 12, width: 1024 });
  assert.equal(L.drawn.find((x) => !x.rest).stem, "down");
  d = put(d, 0, 0, PPQ, -2, V(1));                          // voice 2 enters low: alone it would stem up
  L = layoutComposition(d, { unit: 12, width: 1024 });
  const n1 = L.drawn.find((x) => !x.rest && x.voice === 0), n2 = L.drawn.find((x) => !x.rest && x.voice === 1);
  assert.equal(n1.stem, "up"); assert.equal(n2.stem, "down");
  const top = L.systems[0].staffTop[0];
  const r1 = L.drawn.filter((x) => x.rest && x.voice === 0 && x.bar === 0 && x.staff === 0), r2 = L.drawn.filter((x) => x.rest && x.voice === 1 && x.bar === 0 && x.staff === 0);
  assert.ok(r1.length && r2.length);
  assert.ok(r1.every((r) => r.y === top + 1), "voice 1 rests a space above the middle line: " + r1.map((r) => r.y - top));
  assert.ok(r2.every((r) => r.y === top + 3), "voice 2 rests a space below: " + r2.map((r) => r.y - top));
  // the next bar has voice 1 only: its whole rest hangs from the fourth line as ever, nothing is tinted
  assert.ok(L.drawn.filter((x) => x.bar === 1 && x.staff === 0).every((x) => x.voice === 0 && (!x.rest || x.y === top + 1)));
  // the whole-bar rest of voice 1 when only voice 2 sounds in a bar sits high too
  let e = put(fresh(), 2, 0, 0, 4, V(1));
  const L2 = layoutComposition(e, { unit: 12, width: 1024 });
  const whole = L2.drawn.find((x) => x.rest && x.whole && x.bar === 2 && x.staff === 0);
  assert.ok(whole && whole.voice === 0 && whole.y === L2.systems[0].staffTop[0] + 0, "voice 1's whole rest a space up: " + (whole && whole.y - L2.systems[0].staffTop[0]));
});

test("collisions: a second voice a second (or a unison of a different value) under the first moves right of its stem and the column widens; a unison of the same value shares one head with two stems", () => {
  let d = put(fresh(), 0, 0, 0, 4, V(0)); d = put(d, 0, 0, 0, 3, V(1));    // B4 over A4 at one onset
  d = put(d, 0, 0, PPQ, 4, V(0));                                            // a following column to measure the room
  let L = layoutComposition(d, { unit: 12, width: 1024 });
  const a = L.drawn.find((x) => !x.rest && x.voice === 0 && x.ticks === 0), b = L.drawn.find((x) => !x.rest && x.voice === 1 && x.ticks === 0);
  assert.ok(Math.abs(b.x - (a.x + a.headW + 0.1)) < 1e-9, `voice 2 right of voice 1's stem: ${a.x} → ${b.x}`);
  assert.ok(b.heads[0].x > a.stemX, "clear of the up stem");
  const next = L.drawn.find((x) => !x.rest && x.ticks === PPQ);
  const plain = layoutComposition(put(put(fresh(), 0, 0, 0, 4, V(0)), 0, 0, PPQ, 4, V(0)), { unit: 12, width: 1024 }).drawn.find((x) => !x.rest && x.ticks === PPQ);
  assert.ok(next.x > plain.x + 1, "the next column moved over for the offset");
  // a third apart: no offset
  let e = put(fresh(), 0, 0, 0, 4, V(0)); e = put(e, 0, 0, 0, 2, V(1));
  L = layoutComposition(e, { unit: 12, width: 1024 });
  const [p, q] = [L.drawn.find((x) => !x.rest && x.voice === 0), L.drawn.find((x) => !x.rest && x.voice === 1)];
  assert.equal(p.x, q.x);
  // a unison of quarters: one head, two stems, no offset; a unison of a quarter over a half: offset, two heads
  let u = put(fresh(), 0, 0, 0, 4, V(0)); u = put(u, 0, 0, 0, 4, V(1));
  L = layoutComposition(u, { unit: 12, width: 1024 });
  const [u1, u2] = [L.drawn.find((x) => !x.rest && x.voice === 0), L.drawn.find((x) => !x.rest && x.voice === 1)];
  assert.equal(u1.x, u2.x); assert.equal(u2.shared, true); assert.equal(u2.heads[0].shared, true); assert.ok(!u1.heads[0].shared);
  assert.ok(u1.stem === "up" && u2.stem === "down" && u1.stemX > u2.stemX, "stems on either side of the shared head");
  let w = put(fresh(), 0, 0, 0, 4, V(0)); w = put(w, 0, 0, 0, 4, V(1, 2));
  L = layoutComposition(w, { unit: 12, width: 1024 });
  const [w1, w2] = [L.drawn.find((x) => !x.rest && x.voice === 0), L.drawn.find((x) => !x.rest && x.voice === 1)];
  assert.ok(w2.x > w1.x && !w2.shared);
  // accidentals of both voices stack in one column left of everything the column owns
  let s = put(fresh(), 0, 0, 0, 4, V(0)); s = put(s, 0, 0, 0, 3, V(1));
  const ids = s.measures[0].staves[0].voices.map((v) => v[0].id);
  s = accidental(s, [{ ev: ids[0], pi: 0 }], 1); s = accidental(s, [{ ev: ids[1], pi: 0 }], -1);
  L = layoutComposition(s, { unit: 12, width: 1024 });
  const [s1, s2] = [L.drawn.find((x) => x.id === ids[0]), L.drawn.find((x) => x.id === ids[1])];
  assert.ok(s1.heads[0].accX !== undefined && s2.heads[0].accX !== undefined);
  assert.ok(s2.heads[0].accX < s1.heads[0].accX && s1.heads[0].accX < s1.x, "two columns of accidentals, both left of the heads: " + [s1.heads[0].accX, s2.heads[0].accX, s1.x].join());
});

test("beams are per voice: eighths in voice 1 and voice 2 over the same beat make two beams, one above and one below; a slur in voice 2 clears its own notes only", () => {
  let d = fresh();
  for (let i = 0; i < 2; i++) { d = put(d, 0, 0, i * (PPQ / 2), 6, V(0, 8)); d = put(d, 0, 0, i * (PPQ / 2), 0, V(1, 8)); }
  let L = layoutComposition(d, { unit: 12, width: 1024 });
  assert.equal(L.beams.length, 2);
  const up = L.beams.find((b) => b.voice === 0), down = L.beams.find((b) => b.voice === 1);
  assert.ok(up && down && up.dir === "up" && down.dir === "down" && up.y1 < down.y1, JSON.stringify(L.beams));
  const v2 = d.measures[0].staves[0].voices[1].filter((e) => e.kind === "note");
  d = slur(d, [v2[0].id, v2[1].id]);
  L = layoutComposition(d, { unit: 12, width: 1024 });
  assert.equal(L.slurs.length, 1); assert.equal(L.slurs[0].voice, 1); assert.equal(L.slurs[0].dir, "down", "in a two-voice bar voice 2's slur goes below, clear of voice 1");
  assert.ok(L.slurs[0].y1 > L.beams.find((b) => b.voice === 1).y1, "under voice 2's beam");
  // and a voice-1 slur in the same bar goes above
  const v1n = d.measures[0].staves[0].voices[0].filter((e) => e.kind === "note");
  const L3 = layoutComposition(slur(d, [v1n[0].id, v1n[1].id]), { unit: 12, width: 1024 });
  assert.deepEqual(L3.slurs.map((x) => [x.voice, x.dir]).sort(), [[0, "up"], [1, "down"]]);
});

test("cross-staff: a lower-staff note crossed up draws on the upper staff (owner unchanged, found where drawn); a beam with notes on both staves runs between them with stems toward it", () => {
  let d = put(fresh(), 0, 1, 0, 10, V(0));                      // a high note on the bass staff (E4 on a ledger line)
  const id = d.measures[0].staves[1].voices[0][0].id;
  let L = layoutComposition(d, { unit: 12, width: 1024 });
  const home = L.drawn.find((x) => x.id === id);
  assert.equal(home.drawStaff, 1); assert.equal(home.heads[0].step, 10);
  d = crossStaff(d, [id], -1);
  L = layoutComposition(d, { unit: 12, width: 1024 });
  const away = L.drawn.find((x) => x.id === id);
  assert.equal(away.staff, 1); assert.equal(away.drawStaff, 0); assert.equal(away.cross, -1);
  assert.equal(away.heads[0].step, -2, "E4 sits on the treble staff's first ledger line below");
  assert.ok(away.heads[0].y > L.systems[0].staffTop[0] + 4 && away.heads[0].y < L.systems[0].staffTop[1], "drawn between the staves, hanging off the upper one");
  assert.equal(away.stem, "down", "the stem points home");
  const th = thingAt(L, away.heads[0].x + away.headW / 2, away.heads[0].y);
  assert.ok(th && th.ev === id && th.staff === 1 && th.voice === 0, "found where it is drawn, owned by the lower staff: " + JSON.stringify(th));
  // four eighths on the lower staff rising (two beat groups): the last note crossed up → the second pair's beam runs through the gap
  let e = fresh();
  for (let i = 0; i < 4; i++) e = put(e, 0, 1, i * (PPQ / 2), 6 + i * 2, V(0, 8));
  const ids = e.measures[0].staves[1].voices[0].filter((x) => x.kind === "note").map((x) => x.id);
  e = crossStaff(e, ids.slice(3), -1);
  L = layoutComposition(e, { unit: 12, width: 1024 });
  const beam = L.beams.filter((b) => b.cross);
  assert.equal(beam.length, 1, "one cross-staff beam: " + JSON.stringify(L.beams));
  assert.equal(L.beams.length, 2);
  const gapTop = L.systems[0].staffTop[0] + 4, gapBot = L.systems[0].staffTop[1];
  assert.ok(beam[0].y1 > gapTop && beam[0].y1 < gapBot && beam[0].y1 === beam[0].y2, "flat, in the gap");
  const notes = ids.map((x) => L.drawn.find((n) => n.id === x));
  assert.deepEqual(notes.map((n) => n.stem), ["down", "down", "up", "down"], "the first pair beams by the average (high notes → down); the crossed pair's stems point at the beam in the gap");
  assert.ok(notes.slice(2).every((n) => Math.abs(n.stemTipY - beam[0].y1) < 1e-9), "every stem of the crossed pair reaches the beam");
  assert.ok(notes.every((n) => Math.abs(n.stemTipY - n.stemFromY) >= 2.75 - 1e-9), "stems long enough");
  // a hidden rest stays in the layout (faint on screen, selectable) and in the hit table
  let h = put(fresh(), 0, 0, 0, 4, V(0));
  const rest = h.measures[0].staves[0].voices[0][1];
  h = hideRest(h, [rest.id]);
  L = layoutComposition(h, { unit: 12, width: 1024 });
  const hr = L.drawn.find((x) => x.id === rest.id);
  assert.ok(hr && hr.hidden === true);
  assert.equal(thingAt(L, hr.x + 0.7, hr.y)?.ev, rest.id);
  // moving the note to voice 2 → the tint follows (voice index on the drawn thing), voice 1's rests come back
  const mv = setVoice(h, [h.measures[0].staves[0].voices[0][0].id], 1);
  L = layoutComposition(mv, { unit: 12, width: 1024 });
  assert.ok(L.drawn.some((x) => !x.rest && x.voice === 1) && L.drawn.some((x) => x.rest && x.whole && x.voice === 0 && x.bar === 0));
});

test("a dragged rest draws restY half-spaces higher (or lower), the whole-bar rest too, and the hit table follows it", () => {
  let d = put(fresh(), 0, 0, 0, 4, V(0));                       // n4 r4 r2 in voice 1
  d = put(d, 0, 0, 0, 2, V(1));                                 // voice 2 → the bar has two voices, rests offset by voice
  const r4 = d.measures[0].staves[0].voices[0][1], r2 = d.measures[0].staves[0].voices[0][2];
  const L0 = layoutComposition(d, { unit: 12, width: 1024 });
  const y0 = (id, L) => L.drawn.find((x) => x.id === id).y;
  const moved = nudgeRest(nudgeRest(d, [r4.id], -4), [r2.id], 3);
  const L1 = layoutComposition(moved, { unit: 12, width: 1024 });
  assert.ok(Math.abs((y0(r4.id, L1) - y0(r4.id, L0)) - 2) < 1e-9, "four steps down = two spaces lower");
  assert.ok(Math.abs((y0(r2.id, L0) - y0(r2.id, L1)) - 1.5) < 1e-9, "three steps up");
  const hr = L1.drawn.find((x) => x.id === r4.id);
  assert.equal(thingAt(L1, hr.x + 0.7, hr.y)?.ev, r4.id, "the rest is picked where it is drawn");
  // the whole-bar rest of a silent voice 1 under voice 2
  let w = put(fresh(), 0, 0, 0, 4, V(1));
  const whole = w.measures[0].staves[0].voices[0][0];
  const W0 = layoutComposition(w, { unit: 12, width: 1024 }).drawn.find((x) => x.id === whole.id);
  assert.ok(W0.whole);
  const W1 = layoutComposition(nudgeRest(w, [whole.id], -6), { unit: 12, width: 1024 }).drawn.find((x) => x.id === whole.id);
  assert.ok(W1.whole && Math.abs((W1.y - W0.y) - 3) < 1e-9, "the whole rest drops three spaces");
  // a single-voice bar's rest moves the same way (no voice offset involved)
  const s = put(fresh(), 0, 0, 0, 4, V(0)); const sr = s.measures[0].staves[0].voices[0][1];
  const S0 = layoutComposition(s, { unit: 12, width: 1024 }).drawn.find((x) => x.id === sr.id).y;
  const S1 = layoutComposition(nudgeRest(s, [sr.id], 2), { unit: 12, width: 1024 }).drawn.find((x) => x.id === sr.id).y;
  assert.ok(Math.abs((S0 - S1) - 1) < 1e-9);
});
