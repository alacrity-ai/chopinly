import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition, validate, timeAt, isEmptyBar, evTicks } from "../js/lib/compose/model.js";
import { place, remove, snap, trimBars, find, onsets, pitchFromStep, midiOf, Nudge, normalizeBar, setPitch, stepOf, retype, dot, tie, tuplet, accidental, clipFrom, paste, toRests, setKey, setTime, setClef, articulate, gliss, decompose } from "../js/lib/compose/engine.js";
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
  let timeChanges = 0, nudges = 0;
  for (let i = 0; i < 3000; i++) {
    const x = rnd();
    try {
      if (x < 0.6) { const bar = Math.floor(rnd() * d.measures.length), cap = capacity(timeAt(d, bar)); d = place(d, { bar, staff: Math.floor(rnd() * 2), ticks: Math.floor(rnd() * cap), step: Math.floor(rnd() * 17) - 4 }, pick(durs)).doc; }
      else if (x < 0.75) { const r = setTime(d, Math.floor(rnd() * d.measures.length), pick(times)); d = r.doc; timeChanges++; }
      else if (x < 0.85) d = setKey(d, Math.floor(rnd() * d.measures.length), Math.floor(rnd() * 15) - 7);
      else if (x < 0.92) d = setClef(d, Math.floor(rnd() * d.measures.length), Math.floor(rnd() * 2), pick(["treble", "bass", "alto", "tenor"]));
      else { const ns = d.measures.flatMap((m) => m.staves.flatMap((s) => s.voices[0].filter((e) => e.kind === "note"))); if (ns.length) d = articulate(d, [pick(ns).id], pick(["staccato", "fermata", "trill"])); }
    } catch (e) { if (!(e instanceof Nudge)) throw e; nudges++; }
    if (i % 100 === 0) validate(d);
    if (d.measures.length > 400) d = trimBars(d);
  }
  validate(d);
  assert.ok(timeChanges > 100 && nudges >= 0, `${timeChanges} ${nudges}`);
});
