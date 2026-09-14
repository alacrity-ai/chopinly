import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition, validate, timeAt, isEmptyBar, evTicks } from "../js/lib/compose/model.js";
import { place, remove, snap, trimBars, find, onsets, pitchFromStep, midiOf, Nudge, normalizeBar, setPitch, stepOf } from "../js/lib/compose/engine.js";
import { capacity, PPQ } from "../js/lib/compose/ticks.js";
const Qt = PPQ;
import { createHistory } from "../js/lib/compose/history.js";

const fresh = () => newComposition({ id: "c1", title: "t", now: 1 });
const Q = { base: 4, dots: 0, rest: false }, E = { base: 8, dots: 0, rest: false }, H = { base: 2, dots: 0, rest: false }, W = { base: 1, dots: 0, rest: false };
const kinds = (doc, bar, staff = 0) => doc.measures[bar].staves[staff].voices[0].map((e) => `${e.kind === "rest" ? "r" : "n"}${e.dur.base}${e.dur.dots ? "." : ""}`).join(" ");

test("a new composition is eight valid empty bars with key, time and clefs on bar 1", () => {
  const d = fresh();
  assert.equal(d.measures.length, 8);
  validate(d);
  assert.deepEqual(timeAt(d, 5), { beats: 4, unit: 4 });
  assert.ok(d.measures.every(isEmptyBar));
});

test("pitchFromStep spells from the key: the E line in E♭ major is E♭, in C major E; middle line of the bass staff is D3", () => {
  assert.deepEqual(pitchFromStep(0, "treble", { fifths: 0 }), { step: "E", alter: 0, octave: 4 });
  assert.deepEqual(pitchFromStep(0, "treble", { fifths: -3 }), { step: "E", alter: -1, octave: 4 });
  assert.deepEqual(pitchFromStep(4, "bass", { fifths: 0 }), { step: "D", alter: 0, octave: 3 });
  assert.equal(midiOf({ step: "C", alter: 0, octave: 4 }), 60);
  assert.equal(midiOf({ step: "B", alter: -1, octave: 3 }), 58);
});

test("place a quarter at every quarter slot of a whole rest → note surrounded by standard rests", () => {
  for (const t of [0, Qt, 2 * Qt, 3 * Qt]) {
    const { doc, ev, action } = place(fresh(), { bar: 0, staff: 0, ticks: t + 100, step: 4 }, Q);
    assert.equal(action, "place");
    validate(doc);
    const o = onsets(doc.measures[0].staves[0].voices[0]).find((x) => x.ev.id === ev.id);
    assert.equal(o.start, t, `slot ${t}`);
    assert.equal(ev.pitches[0].step, "B");
  }
  assert.equal(kinds(place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc, 0), "n4 r4 r2");
  assert.equal(kinds(place(fresh(), { bar: 0, staff: 0, ticks: 3 * Qt + 20, step: 4 }, Q).doc, 0), "r2 r4 n4");
});

test("an eighth armed inside a whole rest offers the off-beats; a tap near the 'and' of 1 lands at 480", () => {
  const { doc, ev } = place(fresh(), { bar: 0, staff: 0, ticks: Qt / 2 + 40, step: 6 }, E);
  const o = onsets(doc.measures[0].staves[0].voices[0]).find((x) => x.ev.id === ev.id);
  assert.equal(o.start, Qt / 2);
  assert.equal(kinds(doc, 0), "r8 n8 r4 r2");
  validate(doc);
});

test("the tap snaps to the nearest slot: a quarter tapped at tick 500 goes to beat 1, at 700 to beat 2", () => {
  assert.equal(snap(fresh(), { bar: 0, staff: 0, ticks: Qt * 0.52 }, Q).onset, Qt);
  assert.equal(snap(fresh(), { bar: 0, staff: 0, ticks: Qt * 0.42 }, Q).onset, 0);
});

