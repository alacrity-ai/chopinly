import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition, newMeasure, validate, timeAt, isEmptyBar, evTicks } from "../js/lib/compose/model.js";
import { place, remove, snap, trimBars, find, onsets, pitchFromStep, midiOf, Nudge, normalizeBar, setPitch, stepOf, retype, dot, tie, tuplet, accidental, clipFrom, paste, toRests, setKey, setTime, setClef, articulate, gliss, arpeggio, slur, slurEnd, decompose, addExpression, addHairpin, moveExpressions, moveHairpinEnd, setExpressionValue, removeExpressions, findExpression, expressionsOf, exprSlot, slotOfAbs, nextSlot, upgrade, nudgeExpressionY } from "../js/lib/compose/engine.js";
import { capacity, PPQ, groupSize, exprGrid } from "../js/lib/compose/ticks.js";
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

// --- P1 (WSHED-116): dots, ties, tuplets, accidentals ---------------------
const T = { base: 4, dots: 0, rest: false, tuplet: 3 };
const fullKinds = (doc, bar, staff = 0) => doc.measures[bar].staves[staff].voices[0].map((e) => `${e.kind === "rest" ? "r" : "n"}${e.dur.base}${".".repeat(e.dur.dots)}${e.dur.tuplet ? `/${e.dur.tuplet.n}` : ""}`).join(" ");
const bar1 = (d) => d.measures[0].staves[0].voices[0];

test("dot: a quarter becomes a dotted quarter eating the following rest; undot gives it back; a chord dots as one event", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 6 }, Q).doc; // chord
  d = dot(d, [bar1(d)[0].id], 1);
  assert.equal(fullKinds(d, 0), "n4. r8 r2");
  assert.equal(bar1(d)[0].pitches.length, 2);
  d = dot(d, [bar1(d)[0].id], 0);
  assert.equal(fullKinds(d, 0), "n4 r4 r2");
  validate(d);
  // a dot that does not fit is refused whole
  let e = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, W).doc;
  assert.throws(() => dot(e, [bar1(e)[0].id], 1), Nudge);
});

test("tie: one note ties to the next same pitch (across the barline too); a chord ties what matches; tie again unties; no match nudges", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 3 * Qt, step: 4 }, Q).doc; // B4 on beat 4
  d = place(d, { bar: 1, staff: 0, ticks: 0, step: 4 }, H).doc;               // B4 half in bar 2
  d = place(d, { bar: 1, staff: 0, ticks: 0, step: 6 }, H).doc;               // + D5
  const a = bar1(d)[bar1(d).length - 1], b = d.measures[1].staves[0].voices[0][0];
  d = tie(d, [{ ev: a.id }]);
  assert.equal(find(d, a.id).ev.pitches[0].tie, "start");
  assert.equal(find(d, b.id).ev.pitches.find((p) => p.step === "B").tie, "stop");
  assert.equal(find(d, b.id).ev.pitches.find((p) => p.step === "D").tie, undefined);
  d = tie(d, [{ ev: a.id }]); // toggle off
  assert.equal(find(d, a.id).ev.pitches[0].tie, undefined);
  assert.equal(find(d, b.id).ev.pitches.find((p) => p.step === "B").tie, undefined);
  // two adjacent selected: ties them, and not beyond
  d = place(d, { bar: 1, staff: 0, ticks: 2 * Qt, step: 4 }, H).doc; // second B4 half in bar 2
  const c = d.measures[1].staves[0].voices[0][1];
  d = tie(d, [{ ev: a.id }, { ev: b.id }]);
  assert.equal(find(d, a.id).ev.pitches[0].tie, "start");
  assert.equal(find(d, b.id).ev.pitches.find((p) => p.step === "B").tie, "stop"); // b → c not tied: c was not selected
  assert.equal(find(d, c.id).ev.pitches[0].tie, undefined);
  // nothing tieable
  let e = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  e = place(e, { bar: 0, staff: 0, ticks: Qt, step: 5 }, Q).doc;
  assert.throws(() => tie(e, [{ ev: bar1(e)[0].id }]), /same pitch next/);
  // moving the second note drops the tie; deleting it too
  let f = tie(d, [{ ev: b.id }]); // b → c
  assert.equal(find(f, b.id).ev.pitches.find((p) => p.step === "B").tie, "both");
  f = setPitch(f, [{ ev: c.id, pi: 0 }], 1).doc;
  assert.equal(find(f, b.id).ev.pitches.find((p) => p.step === "B").tie, "stop");
  f = remove(f, [{ ev: b.id }]);
  assert.equal(find(f, a.id).ev.pitches[0].tie, undefined);
  validate(f);
});

test("tuplet: three eighths become a triplet and free an eighth rest; undo restores; bad totals and mixed groups nudge", () => {
  let d = fresh();
  for (let i = 0; i < 3; i++) d = place(d, { bar: 0, staff: 0, ticks: i * (Qt / 2), step: 4 + i }, E).doc;
  assert.equal(fullKinds(d, 0), "n8 n8 n8 r8 r2");
  const ids = bar1(d).slice(0, 3).map((e) => e.id);
  d = tuplet(d, ids, 3);
  assert.equal(fullKinds(d, 0), "n8/3 n8/3 n8/3 r4 r2");
  validate(d);
  const gid = bar1(d)[0].dur.tuplet.id;
  assert.ok(bar1(d).slice(0, 3).every((e) => e.dur.tuplet.id === gid));
  // retype inside the group keeps the ratio and fills with tuplet rests
  let r = retype(d, [ids[1]], { base: 16, dots: 0 });
  assert.equal(fullKinds(r, 0), "n8/3 n16/3 r16/3 n8/3 r4 r2");
  validate(r);
  // deleting every note of the group dissolves it into plain rests
  let g = remove(d, ids.map((ev) => ({ ev })));
  assert.equal(fullKinds(g, 0), "r1");
  // undo the tuplet
  d = tuplet(d, ids, 3);
  assert.equal(fullKinds(d, 0), "n8 n8 n8 r8 r2");
  // a quarter + eighth is a triplet of eighths (3 × eighth); quarter + quarter + eighth is not
  let e = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  e = place(e, { bar: 0, staff: 0, ticks: Qt, step: 4 }, E).doc;
  e = tuplet(e, bar1(e).slice(0, 2).map((x) => x.id), 3);
  assert.equal(fullKinds(e, 0), "n4/3 n8/3 r4 r2");
  let f = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  f = place(f, { bar: 0, staff: 0, ticks: Qt, step: 4 }, Q).doc;
  f = place(f, { bar: 0, staff: 0, ticks: 2 * Qt, step: 4 }, E).doc;
  assert.throws(() => tuplet(f, bar1(f).slice(0, 3).map((x) => x.id), 3), /don't make a tuplet/);
  assert.throws(() => tuplet(f, [bar1(f)[0].id, bar1(f)[2].id], 3), /side by side/);
});

test("armed tuplet: the first tap opens a triplet group in a quarter's room, taps inside fill it, a plain eighth cannot enter it", () => {
  const TE = { base: 8, dots: 0, rest: false, tuplet: 3 };
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, TE).doc;
  assert.equal(fullKinds(d, 0), "n8/3 r4/3 r2. ".trim() === "" ? "" : fullKinds(d, 0));
  assert.match(fullKinds(d, 0), /^n8\/3 r4\/3 r4 r2$/);
  validate(d);
  d = place(d, { bar: 0, staff: 0, ticks: 2240, step: 5 }, TE).doc;     // second slot, tuplet armed
  assert.match(fullKinds(d, 0), /^n8\/3 n8\/3 r8\/3 r4 r2$/);
  d = place(d, { bar: 0, staff: 0, ticks: 4480, step: 6 }, E).doc;      // third slot, plain eighth armed → takes the group's ratio
  assert.match(fullKinds(d, 0), /^n8\/3 n8\/3 n8\/3 r4 r2$/);
  validate(d);
  const gid = bar1(d)[0].dur.tuplet.id;
  assert.ok(bar1(d).slice(0, 3).every((e) => e.dur.tuplet.id === gid), "one group");
  // a second triplet lands on beat 2, snapped to the quarter grid
  d = place(d, { bar: 0, staff: 0, ticks: Qt + 900, step: 4 }, TE).doc;
  assert.match(fullKinds(d, 0), /^n8\/3 n8\/3 n8\/3 n8\/3 r4\/3 r2$/);
  // an armed triplet needs a quarter of room: a lone eighth rest refuses it
  let e = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, { base: 2, dots: 1, rest: false }).doc; // dotted half → r4 left
  e = place(e, { bar: 0, staff: 0, ticks: 3 * Qt, step: 4 }, E).doc;                                   // eighth on beat 4 → r8 left
  assert.throws(() => place(e, { bar: 0, staff: 0, ticks: 3 * Qt + Qt / 2 + 10, step: 4 }, TE), /no room/);
  validate(e);
});

