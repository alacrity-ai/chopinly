import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition } from "../js/lib/compose/model.js";
import { place } from "../js/lib/compose/engine.js";
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