test("no room: a half after three quarters nudges and leaves the bar unchanged; a whole into a bar with a note nudges", () => {
  let d = fresh();
  for (const t of [0, Qt, 2 * Qt]) d = place(d, { bar: 0, staff: 0, ticks: t, step: 4 }, Q).doc;
  const before = JSON.stringify(d);
  assert.throws(() => place(d, { bar: 0, staff: 0, ticks: 3.1 * Qt, step: 4 }, H), Nudge);
  assert.throws(() => place(d, { bar: 0, staff: 0, ticks: 3.1 * Qt, step: 4 }, W), Nudge);
  assert.equal(JSON.stringify(d), before);
  // but a quarter fits in the last slot
  assert.equal(kinds(place(d, { bar: 0, staff: 0, ticks: 3.1 * Qt, step: 4 }, Q).doc, 0), "n4 n4 n4 n4");
});

test("rest armed places a rest that is kept distinct from the auto rests? no — rests are rests: it re-normalises to the same bar", () => {
  const R = { base: 8, dots: 0, rest: true };
  const { doc, action } = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, R);
  assert.equal(action, "place");
  assert.equal(kinds(doc, 0), "r1"); // an eighth rest in an empty bar is still an empty bar
  validate(doc);
});

test("tapping a second pitch at a note's slot joins the chord, sorted low to high; the same pitch is a no-op", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  const r = place(d, { bar: 0, staff: 0, ticks: 100, step: 8 }, Q);
  assert.equal(r.action, "chord");
  assert.deepEqual(r.ev.pitches.map((p) => p.step + p.octave), ["B4", "F5"]);
  const s = place(r.doc, { bar: 0, staff: 0, ticks: 100, step: 8 }, Q);
  assert.equal(s.action, "same");
  assert.throws(() => place(r.doc, { bar: 0, staff: 0, ticks: 100, step: 8 }, { base: 4, dots: 0, rest: true }), Nudge);
});

test("remove: a whole event becomes rests; a pitch leaves its chord; unknown ids change nothing", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: Qt, step: 4 }, Q).doc;
  const ev = d.measures[0].staves[0].voices[0].find((e) => e.kind === "note");
  d = place(d, { bar: 0, staff: 0, ticks: Qt + 40, step: 6 }, Q).doc;
  const gone1 = remove(d, [{ ev: ev.id, pi: 0 }]);
  assert.equal(find(gone1, ev.id).ev.pitches.length, 1);
  const gone = remove(gone1, [{ ev: ev.id }]);
  assert.equal(kinds(gone, 0), "r1");
  validate(gone);
  assert.equal(remove(gone, [{ ev: "nope" }]), gone);
});

test("the last bar getting a note appends a new empty bar; trimBars keeps one trailing empty bar and never fewer than eight", () => {
  const d = place(fresh(), { bar: 7, staff: 1, ticks: 0, step: 4 }, Q).doc;
  assert.equal(d.measures.length, 9);
  assert.ok(isEmptyBar(d.measures[8]));
  validate(d);
  let e = d; for (let i = 0; i < 5; i++) e = { ...e, measures: [...e.measures, ...fresh().measures.slice(0, 1)] };
  assert.equal(trimBars(e).measures.length, 9);
  assert.equal(trimBars(fresh()).measures.length, 8);
});

test("both staves are independent; the bass staff spells from its clef", () => {
  const { doc, ev } = place(fresh(), { bar: 2, staff: 1, ticks: 0, step: 4 }, Q);
  assert.equal(ev.pitches[0].step + ev.pitches[0].octave, "D3");
  assert.equal(kinds(doc, 2, 0), "r1");
  assert.equal(kinds(doc, 2, 1), "n4 r4 r2");
});

