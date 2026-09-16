// Bars (WSHED-132, v104): insert one before a bar, delete one, and the file's trim policy (a file
// ends at the music; storage keeps one bar to write into).
import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition, validate, isEmptyBar, DEFAULT_BARS } from "../js/lib/compose/model.js";
import { place, insertBar, deleteBar, trimBars, setKey, setTime, setClef, setEnding, setBarline, setSimile, addHairpin, addExpression, addPedal, toggleFormMark, expressionsOf, Nudge } from "../js/lib/compose/engine.js";
import { toMusicXml, fromMusicXml } from "../js/lib/compose/musicxml.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const Q = { base: 4, dots: 0, rest: false };
/** A quarter on beat 1 of bars 1–6 (the upper staff), the bar's number as its step so bars can be told apart. */
function piece() {
  let d = newComposition({ id: "bars", title: "Bars", now: 1 });
  for (let b = 0; b < 6; b++) d = place(d, { bar: b, staff: 0, ticks: 0, step: 2 + b }, Q).doc;
  return d;
}
const stepIn = (d, b) => d.measures[b].staves[0].voices[0][0].pitches?.[0] ?? null;
const bars = (d) => d.measures.map((m, b) => (isEmptyBar(m) ? "-" : String(b + 1))).join("");
const pitchOf = (d, b) => { const p = stepIn(d, b); return p ? `${p.step}${p.octave}` : "-"; };

test("insertBar: an empty bar before the tapped one, everything after moves along, one bar longer, valid", () => {
  const d = piece();
  const e = insertBar(d, 2);
  validate(e);
  assert.equal(e.measures.length, d.measures.length + 1);
  assert.ok(isEmptyBar(e.measures[2]));
  assert.equal(pitchOf(e, 3), pitchOf(d, 2)); assert.equal(pitchOf(e, 1), pitchOf(d, 1));
  assert.equal(bars(e), "12-4567--");
  const end = insertBar(d, d.measures.length); validate(end); assert.equal(end.measures.length, d.measures.length + 1);
  assert.throws(() => insertBar(d, 99), Nudge);
});

test("insertBar before bar 1: the new bar becomes bar 1 and carries the key, time and clefs; a key change later stays where it was", () => {
  let d = setKey(piece(), 3, 2);
  const e = insertBar(d, 0);
  validate(e);
  assert.deepEqual(e.measures[0].key, { fifths: 0 }); assert.deepEqual(e.measures[0].time, { beats: 4, unit: 4 }); assert.deepEqual(e.measures[0].clefs, { 0: "treble", 1: "bass" });
  assert.equal(e.measures[1].key, undefined);
  assert.deepEqual(e.measures[4].key, { fifths: 2 }, "the key change moved with its bar");
  assert.equal(pitchOf(e, 1), pitchOf(d, 0));
});

test("insertBar: a span's end and an ending's last bar move along; a two-bar repeat the new bar would split is dropped; the metre in force is the new bar's", () => {
  let d = piece();
  d = addHairpin(d, { staff: 0, bar: 1, at: 0, dir: "cresc", end: { bar: 4, at: 0 } }).doc;
  d = setEnding(d, 1, 1, 3);
  d = setTime(d, 4, { beats: 3, unit: 4 }).doc;
  const e = insertBar(d, 3);
  validate(e);
  const hp = expressionsOf(e).find((x) => x.x.kind === "hairpin");
  assert.equal(hp.bar, 1); assert.equal(hp.x.end.bar, 5, "the end moved one bar right");
  assert.equal(e.measures[1].ending.end, 4, "the ending stretches over the new bar");
  assert.deepEqual(e.measures[3].time, undefined); assert.equal(e.measures[3].staves[0].voices[0].length, 1, "4/4 in force before it: one whole-bar rest");
  assert.deepEqual(e.measures[5].time, { beats: 3, unit: 4 }, "the 3/4 change moved with its bar");
  // a two-bar repeat on bars 7–8 (empty bars after the music) split by an insert before bar 8
  let s = piece(); s = insertBar(s, 6); s = insertBar(s, 6); // bars 7–9 empty now... keep bar 8 plain: set the sign on 7
  s = setSimile(s, 6, 2);
  assert.equal(s.measures[6].simile, 2);
  const t = insertBar(s, 7); validate(t);
  assert.equal(t.measures[6].simile, undefined, "the pair was split");
});

test("deleteBar: the bar and what it carried go, later bars move up, the last bar of a piece stays, valid", () => {
  const d = piece();
  const e = deleteBar(d, 2);
  validate(e);
  assert.equal(e.measures.length, d.measures.length - 1);
  assert.equal(pitchOf(e, 2), pitchOf(d, 3)); assert.equal(bars(e), "12345--");
  let one = newComposition({ id: "one", now: 1 }); one.measures.length = 1;
  assert.throws(() => deleteBar(one, 0), /keeps one bar/);
  assert.throws(() => deleteBar(d, 42), Nudge);
});

