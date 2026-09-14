import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition } from "../js/lib/compose/model.js";
import { place, arpeggio, slur, dynamic, hairpin } from "../js/lib/compose/engine.js";
import { timeline, velocities } from "../js/lib/compose/play.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const Q = { base: 4, dots: 0, rest: false };

test("timeline: notes of both staves in onset order, absolute ticks, midi numbers", () => {
  let d = newComposition({ id: "t" });
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;            // B4 treble middle line
  d = place(d, { bar: 0, staff: 1, ticks: 0, step: 4 }, Q).doc;            // D3 bass middle line
  d = place(d, { bar: 1, staff: 0, ticks: 2 * PPQ, step: 6 }, { base: 2, dots: 0, rest: false }).doc; // D5 half on beat 3 of bar 2
  const { notes, total } = timeline(d);
  assert.equal(total, 4 * PPQ * d.measures.length);
  assert.deepEqual(notes.map((n) => [n.at, n.len, n.midi, n.staff]), [[0, PPQ, 71, 0], [0, PPQ, 50, 1], [4 * PPQ + 2 * PPQ, 2 * PPQ, 74, 0]]);
});

test("timeline: a tied pitch sounds once for the combined length; the untied pitch of the chord re-strikes", () => {
  let d = newComposition({ id: "t2" });
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 6 }, Q).doc;            // chord B4 + D5
  d = place(d, { bar: 0, staff: 0, ticks: PPQ, step: 4 }, Q).doc;          // B4 again
  d = place(d, { bar: 0, staff: 0, ticks: PPQ, step: 6 }, Q).doc;          // D5 again
  const v = d.measures[0].staves[0].voices[0];
  v[0].pitches.find((p) => p.step === "B").tie = "start";                     // tie the B only
  const { notes } = timeline(d);
  assert.deepEqual(notes.map((n) => [n.at, n.len, n.midi]), [[0, 2 * PPQ, 71], [0, PPQ, 74], [PPQ, PPQ, 74]]);
});

test("timeline: a tie with no matching next note is ignored; an empty score has no notes", () => {
  let d = newComposition({ id: "t3" });
  assert.deepEqual(timeline(d).notes, []);
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  d.measures[0].staves[0].voices[0][0].pitches[0].tie = "start";
  assert.deepEqual(timeline(d).notes.map((n) => [n.at, n.len]), [[0, PPQ]]);
});

test("a rolled chord plays its notes one after another — up from the bottom, down from the top — all ending together", () => {
  let d = newComposition({ id: "r" });
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;   // B4
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 6 }, Q).doc;   // D5
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 8 }, Q).doc;   // F5
  const ev = d.measures[0].staves[0].voices[0][0];
  const flat = timeline(d).notes.filter((n) => n.at < PPQ);
  assert.ok(flat.every((n) => n.at === 0 && n.len === PPQ));
  const up = timeline(arpeggio(d, [ev.id], "up")).notes.slice(0, 3);
  assert.deepEqual(up.map((n) => n.midi), [71, 74, 77]);
  const lag = up[1].at - up[0].at;
  assert.ok(lag > 0 && lag <= PPQ / 8, `lag ${lag}`);
  assert.deepEqual(up.map((n) => n.at), [0, lag, 2 * lag]);
  assert.ok(up.every((n) => n.at + n.len === PPQ), "they end together");
  const down = timeline(arpeggio(d, [ev.id], "down")).notes.slice(0, 3).sort((a, b) => a.at - b.at);
  assert.deepEqual(down.map((n) => n.midi), [77, 74, 71]);
  const plain = timeline(arpeggio(d, [ev.id], "plain")).notes.slice(0, 3).sort((a, b) => a.at - b.at);
  assert.deepEqual(plain.map((n) => n.midi), [71, 74, 77], "a plain roll goes up");
});

test("notes under a slur are marked legato (the slur's last note is not)", () => {
  let d = newComposition({ id: "l" });
  for (let q = 0; q < 4; q++) d = place(d, { bar: 0, staff: 0, ticks: q * PPQ, step: 4 + q }, Q).doc;
  const v = d.measures[0].staves[0].voices[0];
  d = slur(d, [v[0].id, v[2].id]);
  const n = timeline(d).notes.slice(0, 4);
  assert.deepEqual(n.map((x) => !!x.legato), [true, true, false, false]);
});

test("velocity: mf until a dynamic is written; a hairpin ramps to the next dynamic, or a step when none follows", () => {
  let d = newComposition({ id: "v" });
  for (let q = 0; q < 8; q++) d = place(d, { bar: Math.floor(q / 4), staff: 0, ticks: (q % 4) * PPQ, step: 4 }, Q).doc;
  const ev = (i) => d.measures[Math.floor(i / 4)].staves[0].voices[0][i % 4];
  assert.ok(timeline(d).notes.every((n) => n.vel === 0.7));
  d = dynamic(d, [ev(0).id], "p"); d = hairpin(d, [ev(1).id, ev(4).id], "cresc"); d = dynamic(d, [ev(4).id], "ff");
  const vel = [...Array(8)].map((_, i) => velocities(d).get(ev(i)));
  assert.equal(vel[0], 0.45);
  assert.ok(vel[1] < vel[2] && vel[2] < vel[3] && vel[3] < vel[4], "ramps up through the hairpin: " + vel.join());
  assert.equal(vel[4], 0.95); assert.equal(vel[7], 0.95, "ff holds");
  d = hairpin(d, [ev(5).id, ev(7).id], "dim");                 // no dynamic after → one step softer
  const v2 = [...Array(8)].map((_, i) => velocities(d).get(ev(i)));
  assert.ok(v2[7] < v2[5] && Math.abs(v2[7] - (0.95 - 0.12)) < 1e-9, "a step down: " + v2.join());
  assert.equal(timeline(d).notes.find((n) => n.at === 4 * PPQ).vel, 0.95, "the timeline carries it");
});
