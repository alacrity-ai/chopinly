import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutKeys, fitOctaves, noteName, isBlack, clampBase, velocityAt, KEYMAP, rangeFor, toMidi, autoOctaves, fitBox } from "../js/lib/keyboard/layout.js";

test("a player starts on fat keys: one octave on a phone, three on a desk", () => {
  assert.equal(autoOctaves(388), 1);
  assert.equal(autoOctaves(960), 3);
  assert.equal(autoOctaves(2000), 4);
});

test("fitBox: fills the width in portrait, goes stubby then narrow on a short screen, never overflows", () => {
  const tall = fitBox(8, 370, 600);      // phone portrait, one octave
  assert.ok(Math.abs(tall.white - 370 / 8) < 1e-9 && tall.ratio === 5.2);
  const two = fitBox(15, 370, 600);
  assert.ok(two.white * 15 <= 370 + 1e-9 && two.white * two.ratio <= 600);
  const side = fitBox(29, 830, 150);     // phone landscape, four octaves: 28.6 px keys at full ratio still fit 150 px
  assert.ok(side.white * 29 <= 830 + 1e-9 && side.white * side.ratio <= 150 + 1e-9);
  assert.equal(side.ratio, 5.2);
  const squat = fitBox(29, 830, 80);     // a very short box: stubby to the floor, then narrower
  assert.equal(squat.ratio, 3.2, "as stubby as allowed before narrowing");
  assert.ok(squat.white * 29 <= 830 + 1e-9, "not past the edge");
  assert.ok(Math.abs(squat.white * squat.ratio - 80) < 1e-9, "not under the controls");
  const desk = fitBox(29, 1100, 700);
  assert.equal(desk.white, 1100 / 29);
  const huge = fitBox(8, 3000, 3000);
  assert.equal(huge.white, 64, "keys stop growing at 64 px");
});

test("sub-ranges: C4–E4 is three whites and two blacks; names work as bounds", () => {
  const lay = layoutKeys("C4", "E4");
  assert.deepEqual(lay.keys.map((k) => k.name), ["C4", "C♯4", "D4", "D♯4", "E4"]);
  assert.equal(lay.whites, 3);
  assert.equal(layoutKeys("F3", "B3").whites, 4);
  assert.equal(layoutKeys("A0", "C8").whites, 52, "the whole piano");
  assert.equal(layoutKeys(60, 72).whites, 8, "one octave, top C included");
  assert.equal(layoutKeys("C2", "C6").whites, 29, "four octaves");
  assert.equal(toMidi("Bb2"), 46);
  assert.equal(toMidi(61), 61);
});

test("two octaves C4–C6: 15 whites, 10 blacks, positions in white-key units", () => {
  const lay = layoutKeys(60, 84);
  assert.equal(lay.whites, 15);
  assert.equal(lay.keys.length, 25);
  assert.equal(lay.keys.filter((k) => k.black).length, 10);
  const c4 = lay.keys.find((k) => k.midi === 60), cs4 = lay.keys.find((k) => k.midi === 61), d4 = lay.keys.find((k) => k.midi === 62);
  assert.deepEqual([c4.x, c4.w], [0, 1]);
  assert.deepEqual([d4.x, d4.w], [1, 1]);
  assert.equal(cs4.w, 0.6);
  assert.ok(cs4.x > 0.5 && cs4.x + cs4.w < 1.3, "C♯ straddles the C|D boundary, leaning left");
  const top = lay.keys.at(-1);
  assert.deepEqual([top.midi, top.x], [84, 14]);
});

test("a range that starts or ends on a black key snaps outward to white keys", () => {
  const lay = layoutKeys(61, 70);
  assert.equal(lay.from, 60);
  assert.equal(lay.to, 71);
  assert.equal(lay.whites, 7);
});

test("names + black keys", () => {
  assert.equal(noteName(60), "C4");
  assert.equal(noteName(61), "C♯4");
  assert.equal(noteName(59), "B3");
  assert.equal(noteName(61, { octave: false }), "C♯");
  assert.ok(isBlack(61) && !isBlack(60) && isBlack(70) && !isBlack(71));
});

test("octaves that fit a width: a phone gets two, a desk four, never fewer than one", () => {
  assert.equal(fitOctaves(420), 2);
  assert.equal(fitOctaves(1280), 4);
  assert.equal(fitOctaves(120), 1);
  assert.equal(fitOctaves(640), 3);
});

test("base C stays on the 88 keys", () => {
  assert.equal(clampBase(60, 2), 60);
  assert.equal(clampBase(12, 2), 24);
  assert.equal(clampBase(108, 2), 84);
  assert.equal(clampBase(67, 1), 60, "a non-C base rounds down to its C");
  assert.deepEqual(rangeFor(48, 3), { from: 48, to: 84 });
});

test("velocity from strike position + the DAW key map", () => {
  assert.equal(velocityAt(0), 0.55);
  assert.equal(velocityAt(1), 1);
  assert.equal(velocityAt(2), 1);
  assert.equal(KEYMAP.a, 0);
  assert.equal(KEYMAP.k, 12);
  assert.equal(KEYMAP.w, 1);
});
