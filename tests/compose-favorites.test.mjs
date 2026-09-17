// Favorites (docs/COMPOSE_DESIGN.md §8.5o, WSHED-148): the pure model — identities, the seed, the stored shape, assign / clear / turn, what may be a favorite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGES, SLOTS, SEED, keyOf, sameKey, allowed, normalize, assign, clear, turn } from "../js/lib/compose/favorites.js";

test("a key is the button's act and data-* as strings, data-pop left out; two keys match only entry for entry", () => {
  assert.deepEqual(keyOf({ act: "acc", alter: "1" }), { act: "acc", alter: "1" });
  assert.deepEqual(keyOf({ alter: 1, act: "acc" }), { act: "acc", alter: "1" }); // numbers become strings, order does not matter
  assert.deepEqual(keyOf({ act: "tuplet" }), { act: "tuplet" });
  assert.deepEqual(keyOf({ act: "voice", v: "2", pop: "cp-voice-more" }), { act: "voice", v: "2" });
  assert.equal(keyOf({ pop: "cp-file-more" }), null, "a menu opener has no act");
  assert.equal(keyOf({}), null);
  assert.ok(sameKey({ act: "tuplet" }, { act: "tuplet" }));
  assert.ok(!sameKey({ act: "tuplet" }, { act: "tuplet", n: "5" }), "the plain tuplet button is not the quintuplet row");
  assert.ok(!sameKey({ act: "dyn", dyn: "mp" }, { act: "dyn", dyn: "mf" }));
  assert.ok(!sameKey(null, { act: "dot" }));
});

test("only an action on a palette rail may be a favorite: the header, control and transport rails, menu openers, rail toggles and the text box's set are refused", () => {
  for (const [act, rail] of [["acc", "palette"], ["dyn", "expression"], ["barline", "form"], ["pedal", "piano"], ["grace", "notes2"], ["key", "utility"], ["voice", "palette"], ["text", "expression"]]) assert.ok(allowed({ act, rail }), `${act} on ${rail}`);
  for (const [act, rail] of [["undo", "control"], ["gesture", "control"], ["favorites", "control"], ["zoom-in", "control"], ["play", "transport"], ["tempo", "transport"], ["back", "header"], ["details", "header"], ["export-pdf", "header"]]) assert.ok(!allowed({ act, rail }), `${act} on ${rail}`);
  assert.ok(!allowed({ act: "text-set", rail: "expression" }), "set needs the typed words");
  assert.ok(!allowed({ act: "rail", rail: "header" }));
  assert.ok(!allowed({ act: "voice", rail: "palette", pop: true }), "a menu opener");
  assert.ok(!allowed({ act: "", rail: "palette" }) && !allowed({}));
});

test("a fresh device gets the seed on page 1 and seven empty pages; a broken store falls back to it; a good store survives with bad slots emptied", () => {
  const s = normalize(null);
  assert.equal(s.pages.length, PAGES); assert.ok(s.pages.every((p) => p.length === SLOTS));
  assert.deepEqual(s.pages[0], [...SEED]);
  assert.deepEqual(s.pages[0].map((k) => k.act), ["acc", "acc", "acc", "dot", "tie", "tuplet"]);
  assert.ok(s.pages.slice(1).every((p) => p.every((k) => k === null)));
  assert.equal(s.page, 0); assert.equal(s.pos, null); assert.equal(s.on, false);
  assert.deepEqual(normalize({ pages: "no", page: 99, pos: { x: "a" }, on: "yes" }), { pages: s.pages, page: 0, pos: null, on: false });
  const good = { pages: s.pages.map((p, i) => (i === 3 ? [{ act: "dyn", dyn: "mp" }, { act: 7 }, "x", null, null, { act: "hairpin", kind: "cresc", niente: "1" }] : p)), page: 3, pos: { x: 40.5, y: 120 }, on: true };
  const n = normalize(good);
  assert.deepEqual(n.pages[3], [{ act: "dyn", dyn: "mp" }, null, null, null, null, { act: "hairpin", kind: "cresc", niente: "1" }]);
  assert.equal(n.page, 3); assert.deepEqual(n.pos, { x: 40.5, y: 120 }); assert.equal(n.on, true);
  assert.notEqual(n.pages, good.pages, "a copy, not the stored object");
});

test("assign fills one slot and nothing else, clear empties it, a bad key or an out-of-range slot changes nothing, and the state is never mutated", () => {
  const s0 = normalize(null);
  const s1 = assign(s0, 1, 4, { act: "dyn", dyn: "mp" });
  assert.deepEqual(s1.pages[1][4], { act: "dyn", dyn: "mp" });
  assert.deepEqual(s0.pages[1][4], null, "the old state is untouched");
  assert.deepEqual(s1.pages[0], s0.pages[0]); assert.equal(s1.pages[1].filter(Boolean).length, 1);
  assert.equal(assign(s1, 1, 4, { act: 5 }), s1); assert.equal(assign(s1, 8, 0, { act: "dot" }), s1); assert.equal(assign(s1, 0, 6, { act: "dot" }), s1); assert.equal(assign(s1, 0, -1, { act: "dot" }), s1);
  const s2 = assign(s1, 0, 0, { act: "dyn", dyn: "mp" }); // the same button may sit in two slots
  assert.deepEqual(s2.pages[0][0], { act: "dyn", dyn: "mp" }); assert.deepEqual(s2.pages[1][4], { act: "dyn", dyn: "mp" });
  const s3 = clear(s2, 1, 4);
  assert.equal(s3.pages[1][4], null); assert.deepEqual(s2.pages[1][4], { act: "dyn", dyn: "mp" });
  assert.equal(clear(s3, 9, 0), s3);
});

test("turn steps one page and stops at the ends", () => {
  let s = normalize(null);
  assert.equal(turn(s, -1).page, 0, "no wrap backwards");
  s = turn(s, 1); assert.equal(s.page, 1);
  for (let i = 0; i < 20; i++) s = turn(s, 1);
  assert.equal(s.page, PAGES - 1, "no wrap forwards");
  assert.equal(turn(s, -1).page, PAGES - 2);
});
