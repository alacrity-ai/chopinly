import { test } from "node:test";
import assert from "node:assert/strict";
import { barPlan, fold, signature, nextBeatBoundary, swapOffset, pointerAt, TAIL_S } from "../js/tools/metronome/bar.js";

const SR = 48000;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test("barPlan: 4/4 at 120 with one accent → 4 clicks on the beat, bar = 2 s exactly", () => {
  const p = barPlan({ bpm: 120, beats: 4, beatStates: [2, 1, 1, 1], subdivision: 1 }, SR);
  assert.equal(p.barSamples, 2 * SR);
  close(p.beatDur, 0.5);
  assert.deepEqual(p.clicks.map((c) => [c.t, c.kind, c.beat]), [[0, "accent", 0], [0.5, "beat", 1], [1, "beat", 2], [1.5, "beat", 3]]);
});

test("barPlan: subdivisions sit under the beat; a muted beat mutes its subdivisions; clamps hold", () => {
  const p = barPlan({ bpm: 60, beats: 3, beatStates: [2, 0, 1], subdivision: 3 }, SR);
  assert.equal(p.clicks.length, 6, "beat 2 muted with its two triplet ticks");
  assert.deepEqual(p.clicks.filter((c) => c.beat === 0).map((c) => c.kind), ["accent", "sub", "sub"]);
  close(p.clicks[1].t, 1 / 3);
  close(p.clicks[2].t, 2 / 3);
  assert.deepEqual(p.clicks.filter((c) => c.beat === 2).map((c) => c.t.toFixed(4)), ["2.0000", "2.3333", "2.6667"]);
  const q = barPlan({ bpm: 900, beats: 40, beatStates: [], subdivision: 9 }, SR);
  assert.equal(q.bpm, 300); assert.equal(q.beats, 12); assert.equal(q.subdivision, 4);
  assert.equal(q.clicks.filter((c) => c.kind === "beat").length, 12, "missing beatStates read as normal");
});

test("barPlan: an awkward tempo rounds the bar to a whole sample, ≤ half a sample off, and the beats divide it evenly", () => {
  const p = barPlan({ bpm: 97, beats: 4, beatStates: [2, 1, 1, 1], subdivision: 1 }, 44100);
  const exact = (4 * 60 / 97) * 44100; // 109154.639…
  assert.equal(p.barSamples, Math.round(exact));
  assert.ok(Math.abs(p.barSamples - exact) <= 0.5);
  assert.ok(Math.abs(p.barDur - 4 * 60 / 97) < 0.5 / 44100, "under ~11 µs per bar");
  close(p.clicks[3].t, 3 * p.beatDur);
  close(p.beatDur * 4, p.barDur, 1e-12);
});

test("fold: the tail past the bar end lands on the bar start; the output is exactly one bar", () => {
  const bar = 10;
  const data = new Float32Array(14);
  data[0] = 1; data[9] = 0.5; data[10] = 0.25; data[11] = 0.125; data[13] = 0.0625;
  const out = fold(data, bar);
  assert.equal(out.length, bar);
  close(out[0], 1.25); close(out[1], 0.125); close(out[3], 0.0625); close(out[9], 0.5);
  assert.ok(TAIL_S >= 0.12, "longer than the longest voice decay");
  const short = fold(new Float32Array([1, 2, 3]), 3);
  assert.deepEqual([...short], [1, 2, 3], "no tail is fine");
});

test("signature: changes that alter the bar change it; volume does not", () => {
  const s = { bpm: 96, beats: 4, beatStates: [2, 1, 1, 1], subdivision: 1, voice: "wood", volume: 0.8 };
  const a = signature(s);
  assert.equal(signature({ ...s, volume: 0.2 }), a);
  assert.notEqual(signature({ ...s, bpm: 97 }), a);
  assert.notEqual(signature({ ...s, beatStates: [2, 1, 0, 1] }), a);
  assert.notEqual(signature({ ...s, voice: "tick" }), a);
  assert.equal(signature({ ...s, beatStates: [2, 1, 1, 1, 2] }), a, "states past the meter don't count");
});

test("nextBeatBoundary + swapOffset: a swap lands on the next beat and continues the count", () => {
  const anchor = { time: 10, beat: 0, beats: 4, beatDur: 0.5, elapsed: 0 };
  let b = nextBeatBoundary(anchor, 11.26);
  close(b.time, 11.5); assert.equal(b.beat, 3); assert.equal(b.elapsed, 3);
  b = nextBeatBoundary(anchor, 11.5);
  close(b.time, 11.5, 1e-6); assert.equal(b.beat, 3, "exactly on a boundary takes that boundary");
  b = nextBeatBoundary(anchor, 9);
  close(b.time, 10); assert.equal(b.n, 0, "a pending anchor still in the future swaps at its own start");
  b = nextBeatBoundary({ ...anchor, beat: 2, elapsed: 7 }, 12.1);
  close(b.time, 12.5); assert.equal(b.beat, (2 + 5) % 4); assert.equal(b.elapsed, 12);
  // beat 3 of a 4-beat bar into a new 3-beat plan lands on beat 0; into a 6-beat plan on beat 3
  const p3 = barPlan({ bpm: 120, beats: 3, beatStates: [], subdivision: 1 }, SR);
  const p6 = barPlan({ bpm: 120, beats: 6, beatStates: [], subdivision: 1 }, SR);
  close(swapOffset(p3, 3), 0);
  close(swapOffset(p6, 3), 1.5);
});

test("pointerAt: beat, phase and a continuous elapsed count from the anchor", () => {
  const a = { time: 100, beat: 1, beats: 4, beatDur: 0.5, elapsed: 9 };
  let p = pointerAt(a, 100);
  assert.deepEqual(p, { beat: 1, phase: 0, beatsElapsed: 9 });
  p = pointerAt(a, 101.25);
  assert.equal(p.beat, (1 + 2) % 4); close(p.phase, 0.5); close(p.beatsElapsed, 11.5);
  p = pointerAt(a, 102);
  assert.equal(p.beat, 1, "wrapped around the bar");
  p = pointerAt(a, 99);
  assert.deepEqual(p, { beat: 1, phase: 0, beatsElapsed: 9 }, "before the anchor: hold at its start");
});