test("deleteBar: a key, time or clef change the bar carried stays in force from the next bar; deleting bar 1 hands its signatures on", () => {
  let d = piece();
  d = setKey(d, 2, -3); d = setTime(d, 2, { beats: 3, unit: 4 }).doc; d = setClef(d, 2, 1, "tenor");
  const e = deleteBar(d, 2);
  validate(e);
  assert.deepEqual(e.measures[2].key, { fifths: -3 }); assert.deepEqual(e.measures[2].time, { beats: 3, unit: 4 }); assert.equal(e.measures[2].clefs?.[1], "tenor");
  const f = deleteBar(piece(), 0);
  validate(f);
  assert.deepEqual(f.measures[0].key, { fifths: 0 }); assert.deepEqual(f.measures[0].time, { beats: 4, unit: 4 }); assert.deepEqual(f.measures[0].clefs, { 0: "treble", 1: "bass" });
  assert.equal(pitchOf(f, 0), pitchOf(piece(), 1));
  // a clef change inside the deleted bar (on beat 3) is what is in force after it
  let g = setClef(piece(), 2, 0, "alto", 2 * PPQ);
  const h = deleteBar(g, 2); validate(h);
  assert.equal(h.measures[2].clefs?.[0], "alto");
});

test("deleteBar: spans — one starting in the bar goes, one ending in it ends at the previous bar's last slot, later ends and endings shift; marks on it go; a bar repeat pointing at it goes", () => {
  let d = piece();
  d = addHairpin(d, { staff: 0, bar: 1, at: 0, dir: "cresc", end: { bar: 3, at: PPQ } }).doc;   // ends in bar 4
  d = addPedal(d, { staff: 1, bar: 3, at: 0, end: { bar: 4, at: PPQ } }).doc;                    // starts in bar 4
  d = addHairpin(d, { staff: 1, bar: 4, at: 0, dir: "dim", end: { bar: 5, at: PPQ } }).doc;    // after it
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 3, at: 0, value: "f" }).doc;              // on it
  d = setEnding(d, 1, 1, 4); d = toggleFormMark(d, 3, { kind: "segno" }); d = setBarline(d, 3, { end: "repeat" });
  d = setSimile(d, 6, 1);
  const e = deleteBar(d, 3);
  validate(e);
  const xs = expressionsOf(e);
  const cresc = xs.find((x) => x.x.kind === "hairpin" && x.x.dir === "cresc"), dim = xs.find((x) => x.x.kind === "hairpin" && x.x.dir === "dim");
  assert.deepEqual([cresc.bar, cresc.x.end], [1, { bar: 2, at: 4 * PPQ - PPQ / 2 }], "ends at the last half-beat of bar 3");
  assert.equal(xs.some((x) => x.x.kind === "pedal"), false, "the pedal started in the deleted bar");
  assert.equal(xs.some((x) => x.x.kind === "dyn"), false, "the dynamic sat on it");
  assert.deepEqual([dim.bar, dim.x.end.bar], [3, 4], "the later hairpin moved up a bar");
  assert.equal(e.measures[1].ending.end, 3, "the ending's last bar moved up");
  assert.equal(e.measures.some((m) => m.form || m.barline), false, "the segno and the repeat went with the bar");
  assert.equal(e.measures[5].simile, 1, "a bar repeat elsewhere moves up with its bar");
  // the bar repeat right after the deleted bar pointed at it: it goes
  let r = setSimile(piece(), 6, 1); r = deleteBar(r, 5); validate(r);
  assert.equal(r.measures[5].simile, undefined, "the bar repeat that pointed at the deleted bar is gone");
  // a hairpin over one bar whose end bar is deleted and nothing is left of it goes
  let s = addHairpin(piece(), { staff: 0, bar: 2, at: 4 * PPQ - PPQ / 2, dir: "cresc", end: { bar: 3, at: 0 } }).doc;
  const t = deleteBar(s, 3); validate(t);
  assert.equal(expressionsOf(t).length, 0);
});

test("trimBars: a file ends at the music (no stray empty bar), an empty piece keeps its eight bars; storage keeps one bar to write into, never below eight", () => {
  const d = piece(); // six bars of notes in eight
  assert.equal(trimBars(d).measures.length, 6, "the PDF / MusicXML print six bars");
  assert.equal(trimBars(d, { forEditing: true }).measures.length, 8);
  let long = d; for (let b = 6; b < 12; b++) long = place(long, { bar: b, staff: 0, ticks: 0, step: 4 }, Q).doc; // 12 bars of notes + the appended 13th
  assert.equal(long.measures.length, 13);
  assert.equal(trimBars(long).measures.length, 12); assert.equal(trimBars(long, { forEditing: true }).measures.length, 13);
  const empty = newComposition({ id: "e", now: 1 });
  assert.equal(trimBars(empty).measures.length, DEFAULT_BARS); assert.equal(trimBars(empty, { forEditing: true }).measures.length, DEFAULT_BARS);
  const marked = toggleFormMark(newComposition({ id: "m", now: 1 }), 3, { kind: "fine" });
  assert.equal(trimBars(marked).measures.length, 4, "a bar the form uses is the last");
  // MusicXML: the file carries six bars; the import gives one back to write into
  const back = fromMusicXml(toMusicXml(d));
  assert.equal((toMusicXml(d).match(/<measure /g) ?? []).length, 6);
  assert.equal(back.doc.measures.length, 8, "six bars + one to write into, padded to eight");
});
