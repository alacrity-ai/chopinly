// Gesture v2 — the chevrons (docs/COMPOSE_DESIGN.md §8.5k, WSHED-131; four ways since v114, WSHED-152): the recogniser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chevron } from "../js/lib/compose/gesture.js";

const up = (cx, cy, w = 3, h = 2.5) => [{ x: cx - w, y: cy + h }, { x: cx - w / 2, y: cy }, { x: cx, y: cy - h }, { x: cx + w / 2, y: cy }, { x: cx + w, y: cy + h }];
const down = (cx, cy, w = 3, h = 2.5) => up(cx, cy, w, h).map((p) => ({ x: p.x, y: 2 * cy - p.y }));

test("∧ is up, ∨ is down, in either drawing direction", () => {
  assert.equal(chevron(up(10, 10)), "up");
  assert.equal(chevron(down(10, 10)), "down");
  assert.equal(chevron(up(10, 10).reverse()), "up");
  assert.equal(chevron(down(10, 10).reverse()), "down");
});

test("a wobbly hand still draws a chevron; a tiny one does not", () => {
  const w = up(10, 10).map((p, i) => ({ x: p.x + (i % 2 ? 0.15 : -0.1), y: p.y + (i % 2 ? -0.12 : 0.1) }));
  assert.equal(chevron(w), "up");
  assert.equal(chevron(up(10, 10, 0.9, 0.8)), null);
});

test("a line, a loop, a lopsided or a flat stroke is not a chevron", () => {
  assert.equal(chevron([{ x: 0, y: 10 }, { x: 5, y: 10.1 }, { x: 10, y: 10 }]), null); // a line
  assert.equal(chevron([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0.3 }]), null); // a loop
  assert.equal(chevron([{ x: 0, y: 10 }, { x: 4, y: 2 }, { x: 5, y: 0 }, { x: 5.4, y: 0.8 }, { x: 5.8, y: 1.6 }]), null); // one leg a stub
  assert.equal(chevron([{ x: 0, y: 10 }, { x: 5, y: 0 }, { x: 10, y: 3 }]), null); // tips not level
  assert.equal(chevron([{ x: 0, y: 10 }, { x: 5, y: 9.2 }, { x: 10, y: 10 }]), null); // too flat (an obtuse bend under 2 S)
  assert.equal(chevron([{ x: 0, y: 10 }, { x: 2, y: 8 }, { x: 4, y: 6 }, { x: 6, y: 4 }, { x: 8, y: 2 }]), null); // straight, no vertex
});

test("a hairpin-narrow chevron counts down to 20°; a bent leg does not", () => {
  assert.equal(chevron([{ x: 0, y: 10 }, { x: 1, y: 5 }, { x: 2, y: 0 }, { x: 3, y: 5 }, { x: 4, y: 10 }]), "up"); // ≈ 23°
  assert.equal(chevron([{ x: 0, y: 10 }, { x: 1, y: 3 }, { x: 4, y: 0 }, { x: 5.5, y: 5 }, { x: 8, y: 10 }]), null); // the first leg bows
});

// v114 (WSHED-152): the sideways chevrons — the same test with the axes swapped
const left = (cx, cy, w = 3, h = 2.5) => up(cy, cx, w, h).map((p) => ({ x: p.y, y: p.x })); // < : tips stacked, the vertex at the smaller x
const right = (cx, cy, w = 3, h = 2.5) => left(cx, cy, w, h).map((p) => ({ x: 2 * cx - p.x, y: p.y }));
const rot = (pts, deg, cx = 10, cy = 10) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return pts.map((p) => ({ x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c })); };

test("< is left and > is right, in either drawing direction; a wobbly one still counts, a tiny one does not", () => {
  assert.equal(chevron(left(10, 10)), "left");
  assert.equal(chevron(right(10, 10)), "right");
  assert.equal(chevron(left(10, 10).reverse()), "left");
  assert.equal(chevron(right(10, 10).reverse()), "right");
  const w = right(10, 10).map((p, i) => ({ x: p.x + (i % 2 ? 0.15 : -0.1), y: p.y + (i % 2 ? -0.12 : 0.1) }));
  assert.equal(chevron(w), "right");
  assert.equal(chevron(left(10, 10, 0.9, 0.8)), null);
});

test("an ∧ turned through a full circle is up, then right, then down, then left, or nothing in between — never two shapes at once", () => {
  const seen = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const got = chevron(rot(up(10, 10), deg));
    // y grows downward on the page, so a positive turn is clockwise: ∧ → > → ∨ → <
    const want = deg < 45 || deg > 315 ? "up" : deg < 135 ? "right" : deg < 225 ? "down" : "left";
    if (got !== null) assert.equal(got, want, `${deg}°`);
    seen.push(got);
  }
  for (const d of ["up", "right", "down", "left"]) assert.ok(seen.includes(d), d);
  assert.equal(seen[0], "up"); assert.equal(seen[18], "right"); assert.equal(seen[36], "down"); assert.equal(seen[54], "left");
  assert.equal(chevron(rot(up(10, 10), 45)), null, "square on the diagonal is no shape"); assert.equal(chevron(rot(up(10, 10), 135)), null);
});