test("fuzz: 10,000 random places and removes keep every invariant", () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let d = fresh();
  const durs = [W, H, Q, E, { base: 16, dots: 0, rest: false }, { base: 4, dots: 1, rest: false }, { base: 8, dots: 0, rest: true }, { base: 4, dots: 0, rest: true }];
  let placed = 0, nudged = 0, removed = 0;
  for (let i = 0; i < 10000; i++) {
    if (rnd() < 0.7) {
      const bar = Math.floor(rnd() * d.measures.length), staff = Math.floor(rnd() * 2);
      const cap = capacity(timeAt(d, bar));
      try { d = place(d, { bar, staff, ticks: Math.floor(rnd() * cap), step: Math.floor(rnd() * 17) - 4 }, pick(durs)).doc; placed++; }
      catch (e) { if (!(e instanceof Nudge)) throw e; nudged++; }
    } else {
      const notes = d.measures.flatMap((m) => m.staves.flatMap((s) => s.voices[0].filter((e) => e.kind === "note")));
      if (notes.length) { const n = pick(notes); d = remove(d, [{ ev: n.id, ...(n.pitches.length > 1 && rnd() < 0.5 ? { pi: 0 } : {}) }]); removed++; }
    }
    if (i % 250 === 0) validate(d);
  }
  validate(d);
  assert.ok(placed > 3000 && nudged > 0 && removed > 0, `${placed} ${nudged} ${removed}`);
  assert.ok(d.measures.length < 200, "bars only grow when the last one is used");
});

test("history: push / undo / redo, and a push after undo drops the redo branch", () => {
  const h = createHistory("a");
  h.push("b"); h.push("c");
  assert.equal(h.undo(), "b"); assert.equal(h.undo(), "a"); assert.equal(h.undo(), "a");
  assert.equal(h.redo(), "b"); h.push("d"); assert.equal(h.canRedo, false); assert.equal(h.redo(), "d");
});

test("setPitch: moves by staff step spelled from the key; a chord re-sorts and the moved index follows; collisions and the range nudge", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc; // B4
  const ev = d.measures[0].staves[0].voices[0][0];
  let r = setPitch(d, [{ ev: ev.id, pi: 0 }], 2);
  assert.equal(find(r.doc, ev.id).ev.pitches[0].step + find(r.doc, ev.id).ev.pitches[0].octave, "D5");
  assert.equal(r.pi, 0);
  r = setPitch(r.doc, [{ ev: ev.id, pi: 0 }], -8); // D5 (step 6) → step -2 = C4, on its ledger line
  assert.equal(find(r.doc, ev.id).ev.pitches[0].step + find(r.doc, ev.id).ev.pitches[0].octave, "C4");
  assert.equal(stepOf({ step: "C", alter: 0, octave: 4 }, "treble"), -2);
  // key spelling: in E♭ major, moving onto the E line gives E♭
  let e = fresh(); e.measures[0].key = { fifths: -3 };
  e = place(e, { bar: 0, staff: 0, ticks: 0, step: 1 }, Q).doc; // F4
  const ev2 = e.measures[0].staves[0].voices[0][0];
  const m = setPitch(e, [{ ev: ev2.id, pi: 0 }], -1).doc;
  assert.deepEqual(find(m, ev2.id).ev.pitches[0], { step: "E", alter: -1, octave: 4 });
  // chord: move the lower note above the upper one → the index follows the re-sort
  let c = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  c = place(c, { bar: 0, staff: 0, ticks: 10, step: 6 }, Q).doc; // B4 + D5
  const ev3 = c.measures[0].staves[0].voices[0][0];
  const up = setPitch(c, [{ ev: ev3.id, pi: 0 }], 4); // B4 → F5, now above D5
  assert.equal(up.pi, 1);
  assert.deepEqual(find(up.doc, ev3.id).ev.pitches.map((p) => p.step + p.octave), ["D5", "F5"]);
  assert.throws(() => setPitch(c, [{ ev: ev3.id, pi: 0 }], 2), Nudge); // onto D5
  assert.throws(() => setPitch(c, [{ ev: ev3.id, pi: 0 }], 40), Nudge); // off the staff
  const before = JSON.stringify(c);
  try { setPitch(c, [{ ev: ev3.id, pi: 0 }], 2); } catch { /* nudged */ }
  assert.equal(JSON.stringify(c), before);
  // whole event: both pitches move
  const both = setPitch(c, [{ ev: ev3.id }], 1).doc;
  assert.deepEqual(find(both, ev3.id).ev.pitches.map((p) => p.step + p.octave), ["C5", "E5"]);
  validate(both);
});