test("accidental: sets the spelling, pressing it again returns to the key, a natural the key implies is a cautionary", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc; // B4 in C
  const id = bar1(d)[0].id;
  d = accidental(d, [{ ev: id, pi: 0 }], -1);
  assert.deepEqual([find(d, id).ev.pitches[0].alter, find(d, id).ev.pitches[0].acc], [-1, undefined]);
  assert.equal(midiOf(find(d, id).ev.pitches[0]), 70);
  d = accidental(d, [{ ev: id, pi: 0 }], -1);                                // again → back to the key
  assert.equal(find(d, id).ev.pitches[0].alter, 0);
  d = accidental(d, [{ ev: id, pi: 0 }], 0);                                 // natural in C → cautionary
  assert.deepEqual([find(d, id).ev.pitches[0].alter, find(d, id).ev.pitches[0].acc], [0, "show"]);
  d = accidental(d, [{ ev: id, pi: 0 }], 0);                                 // again → hidden
  assert.equal(find(d, id).ev.pitches[0].acc, undefined);
  d = accidental(d, [{ ev: id }], 2);
  assert.equal(midiOf(find(d, id).ev.pitches[0]), 73);
  // armed accidental on placement, and on a pitch already there
  let e = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, { ...Q, alter: 1 }).doc;
  assert.equal(bar1(e)[0].pitches[0].alter, 1);
  const r = place(e, { bar: 0, staff: 0, ticks: 0, step: 4 }, { ...Q, alter: -1 });
  assert.equal(r.action, "alter");
  assert.equal(bar1(r.doc)[0].pitches[0].alter, -1);
  assert.equal(place(r.doc, { bar: 0, staff: 0, ticks: 0, step: 4 }, { ...Q, alter: -1 }).action, "same");
  assert.throws(() => accidental(fresh(), [{ ev: "nope" }], 1), Nudge);
});

test("clipboard with a tuplet: the group travels whole and pastes with fresh ids; a paste into the last bar keeps an empty bar after it", () => {
  let d = fresh();
  for (let i = 0; i < 3; i++) d = place(d, { bar: 0, staff: 0, ticks: i * (Qt / 2), step: 4 }, E).doc;
  d = tuplet(d, bar1(d).slice(0, 3).map((e) => e.id), 3);
  const clip = clipFrom(d, [{ ev: bar1(d)[1].id, pi: 0 }]); // one note of the triplet selected
  assert.equal(clip.events.length, 3);
  assert.deepEqual(clip.events.map((e) => e.kind), ["rest", "note", "rest"]);
  const last = d.measures.length - 1;
  const r = paste(d, clip, { bar: last, ticks: 0, staff: 1 });
  assert.equal(fullKinds(r.doc, last, 1), "r8/3 n8/3 r8/3 r4 r2");
  assert.notEqual(r.doc.measures[last].staves[1].voices[0][0].dur.tuplet.id, bar1(d)[0].dur.tuplet.id);
  assert.equal(r.doc.measures.length, last + 2, "a bar after the pasted one");
  validate(r.doc);
  // a paste over part of a tuplet drops the whole group; one that misses the beat grid is refused
  let e = fresh();
  for (let i = 0; i < 3; i++) e = place(e, { bar: 0, staff: 0, ticks: i * Qt, step: 4 }, Q).doc;
  e = tuplet(e, bar1(e).slice(0, 3).map((x) => x.id), 3);                    // triplet quarters over beats 1–2
  assert.equal(fullKinds(e, 0), "n4/3 n4/3 n4/3 r2");
  e = place(e, { bar: 1, staff: 0, ticks: 0, step: 4 }, Q).doc;
  const qc = clipFrom(e, [{ ev: e.measures[1].staves[0].voices[0][0].id }]);
  const p = paste(e, qc, { bar: 0, ticks: Qt, staff: 0 }).doc;              // beat 2: inside the triplet's span
  assert.equal(fullKinds(p, 0), "r4 n4 r2");
  validate(p);
  assert.throws(() => paste(e, qc, { bar: 0, ticks: 2240, staff: 0 }), /line up/);
});

test("duplet: two eighths in the time of three take the rest after them, or nudge when there is none", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, E).doc;
  d = place(d, { bar: 0, staff: 0, ticks: Qt / 2, step: 5 }, E).doc;
  d = tuplet(d, bar1(d).slice(0, 2).map((x) => x.id), 2);
  assert.equal(fullKinds(d, 0), "n8/2 n8/2 r8 r2");
  validate(d);
  d = tuplet(d, bar1(d).slice(0, 2).map((x) => x.id), 2);                   // undo
  assert.equal(fullKinds(d, 0), "n8 n8 r4 r2");
  let e = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, { base: 2, dots: 1, rest: false }).doc;
  e = place(e, { bar: 0, staff: 0, ticks: 3 * Qt, step: 4 }, E).doc;
  e = place(e, { bar: 0, staff: 0, ticks: 3 * Qt + Qt / 2, step: 4 }, E).doc;
  assert.throws(() => tuplet(e, bar1(e).slice(1, 3).map((x) => x.id), 2), /no room/);
});

test("fuzz: 8,000 random edits over every P1 op keep every invariant", () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let d = fresh();
  const durs = [W, H, Q, E, { base: 16, dots: 0, rest: false }, { base: 4, dots: 1, rest: false }, { base: 8, dots: 0, rest: true }, { base: 8, dots: 0, rest: false, tuplet: 3 }, { base: 16, dots: 0, rest: false, tuplet: 5 }, { base: 4, dots: 0, rest: false, tuplet: 3 }, { base: 8, dots: 0, rest: false, alter: 1 }, { base: 4, dots: 0, rest: false, alter: -1 }];
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] ?? 0) + 1; };
  const notes = () => d.measures.flatMap((m) => m.staves.flatMap((s) => s.voices[0].filter((e) => e.kind === "note")));
  const run = (k, fn) => { try { d = fn(); bump(k); } catch (e) { if (!(e instanceof Nudge)) throw e; bump("nudge"); } };
  for (let i = 0; i < 8000; i++) {
    const x = rnd(), ns = notes();
    if (x < 0.45 || !ns.length) {
      const bar = Math.floor(rnd() * d.measures.length), staff = Math.floor(rnd() * 2), cap = capacity(timeAt(d, bar));
      run("place", () => place(d, { bar, staff, ticks: Math.floor(rnd() * cap), step: Math.floor(rnd() * 17) - 4 }, pick(durs)).doc);
    } else if (x < 0.55) { const n = pick(ns); run("remove", () => remove(d, [{ ev: n.id, ...(n.pitches.length > 1 && rnd() < 0.5 ? { pi: 0 } : {}) }])); }
    else if (x < 0.65) { const n = pick(ns); run("retype", () => retype(d, [n.id], pick([W, H, Q, E, { base: 16, dots: 0 }]))); }
    else if (x < 0.72) { const n = pick(ns); run("dot", () => dot(d, [n.id], n.dur.dots ? 0 : pick([1, 2]))); }
    else if (x < 0.80) { const n = pick(ns); run("tie", () => tie(d, [{ ev: n.id }])); }
    else if (x < 0.88) {
      const n = pick(ns), f = find(d, n.id), voice = d.measures[f.bar].staves[f.staff].voices[0];
      const ids = voice.slice(f.index, f.index + pick([2, 3, 3, 5])).map((e) => e.id);
      run("tuplet", () => tuplet(d, ids, pick([2, 3, 3, 5, 6, 7])));
    }
    else if (x < 0.94) { const n = pick(ns); run("accidental", () => accidental(d, [{ ev: n.id, pi: Math.floor(rnd() * n.pitches.length) }], pick([-2, -1, 0, 1, 2]))); }
    else { const n = pick(ns); run("setPitch", () => setPitch(d, [{ ev: n.id }], pick([-2, -1, 1, 2, 7])).doc); if (rnd() < 0.3) run("toRests", () => toRests(d, [n.id])); }
    if (i % 200 === 0) validate(d);
  }
  validate(d);
  for (const k of ["place", "remove", "retype", "dot", "tie", "tuplet", "accidental", "setPitch"]) assert.ok(counts[k] > 20, `${k}: ${counts[k]}`);
  assert.ok(d.measures.length < 200, "bars only grow when the last one is used");
});

// --- P2 (WSHED-117): key / time / clef anywhere, articulations, gliss ---------
import { keyAt, clefAt } from "../js/lib/compose/model.js";

test("setKey / setClef: a change holds until the next one; the value already in force removes the change; bar 1 always keeps its own", () => {
  let d = setKey(fresh(), 2, 1);
  assert.equal(keyAt(d, 1).fifths, 0); assert.equal(keyAt(d, 2).fifths, 1); assert.equal(keyAt(d, 7).fifths, 1);
  d = setKey(d, 5, -3);
  assert.equal(keyAt(d, 4).fifths, 1); assert.equal(keyAt(d, 6).fifths, -3);
  d = setKey(d, 2, 0); // back to what bar 1 has → the change at bar 3 goes
  assert.equal(d.measures[2].key, undefined); assert.equal(keyAt(d, 4).fifths, 0);
  d = setKey(d, 0, 2); assert.equal(keyAt(d, 0).fifths, 2);
  assert.throws(() => setKey(d, 0, 8), Nudge);
  d = setClef(d, 4, 1, "treble");
  assert.equal(clefAt(d, 3, 1), "bass"); assert.equal(clefAt(d, 4, 1), "treble"); assert.equal(clefAt(d, 4, 0), "treble");
  d = setClef(d, 4, 1, "bass"); assert.equal(d.measures[4].clefs, undefined);
  d = setClef(d, 6, 0, "tenor"); assert.equal(clefAt(d, 7, 0), "tenor");
  validate(d);
  // on a beat inside a bar: tenor from beat 3 of bar 4 on the lower staff holds through every later bar
  d = setClef(fresh(), 3, 1, "tenor", 2 * Qt);
  assert.deepEqual(d.measures[3].clefChanges, [{ staff: 1, at: 2 * Qt, clef: "tenor" }]);
  assert.equal(clefAt(d, 3, 1, 0), "bass"); assert.equal(clefAt(d, 3, 1, 2 * Qt - 1), "bass"); assert.equal(clefAt(d, 3, 1, 2 * Qt), "tenor"); assert.equal(clefAt(d, 4, 1), "tenor"); assert.equal(clefAt(d, 7, 1, 3 * Qt), "tenor"); assert.equal(clefAt(d, 3, 0, 2 * Qt), "treble");
  validate(d);
  // a note placed on that beat reads in the new clef; one before it in the old
  let f = place(d, { bar: 3, staff: 1, ticks: 2 * Qt, step: 4 }, Q).doc;                       // middle line, tenor → A3
  f = place(f, { bar: 3, staff: 1, ticks: 0, step: 4 }, Q).doc;                                // middle line, bass → D3
  const notes = f.measures[3].staves[1].voices[0].filter((e) => e.kind === "note").map((e) => e.pitches[0].step + e.pitches[0].octave);
  assert.deepEqual(notes, ["D3", "A3"]);
  // the clef already in force on that beat removes the change; off the beat refuses; bass again at the barline after → an explicit change back
  assert.equal(setClef(d, 3, 1, "bass", 2 * Qt).measures[3].clefChanges, undefined);
  assert.throws(() => setClef(d, 3, 1, "alto", Qt / 2), Nudge);
  const g = setClef(d, 4, 1, "bass");
  assert.deepEqual(g.measures[4].clefs, { 1: "bass" }); assert.equal(clefAt(g, 5, 1), "bass");
  // a time change carries a mid-bar clef to the beat that now holds its tick
  const h = setTime(d, 2, { beats: 3, unit: 4 }).doc;                                          // ticks 3·4Q+2Q from bar 1 = 2·4Q + 2·3Q → bar 5, beat 1
  assert.equal(h.measures[3].clefChanges, undefined); assert.deepEqual(h.measures[4].clefs, { 1: "tenor" });
  validate(h);
  // a placed note keeps its pitch across a clef change, and the new bar's spelling follows the new key
  let e = place(setKey(fresh(), 1, 1), { bar: 1, staff: 0, ticks: 0, step: 1 }, Q).doc; // F line in G major → F#
  assert.equal(e.measures[1].staves[0].voices[0][0].pitches[0].alter, 1);
});

