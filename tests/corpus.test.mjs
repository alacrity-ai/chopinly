import { test } from "node:test";
import assert from "node:assert/strict";
import { MELODIES, byId, pool, validateCorpus, dealSet } from "../js/tools/sightsinging/melodies.js";
import { BOOKS, LESSONS, starsFor } from "../js/tools/sightsinging/corpus/campaign.js";

test("corpus validates and is 108 strong", () => {
  validateCorpus();
  assert.equal(MELODIES.length, 108);
});

test("campaign table: 5 books × 6 lessons × 3 melodies, all ids resolve, no reuse", () => {
  assert.equal(BOOKS.length, 5);
  const seen = new Set();
  for (const b of BOOKS) {
    assert.equal(b.lessons.length, 6, `${b.id} lesson count`);
    for (const l of b.lessons) {
      assert.equal(l.melodies.length, 3, `${l.id} melody count`);
      for (const id of l.melodies) {
        assert.ok(byId.has(id), `${l.id} references unknown melody ${id}`);
        assert.ok(!seen.has(id), `${id} appears in two lessons`);
        seen.add(id);
      }
    }
  }
  assert.equal(seen.size, 90);
  assert.equal(LESSONS.length, 30);
});

test("campaign difficulty tags match the book plan", () => {
  const want = { b1: 1, b2: 1, b3: 2, b4: 2, b5: 3 };
  for (const b of BOOKS) {
    for (const l of b.lessons) {
      for (const id of l.melodies) {
        assert.equal(byId.get(id).difficulty, want[b.id], `${id} difficulty`);
      }
    }
  }
});

test("tempos genuinely vary: within lessons, per book, and across the span", () => {
  for (const b of BOOKS) {
    const tempos = new Set();
    for (const l of b.lessons) {
      const ts = l.melodies.map((id) => byId.get(id).tempo);
      ts.forEach((t) => tempos.add(t));
      const sorted = [...ts].sort((a, b2) => a - b2);
      for (let i = 1; i < sorted.length; i++) {
        assert.ok(sorted[i] - sorted[i - 1] >= 10, `${l.id}: tempos ${ts.join(",")} closer than 10bpm`);
      }
    }
    assert.ok(tempos.size >= 8, `${b.id}: only ${tempos.size} distinct tempos`);
  }
  const all = MELODIES.map((m) => m.tempo);
  assert.ok(Math.min(...all) <= 60 && Math.max(...all) >= 116, "corpus should span slow to fast");
});

test("every book-5 clef appears; bass owns book 3", () => {
  const b5clefs = new Set(BOOKS[4].lessons.flatMap((l) => l.melodies.map((id) => byId.get(id).clef)));
  assert.ok(b5clefs.has("alto") && b5clefs.has("soprano"), "book 5 teaches C clefs");
  for (const l of BOOKS[2].lessons) {
    for (const id of l.melodies) assert.equal(byId.get(id).clef, "bass", `${id} should be bass`);
  }
});

test("pool filters by difficulty and clef; dealSet deals distinct", () => {
  assert.ok(pool({ difficulty: 1 }).every((m) => m.difficulty === 1));
  assert.ok(pool({ clefs: ["bass"] }).every((m) => m.clef === "bass"));
  assert.ok(pool({ clefs: ["bass"] }).length >= 20);
  const set = dealSet(10, { difficulty: 2 });
  assert.equal(new Set(set.map((m) => m.id)).size, 10);
  assert.ok(set.every((m) => m.difficulty === 2));
});

test("starsFor thresholds", () => {
  assert.equal(starsFor(69), 0);
  assert.equal(starsFor(70), 1);
  assert.equal(starsFor(85), 2);
  assert.equal(starsFor(95), 3);
  assert.equal(starsFor(100), 3);
});