test("retype: shorter leaves rests, longer eats the rests that follow, a note in the way nudges the whole set and nothing changes; rests are refused", async () => {
  const { retype, toRests } = await import("../js/lib/compose/engine.js");
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  const ev = d.measures[0].staves[0].voices[0][0];
  assert.equal(kinds(retype(d, [ev.id], H), 0), "n2 r2");
  assert.equal(kinds(retype(d, [ev.id], E), 0), "n8 r8 r4 r2");
  assert.equal(kinds(retype(d, [ev.id], W), 0), "n1");
  d = place(d, { bar: 0, staff: 0, ticks: Qt + 10, step: 4 }, Q).doc; // n4 n4 r2
  const [a, b] = d.measures[0].staves[0].voices[0];
  assert.throws(() => retype(d, [a.id], H), Nudge); // b is in the way
  assert.equal(kinds(retype(d, [b.id], H), 0), "n4 n2 r4");
  assert.equal(kinds(retype(d, [a.id, b.id], E), 0), "n8 r8 n8 r8 r2");
  const before = JSON.stringify(d);
  assert.throws(() => retype(d, [a.id, b.id], H), (e) => e instanceof Nudge && e.bar === 0); // a cannot grow: all or nothing
  assert.equal(JSON.stringify(d), before);
  const rest = d.measures[0].staves[0].voices[0][2];
  assert.throws(() => retype(d, [a.id, rest.id], H), Nudge);
  // dots via retype
  assert.equal(kinds(retype(d, [b.id], { base: 4, dots: 1 }), 0), "n4 n4. r8 r4");
  // toRests
  assert.equal(kinds(toRests(d, [a.id, b.id]), 0), "r1");
  assert.equal(toRests(d, [rest.id]), d);
  validate(retype(d, [a.id, b.id], E));
});

test("setPitch moves a cluster together: two pitches of one chord step up as a pair without a false collision; a real collision nudges", () => {
  let c = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  c = place(c, { bar: 0, staff: 0, ticks: 10, step: 5 }, Q).doc; // B4 + C5
  const ev = c.measures[0].staves[0].voices[0][0];
  const r = setPitch(c, [{ ev: ev.id, pi: 0 }, { ev: ev.id, pi: 1 }], 1);
  assert.deepEqual(find(r.doc, ev.id).ev.pitches.map((p) => p.step + p.octave), ["C5", "D5"]);
  assert.deepEqual(r.moved.map((m) => m.pi).sort(), [0, 1]);
  c = place(c, { bar: 0, staff: 0, ticks: 10, step: 8 }, Q).doc; // + F5
  const ev2 = c.measures[0].staves[0].voices[0][0];
  assert.throws(() => setPitch(c, [{ ev: ev2.id, pi: 1 }], 3), Nudge); // C5 → F5 collides
  // a cluster across two events
  let e = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  e = place(e, { bar: 0, staff: 1, ticks: 0, step: 4 }, Q).doc;
  const [x] = e.measures[0].staves[0].voices[0], [y] = e.measures[0].staves[1].voices[0];
  const m = setPitch(e, [{ ev: x.id, pi: 0 }, { ev: y.id, pi: 0 }], -2).doc;
  assert.equal(find(m, x.id).ev.pitches[0].step + find(m, x.id).ev.pitches[0].octave, "G4");
  assert.equal(find(m, y.id).ev.pitches[0].step + find(m, y.id).ev.pitches[0].octave, "B2");
});