test("decompose: one value when it is one, else the fewest plain values longest first", () => {
  assert.deepEqual(decompose(Qt * 3), [{ base: 2, dots: 1 }]);
  assert.deepEqual(decompose(Qt * 5), [{ base: 1, dots: 0 }, { base: 4, dots: 0 }]);
  assert.deepEqual(decompose(Qt / 2 + Qt / 4), [{ base: 8, dots: 1 }]);
  assert.equal(decompose(100), null);
});

test("setTime: 4/4 → 3/4 at bar 3 of a full eight bars re-cuts into 3/4 bars, loses no ticks, ties the notes that cross the new barlines", () => {
  let d = fresh();
  for (let b = 0; b < 8; b++) for (let i = 0; i < 4; i++) d = place(d, { bar: b, staff: 0, ticks: i * Qt, step: 4 + i }, Q).doc;
  assert.equal(d.measures.length, 9);
  const r = setTime(d, 2, { beats: 3, unit: 4 });
  assert.deepEqual([r.before, r.after], [7, 10]);       // bars 3–9 (7 bars, 28 quarters incl. the empty ninth) → 10 bars of three
  assert.equal(r.doc.measures.length, 2 + 10);           // the tenth 3/4 bar is already empty, so no extra trailing bar
  validate(r.doc);
  assert.deepEqual(timeAt(r.doc, 1), { beats: 4, unit: 4 }); assert.deepEqual(timeAt(r.doc, 2), { beats: 3, unit: 4 });
  const all = r.doc.measures.slice(2).flatMap((m) => m.staves[0].voices[0]).filter((e) => e.kind === "note");
  assert.equal(all.length, 24, "every quarter survived");
  assert.equal(kinds(r.doc, 2), "n4 n4 n4"); assert.equal(kinds(r.doc, 3), "n4 n4 n4");
  // a half note across the new barline becomes two tied quarters
  let e = place(fresh(), { bar: 0, staff: 0, ticks: 2 * Qt, step: 4 }, H).doc; // beats 3–4
  const t = setTime(e, 0, { beats: 3, unit: 4 });
  assert.equal(kinds(t.doc, 0), "r2 n4"); assert.equal(kinds(t.doc, 1), "n4 r4 r4");
  assert.equal(t.doc.measures[0].staves[0].voices[0][1].pitches[0].tie, "start");
  assert.equal(t.doc.measures[1].staves[0].voices[0][0].pitches[0].tie, "stop");
  validate(t.doc);
  // 4/4 → 6/8 keeps the content; a whole note across bars splits into dotted values
  let w = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, W).doc;
  const s = setTime(w, 0, { beats: 6, unit: 8 });
  assert.equal(kinds(s.doc, 0), "n2."); assert.equal(kinds(s.doc, 1), "n4 r8 r4."); // 4 quarters = a 6/8 bar (3 quarters) + a quarter; the rests complete each dotted-quarter group
  validate(s.doc);
  // a tuplet across the new barline refuses the change
  let u = fresh();
  for (let i = 0; i < 3; i++) u = place(u, { bar: 0, staff: 0, ticks: 2 * Qt + i * Qt, step: 4 }, Q).doc; // beats 3, 4 and bar 2 beat 1? no: beat 3, 4 of bar 1 and beat 1 of bar 2 → keep to bar 1
  u = fresh();
  for (let i = 0; i < 3; i++) u = place(u, { bar: 0, staff: 0, ticks: i * Qt, step: 4 }, Q).doc;
  u = tuplet(u, u.measures[0].staves[0].voices[0].slice(0, 3).map((x) => x.id), 3); // triplet quarters over beats 1–2
  assert.throws(() => setTime(u, 0, { beats: 1, unit: 4 }), /cross the new barline/);
  // the same metre again removes a change and re-flows nothing; a later time change bounds the stretch
  let v = setTime(fresh(), 3, { beats: 3, unit: 4 }).doc;
  v = setTime(v, 5, { beats: 2, unit: 4 }).doc;
  assert.deepEqual(timeAt(v, 4), { beats: 3, unit: 4 }); assert.deepEqual(timeAt(v, 5), { beats: 2, unit: 4 });
  const back = setTime(v, 3, { beats: 4, unit: 4 });
  assert.equal(back.doc.measures[3].time, undefined);
  validate(back.doc);
});

test("slur: first to last selected note (one note: to the next note, over rests), the same span again removes it, slurs nest and share ends, ends die with their notes", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: Qt, step: 5 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 3 * Qt, step: 6 }, Q).doc;   // a rest sits between b and c
  const [a, b, rest, c] = bar1(d);
  const at = (ev) => (find(d, ev.id).ev.slurs ?? []).map((x) => x.at).join();
  assert.equal(rest.kind, "rest");
  d = slur(d, [c.id, a.id]);                                            // order of selection is irrelevant
  assert.deepEqual([at(a), at(b), at(c)], ["start", "", "stop"]);
  const id1 = find(d, a.id).ev.slurs[0].id;
  assert.equal(slurEnd(d, 0, 0, find(d, a.id).ev, id1), find(d, c.id).ev);
  d = slur(d, [b.id]);                                                  // one note: to the next note, skipping the rest — nested, sharing the end
  assert.deepEqual([at(b), at(c)], ["start", "stop,stop"]);
  const id2 = find(d, b.id).ev.slurs[0].id;
  assert.equal(slurEnd(d, 0, 0, find(d, b.id).ev, id2), find(d, c.id).ev);
  assert.equal(slurEnd(d, 0, 0, find(d, a.id).ev, id1), find(d, c.id).ev, "the outer one still has its end");
  d = slur(d, [b.id, c.id]);                                            // exactly that slur again → off; the outer survives
  assert.deepEqual([at(a), at(b), at(c)], ["start", "", "stop"]);
  assert.throws(() => slur(d, [c.id]), /needs a note after/);
  assert.throws(() => slur(d, [rest.id]), /pick the notes/);
  d = remove(d, [{ ev: c.id }]);                                        // the end goes → the start is dropped
  assert.equal(find(d, a.id).ev.slurs, undefined);
  d = slur(d, [a.id, b.id]);
  d = toRests(d, [a.id]);                                               // a rest carries no slur, and the orphaned stop goes
  assert.equal(find(d, b.id).ev.slurs, undefined);
});

