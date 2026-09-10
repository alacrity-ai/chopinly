import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, decode, simplify, hit, travel, bytes, SCALE, PEN_W, HI_W, MIN_TRAVEL, COLORS } from "../js/lib/scores/ink.js";
import { bodyCap, KINDS } from "../js/lib/merge.js";
import { createLogbook } from "../js/lib/logbook.js";

const line = (n, x0 = 0.1, y0 = 0.2, dx = 0.004, dy = 0.001) => Array.from({ length: n }, (_, i) => ({ x: x0 + i * dx, y: y0 + i * dy, p: 0.3 + (i % 5) * 0.1 }));

test("encode / decode round-trip within quantisation; ints only; delta-encoded", () => {
  const strokes = [{ t: "pen", c: 2, w: PEN_W, pts: line(20) }, { t: "hi", c: 1, w: HI_W, pts: [{ x: 0.5, y: 0.5, p: 1 }, { x: 0.6, y: 0.5, p: 1 }] }];
  const body = encode(strokes);
  assert.equal(body.v, 1);
  assert.equal(body.s.length, 2);
  for (const st of body.s) for (const v of st.p) assert.ok(Number.isInteger(v));
  assert.deepEqual(body.s[0].p.slice(0, 3), [1000, 2000, Math.round(0.3 * 255)]);
  assert.equal(body.s[0].p[3], 40, "second point is a delta of 0.004 * 10000");
  const back = decode(body);
  assert.equal(back.length, 2);
  back[0].pts.forEach((pt, i) => { assert.ok(Math.abs(pt.x - strokes[0].pts[i].x) <= 1 / SCALE); assert.ok(Math.abs(pt.p - strokes[0].pts[i].p) <= 1 / 255); });
  assert.equal(back[1].t, "hi"); assert.equal(back[1].c, 1); assert.equal(back[1].w, HI_W);
  assert.deepEqual(decode(null), []);
  assert.deepEqual(decode({ s: [{ p: [1] }] }), [], "a stroke needs a whole point");
  assert.equal(encode([{ t: "pen", c: 9, w: 0.2, pts: [{ x: 2, y: -1 }] }]).s[0].c, COLORS.length - 1, "colour clamped");
});

test("simplify keeps ends and corners, drops the straight middle; travel; tap threshold", () => {
  const straight = line(50);
  const s1 = simplify(straight, 2 / SCALE);
  assert.equal(s1.length, 2, "a straight line is two points");
  const corner = [...line(10), ...line(10, 0.136, 0.209, 0, 0.004)];
  const s2 = simplify(corner, 2 / SCALE);
  assert.ok(s2.length >= 3 && s2.length <= 5, "the corner survives: " + s2.length);
  assert.deepEqual(s2[0], corner[0]); assert.deepEqual(s2[s2.length - 1], corner[corner.length - 1]);
  assert.equal(simplify([{ x: 0, y: 0 }]).length, 1);
  assert.ok(travel(line(2)) * SCALE < MIN_TRAVEL, "two close points are a tap");
  assert.ok(travel(line(20)) * SCALE > MIN_TRAVEL);
});

test("hit: the first stroke within r of the point, segments not just vertices", () => {
  const strokes = [{ t: "pen", c: 0, w: PEN_W, pts: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }] }, { t: "pen", c: 0, w: PEN_W, pts: [{ x: 0.3, y: 0.4 }] }];
  assert.equal(hit(strokes, 0.3, 0.102, 0.01), 0, "mid-segment");
  assert.equal(hit(strokes, 0.3, 0.405, 0.01), 1, "a dot");
  assert.equal(hit(strokes, 0.9, 0.9, 0.01), -1);
});

test("a dense page stays under the ink cap; the cap is per kind and the logbook enforces it", () => {
  assert.ok(KINDS.includes("ink"));
  assert.equal(bodyCap("ink"), 131072);
  assert.equal(bodyCap("note"), 8192);
  const dense = Array.from({ length: 150 }, (_, i) => ({ t: i % 7 ? "pen" : "hi", c: i % 3, w: i % 7 ? PEN_W : HI_W, pts: simplify(line(60, 0.05 + (i % 10) * 0.09, 0.05 + Math.floor(i / 10) * 0.06, 0.0013, 0.0007 * ((i % 2) ? 1 : -1)), 1 / SCALE) }));
  const body = encode(dense);
  assert.ok(bytes(body) < bodyCap("ink"), `dense page is ${bytes(body)} bytes`);
  assert.ok(bytes(encode([{ t: "pen", c: 0, w: PEN_W, pts: simplify(line(30), 1 / SCALE) }])) < 200, "a fingering is a few hundred bytes at most");

  const store = (() => { const m = new Map(); return { get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), set: (k, v) => m.set(k, JSON.stringify(v)) }; })();
  let t = 1000; const lb = createLogbook({ store, now: () => t });
  const sc = lb.addScore({ title: "A", pages: 3 });
  const ent = lb.setInk(sc.id, 2, body);
  assert.equal(ent.id, `${sc.id}:2`); assert.equal(ent.page, 2); assert.equal(ent.s.length, 150);
  assert.deepEqual(lb.inkPages(sc.id), [2]);
  assert.ok(lb.doc.pending.includes(`ink:${sc.id}:2`));
  const env = lb.pendingEnvelopes().find((e) => e.kind === "ink");
  assert.equal(env.id, `${sc.id}:2`, "ids with a colon survive the pending key");
  assert.ok(JSON.stringify(env.body).length > 8192 && JSON.stringify(env.body).length < 131072, "over the default cap, under the ink cap");
  assert.throws(() => lb.setInk(sc.id, 3, encode(Array.from({ length: 4000 }, () => ({ t: "pen", c: 0, w: PEN_W, pts: line(40) })))), /too much ink/);
  assert.equal(lb.inkFor(sc.id, 3), null, "nothing kept for the refused page");
  t++; lb.setInk(sc.id, 2, { v: 1, s: [] });
  assert.equal(lb.inkFor(sc.id, 2), null, "an empty body removes the entity");
  assert.ok(lb.doc.deleted.some((d) => d.kind === "ink" && d.id === `${sc.id}:2`), "tombstoned");
  t++; lb.setInk(sc.id, 1, body);
  lb.removeScore(sc.id);
  assert.equal(lb.doc.ink.length, 0, "removing the score removes its ink");
  assert.ok(lb.doc.deleted.some((d) => d.kind === "ink" && d.id === `${sc.id}:1`));
});
