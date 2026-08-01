// node --test tests/  — pure-module tests (no DOM): music math + layout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePitch, keyFifths, keySignatureGlyphs, staffStep, tonicTriad } from "../js/lib/music.js";
import { toMeasures, layoutMelody } from "../js/lib/staff/layout.js";

test("parsePitch", () => {
  assert.equal(parsePitch("A4").midi, 69);
  assert.equal(parsePitch("C4").midi, 60);
  assert.equal(parsePitch("F#4").midi, 66);
  assert.equal(parsePitch("Bb3").midi, 58);
  assert.equal(parsePitch("C4").diatonic, 28);
  assert.throws(() => parsePitch("H2"));
});

test("key fifths", () => {
  assert.equal(keyFifths("C", "major"), 0);
  assert.equal(keyFifths("A", "major"), 3);
  assert.equal(keyFifths("Eb", "major"), -3);
  assert.equal(keyFifths("A", "minor"), 0);
  assert.equal(keyFifths("C", "minor"), -3);
  assert.equal(keyFifths("F#", "minor"), 3);
});

test("staff steps per clef", () => {
  assert.equal(staffStep("E4", "treble"), 0);   // bottom line
  assert.equal(staffStep("B4", "treble"), 4);   // middle line
  assert.equal(staffStep("F5", "treble"), 8);   // top line
  assert.equal(staffStep("G2", "bass"), 0);
  assert.equal(staffStep("D3", "bass"), 4);
  assert.equal(staffStep("F3", "alto"), 0);
  assert.equal(staffStep("C4", "alto"), 4);     // C clef centers middle C
  assert.equal(staffStep("C4", "soprano"), 0);
});

test("key signature glyph placement (treble sharps/flats)", () => {
  const sharps = keySignatureGlyphs(3, "treble"); // A major: F# C# G#
  assert.deepEqual(sharps.map((s) => s.step), [staffStep("F5", "treble"), staffStep("C5", "treble"), staffStep("G5", "treble")]);
  const flats = keySignatureGlyphs(-2, "treble"); // Bb: Bb Eb
  assert.deepEqual(flats.map((s) => s.acc), [-1, -1]);
  assert.equal(keySignatureGlyphs(0, "treble").length, 0);
});

test("tonic triad sits below the reference pitch", () => {
  const triad = tonicTriad("C", "major", 72);
  assert.deepEqual(triad.map((m) => m % 12), [0, 4, 7]);
  assert.ok(triad[0] <= 68 && triad[0] >= 56);
  assert.deepEqual(tonicTriad("A", "minor", 69).map((m) => m % 12), [9, 0, 4]);
});

const mel = (notes, time = [4, 4]) => ({
  id: "t", clef: "treble", key: "G", mode: "major", time, tempo: 80, notes,
});

test("measure split: exact fill required", () => {
  const ok = toMeasures(mel([
    { p: "G4", d: 8 }, { p: "A4", d: 8 },
    { p: "B4", d: 16 },
  ]));
  assert.equal(ok.length, 2);
  assert.throws(() => toMeasures(mel([{ p: "G4", d: 8 }])), /incomplete/);
  assert.throws(() => toMeasures(mel([{ p: "G4", d: 12 }, { p: "A4", d: 8 }, { p: "B4", d: 12 }])), /crosses a barline/);
});

test("accidental logic: key signature + measure state", () => {
  const L = layoutMelody(mel([
    { p: "F#4", d: 4 },  // in key (G major) → no accidental
    { p: "F4", d: 4 },   // natural needed
    { p: "F4", d: 4 },   // still natural → no re-draw
    { p: "F#4", d: 4 },  // back to sharp → draw sharp
    { p: "F#4", d: 16 }, // new measure: key sig covers it → no accidental
  ]), { width: 700 });
  const accs = L.drawn.map((d) => d.accDrawn);
  assert.deepEqual(accs, [null, 0, null, 1, null]);
});

test("beams pair 8ths within a beat; no cross-beat beams", () => {
  const L = layoutMelody(mel([
    { p: "G4", d: 2 }, { p: "A4", d: 2 },  // beat 1 → beamed
    { p: "B4", d: 2 }, { p: "C5", d: 2 },  // beat 2 → beamed
    { p: "D5", d: 4 },
    { p: "E5", d: 4 },
  ]), { width: 700 });
  assert.equal(L.beams.length, 2);
  assert.ok(L.drawn[0].beamed && L.drawn[1].beamed && L.drawn[2].beamed && L.drawn[3].beamed);
  assert.ok(!L.drawn[4].beamed);
});

test("system packing wraps and never exceeds 4 measures", () => {
  const eight = [];
  for (let i = 0; i < 8; i++) eight.push({ p: "G4", d: 8 }, { p: "B4", d: 8 });
  const L = layoutMelody(mel(eight), { width: 500 });
  assert.ok(L.systems.length >= 2);
  for (const s of L.systems) assert.ok(s.measures.length <= 4);
  // every drawn coordinate is finite and inside the canvas
  for (const d of L.drawn) {
    assert.ok(Number.isFinite(d.x) && d.x > 0 && d.x * L.S < 500);
    assert.ok(Number.isFinite(d.y));
  }
});

test("stems: direction by middle line, tied + dotted survive layout", () => {
  const L = layoutMelody(mel([
    { p: "C4", d: 6 }, { p: "D4", d: 2 }, { p: "C5", d: 8, tie: true },
    { p: "C5", d: 4 }, { p: "G4", d: 4 }, { r: true, d: 8 },
  ]), { width: 700 });
  const [low, , high] = L.drawn;
  assert.equal(low.stem, "up");
  assert.equal(high.stem, "down");
  assert.equal(L.ties.length, 1);
  assert.ok(low.dot);
  assert.ok(L.drawn[5].rest);
});