test("expressions (WSHED-122): a dynamic / text takes a half-beat slot of a staff (the same kind there is replaced), off-grid and bad values are refused, a hairpin owns its range and must end after it starts", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  const g = exprGrid(timeAt(d, 0));
  assert.equal(g, Qt / 2, "an eighth grid in 4/4");
  let r = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "f" }); d = r.doc;
  assert.deepEqual(d.measures[0].expressions.map((x) => [x.kind, x.at, x.value]), [["dyn", 0, "f"]]);
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "pp" }).doc;          // the same slot: replaced
  d = addExpression(d, { kind: "dyn", staff: 1, bar: 0, at: 0, value: "mf" }).doc;          // the other staff keeps its own
  d = addExpression(d, { kind: "text", staff: 0, bar: 0, at: 5 * g, value: "  rit.   qui " }).doc;
  assert.deepEqual(d.measures[0].expressions.map((x) => [x.kind, x.staff, x.at, x.value]), [["dyn", 0, 0, "pp"], ["dyn", 1, 0, "mf"], ["text", 0, 5 * g, "rit. qui"]]);
  assert.throws(() => addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: g / 2, value: "f" }), /off the grid/);
  assert.throws(() => addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "fffff" }), /no such dynamic/); // fff is a dynamic since v98
  assert.throws(() => addExpression(d, { kind: "text", staff: 0, bar: 0, at: 0, value: "   " }), /say what/);
  assert.throws(() => addExpression(d, { kind: "dyn", staff: 2, bar: 0, at: 0, value: "f" }), /nowhere/);
  r = addHairpin(d, { staff: 0, bar: 0, at: 2 * g, dir: "cresc", end: { bar: 1, at: 0 } }); d = r.doc;
  const hp = r.id;
  assert.deepEqual(findExpression(d, hp).x, { id: hp, kind: "hairpin", staff: 0, at: 2 * g, dir: "cresc", end: { bar: 1, at: 0 } });
  assert.throws(() => addHairpin(d, { staff: 0, bar: 0, at: 2 * g, dir: "dim", end: { bar: 0, at: 2 * g } }), /end after it starts/);
  assert.throws(() => addHairpin(d, { staff: 0, bar: 1, at: 0, dir: "dim", end: { bar: 0, at: 4 * g } }), /end after it starts/);
  d = addHairpin(d, { staff: 0, bar: 0, at: 6 * g, dir: "dim", end: { bar: 1, at: 4 * g } }).doc;  // overlaps the first on the same staff → the first goes
  assert.equal(findExpression(d, hp), null);
  assert.equal(expressionsOf(d).filter((e) => e.x.kind === "hairpin").length, 1);
  d = addHairpin(d, { staff: 1, bar: 0, at: 6 * g, dir: "dim", end: { bar: 1, at: 4 * g } }).doc;  // the other staff may overlap freely
  assert.equal(expressionsOf(d).filter((e) => e.x.kind === "hairpin").length, 2);
  assert.ok(validate(d));
  // removing notes leaves the marks; removing the marks leaves the notes
  const a = bar1(d)[0];
  d = remove(d, [{ ev: a.id }]);
  assert.equal(d.measures[0].expressions.length, 5, "two dynamics, a text, two hairpins");
  const before = d;
  d = removeExpressions(d, ["nope"]);
  assert.equal(d, before, "nothing matched → the same document");
  d = removeExpressions(d, d.measures[0].expressions.filter((x) => x.kind === "dyn").map((x) => x.id));
  assert.deepEqual(d.measures[0].expressions.map((x) => x.kind), ["text", "hairpin", "hairpin"], "sorted by slot: the text on the & of 3, the hairpins on beat 4");
  assert.ok(validate(d));
});

test("expressions: exprSlot snaps to the nearest slot and rolls the tail of a bar into the next; the last bar clamps", () => {
  const d = fresh(), g = exprGrid(timeAt(d, 0)), cap = capacity(timeAt(d, 0));
  assert.deepEqual(exprSlot(d, 0, 0), { bar: 0, at: 0 });
  assert.deepEqual(exprSlot(d, 0, g * 0.4), { bar: 0, at: 0 });
  assert.deepEqual(exprSlot(d, 0, g * 0.6), { bar: 0, at: g });
  assert.deepEqual(exprSlot(d, 0, cap - 1), { bar: 1, at: 0 });
  assert.deepEqual(exprSlot(d, d.measures.length - 1, cap - 1), { bar: d.measures.length - 1, at: cap - g });
  assert.deepEqual(slotOfAbs(d, cap + g + 5), { bar: 1, at: g });
  assert.equal(slotOfAbs(d, cap * d.measures.length), null);
  assert.deepEqual(nextSlot(d, { bar: 0, at: cap - g }), { bar: 1, at: 0 });
  assert.equal(nextSlot(d, { bar: d.measures.length - 1, at: cap - g }), null);
});

test("expressions: moving slides by ticks across bars (a hairpin: both ends), lands on the grid, refuses to leave the piece and moves nothing then; a handle moves one end; retyping changes the value", () => {
  let d = fresh();
  const g = exprGrid(timeAt(d, 0)), cap = capacity(timeAt(d, 0));
  const dy = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 6 * g, value: "p" }); d = dy.doc;
  const hp = addHairpin(d, { staff: 0, bar: 1, at: 0, dir: "cresc", end: { bar: 1, at: 4 * g } }); d = hp.doc;
  const tx = addExpression(d, { kind: "text", staff: 0, bar: 2, at: 0, value: "dolce" }); d = tx.doc;
  d = moveExpressions(d, [dy.id, hp.id], 3 * g);                                   // the dynamic crosses into bar 2, the hairpin shifts whole
  assert.deepEqual([findExpression(d, dy.id).bar, findExpression(d, dy.id).x.at], [1, g]);
  assert.deepEqual([findExpression(d, hp.id).x.at, findExpression(d, hp.id).x.end], [3 * g, { bar: 1, at: 7 * g }]);
  assert.equal(moveExpressions(d, [dy.id], 0), d, "no move → the same document");
  assert.throws(() => moveExpressions(d, [dy.id, hp.id], -(cap + 2 * g)), /as far left/);
  assert.throws(() => moveExpressions(d, [tx.id], cap * 20), /as far right/);
  assert.equal(findExpression(d, dy.id).x.at, g, "a refused move changed nothing");
  assert.throws(() => moveExpressions(d, ["nope"], g), /pick the marks/);
  d = moveExpressions(d, [tx.id], -g);                                             // back into bar 2's tail → bar 1's last slot
  assert.deepEqual([findExpression(d, tx.id).bar, findExpression(d, tx.id).x.at], [1, cap - g]);
  d = moveExpressions(d, [dy.id], 2 * g);                                          // onto the hairpin's start slot: fine, different kinds
  assert.equal(findExpression(d, dy.id).x.at, 3 * g);
  d = moveHairpinEnd(d, hp.id, "end", { bar: 2, at: 2 * g });
  assert.deepEqual(findExpression(d, hp.id).x.end, { bar: 2, at: 2 * g });
  d = moveHairpinEnd(d, hp.id, "start", { bar: 0, at: 4 * g });                    // the start may move into an earlier bar: the hairpin moves to that bar's list
  assert.deepEqual([findExpression(d, hp.id).bar, findExpression(d, hp.id).x.at, findExpression(d, hp.id).x.end], [0, 4 * g, { bar: 2, at: 2 * g }]);
  assert.throws(() => moveHairpinEnd(d, hp.id, "end", { bar: 0, at: 4 * g }), /end after it starts/);
  assert.equal(moveHairpinEnd(d, hp.id, "end", { bar: 2, at: 2 * g }), d, "the same place → the same document");
  d = setExpressionValue(d, [dy.id], "ff");
  assert.equal(findExpression(d, dy.id).x.value, "ff");
  assert.equal(setExpressionValue(d, [dy.id], "ff"), d);
  assert.throws(() => setExpressionValue(d, [dy.id, tx.id], "f"), /not both/);
  assert.throws(() => setExpressionValue(d, [hp.id], "f"), /not both/);
  d = setExpressionValue(d, [tx.id], " a  tempo ");
  assert.equal(findExpression(d, tx.id).x.value, "a tempo");
  assert.ok(validate(d));
  // a moved dynamic landing on another's slot owns it; a moved hairpin landing over another owns the range
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 5 * g, value: "mp" }).doc;
  d = moveExpressions(d, [dy.id], -(cap + 3 * g - 5 * g));
  assert.deepEqual(d.measures[0].expressions.filter((x) => x.kind === "dyn").map((x) => [x.at, x.value]), [[5 * g, "ff"]]);
  assert.ok(validate(d));
});

test("expressions: a vertical nudge lifts a mark off its automatic line by whole staff steps (`dy`, positive = up), clamps at ±20 with a sentence and no change, clears at 0, survives a move and a metre change", () => {
  let d = fresh();
  const g = exprGrid(timeAt(d, 0));
  const dy = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "p" }); d = dy.doc;
  const hp = addHairpin(d, { staff: 0, bar: 0, at: 2 * g, dir: "cresc", end: { bar: 1, at: 0 } }); d = hp.doc;
  d = nudgeExpressionY(d, [dy.id, hp.id], -3);
  assert.deepEqual([findExpression(d, dy.id).x.dy, findExpression(d, hp.id).x.dy], [-3, -3]);
  d = nudgeExpressionY(d, [dy.id], 3);
  assert.equal(findExpression(d, dy.id).x.dy, undefined, "back on the line: the field goes");
  assert.equal(nudgeExpressionY(d, [dy.id], 0), d);
  assert.throws(() => nudgeExpressionY(d, [hp.id], -18), /as low as it goes/);
  assert.equal(findExpression(d, hp.id).x.dy, -3, "a refused nudge changed nothing");
  assert.throws(() => nudgeExpressionY(d, [hp.id], 1.5), /whole steps/);
  assert.throws(() => nudgeExpressionY(d, ["nope"], 1), /pick the marks/);
  d = nudgeExpressionY(d, [hp.id], 23);
  assert.equal(findExpression(d, hp.id).x.dy, 20);
  assert.ok(validate(d));
  d = moveExpressions(d, [hp.id], 2 * g);
  assert.equal(findExpression(d, hp.id).x.dy, 20, "a move keeps the lift");
  const t = setTime(d, 0, { beats: 3, unit: 4 }).doc;
  assert.equal(findExpression(t, hp.id).x.dy, 20, "a metre change keeps the lift");
  assert.throws(() => { const w = structuredClone(d); w.measures[0].expressions[0].dy = 0; validate(w); }, /absent when 0/);
});

