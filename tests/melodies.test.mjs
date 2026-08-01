import { test } from "node:test";
import assert from "node:assert/strict";
import { MELODIES, validateCorpus, toTimeline, deal } from "../js/tools/sightsinging/melodies.js";
import { layoutMelody } from "../js/lib/staff/layout.js";

test("corpus validates and lays out", () => {
  assert.ok(MELODIES.length >= 16);
  validateCorpus();
  for (const m of MELODIES) {
    for (const width of [340, 700]) {
      const L = layoutMelody(m, { width });
      assert.ok(L.drawn.length === m.notes.length, `${m.id}: drawn count`);
      for (const d of L.drawn) assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y), `${m.id}: coords`);
    }
  }
});

test("corpus coverage: clefs, keys, features", () => {
  const clefs = new Set(MELODIES.map((m) => m.clef));
  assert.deepEqual([...clefs].sort(), ["alto", "bass", "soprano", "treble"]);
  assert.ok(MELODIES.some((m) => ["F", "Bb", "Eb"].includes(m.key) && m.mode === "major"), "flat keys");
  assert.ok(MELODIES.some((m) => ["G", "D", "A", "B", "F#"].includes(m.key)), "sharp keys");
  assert.ok(MELODIES.some((m) => m.mode === "minor"), "minor");
  assert.ok(MELODIES.some((m) => m.notes.some((n) => n.tie)), "ties");
  assert.ok(MELODIES.some((m) => m.notes.some((n) => n.r)), "rests");
  const durs = new Set(MELODIES.flatMap((m) => m.notes.map((n) => n.d)));
  for (const d of [2, 4, 6, 8, 12, 16]) assert.ok(durs.has(d), `duration ${d} used`);
  for (const diff of [1, 2, 3]) assert.ok(MELODIES.some((m) => m.difficulty === diff));
});

test("validator rejects malformed melodies", () => {
  const bad = { id: "bad", clef: "treble", key: "C", mode: "major", time: [4, 4], tempo: 80,
    notes: [{ p: "C4", d: 8 }] };
  assert.throws(() => validateCorpus([bad]), /incomplete/);
  const badTie = { ...bad, notes: [{ p: "C4", d: 8, tie: true }, { p: "D4", d: 8 }] };
  assert.throws(() => validateCorpus([badTie]), /tie/);
});

test("timeline merges ties, drops rests, sums durations", () => {
  const m = MELODIES.find((x) => x.id === "d3-eb-tied"); // has Bb4:8~ | Bb4:4
  const tl = toTimeline(m, 60); // 1 unit = 0.25s
  const total = m.notes.reduce((s, n) => s + n.d, 0) * 0.25;
  assert.ok(Math.abs(tl.total - total) < 1e-9);
  const tied = tl.units.find((u) => u.drawn.length === 2);
  assert.ok(tied, "tied unit exists");
  assert.ok(Math.abs((tied.t1 - tied.t0) - 12 * 0.25) < 1e-9, "tied unit spans 8+4 units");
  assert.ok(tl.units.every((u) => u.t1 > u.t0));
  const restless = m.notes.filter((n) => !n.r).length;
  assert.equal(tl.units.reduce((s, u) => s + u.drawn.length, 0), restless);
});

test("deal respects difficulty and never repeats", () => {
  for (let i = 0; i < 30; i++) {
    const m = deal(1);
    assert.equal(m.difficulty, 1);
    assert.notEqual(deal(0, m.id).id, m.id);
  }
});
