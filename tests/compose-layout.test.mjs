import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition } from "../js/lib/compose/model.js";
import { place, setClef, setKey, setTime, articulate, arpeggio, accidental, MARKS } from "../js/lib/compose/engine.js";
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