test("expressions: a v2 document is upgraded — every note-attached mark lands on its note's onset, a start / stop pair becomes one hairpin, halves alone are dropped, the old fields go; v3 is returned as it is", () => {
  let d = fresh();
  for (let q = 0; q < 4; q++) d = place(d, { bar: 0, staff: 0, ticks: q * Qt, step: 4 }, Q).doc;
  d = place(d, { bar: 1, staff: 0, ticks: Qt, step: 4 }, Q).doc;
  for (let i = 0; i < 3; i++) d = place(d, { bar: 1, staff: 1, ticks: i * (Qt / 2), step: 4 }, E).doc;
  d = tuplet(d, d.measures[1].staves[1].voices[0].slice(0, 3).map((e) => e.id), 3); // a triplet: the second member's onset is off the grid
  const v = bar1(d), v2 = d.measures[1].staves[0].voices[0], t = d.measures[1].staves[1].voices[0];
  v[0].dyn = "p"; v[0].hairpin = "cresc-start"; v[3].hairpin = "cresc-stop"; v[1].text = "dolce"; v2[1].dyn = "ff"; v2[0].text = "a tempo"; // the rest before it carries text
  v[2].hairpin = "dim-stop";                                                                 // a stop without its start
  t[1].dyn = "mf"; t[2].hairpin = "dim-start";                                                // a start without its stop
  d.v = 2;
  assert.ok(validate(d), "a v2 document with marks on notes is valid");
  const u = upgrade(d);
  assert.equal(u.v, 3);
  assert.deepEqual(u.measures[0].expressions.map((x) => [x.kind, x.staff, x.at, x.value ?? x.dir, x.end]), [["dyn", 0, 0, "p", undefined], ["hairpin", 0, 0, "cresc", { bar: 0, at: 3 * Qt }], ["text", 0, Qt, "dolce", undefined]]);
  assert.deepEqual(u.measures[1].expressions.map((x) => [x.kind, x.staff, x.at, x.value]), [["text", 0, 0, "a tempo"], ["dyn", 1, 0, "mf"], ["dyn", 0, Qt, "ff"]], "the triplet's second member (a third of a quarter in) snaps down to beat 1");
  for (const m of u.measures) for (const st of m.staves) for (const vv of st.voices) for (const e of vv ?? []) assert.ok(!("dyn" in e) && !("hairpin" in e) && !("text" in e), "the old fields are gone");
  assert.ok(validate(u));
  assert.equal(upgrade(u), u, "v3 comes back as the same object");
  assert.throws(() => { const w = structuredClone(u); w.measures[0].staves[0].voices[0][0].dyn = "p"; validate(w); }, /keeps its marks in expressions/);
  // a v1 document (no `v` bump needed beyond the marks) upgrades the same way
  const one = fresh(); one.v = 1; one.measures[0].staves[0].voices[0][0].text = "slow";
  assert.deepEqual(upgrade(one).measures[0].expressions.map((x) => [x.kind, x.at, x.value]), [["text", 0, "slow"]]);
});

test("expressions: a metre change carries them by tick (a hairpin's end too, one past the stretch shifts with the bars); trimming keeps a bar a mark sits in or a hairpin ends in", () => {
  let d = fresh();
  const g = exprGrid(timeAt(d, 0)), cap = capacity(timeAt(d, 0));
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "p" }).doc;
  d = addExpression(d, { kind: "text", staff: 0, bar: 1, at: 6 * g, value: "rit." }).doc;      // beat 4 of bar 2 → abs 14 eighths
  const hp = addHairpin(d, { staff: 0, bar: 0, at: 4 * g, dir: "cresc", end: { bar: 5, at: 2 * g } }); d = hp.doc; // ends past the stretch
  const r = setTime(d, 0, { beats: 3, unit: 4 });                                              // 8 bars of 4/4 → 11 bars of 3/4 (the stretch is the whole piece)
  const u = r.doc, cap3 = capacity({ beats: 3, unit: 4 });
  assert.equal(u.measures.length, 11, "thirty-two quarters make eleven bars of three; the eleventh is empty, so none is appended");
  const all = expressionsOf(u);
  assert.deepEqual(all.map((e) => [e.x.kind, e.bar, e.x.at]), [["dyn", 0, 0], ["hairpin", 0, 4 * g], ["text", 2, 14 * g - 2 * cap3]]);
  assert.equal(findExpression(u, hp.id).x.end.bar * cap3 + findExpression(u, hp.id).x.end.at, 5 * cap + 2 * g, "the end keeps its absolute tick");
  assert.ok(validate(u));
  // an expression in a trailing bar, or a hairpin ending there, keeps the bar through trimBars
  let t = fresh();
  for (let b = 8; b < 14; b++) t.measures.push(newMeasure(2));
  t = addExpression(t, { kind: "dyn", staff: 0, bar: 11, at: 0, value: "p" }).doc;
  assert.equal(trimBars(t).measures.length, 13, "the bar it sits in plus one");
  t = addHairpin(t, { staff: 1, bar: 10, at: 0, dir: "dim", end: { bar: 12, at: 2 * g } }).doc;
  assert.equal(trimBars(t).measures.length, 14, "the bar the hairpin ends in plus one");
  assert.equal(trimBars(fresh()).measures.length, 8);
});

test("arpeggio: one roll per note, set / switch / clear on the selection, notes only", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 8 }, Q).doc;   // a chord
  d = place(d, { bar: 0, staff: 0, ticks: Qt, step: 6 }, Q).doc;
  const [a, b] = bar1(d);
  d = arpeggio(d, [a.id, b.id], "up");
  assert.deepEqual([find(d, a.id).ev.arp, find(d, b.id).ev.arp], ["up", "up"]);
  d = arpeggio(d, [a.id], "down");                                // a different roll replaces
  assert.equal(find(d, a.id).ev.arp, "down");
  d = arpeggio(d, [a.id, b.id], "plain");                         // not all plain → all plain
  assert.deepEqual([find(d, a.id).ev.arp, find(d, b.id).ev.arp], ["plain", "plain"]);
  d = arpeggio(d, [a.id, b.id], "plain");                         // all have it → off
  assert.deepEqual([find(d, a.id).ev.arp, find(d, b.id).ev.arp], [undefined, undefined]);
  assert.throws(() => arpeggio(d, [a.id], "sideways"), Nudge);
  const rest = bar1(d)[2];
  assert.throws(() => arpeggio(d, [rest.id], "up"), /pick the chord/);
});

test("articulate / gliss toggle on the selection; gliss needs a note after it and dies with it", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: Qt, step: 6 }, Q).doc;
  const [a, b] = bar1(d);
  d = articulate(d, [a.id, b.id], "staccato");
  assert.deepEqual([find(d, a.id).ev.art, find(d, b.id).ev.art], [["staccato"], ["staccato"]]);
  d = articulate(d, [a.id], "accent");
  assert.deepEqual(find(d, a.id).ev.art, ["staccato", "accent"]);
  d = articulate(d, [a.id, b.id], "staccato"); // all have it → off
  assert.deepEqual([find(d, a.id).ev.art, find(d, b.id).ev.art], [["accent"], undefined]);
  assert.throws(() => articulate(d, [a.id], "bogus"), Nudge);
  d = gliss(d, [a.id]);
  assert.equal(find(d, a.id).ev.gliss, "start");
  assert.throws(() => gliss(d, [b.id]), /needs a note after/);
  d = gliss(d, [a.id]); assert.equal(find(d, a.id).ev.gliss, undefined);
  d = gliss(d, [a.id]);
  d = remove(d, [{ ev: b.id }]);
  assert.equal(find(d, a.id).ev.gliss, undefined, "the gliss dies with its target");
  validate(d);
});

test("fuzz: 3,000 edits mixing time / key / clef changes with notes keep every invariant", () => {
  let seed = 23;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let d = fresh();
  const durs = [W, H, Q, E, { base: 16, dots: 0, rest: false }, { base: 4, dots: 1, rest: false }, { base: 8, dots: 0, rest: false, tuplet: 3 }];
  const times = [{ beats: 4, unit: 4 }, { beats: 3, unit: 4 }, { beats: 6, unit: 8 }, { beats: 2, unit: 2 }, { beats: 5, unit: 4 }, { beats: 7, unit: 8 }];
  let timeChanges = 0, nudges = 0, clefChanges = 0;
  for (let i = 0; i < 3000; i++) {
    const x = rnd();
    try {
      if (x < 0.6) { const bar = Math.floor(rnd() * d.measures.length), cap = capacity(timeAt(d, bar)); d = place(d, { bar, staff: Math.floor(rnd() * 2), ticks: Math.floor(rnd() * cap), step: Math.floor(rnd() * 17) - 4 }, pick(durs)).doc; }
      else if (x < 0.75) { const r = setTime(d, Math.floor(rnd() * d.measures.length), pick(times)); d = r.doc; timeChanges++; }
      else if (x < 0.85) d = setKey(d, Math.floor(rnd() * d.measures.length), Math.floor(rnd() * 15) - 7);
      else if (x < 0.92) { const bar = Math.floor(rnd() * d.measures.length), beat = groupSize(timeAt(d, bar)), n = capacity(timeAt(d, bar)) / beat; d = setClef(d, bar, Math.floor(rnd() * 2), pick(["treble", "bass", "alto", "tenor", "baritone", "mezzo", "soprano"]), Math.floor(rnd() * n) * beat); clefChanges++; }
      else { const ns = d.measures.flatMap((m) => m.staves.flatMap((s) => s.voices[0].filter((e) => e.kind === "note"))); if (ns.length) d = articulate(d, [pick(ns).id], pick(["staccato", "fermata", "trill"])); }
    } catch (e) { if (!(e instanceof Nudge)) throw e; nudges++; }
    if (i % 100 === 0) validate(d);
    if (d.measures.length > 400) d = trimBars(d);
  }
  validate(d);
  assert.ok(timeChanges > 100 && clefChanges > 100 && nudges >= 0, `${timeChanges} ${clefChanges} ${nudges}`);
  assert.ok(d.measures.some((m) => m.clefChanges?.length), "some clef changes sit inside bars");
});

