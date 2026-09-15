// Gesture mode v1 (docs/COMPOSE_DESIGN.md §8.5j, WSHED-130): the strike — which selected boxes a stroke crosses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { struck, isLine } from "../js/lib/compose/hit.js";

const head = (key, x, y) => ({ key, x, y, rx: 0.75, ry: 0.5 });

test("a line through three heads strikes all three and misses the one above", () => {
  const targets = [head("a:0", 2, 10), head("b:0", 5, 10), head("c:0", 8, 10), head("d:0", 5, 7)];
  const hit = struck([{ x: 0, y: 10.2 }, { x: 10, y: 9.8 }], targets);
  assert.deepEqual([...hit].sort(), ["a:0", "b:0", "c:0"]);
});

test("a stroke that passes beside a head does not strike it; a diagonal that clips a corner does", () => {
  const t = [head("a:0", 5, 10)];
  assert.equal(struck([{ x: 0, y: 11 }, { x: 10, y: 11 }], t).size, 0);
  assert.equal(struck([{ x: 4, y: 9 }, { x: 6, y: 11 }], t).size, 1);
});

test("a polyline strikes on any segment; a loop drawn around a head never crosses it", () => {
  const t = [head("a:0", 5, 10)];
  assert.equal(struck([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }], t).size, 1);
  const loop = [{ x: 2, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 13 }, { x: 2, y: 13 }, { x: 2, y: 7 }];
  assert.equal(struck(loop, t).size, 0);
});

test("a one-point stroke is a point test; an empty stroke strikes nothing; a wider box (a finger) reaches further", () => {
  const t = [head("a:0", 5, 10)];
  assert.equal(struck([{ x: 5.5, y: 10.3 }], t).size, 1);
  assert.equal(struck([], t).size, 0);
  assert.equal(struck([{ x: 0, y: 11.5 }, { x: 10, y: 11.5 }], t).size, 0);
  assert.equal(struck([{ x: 0, y: 11.5 }, { x: 10, y: 11.5 }], [{ key: "a:0", x: 5, y: 10, rx: 1.8, ry: 1.8 }]).size, 1);
});

test("a stroke is a line when it encloses next to nothing; a loop is not", () => {
  assert.equal(isLine([{ x: 0, y: 10 }, { x: 5, y: 10.2 }, { x: 10, y: 10 }]), true);
  assert.equal(isLine([{ x: 0, y: 0 }, { x: 10, y: 0 }]), true);
  assert.equal(isLine([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]), false);
  const circle = Array.from({ length: 24 }, (_, i) => ({ x: 5 + 3 * Math.cos((i / 24) * 2 * Math.PI), y: 5 + 3 * Math.sin((i / 24) * 2 * Math.PI) }));
  assert.equal(isLine(circle), false);
  assert.equal(isLine([{ x: 0, y: 10 }, { x: 3, y: 11 }, { x: 6, y: 9 }, { x: 10, y: 10 }]), true); // a wobbly line: its end is far from its start
  assert.equal(isLine([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 0.2 }]), false); // a thin loop drawn closed is still a loop
  const threeQuarters = Array.from({ length: 19 }, (_, i) => ({ x: 5 + 3 * Math.cos((i / 24) * 2 * Math.PI), y: 5 + 3 * Math.sin((i / 24) * 2 * Math.PI) }));
  assert.equal(isLine(threeQuarters), false); // an almost-closed lasso still selects
});
