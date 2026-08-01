import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, centsOff, provisionalTier, STRICTNESS } from "../js/tools/sightsinging/judge.js";

// three notes: 0.75s, 0.5s, 1.0s
const UNITS = [
  { t0: 0, t1: 0.75, midi: 67 },
  { t0: 0.75, t1: 1.25, midi: 69 },
  { t0: 1.25, t1: 2.25, midi: 71 },
];

function sing(offsetSemis, { skipFrac = 0, only = null } = {}) {
  const samples = [];
  for (const u of UNITS) {
    if (only && !only.includes(u)) continue;
    const start = u.t0 + (u.t1 - u.t0) * skipFrac;
    for (let t = start + 0.02; t < u.t1; t += 0.085) {
      samples.push({ t, midi: u.midi + offsetSemis });
    }
  }
  return samples;
}
const opts = { latency: 0 };

test("centsOff folds octaves", () => {
  assert.equal(centsOff(69, 69), 0);
  assert.equal(centsOff(57, 69), 0);     // octave below
  assert.equal(centsOff(81, 69), 0);     // octave above
  assert.equal(centsOff(69.5, 69), 50);
  assert.equal(centsOff(68.5, 57), -50);
  assert.equal(Math.abs(centsOff(75, 69)), 600); // tritone folds to ±600
});

test("perfect performance → all nailed, score 100", () => {
  const v = judge(UNITS, sing(0), opts);
  assert.deepEqual(v.notes.map((n) => n.tier), ["nailed", "nailed", "nailed"]);
  assert.equal(v.score, 100);
});

test("octave-down is identical to perfect", () => {
  const v = judge(UNITS, sing(-12), opts);
  assert.deepEqual(v.notes.map((n) => n.tier), ["nailed", "nailed", "nailed"]);
});

test("consistently 80 cents flat → rough (strict ×1.0)", () => {
  const v = judge(UNITS, sing(-0.8), { ...opts, strictness: 1.0 });
  assert.deepEqual(v.notes.map((n) => n.tier), ["rough", "rough", "rough"]);
  assert.equal(v.score, 40);
});

test("way off (3 semitones) → missed", () => {
  const v = judge(UNITS, sing(3), opts);
  assert.deepEqual(v.notes.map((n) => n.tier), ["missed", "missed", "missed"]);
  assert.equal(v.score, 0);
});

test("silence → all missed, score 0", () => {
  const v = judge(UNITS, [], opts);
  assert.equal(v.score, 0);
  assert.equal(v.counts.missed, 3);
});

test("late entry drops the tier via coverage, not pitch", () => {
  const v = judge(UNITS, sing(0, { skipFrac: 0.55 }), opts);
  for (const n of v.notes) {
    assert.ok(n.tier !== "nailed", "late singing must not nail");
    assert.ok(n.precision <= 15, "pitch itself was perfect");
  }
});

test("strictness moves borderline performances", () => {
  // ladder: relaxed ×2.0 → [30, 90, 180] · standard ×1.5 → [22.5, 67.5, 135] · strict ×1.0 → [15, 45, 90]
  const flat25 = sing(-0.25);
  assert.deepEqual(judge(UNITS, flat25, { ...opts, strictness: STRICTNESS.relaxed }).notes.map((n) => n.tier),
    ["nailed", "nailed", "nailed"]);  // 25 ≤ 30
  assert.deepEqual(judge(UNITS, flat25, { ...opts, strictness: STRICTNESS.standard }).notes.map((n) => n.tier),
    ["good", "good", "good"]);        // 25 > 22.5
  const flat55 = sing(-0.55);
  assert.deepEqual(judge(UNITS, flat55, { ...opts, strictness: STRICTNESS.standard }).notes.map((n) => n.tier),
    ["good", "good", "good"]);        // 55 ≤ 67.5
  assert.deepEqual(judge(UNITS, flat55, { ...opts, strictness: STRICTNESS.strict }).notes.map((n) => n.tier),
    ["rough", "rough", "rough"]);     // 55 > 45, ≤ 90
  const flat95 = sing(-0.95);
  assert.deepEqual(judge(UNITS, flat95, { ...opts, strictness: STRICTNESS.standard }).notes.map((n) => n.tier),
    ["rough", "rough", "rough"]);     // 95 ≤ 135
  assert.deepEqual(judge(UNITS, flat95, { ...opts, strictness: STRICTNESS.strict }).notes.map((n) => n.tier),
    ["missed", "missed", "missed"]);  // 95 > 90
});

test("provisionalTier: null until evidence, then tier from precision alone", () => {
  const u = UNITS[0];
  const at = (n, off = 0) =>
    Array.from({ length: n }, (_, i) => ({ t: u.t0 + 0.08 + i * 0.085, midi: u.midi + off }));
  assert.equal(provisionalTier(u, [], opts), null);
  assert.equal(provisionalTier(u, at(1), opts), null);              // one sample isn't proof
  assert.equal(provisionalTier(u, at(2), opts), "nailed");          // hit awarded ~0.25s in
  assert.equal(provisionalTier(u, at(3, -0.8), { ...opts, strictness: STRICTNESS.strict }), "rough");
  assert.equal(provisionalTier(u, at(3, -0.25), { ...opts, strictness: STRICTNESS.standard }), "good");
  assert.equal(provisionalTier(u, at(4, 3), opts), null);           // off-pitch: not judged yet…
  assert.equal(provisionalTier(u, at(5, 3), opts), "missed");       // …missed once it's clearly wrong
});

test("provisionalTier ignores samples outside the note window", () => {
  const u = UNITS[1];
  const before = [{ t: u.t0 - 0.2, midi: u.midi }, { t: u.t0 - 0.1, midi: u.midi }];
  assert.equal(provisionalTier(u, before, opts), null);
});

test("one wrong note among right ones only hurts itself", () => {
  const samples = [...sing(0, { only: [UNITS[0], UNITS[2]] }), ...sing(4, { only: [UNITS[1]] })];
  const v = judge(UNITS, samples, opts);
  assert.equal(v.notes[0].tier, "nailed");
  assert.equal(v.notes[1].tier, "missed");
  assert.equal(v.notes[2].tier, "nailed");
});