// --- P5 (WSHED-120): voices — sparse per bar, the voice follows the pen, move / swap / cross / hide ---------
import { setVoice, swapVoices, crossStaff, hideRest, nudgeRest, seqOf, compactVoices } from "../js/lib/compose/engine.js";
import { REST_Y_MAX, clone } from "../js/lib/compose/model.js";
import { usedVoices, MAX_VOICES, SCHEMA } from "../js/lib/compose/model.js";
const vKinds = (doc, bar, staff, vi) => (doc.measures[bar].staves[staff].voices[vi] ?? null)?.map((e) => `${e.kind === "rest" ? "r" : "n"}${e.dur.base}${".".repeat(e.dur.dots)}${e.dur.tuplet ? `/${e.dur.tuplet.n}` : ""}`).join(" ") ?? null;

test("voices are sparse per bar: a tap into voice 2 creates it with padding rests, only in that bar; deleting its last note removes it; voice 1 always stays; a v1 document validates as v2", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  assert.equal(SCHEMA, 3); assert.equal(d.v, 3);
  assert.equal(d.measures[0].staves[0].voices.length, 1);
  const r = place(d, { bar: 0, staff: 0, ticks: 100, step: 0, voice: 1 }, H);
  d = r.doc;
  assert.equal(r.action, "place");
  assert.equal(vKinds(d, 0, 0, 0), "n4 r4 r2", "voice 1 untouched");
  assert.equal(vKinds(d, 0, 0, 1), "n2 r2", "voice 2 padded with the metre's rests");
  assert.equal(d.measures[1].staves[0].voices.length, 1, "no voice 2 in the next bar");
  assert.equal(d.measures[0].staves[1].voices.length, 1, "no voice 2 on the other staff");
  validate(d);
  assert.deepEqual([...usedVoices(d)], [0, 1]);
  // a note of voice 1 and voice 2 at one onset: both stay (two voices at one onset is the point)
  d = place(d, { bar: 0, staff: 0, ticks: 2 * PPQ + 100, step: 2, voice: 1 }, Q).doc;
  assert.equal(vKinds(d, 0, 0, 1), "n2 n4 r4");
  assert.equal(vKinds(d, 0, 0, 0), "n4 r4 r2");
  // tapping into voice 2 on a slot where voice 1 rests places into voice 2, not voice 1
  d = place(d, { bar: 0, staff: 0, ticks: 3 * PPQ + 50, step: 2, voice: 1 }, Q).doc;
  assert.equal(vKinds(d, 0, 0, 1), "n2 n4 n4"); assert.equal(vKinds(d, 0, 0, 0), "n4 r4 r2");
  // a rest placed into a voice that is not in the bar changes nothing
  const none = place(d, { bar: 3, staff: 0, ticks: 0, step: 4, voice: 1 }, { base: 4, dots: 0, rest: true });
  assert.equal(none.action, "none"); assert.equal(none.doc, d);
  // removing every note of voice 2 → the voice leaves the bar (compactVoices); voice 1 stays even when all rests
  const v2 = d.measures[0].staves[0].voices[1].filter((e) => e.kind === "note");
  let e = remove(d, v2.map((n) => ({ ev: n.id })));
  assert.equal(e.measures[0].staves[0].voices.length, 1, "voice 2 gone with its last note");
  validate(e);
  e = remove(e, [{ ev: e.measures[0].staves[0].voices[0][0].id }]);
  assert.equal(vKinds(e, 0, 0, 0), "r1");
  validate(e);
  // voice 3 without voice 2: a null slot in between, never a trailing one
  let f = place(fresh(), { bar: 0, staff: 1, ticks: 0, step: 4, voice: 2 }, Q).doc;
  assert.deepEqual(f.measures[0].staves[1].voices.map((v) => (v ? "v" : "-")), ["v", "-", "v"]);
  validate(f);
  f = toRests(f, [f.measures[0].staves[1].voices[2][0].id]);
  assert.equal(f.measures[0].staves[1].voices.length, 1);
  assert.throws(() => place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4, voice: MAX_VOICES }, Q), Nudge);
  // a v1 document (one voice per staff) validates unchanged
  const old = fresh(); old.v = 1; validate(old);
});

test("retype / dot / tuplet / accidental / setPitch act on a note in its own voice; the other voice at the same onset is untouched", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 8 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 0, voice: 1 }, Q).doc;
  const a = d.measures[0].staves[0].voices[0][0], b = d.measures[0].staves[0].voices[1][0];
  d = retype(d, [b.id], H);
  assert.equal(vKinds(d, 0, 0, 1), "n2 r2"); assert.equal(vKinds(d, 0, 0, 0), "n4 r4 r2");
  d = dot(d, [a.id], 1);
  assert.equal(vKinds(d, 0, 0, 0), "n4. r8 r2"); assert.equal(vKinds(d, 0, 0, 1), "n2 r2");
  d = setPitch(d, [{ ev: b.id, pi: 0 }], 2).doc;
  assert.equal(find(d, b.id).ev.pitches[0].step + find(d, b.id).ev.pitches[0].octave, "G4");
  assert.equal(find(d, a.id).ev.pitches[0].step + find(d, a.id).ev.pitches[0].octave, "F5");
  d = accidental(d, [{ ev: b.id, pi: 0 }], 1);
  assert.equal(find(d, b.id).ev.pitches[0].alter, 1); assert.equal(find(d, a.id).ev.pitches[0].alter, 0);
  // three eighths in voice 2 make a triplet; voice 1 keeps its dotted quarter
  let e = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 8 }, { base: 4, dots: 1, rest: false }).doc;
  for (let i = 0; i < 3; i++) e = place(e, { bar: 0, staff: 0, ticks: i * (PPQ / 2), step: i, voice: 1 }, E).doc;
  e = tuplet(e, e.measures[0].staves[0].voices[1].slice(0, 3).map((x) => x.id), 3);
  assert.equal(vKinds(e, 0, 0, 1), "n8/3 n8/3 n8/3 r4 r2"); assert.equal(vKinds(e, 0, 0, 0), "n4. r8 r2");
  validate(e);
});

test("ties, slurs and gliss pair within one voice: a tie needs the voice in the next bar, a one-note slur reaches the voice's next note across a silent bar", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 3 * PPQ, step: 0, voice: 1 }, Q).doc;   // E4 in voice 2, beat 4
  d = place(d, { bar: 0, staff: 0, ticks: 3 * PPQ, step: 8 }, Q).doc;                        // F5 in voice 1 at the same onset
  d = place(d, { bar: 1, staff: 0, ticks: 0, step: 8 }, Q).doc;                              // voice 1 continues in bar 2
  d = place(d, { bar: 2, staff: 0, ticks: 0, step: 0, voice: 1 }, H).doc;                    // voice 2 is absent from bar 2, present in bar 3
  const v2a = d.measures[0].staves[0].voices[1].find((e) => e.kind === "note"), v2b = d.measures[2].staves[0].voices[1][0], v1a = d.measures[0].staves[0].voices[0].find((e) => e.kind === "note");
  assert.equal(seqOf(d, 0, 1).length, 3 + 2, "voice 2's sequence skips the bar it is not in");
  assert.throws(() => tie(d, [{ ev: v2a.id }]), /same pitch next/, "no voice 2 in the next bar: nothing adjacent to tie to");
  assert.throws(() => gliss(d, [v2a.id]), /needs a note after/);
  d = slur(d, [v2a.id]);                                                                       // one note → to the next note of its voice, across the silent bar
  assert.equal(slurEnd(d, 0, 1, find(d, v2a.id).ev, find(d, v2a.id).ev.slurs[0].id), find(d, v2b.id).ev);
  validate(d);
  // with voice 2 in the next bar the tie holds, and only in voice 2
  d = place(d, { bar: 1, staff: 0, ticks: 0, step: 0, voice: 1 }, Q).doc;                    // E4 voice 2, bar 2 beat 1
  const v2mid = d.measures[1].staves[0].voices[1][0];
  d = tie(d, [{ ev: v2a.id }]);
  assert.equal(find(d, v2a.id).ev.pitches[0].tie, "start"); assert.equal(find(d, v2mid.id).ev.pitches[0].tie, "stop");
  assert.equal(find(d, v1a.id).ev.pitches[0].tie, undefined, "voice 1 is not tied by a voice-2 tie");
  d = gliss(d, [v2a.id]);
  assert.equal(find(d, v2a.id).ev.gliss, "start");
  validate(d);
  // voice 1 alone: its own tie only; a tie can never cross voices
  let e = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  e = place(e, { bar: 0, staff: 0, ticks: PPQ, step: 4, voice: 1 }, Q).doc;                  // the same pitch next, but in voice 2
  assert.throws(() => tie(e, [{ ev: e.measures[0].staves[0].voices[0][0].id }]), /same pitch next/);
  // moving the voice-2 note away drops the tie (cleanTies per voice)
  const g = setVoice(d, [v2mid.id], 2);
  assert.equal(find(g, v2a.id).ev.pitches[0].tie, undefined);
  validate(g);
});

