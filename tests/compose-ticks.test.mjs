import { test } from "node:test";
import assert from "node:assert/strict";
import { ticks, capacity, beatGroups, groupSize, splitRest, fromTicks, WHOLE, PPQ } from "../js/lib/compose/ticks.js";

test("every palette duration is an integer number of ticks (dots 0–2, tuplets 2/3/5/6/7 down to the 32nd)", () => {
  for (const base of [0, 1, 2, 4, 8, 16, 32, 64]) for (const dots of [0, 1, 2]) {
    assert.ok(Number.isInteger(ticks({ base, dots })));
    for (const n of [2, 3, 5, 6, 7]) {
      const inn = n === 2 ? 3 : n === 3 ? 2 : 4;
      if (n === 2 && dots === 2 && base === 64) { assert.throws(() => ticks({ base, dots, tuplet: { n, in: inn } })); continue; } // the one combination that is not an integer: the engine refuses it
      assert.ok(Number.isInteger(ticks({ base, dots, tuplet: { n, in: inn } })), `${base}.${dots} ${n}:${inn}`);
    }
  }
  assert.equal(PPQ, 6720);
  assert.equal(ticks({ base: 4 }), PPQ);
  assert.equal(ticks({ base: 1 }), WHOLE);
  assert.equal(ticks({ base: 8, dots: 1 }), PPQ * 0.75);
  assert.equal(ticks({ base: 8, tuplet: { n: 3, in: 2 } }), PPQ / 3);
  assert.equal(ticks({ base: 16, tuplet: { n: 7, in: 4 } }), PPQ / 7);
  assert.equal(ticks({ base: 0 }), 2 * WHOLE);
});

test("capacities and beat groups for common metres", () => {
  const Q = PPQ;
  assert.equal(capacity({ beats: 4, unit: 4 }), 4 * Q);
  assert.equal(capacity({ beats: 3, unit: 4 }), 3 * Q);
  assert.equal(capacity({ beats: 6, unit: 8 }), 3 * Q);
  assert.equal(capacity({ beats: 2, unit: 2 }), 4 * Q);
  assert.equal(capacity({ beats: 5, unit: 4 }), 5 * Q);
  assert.equal(groupSize({ beats: 4, unit: 4 }), Q);
  assert.equal(groupSize({ beats: 6, unit: 8 }), 1.5 * Q);
  assert.equal(groupSize({ beats: 2, unit: 2 }), 2 * Q);
  assert.equal(groupSize({ beats: 3, unit: 8 }), Q / 2);
  assert.deepEqual(beatGroups({ beats: 6, unit: 8 }), [0, 1.5 * Q, 3 * Q]);
  assert.deepEqual(beatGroups({ beats: 4, unit: 4 }), [0, Q, 2 * Q, 3 * Q, 4 * Q]);
});

test("splitRest: standard rests, aligned to their own size, longest first; compound metres keep rests inside the dotted group; a full bar is the metre's own split (the layout draws it as one whole-bar rest)", () => {
  const Q = PPQ, t44 = { beats: 4, unit: 4 }, t34 = { beats: 3, unit: 4 }, t68 = { beats: 6, unit: 8 };
  assert.deepEqual(splitRest(4 * Q, 0, t44), [{ base: 1, dots: 0 }]);
  assert.deepEqual(splitRest(3 * Q, 0, t34), [{ base: 2, dots: 1 }]); // drawn as a whole-bar rest by the layout; stored as one value that spans the bar so it adds up
  assert.deepEqual(splitRest(3 * Q, 0, t68), [{ base: 2, dots: 1 }]);
  // a quarter on beat 1 leaves quarter + half (the half rest sits on beat 3, where it is aligned)
  assert.deepEqual(splitRest(3 * Q, Q, t44), [{ base: 4, dots: 0 }, { base: 2, dots: 0 }]);
  // beats 3–4 empty → one half rest; beats 2–3 empty → two quarter rests (a half rest may not start on beat 2)
  assert.deepEqual(splitRest(2 * Q, 2 * Q, t44), [{ base: 2, dots: 0 }]);
  assert.deepEqual(splitRest(2 * Q, Q, t44), [{ base: 4, dots: 0 }, { base: 4, dots: 0 }]);
  // an eighth on the "and" of 1: gap 0..½ → eighth rest; gap from the "and" of 1 to the end of beat 2 → eighth, quarter
  assert.deepEqual(splitRest(Q / 2, 0, t44), [{ base: 8, dots: 0 }]);
  assert.deepEqual(splitRest(1.5 * Q, Q / 2, t44), [{ base: 8, dots: 0 }, { base: 4, dots: 0 }]);
  // 6/8: a dotted-quarter gap at 0 → one dotted quarter rest; an eighth on beat 1 → quarter rest, then a dotted quarter
  assert.deepEqual(splitRest(1.5 * Q, 0, t68), [{ base: 4, dots: 1 }]);
  assert.deepEqual(splitRest(2.5 * Q, Q / 2, t68), [{ base: 4, dots: 0 }, { base: 4, dots: 1 }]);
  // every gap in a 4/4 bar at every sixteenth adds up, every rest is aligned to its size, and no rest straddles the half-bar
  for (let at = 0; at < 4 * Q; at += Q / 4) for (let len = Q / 4; at + len <= 4 * Q; len += Q / 4) {
    const parts = splitRest(len, at, t44);
    let pos = at;
    for (const p of parts) {
      const d = ticks(p);
      if (!(at === 0 && len === 4 * Q)) { assert.equal(pos % d, 0, `unaligned ${d} at ${pos}`); assert.ok(pos < 2 * Q ? pos + d <= 2 * Q : true, `straddles the half-bar at ${pos}`); }
      pos += d;
    }
    assert.equal(pos, at + len);
  }
});

test("fromTicks round-trips plain and dotted values", () => {
  for (const base of [1, 2, 4, 8, 16, 32, 64]) assert.deepEqual(fromTicks(ticks({ base })), { base, dots: 0 });
  for (const base of [1, 2, 4, 8, 16, 32]) assert.deepEqual(fromTicks(ticks({ base, dots: 1 })), { base, dots: 1 });
  assert.equal(fromTicks(320), null);
});