test("setVoice moves notes at their own onsets: creates the voice, leaves rests behind, refuses a collision or a split tuplet whole, keeps ids", () => {
  let d = fresh();
  for (let q = 0; q < 4; q++) d = place(d, { bar: 0, staff: 0, ticks: q * PPQ, step: 4 + q }, Q).doc;
  const v1 = d.measures[0].staves[0].voices[0];
  const moved = setVoice(d, [v1[1].id, v1[2].id], 1);
  assert.equal(vKinds(moved, 0, 0, 0), "n4 r4 r4 n4", "the time they left is rests (a half rest never starts on beat 2)"); assert.equal(vKinds(moved, 0, 0, 1), "r4 n4 n4 r4");
  assert.ok(find(moved, v1[1].id) && find(moved, v1[1].id).voice === 1, "the note keeps its id in its new voice");
  validate(moved);
  // back to voice 1 → the voice-2 bar goes away again
  const back = setVoice(moved, [v1[1].id, v1[2].id], 0);
  assert.equal(vKinds(back, 0, 0, 0), "n4 n4 n4 n4"); assert.equal(back.measures[0].staves[0].voices.length, 1);
  // a collision: voice 1 already sounds on beat 1 → refused whole, nothing changes
  const before = JSON.stringify(moved);
  const v2 = moved.measures[0].staves[0].voices[1];
  const clash = place(moved, { bar: 0, staff: 0, ticks: PPQ, step: 8 }, Q).doc;            // voice 1 gets a note under voice 2's beat 2 note
  assert.throws(() => setVoice(clash, [v2[1].id], 0), /already sounds/);
  assert.equal(JSON.stringify(moved), before);
  assert.throws(() => setVoice(moved, [v2[1].id], 9), Nudge);
  assert.equal(setVoice(moved, [v2[1].id], 1), moved, "moving to the voice it is in changes nothing");
  // a half over two beats where the other voice has a note on the second beat also collides
  let e = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, H).doc;
  e = place(e, { bar: 0, staff: 0, ticks: PPQ, step: 0, voice: 1 }, Q).doc;
  assert.throws(() => setVoice(e, [e.measures[0].staves[0].voices[0][0].id], 1), /already sounds/);
  // a tuplet moves whole or not at all
  let t = fresh();
  for (let i = 0; i < 3; i++) t = place(t, { bar: 0, staff: 0, ticks: i * (PPQ / 2), step: 4 }, E).doc;
  t = tuplet(t, t.measures[0].staves[0].voices[0].slice(0, 3).map((x) => x.id), 3);
  const trip = t.measures[0].staves[0].voices[0].slice(0, 3);
  assert.throws(() => setVoice(t, [trip[0].id], 1), /whole tuplet/);
  const tm = setVoice(t, trip.map((x) => x.id), 1);
  assert.equal(vKinds(tm, 0, 0, 1), "n8/3 n8/3 n8/3 r4 r2"); assert.equal(vKinds(tm, 0, 0, 0), "r1");
  validate(tm);
  // across two bars and both staves in one go
  let m = fresh();
  m = place(m, { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc; m = place(m, { bar: 1, staff: 1, ticks: 2 * PPQ, step: 4 }, Q).doc;
  const ids = [m.measures[0].staves[0].voices[0][0].id, m.measures[1].staves[1].voices[0][1].id];
  const mm = setVoice(m, ids, 3);
  assert.equal(vKinds(mm, 0, 0, 3), "n4 r4 r2"); assert.equal(vKinds(mm, 1, 1, 3), "r2 n4 r4");
  validate(mm);
});

test("swapVoices exchanges voices 1 and 2 in whole bars; voice 1 never leaves (rests fill it); a bar without either is untouched", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 8 }, W).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 0, voice: 1 }, H).doc;
  d = place(d, { bar: 1, staff: 0, ticks: 0, step: 4 }, Q).doc;                              // bar 2: voice 1 only
  const s = swapVoices(d, [{ bar: 0, staff: 0 }, { bar: 1, staff: 0 }], 0, 1);
  assert.equal(vKinds(s, 0, 0, 0), "n2 r2"); assert.equal(vKinds(s, 0, 0, 1), "n1");
  assert.equal(vKinds(s, 1, 0, 0), "r1", "voice 1 of bar 2 became rests"); assert.equal(vKinds(s, 1, 0, 1), "n4 r4 r2");
  validate(s);
  assert.equal(swapVoices(d, [{ bar: 0, staff: 0 }], 1, 1), d);
  assert.throws(() => swapVoices(fresh(), [{ bar: 3, staff: 0 }], 1, 2), /nothing to swap/);
  const twice = swapVoices(swapVoices(d, [{ bar: 0, staff: 0 }], 0, 1), [{ bar: 0, staff: 0 }], 0, 1);
  assert.equal(vKinds(twice, 0, 0, 0), vKinds(d, 0, 0, 0)); assert.equal(vKinds(twice, 0, 0, 1), vKinds(d, 0, 0, 1));
});

test("crossStaff: a lower-staff note steps up to the upper staff (cross −1) and back; past the outer staff refuses; hideRest toggles rests only", () => {
  let d = place(fresh(), { bar: 0, staff: 1, ticks: 0, step: 10 }, Q).doc;                 // a high note on the bass staff
  const id = d.measures[0].staves[1].voices[0][0].id;
  d = crossStaff(d, [id], -1);
  assert.equal(find(d, id).ev.cross, -1); assert.equal(find(d, id).staff, 1, "still owned by the lower staff");
  validate(d);
  assert.throws(() => crossStaff(d, [id], -1), /no staff above/);
  d = crossStaff(d, [id], 1);
  assert.equal(find(d, id).ev.cross, undefined, "back home");
  assert.throws(() => crossStaff(d, [id], 1), /no staff below/);
  const u = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: -2 }, Q);                     // an upper-staff note steps down to the lower staff
  assert.equal(find(crossStaff(u.doc, [u.ev.id], 1), u.ev.id).ev.cross, 1);
  assert.throws(() => crossStaff(u.doc, [u.ev.id], -1), /no staff above/);
  const rest = d.measures[0].staves[1].voices[0][1];
  assert.throws(() => hideRest(d, [id]), /pick the rests/);
  d = hideRest(d, [rest.id]);
  assert.equal(find(d, rest.id).ev.hidden, true);
  validate(d);
  d = hideRest(d, [rest.id]);
  assert.equal(find(d, rest.id).ev.hidden, undefined);
  // a hidden rest still takes a tap: placing into it works and the new padding rests are not hidden
  d = hideRest(d, [rest.id]);
  const p = place(d, { bar: 0, staff: 1, ticks: PPQ + 100, step: 4 }, E).doc;
  assert.equal(vKinds(p, 0, 1, 0), "n4 n8 r8 r2");
  validate(p);
});

test("clipboard keeps voice offsets: a two-voice phrase pastes as two voices from the active one, capped at voice 4; a crossed note keeps its cross when the staff exists", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 8 }, H).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 0, voice: 1 }, Q).doc;
  d = place(d, { bar: 0, staff: 0, ticks: PPQ, step: 1, voice: 1 }, Q).doc;
  const all = [...d.measures[0].staves[0].voices[0].filter((e) => e.kind === "note"), ...d.measures[0].staves[0].voices[1].filter((e) => e.kind === "note")];
  const clip = clipFrom(d, all.map((e) => ({ ev: e.id })));
  assert.deepEqual(clip.events.map((e) => e.dVoice), [0, 1, 1]);
  let r = paste(d, clip, { bar: 2, ticks: 0, staff: 1, voice: 0 });
  assert.equal(vKinds(r.doc, 2, 1, 0), "n2 r2"); assert.equal(vKinds(r.doc, 2, 1, 1), "n4 n4 r2");
  validate(r.doc);
  r = paste(d, clip, { bar: 2, ticks: 0, staff: 0, voice: 2 });                                // from voice 3: voices 3 and 4
  assert.equal(vKinds(r.doc, 2, 0, 2), "n2 r2"); assert.equal(vKinds(r.doc, 2, 0, 3), "n4 n4 r2");
  assert.equal(vKinds(r.doc, 2, 0, 0), "r1");
  validate(r.doc);
  assert.throws(() => paste(d, clip, { bar: 2, ticks: 0, staff: 0, voice: 3 }), /overlap/);      // both would land in voice 4: refused whole
  // a phrase from voice 2 alone lands in the active voice (no offset)
  const c2 = clipFrom(d, [{ ev: all[1].id }, { ev: all[2].id }]);
  assert.deepEqual(c2.events.map((e) => e.dVoice), [0, 0]);
  const p2 = paste(d, c2, { bar: 3, ticks: 0, staff: 0, voice: 0 });
  assert.equal(vKinds(p2.doc, 3, 0, 0), "n4 n4 r2"); assert.equal(p2.doc.measures[3].staves[0].voices.length, 1);
  // a crossed note travels with its cross
  let x = place(fresh(), { bar: 0, staff: 1, ticks: 0, step: 10 }, Q).doc;
  const xid = x.measures[0].staves[1].voices[0][0].id;
  x = crossStaff(x, [xid], -1);
  const cx = clipFrom(x, [{ ev: xid }]);
  const px = paste(x, cx, { bar: 1, ticks: 0, staff: 1 });
  assert.equal(px.doc.measures[1].staves[1].voices[0][0].cross, -1);
  const px0 = paste(x, cx, { bar: 1, ticks: 0, staff: 0 });
  assert.equal(px0.doc.measures[1].staves[0].voices[0][0].cross, undefined, "no staff above the upper one: the cross is dropped");
  validate(px.doc); validate(px0.doc);
});

test("setTime re-cuts every voice: a voice-2 half across the new barline ties, the voice appears only in bars that hold it", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 8 }, W).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 2 * PPQ, step: 0, voice: 1 }, H).doc;              // beats 3–4 in voice 2
  const r = setTime(d, 0, { beats: 3, unit: 4 });
  validate(r.doc);
  assert.equal(vKinds(r.doc, 0, 0, 0), "n2."); assert.equal(vKinds(r.doc, 1, 0, 0), "n4 r4 r4");
  assert.equal(vKinds(r.doc, 0, 0, 1), "r2 n4"); assert.equal(vKinds(r.doc, 1, 0, 1), "n4 r4 r4");
  assert.equal(r.doc.measures[0].staves[0].voices[1][1].pitches[0].tie, "start"); assert.equal(r.doc.measures[1].staves[0].voices[1][0].pitches[0].tie, "stop");
  assert.equal(r.doc.measures[2].staves[0].voices.length, 1, "voice 2 is not in a bar it does not sound in");
});

test("fuzz: 4,000 random edits across four voices keep every invariant (every present voice adds up, voice 1 exists, no rest-only secondary voice)", () => {
  let seed = 31;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let d = fresh();
  const durs = [W, H, Q, E, { base: 16, dots: 0, rest: false }, { base: 4, dots: 1, rest: false }, { base: 8, dots: 0, rest: true }, { base: 8, dots: 0, rest: false, tuplet: 3 }, { base: 4, dots: 0, rest: false, tuplet: 3 }];
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] ?? 0) + 1; };
  const notes = () => d.measures.flatMap((m) => m.staves.flatMap((s) => s.voices.flatMap((v) => (v ? v.filter((e) => e.kind === "note") : []))));
  const rests = () => d.measures.flatMap((m) => m.staves.flatMap((s) => s.voices.flatMap((v) => (v ? v.filter((e) => e.kind === "rest") : []))));
  const run = (k, fn) => { try { const n = fn(); if (n !== d) { d = n; bump(k); } else bump("noop"); } catch (e) { if (!(e instanceof Nudge)) throw e; bump("nudge"); } };
  for (let i = 0; i < 4000; i++) {
    const x = rnd(), ns = notes();
    if (x < 0.4 || !ns.length) {
      const bar = Math.floor(rnd() * d.measures.length), staff = Math.floor(rnd() * 2), cap = capacity(timeAt(d, bar));
      run("place", () => place(d, { bar, staff, ticks: Math.floor(rnd() * cap), step: Math.floor(rnd() * 17) - 4, voice: Math.floor(rnd() * 4) }, pick(durs)).doc);
    } else if (x < 0.5) { const n = pick(ns); run("remove", () => remove(d, [{ ev: n.id, ...(n.pitches.length > 1 && rnd() < 0.5 ? { pi: 0 } : {}) }])); }
    else if (x < 0.62) { const picked = [...new Set([pick(ns), pick(ns), pick(ns)].slice(0, 1 + Math.floor(rnd() * 3)))]; run("setVoice", () => setVoice(d, picked.map((n) => n.id), Math.floor(rnd() * 4))); }
    else if (x < 0.68) { const n = pick(ns), f = find(d, n.id); run("swap", () => swapVoices(d, [{ bar: f.bar, staff: f.staff }], 0, 1 + Math.floor(rnd() * 3))); }
    else if (x < 0.74) { const n = pick(ns); run("cross", () => crossStaff(d, [n.id], pick([-1, 1]))); }
    else if (x < 0.78) { const rs = rests(); if (rs.length) run(rnd() < 0.5 ? "hide" : "nudgeRest", () => (rnd() < 0.5 ? hideRest(d, [pick(rs).id]) : nudgeRest(d, [pick(rs).id], pick([-3, -1, 1, 2, 5])))); }
    else if (x < 0.84) { const n = pick(ns); run("tie", () => tie(d, [{ ev: n.id }])); if (rnd() < 0.5) run("slur", () => slur(d, [n.id])); }
    else if (x < 0.88) { const n = pick(ns); run("retype", () => retype(d, [n.id], pick([W, H, Q, E]))); }
    else if (x < 0.92) { const n = pick(ns), f = find(d, n.id), voice = d.measures[f.bar].staves[f.staff].voices[f.voice]; run("tuplet", () => tuplet(d, voice.slice(f.index, f.index + pick([2, 3, 3])).map((e) => e.id), pick([2, 3, 5]))); }
    else if (x < 0.95) { const bar = Math.floor(rnd() * d.measures.length), t = pick([{ beats: 4, unit: 4 }, { beats: 3, unit: 4 }, { beats: 6, unit: 8 }, { beats: 2, unit: 4 }]); run("time", () => setTime(d, bar, t).doc); }
    else { const n = pick(ns), f = find(d, n.id), near = d.measures[f.bar].staves.flatMap((s) => s.voices.flatMap((v) => (v ? v.filter((e) => e.kind === "note") : []))); const clip = clipFrom(d, [{ ev: n.id }, { ev: pick(near).id }]); const bar = Math.floor(rnd() * d.measures.length); run("paste", () => paste(d, clip, { bar, ticks: pick([0, PPQ, 2 * PPQ]), staff: Math.floor(rnd() * 2), voice: Math.floor(rnd() * 4) }).doc); }
    if (i % 150 === 0) validate(d);
    if (d.measures.length > 300) d = trimBars(d);
  }
  validate(d);
  for (const k of ["place", "remove", "setVoice", "swap", "cross", "hide", "nudgeRest", "retype", "tuplet", "time", "paste"]) assert.ok(counts[k] > 10, `${k}: ${counts[k]}`);
  assert.ok(rests().some((r) => r.restY), "dragged rests survive");
  assert.ok(counts.tie > 2 && counts.slur > 10, `tie ${counts.tie} slur ${counts.slur}`); // a tie needs the same pitch next in the voice: rare under random steps
  assert.ok(usedVoices(d).size >= 3, "several voices in use: " + [...usedVoices(d)].join());
  assert.ok(d.measures.some((m) => m.staves.some((s) => s.voices.length > 2)), "voices 3 or 4 appear");
  assert.ok(notes().some((n) => n.cross), "crossed notes survive");
});

test("nudgeRest: a display offset in steps on rests only, clamped at ±REST_Y_MAX, cleared at 0; it survives normalisation while the rest keeps its onset and length, and is dropped when the rest is re-split", () => {
  let d = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;              // n4 r4 r2
  const [note, r4, r2] = d.measures[0].staves[0].voices[0];
  assert.throws(() => nudgeRest(d, [note.id], 1), /pick the rests/);
  assert.throws(() => nudgeRest(d, [r4.id], 0.5), /whole steps/);
  d = nudgeRest(d, [r4.id, r2.id], -3);
  assert.equal(find(d, r4.id).ev.restY, -3); assert.equal(find(d, r2.id).ev.restY, -3);
  validate(d);
  d = nudgeRest(d, [r4.id], 3);
  assert.equal(find(d, r4.id).ev.restY, undefined, "back to automatic clears the field");
  assert.throws(() => nudgeRest(d, [r2.id], -(REST_Y_MAX)), /as low as it goes/);
  d = nudgeRest(d, [r2.id], -(REST_Y_MAX - 3));
  assert.equal(find(d, r2.id).ev.restY, -REST_Y_MAX);
  assert.throws(() => nudgeRest(nudgeRest(d, [r4.id], REST_Y_MAX), [r4.id], 1), /as high as it goes/);
  assert.equal(d.measures[0].staves[0].voices[0].reduce((n, e) => n + evTicks(e), 0), capacity(timeAt(d, 0)), "the bar still adds up");
  // normalisation keeps the offset on a rest that comes back unchanged: re-pitching the note re-normalises the bar
  const moved = setPitch(d, [{ ev: note.id, pi: 0 }], 2).doc;
  assert.equal(find(moved, r2.id).ev.restY, -REST_Y_MAX, "the half rest keeps its offset");
  assert.equal(vKinds(moved, 0, 0, 0), "n4 r4 r2");
  // ...and hidden survives the same way (before, any later edit in the bar showed the rest again)
  const hid = setPitch(hideRest(d, [r2.id]), [{ ev: note.id, pi: 0 }], -1).doc;
  assert.equal(find(hid, r2.id).ev.hidden, true);
  // a note placed into the dragged half rest re-splits it: the pieces are fresh rests at the automatic place
  const split = place(d, { bar: 0, staff: 0, ticks: 3 * Qt, step: 4 }, Q).doc;      // n4 r4 r4 n4
  assert.equal(vKinds(split, 0, 0, 0), "n4 r4 r4 n4");
  assert.ok(split.measures[0].staves[0].voices[0].filter((e) => e.kind === "rest").every((e) => !e.restY), "re-split rests start at the automatic place");
  validate(split);
  // a whole-bar rest (voice 1 silent under voice 2) takes the offset too
  let v = place(fresh(), { bar: 0, staff: 0, ticks: 0, step: 4, voice: 1 }, Q).doc;
  const whole = v.measures[0].staves[0].voices[0][0];
  v = nudgeRest(v, [whole.id], 4);
  assert.equal(find(v, whole.id).ev.restY, 4); validate(v);
  // the schema refuses a bad offset
  const bad = clone(d); bad.measures[0].staves[0].voices[0][1].restY = REST_Y_MAX + 1;
  assert.throws(() => validate(bad), /restY/);
  const onNote = clone(d); onNote.measures[0].staves[0].voices[0][0].restY = 1;
  assert.throws(() => validate(onNote), /restY/);
});

test("clipboard: a crossed tuplet sibling copied as a rest sheds its cross — the paste validates (found by the fuzz)", () => {
  let d = fresh();
  d = place(d, { bar: 0, staff: 1, ticks: 0, step: 10 }, { base: 8, dots: 0, rest: false, tuplet: 3 }).doc;
  d = place(d, { bar: 0, staff: 1, ticks: snap(d, { bar: 0, staff: 1, ticks: PPQ / 3 + 10 }, { base: 8, dots: 0, rest: false, tuplet: 3 }).ticks, step: 10 }, { base: 8, dots: 0, rest: false, tuplet: 3 }).doc;
  const trip = d.measures[0].staves[1].voices[0].filter((e) => e.dur.tuplet);
  assert.ok(trip.length >= 2, "a triplet group: " + vKinds(d, 0, 1, 0));
  d = crossStaff(d, [trip[0].id], -1);
  validate(d);
  const clip = clipFrom(d, [{ ev: trip[1].id }]);                   // the crossed sibling rides along as a rest
  assert.ok(clip.events.every((e) => e.kind === "note" || !e.cross), "no rest in the clip crosses");
  const p = paste(d, clip, { bar: 2, ticks: 0, staff: 1, voice: 0 }).doc;
  validate(p);
});
