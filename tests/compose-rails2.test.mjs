// The rails filled out (docs/COMPOSE_RAILS2_DESIGN.md, WSHED-127): the extreme and sudden dynamics, niente
// hairpins, text lines, heard rit. / accel., tempo units, repeat times, rehearsal styles, bar repeats,
// 15ma, pedal styles, the new marks and ornaments heard, trill options, stem and beam overrides, grace
// chords — model, engine, engraver, playback and MusicXML both ways.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition, validate, DYNAMICS, SUDDEN } from "../js/lib/compose/model.js";
import { place, addExpression, addHairpin, addTextLine, addPedal, addOttava, setBarline, toggleFormMark, formMarksOf, setSimile, simileSource, articulate, setTrill, setStem, beamBreak, toggleGrace, unroll, tempoMap, quarterBpm, setTime, paste, clipFrom, spansOf, Nudge } from "../js/lib/compose/engine.js";
import { timeline, velocities, clockOf } from "../js/lib/compose/play.js";
import { layoutComposition } from "../js/lib/compose/layout.js";
import { thingAt } from "../js/lib/compose/hit.js";
import { toMusicXml, fromMusicXml } from "../js/lib/compose/musicxml.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const Q = { base: 4, dots: 0, rest: false }, E = { base: 8, dots: 0, rest: false };
const BAR = 4 * PPQ;
/** Eight bars: quarters on beats 1–4 of bar 1 (upper staff, steps 4–7), a quarter on beat 1 of bars 2–4, eighths through bar 5. */
function piece() {
  let d = newComposition({ id: "r2", title: "Rails2", now: 1 });
  for (let i = 0; i < 4; i++) d = place(d, { bar: 0, staff: 0, ticks: i * PPQ, step: 4 + i }, Q).doc;
  for (let b = 1; b < 4; b++) d = place(d, { bar: b, staff: 0, ticks: 0, step: 8 }, Q).doc;
  for (let i = 0; i < 8; i++) d = place(d, { bar: 4, staff: 0, ticks: i * (PPQ / 2), step: 2 + (i % 4) }, E).doc;
  return d;
}
const notesOf = (d, bar = 0, si = 0) => d.measures[bar].staves[si].voices[0].filter((e) => e.kind === "note");
const at = (d, bar, si = 0) => notesOf(d, bar, si);

test("model: the ten levels and five sudden dynamics validate; every new field is checked", () => {
  let d = piece();
  for (const v of [...DYNAMICS, ...SUDDEN]) d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: v }).doc;
  validate(d);
  assert.throws(() => addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "fffff" }), /no such dynamic/);
  const bad = (f, re) => { const c = structuredClone(d); f(c); assert.throws(() => validate(c), re); };
  bad((c) => { c.measures[0].expressions[0].value = "sfff"; }, /not a dynamic/);
  bad((c) => { c.measures[0].barline = { end: "double", times: 3 }; }, /repeat times/);
  bad((c) => { c.measures[0].barline = { end: "repeat", times: 1 }; }, /repeat times/);
  bad((c) => { c.measures[0].form = [{ kind: "tempo", bpm: 100, unit: { base: 16, dots: 0 } }]; }, /unit/);
  bad((c) => { c.measures[0].form = [{ kind: "rehearsal", text: "a word that is far too long" }]; }, /rehearsal/);
  bad((c) => { c.measures[0].form = [{ kind: "rehearsal", text: "Trio", style: "number" }]; }, /rehearsal/);
  bad((c) => { c.measures[0].simile = 1; }, /nothing before it/);
  bad((c) => { c.measures[1].simile = 1; }, /holds no notes/);
  bad((c) => { c.measures[6].simile = 3; }, /1 or 2/);
  bad((c) => { c.measures[5].simile = 2; c.measures[6].simile = 1; }, /plain bar after/);
  bad((c) => { at(c, 0)[0].trill = { line: true }; }, /trilled note/);
  bad((c) => { at(c, 0)[0].art = ["trill"]; at(c, 0)[0].trill = { alter: 2 }; }, /trilled note/);
  bad((c) => { at(c, 0)[0].stem = "left"; }, /stem/);
  bad((c) => { at(c, 0)[0].beam = "join"; }, /beam/);
  bad((c) => { at(c, 0)[0].art = ["turn", "invertedTurn"]; }, /one turn/);
  bad((c) => { c.measures[0].expressions.push({ id: "tl", kind: "textline", staff: 0, at: 0, end: { bar: 1, at: 0 }, text: "" }); }, /text line/);
  bad((c) => { c.measures[0].expressions.push({ id: "o15", kind: "ottava", staff: 0, at: 0, end: { bar: 1, at: 0 }, dir: 1, size: 22 }); }, /size is 15/);
  bad((c) => { c.measures[0].expressions.push({ id: "pd", kind: "pedal", staff: 1, at: 0, end: { bar: 1, at: 0 }, style: "wide" }); }, /style/);
});

test("velocities: the extremes, a sudden dynamic spikes its slot and leaves the level (fp drops to p), a niente hairpin, a cresc. text line ramps, una corda softens", () => {
  let d = piece();
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "ppp" }).doc;
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: PPQ, value: "sfz" }).doc;
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 2 * PPQ, value: "fp" }).doc;
  const n = at(d, 0), v = velocities(d);
  assert.equal(v.get(n[0]), 0.27, "ppp");
  assert.ok(Math.abs(v.get(n[1]) - 0.51) < 1e-9, "sfz: two steps above ppp: " + v.get(n[1]));
  assert.equal(v.get(n[2]), 0.82, "fp attacks at f");
  assert.equal(v.get(n[3]), 0.45, "…and the level after is p (sfz left ppp alone)");
  // niente: from silence up to the ff written at its end
  let e = piece();
  e = addHairpin(e, { staff: 0, bar: 0, at: 0, dir: "cresc", end: { bar: 0, at: 3 * PPQ }, niente: true }).doc;
  e = addExpression(e, { kind: "dyn", staff: 0, bar: 0, at: 3 * PPQ, value: "ff" }).doc;
  assert.equal(spansOf(e, "hairpin")[0].x.niente, true);
  const ve = velocities(e), ne = at(e, 0);
  assert.equal(ve.get(ne[0]), 0.05, "from nothing"); assert.ok(ve.get(ne[1]) < ve.get(ne[2]) && ve.get(ne[2]) < 0.95, "ramps up"); assert.equal(ve.get(ne[3]), 0.95);
  // a text line "cresc." ramps like a hairpin; "una corda" softens what it covers
  let t = piece();
  t = addTextLine(t, { staff: 0, bar: 0, at: 0, end: { bar: 0, at: 3 * PPQ }, text: "cresc." }).doc;
  const vt = velocities(t), nt = at(t, 0);
  assert.ok(vt.get(nt[0]) < vt.get(nt[1]) && vt.get(nt[1]) < vt.get(nt[2]), "the words ramp: " + [0, 1, 2].map((i) => vt.get(nt[i])).join());
  let u = piece();
  u = addTextLine(u, { staff: 0, bar: 0, at: PPQ, end: { bar: 0, at: 3 * PPQ }, text: "una corda", endText: "tre corde" }).doc;
  const vu = velocities(u), nu = at(u, 0);
  assert.equal(vu.get(nu[0]), 0.7); assert.equal(vu.get(nu[1]), 0.56); assert.equal(vu.get(nu[3]), 0.7, "tre corde lifts it");
  validate(u);
  assert.throws(() => addTextLine(u, { staff: 0, bar: 0, at: 0, end: { bar: 0, at: PPQ }, text: "  " }), /say what/);
});

test("the clock: rit. ramps down and snaps back at the end of the following bar, a tempo ends it, accel. ramps up, a tempo unit scales, a fermata holds, a caesura pauses", () => {
  let d = piece();
  d = addExpression(d, { kind: "text", staff: 0, bar: 0, at: 2 * PPQ, value: "rit." }).doc;
  let tl = timeline(d);
  const bpm = (t) => { let b = tl.tempos[0].bpm; for (const s of tl.tempos) if (s.at <= t) b = s.bpm; return b; };
  assert.equal(bpm(0), 100); assert.equal(bpm(2 * PPQ - 1), 100, "in tempo before the rit.");
  assert.ok(bpm(2 * PPQ) < 100 && bpm(2 * PPQ) > 90, "the first half-beat step is a little slower: " + bpm(2 * PPQ));
  assert.ok(bpm(BAR + 3 * PPQ) < bpm(BAR), "still slowing through bar 2");
  assert.ok(Math.abs(bpm(2 * BAR - PPQ / 2) - 70) < 1e-6, "reaches 70% by the end of the following bar: " + bpm(2 * BAR - PPQ / 2));
  assert.equal(bpm(2 * BAR), 100, "…and snaps back at bar 3");
  // a tempo ends the ramp where it is written
  let a = addExpression(d, { kind: "text", staff: 0, bar: 1, at: 0, value: "a tempo" }).doc;
  tl = timeline(a);
  assert.ok(bpm(3 * PPQ + PPQ / 2) < 100, "slowing before it"); assert.equal(bpm(BAR), 100, "a tempo");
  // accel. ramps up; a tempo mark caps it
  let c = piece();
  c = addExpression(c, { kind: "text", staff: 0, bar: 0, at: 0, value: "accel." }).doc;
  c = toggleFormMark(c, 1, { kind: "tempo", bpm: 120 });
  tl = timeline(c);
  assert.ok(bpm(0) > 100 && bpm(3 * PPQ) > bpm(0) && bpm(3 * PPQ) <= 130, "faster and faster: " + bpm(3 * PPQ));
  assert.equal(bpm(BAR), 120, "the tempo mark takes over");
  // beat units: ♪ = 120 is ♩ = 60; ♩. = 60 is ♩ = 90
  assert.equal(quarterBpm({ bpm: 120, unit: { base: 8, dots: 0 } }), 60);
  assert.equal(quarterBpm({ bpm: 60, unit: { base: 4, dots: 1 } }), 90);
  let u = toggleFormMark(piece(), 0, { kind: "tempo", bpm: 120, unit: { base: 8, dots: 0 } });
  assert.deepEqual(tempoMap(u).slice(0, 2), [60, 60]);
  assert.equal(toggleFormMark(u, 0, { kind: "tempo", bpm: 120, unit: { base: 8, dots: 0 } }).measures[0].form, undefined, "the same mark again → off");
  assert.equal(toggleFormMark(u, 0, { kind: "tempo", bpm: 120 }).measures[0].form[0].unit, undefined, "another unit replaces");
  validate(u);
  // a fermata: its note's span at two thirds the tempo; a caesura: the last thirty-second of its note at a fifth
  const f0 = piece();
  let f = articulate(f0, [at(f0, 0)[1].id], "fermata");
  tl = timeline(f);
  assert.ok(Math.abs(bpm(PPQ) - 100 / 1.5) < 1e-3); assert.equal(bpm(2 * PPQ), 100);
  const clock = clockOf(tl.tempos);
  assert.ok(Math.abs(clock.seconds(2 * PPQ) - clock.seconds(PPQ) - 0.9) < 1e-4, "the quarter lasts 0.9 s at 100 bpm held 1.5×");
  let cz = articulate(f0, [at(f0, 0)[1].id], "caesura");
  tl = timeline(cz);
  assert.equal(bpm(2 * PPQ - PPQ / 8), 20); assert.equal(bpm(2 * PPQ), 100);
  const cut = tl.notes.find((n) => n.at === PPQ);
  assert.equal(cut.len, PPQ - PPQ / 8, "the note gives up its last thirty-second to the pause");
});

test("ornaments are heard: a trill alternates in thirty-seconds (its accidental respected), mordents, turns, a delayed turn; portato and breath shorten; a short note plays plain", () => {
  const d0 = piece(), ids = at(d0, 0).map((e) => e.id);
  const notesAt = (d, t) => timeline(d).notes.filter((n) => n.at >= t && n.at < t + PPQ).sort((a, b) => a.at - b.at);
  let d = articulate(d0, [ids[0]], "trill"); // B4 (step 4 in treble)
  let ns = notesAt(d, 0);
  assert.equal(ns.length, 8, "eight thirty-seconds in a quarter");
  assert.deepEqual(ns.slice(0, 3).map((n) => n.midi), [71, 72, 71], "main, upper (C in C major), main");
  d = setTrill(d, [ids[0]], { alter: 1 });
  assert.deepEqual(at(d, 0)[0].trill, { alter: 1 });
  assert.equal(notesAt(d, 0)[1].midi, 73, "tr♯: C♯");
  d = setTrill(d, [ids[0]], { line: true });
  assert.deepEqual(at(d, 0)[0].trill, { alter: 1, line: true });
  d = setTrill(d, [ids[0]], { alter: 1 });
  assert.deepEqual(at(d, 0)[0].trill, { line: true }, "the same accidental again clears it");
  d = articulate(d, [ids[0]], "trill");
  assert.equal(at(d, 0)[0].trill, undefined, "the options leave with the mark");
  assert.equal(at(setTrill(d0, [ids[1]], { line: true }), 0)[1].art.includes("trill"), true, "an option on a plain note trills it");
  assert.throws(() => setTrill(d0, [ids[0]], {}), Nudge);
  let m = articulate(d0, [ids[1]], "mordent"); // C5
  ns = notesAt(m, PPQ);
  assert.deepEqual(ns.map((n) => [n.midi, n.len]), [[72, PPQ / 8], [74, PPQ / 8], [72, PPQ - PPQ / 4]]);
  m = articulate(d0, [ids[1]], "lowerMordent");
  assert.deepEqual(notesAt(m, PPQ).map((n) => n.midi), [72, 71, 72]);
  let t = articulate(d0, [ids[2]], "turn"); // D5
  assert.deepEqual(notesAt(t, 2 * PPQ).map((n) => n.midi), [76, 74, 72, 74]);
  t = articulate(t, [ids[2]], "invertedTurn");
  assert.deepEqual(at(t, 0)[2].art, ["invertedTurn"], "one turn per note: the inverted one replaces");
  assert.deepEqual(notesAt(t, 2 * PPQ).map((n) => n.midi), [72, 74, 76, 74]);
  t = articulate(t, [ids[2]], "delayedTurn");
  ns = notesAt(t, 2 * PPQ);
  assert.deepEqual(ns.map((n) => n.midi), [74, 76, 74, 72, 74]); assert.equal(ns[0].len, PPQ / 2, "half the note first");
  // portato and breath
  let p = articulate(d0, [ids[3]], "portato");
  assert.equal(timeline(p).notes.find((n) => n.at === 3 * PPQ).len, Math.floor(PPQ * 0.75));
  p = articulate(d0, [ids[3]], "breath");
  assert.equal(timeline(p).notes.find((n) => n.at === 3 * PPQ).len, PPQ - PPQ / 4);
  // a note too short for its ornament plays plain
  const e8 = at(d0, 4);
  const s = articulate(d0, [e8[0].id], "turn");
  assert.equal(timeline(s).notes.filter((n) => n.at === 4 * BAR).length, 1, "an eighth is too short for a turn");
  validate(s);
});

test("form: a repeat plays n times, rehearsal marks count letters or numbers or say a word, a bar repeat plays the bar before it and refuses a bar with notes", () => {
  let d = piece();
  d = setBarline(d, 1, { end: "repeat", times: 3 });
  assert.deepEqual(d.measures[1].barline, { end: "repeat", times: 3 });
  assert.deepEqual(unroll(d).slice(0, 7).map((p) => p.bar), [0, 1, 0, 1, 0, 1, 2], "three passes");
  assert.deepEqual(setBarline(d, 1, { times: 2 }).measures[1].barline, { end: "repeat" }, "twice is the default");
  assert.deepEqual(setBarline(d, 1, { end: "double" }).measures[1].barline, { end: "double" }, "times ride a repeat end");
  assert.throws(() => setBarline(d, 1, { times: 12 }), Nudge);
  validate(d);
  let r = toggleFormMark(piece(), 0, { kind: "rehearsal" });
  r = toggleFormMark(r, 1, { kind: "rehearsal", style: "number" });
  r = toggleFormMark(r, 2, { kind: "rehearsal", text: "Trio" });
  r = toggleFormMark(r, 3, { kind: "rehearsal" });
  assert.deepEqual(formMarksOf(r).map((f) => f.letter), ["A", "2", "Trio", "C"], "letters and numbers share one count; a word is itself");
  assert.equal(toggleFormMark(r, 2, { kind: "rehearsal", text: "Trio" }).measures[2].form, undefined, "the same word → off");
  assert.equal(toggleFormMark(r, 2, { kind: "rehearsal", text: "Coda" }).measures[2].form[0].text, "Coda", "another word replaces");
  validate(r);
  // bar repeats
  let s = piece();
  assert.throws(() => setSimile(s, 0, 1), /nothing before/);
  assert.throws(() => setSimile(s, 1, 1), /empty the bar/);
  assert.throws(() => setSimile(s, 4, 2), /empty the bar/);
  s = setSimile(s, 5, 1);
  assert.equal(s.measures[5].simile, 1); assert.equal(simileSource(s, 5), 4);
  s = setSimile(s, 6, 1);
  assert.equal(simileSource(s, 6), 4, "a chain of % reaches the plain bar");
  assert.equal(setSimile(s, 6, 1).measures[6].simile, undefined, "the same again → off");
  assert.throws(() => setSimile(newComposition({ id: "x", now: 1 }), 0, 1), /nothing before/);
  validate(s);
  const tl = timeline(s);
  const bar5 = tl.notes.filter((n) => n.at >= 5 * BAR && n.at < 6 * BAR), bar4 = tl.notes.filter((n) => n.at >= 4 * BAR && n.at < 5 * BAR);
  assert.equal(bar5.length, 8); assert.deepEqual(bar5.map((n) => n.midi), bar4.map((n) => n.midi), "bar 6 plays bar 5's eighths");
  assert.deepEqual(tl.notes.filter((n) => n.at >= 6 * BAR && n.at < 7 * BAR).map((n) => n.midi), bar4.map((n) => n.midi), "and bar 7 too");
  // writing into a % bar clears it
  const w = place(s, { bar: 5, staff: 0, ticks: 0, step: 4 }, Q).doc;
  assert.equal(w.measures[5].simile, undefined); validate(w);
  const pasted = paste(s, clipFrom(s, [{ ev: at(s, 0)[0].id }]), { bar: 6, ticks: 0, staff: 0 }).doc;
  assert.equal(pasted.measures[6].simile, undefined); validate(pasted);
  // a two-bar repeat: bars 7–8 play bars 5–6 (bar 6 being itself a % of 5)
  let two = piece();
  two = setSimile(two, 5, 1); two = setSimile(two, 6, 2);
  assert.equal(simileSource(two, 6), 4); assert.equal(simileSource(two, 7), 4);
  validate(two);
  assert.equal(timeline(two).notes.filter((n) => n.at >= 7 * BAR && n.at < 8 * BAR).length, 8);
  const L = layoutComposition(two, { unit: 10, width: 1400 });
  assert.equal(L.similes.filter((x) => x.n === 1).length, 2, "the % on both staves of bar 6");
  assert.equal(L.similes.filter((x) => x.n === 2).length, 2, "the two-bar sign on both staves");
  assert.equal(L.drawn.filter((x) => x.rest && x.whole && [5, 6, 7].includes(x.bar)).length, 0, "no whole-bar rests under the signs");
  // a re-cut of the metre through a % bar drops the sign that no longer knows what it repeats
  const cut = setTime(s, 0, { beats: 3, unit: 4 }).doc;
  validate(cut);
});

test("piano: a 15ma shifts fourteen steps and the sign changes, pedal styles draw the signs, the text line is a span with handles", () => {
  let d = piece();
  d = addOttava(d, { staff: 0, bar: 0, at: 0, dir: 1, size: 15, end: { bar: 0, at: 3 * PPQ } }).doc;
  d = addPedal(d, { staff: 1, bar: 0, at: 0, style: "sign", end: { bar: 1, at: 0 } }).doc;
  d = addPedal(d, { staff: 1, bar: 1, at: 0, style: "sost", end: { bar: 2, at: 0 } }).doc;
  d = addTextLine(d, { staff: 0, bar: 1, at: 0, end: { bar: 3, at: 0 }, text: "cresc." }).doc;
  validate(d);
  assert.equal(spansOf(d, "ottava")[0].x.size, 15); assert.deepEqual(spansOf(d, "pedal").map((e) => e.x.style), ["sign", "sost"]);
  const plain = layoutComposition(piece(), { unit: 10, width: 1400 }), L = layoutComposition(d, { unit: 10, width: 1400 });
  const y0 = plain.drawn.find((x) => !x.rest && x.bar === 0).heads[0].y, y1 = L.drawn.find((x) => !x.rest && x.bar === 0).heads[0].y;
  assert.equal(y1 - y0, 7, "fourteen steps = seven spaces lower under a 15ma");
  assert.equal(L.ottavas[0].size, 15);
  assert.deepEqual(L.pedals.map((p) => p.style), ["sign", "sost"]);
  assert.ok(L.pedals[1].x1 >= L.pedals[0].x2 + 1.5, "after a ✱ the next Ped. stands clear");
  assert.equal(L.textLines.length, 1); assert.equal(L.textLines[0].text, "cresc."); assert.equal(L.textLines[0].type, "textline");
  const t = thingAt(L, (L.textLines[0].x1 + L.textLines[0].x2) / 2, L.textLines[0].y);
  assert.equal(t?.type, "textline");
  assert.equal(thingAt(L, L.textLines[0].x1, L.textLines[0].y, new Set([L.textLines[0].id]))?.type, "textline-start", "a selected text line has handles");
  assert.equal(addOttava(d, { staff: 0, bar: 4, at: 0, dir: -1, size: 8, end: { bar: 4, at: PPQ } }).doc.measures[4].expressions[0].size, undefined, "8 is the default and is not stored");
});

test("engraving: the marks' places, a trill line and accidental, the extreme dynamics' glyphs, a niente hairpin, a set stem rules the beam, a beam break splits the run, a grace chord", () => {
  let d = piece();
  const ids = at(d, 0).map((e) => e.id), e8 = at(d, 4).map((e) => e.id);
  d = articulate(d, [ids[0]], "breath"); d = articulate(d, [ids[1]], "caesura"); d = articulate(d, [ids[2]], "portato"); d = articulate(d, [ids[3]], "trill"); d = setTrill(d, [ids[3]], { line: true }); d = setTrill(d, [ids[3]], { alter: -1 });
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "ffff" }).doc;
  d = addHairpin(d, { staff: 0, bar: 1, at: 0, dir: "dim", niente: true, end: { bar: 1, at: 2 * PPQ } }).doc;
  d = setStem(d, e8.slice(0, 4), "down"); d = beamBreak(d, [e8[7]]);
  d = toggleGrace(d, ids[2], { pitch: { step: "A", octave: 4, alter: 0 } }).doc; d = toggleGrace(d, ids[2], { pitch: { step: "C", octave: 5, alter: 0 }, chord: true }).doc;
  assert.deepEqual(at(d, 0)[2].graces, [{ base: 8, pitches: [{ step: "A", octave: 4, alter: 0 }, { step: "C", octave: 5, alter: 0 }], slash: true }], "the second pitch stacked on the grace");
  validate(d);
  const L = layoutComposition(d, { unit: 10, width: 1400 });
  const dn = (i) => L.drawn.find((x) => x.id === ids[i]);
  const breath = L.marks.find((m) => m.mark === "breath"), caesura = L.marks.find((m) => m.mark === "caesura"), portato = L.marks.find((m) => m.mark === "portato"), tr = L.marks.find((m) => m.mark === "trill");
  assert.ok(breath.after && breath.x > dn(0).x + dn(0).headW && breath.y < L.systems[0].staffTop[0], "the breath after the note, above the top line");
  assert.ok(caesura.after && caesura.x > dn(1).x + dn(1).headW, "the caesura after its note");
  assert.ok(!portato.after && Math.abs(portato.x - (dn(2).x + dn(2).headW / 2)) < 1e-9, "portato hugs the head like staccato");
  assert.ok(dn(1).x - dn(0).x > dn(2).x - dn(1).x - 1e-9 || dn(1).colX - dn(0).colX >= 1.4, "the column with a breath is wider");
  assert.equal(L.trillLines.length, 1); assert.ok(L.trillLines[0].x1 > tr.x && L.trillLines[0].x2 > L.trillLines[0].x1, "the wavy line runs on from tr");
  assert.deepEqual(L.trillAccs.map((a) => a.alter), [-1]); assert.ok(L.trillAccs[0].y < tr.y, "the flat over the tr");
  assert.equal(L.dynamics[0].dyn, "ffff");
  assert.equal(L.hairpins[0].niente, true);
  const run = e8.map((id) => L.drawn.find((x) => x.id === id));
  assert.ok(run.slice(0, 4).every((x) => x.stem === "down"), "the set stems point down"); assert.ok(run.slice(4, 6).every((x) => x.stem === "up"), "the next pair keeps the automatic direction: " + run.map((x) => x.stem).join());
  assert.equal(run[4].beamRun, run[5].beamRun); assert.ok(!run[6].beamed && !run[7].beamed, "the beam breaks before the last eighth: the pair stands as two flagged notes");
  assert.equal(L.graces.length, 1); assert.equal(L.graces[0].heads.length, 2, "one grace, two heads");
  assert.equal(beamBreak(d, [e8[7]]).measures[4].staves[0].voices[0].find((e) => e.id === e8[7]).beam, undefined, "again → joined");
  assert.equal(setStem(d, e8.slice(0, 4), null).measures[4].staves[0].voices[0].find((e) => e.id === e8[0]).stem, undefined);
  assert.throws(() => setStem(d, e8, "left"), Nudge);
});

test("MusicXML: everything round-trips; a foreign measure repeat, sostenuto pedal, eighth beat unit, dashes with words, inverted turn, wavy line and repeat times are read", () => {
  let d = piece();
  const ids = at(d, 0).map((e) => e.id), e8 = at(d, 4).map((e) => e.id);
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "pppp" }).doc;
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: PPQ, value: "sfp" }).doc;
  d = addHairpin(d, { staff: 0, bar: 0, at: 2 * PPQ, dir: "cresc", niente: true, end: { bar: 0, at: 3 * PPQ } }).doc;
  d = addTextLine(d, { staff: 0, bar: 1, at: 0, end: { bar: 2, at: 0 }, text: "dim." }).doc;
  d = addTextLine(d, { staff: 1, bar: 1, at: 0, end: { bar: 3, at: 0 }, text: "una corda", endText: "tre corde" }).doc;
  d = addOttava(d, { staff: 0, bar: 2, at: 0, dir: -1, size: 15, end: { bar: 2, at: 2 * PPQ } }).doc;
  d = addPedal(d, { staff: 1, bar: 0, at: 0, style: "sign", end: { bar: 0, at: 3 * PPQ } }).doc;
  d = addPedal(d, { staff: 1, bar: 3, at: 0, style: "sost", end: { bar: 3, at: 3 * PPQ } }).doc;
  d = setBarline(d, 1, { end: "repeat", times: 3 });
  d = toggleFormMark(d, 0, { kind: "tempo", bpm: 120, unit: { base: 8, dots: 0 } });
  d = toggleFormMark(d, 1, { kind: "rehearsal", text: "Trio" });
  d = toggleFormMark(d, 2, { kind: "rehearsal", style: "number" });
  d = setSimile(d, 5, 1); d = setSimile(d, 6, 2);
  d = articulate(d, [ids[0]], "portato"); d = articulate(d, [ids[0]], "breath"); d = articulate(d, [ids[1]], "caesura");
  d = articulate(d, [ids[2]], "invertedTurn"); d = articulate(d, [ids[3]], "delayedTurn");
  d = articulate(d, [e8[0]], "trill"); d = setTrill(d, [e8[0]], { line: true }); d = setTrill(d, [e8[0]], { alter: 1 });
  d = setStem(d, [e8[1]], "up"); d = beamBreak(d, [e8[2]]);
  d = toggleGrace(d, ids[1], { pitch: { step: "E", octave: 5, alter: 0 } }).doc; d = toggleGrace(d, ids[1], { pitch: { step: "G", octave: 5, alter: 0 }, chord: true }).doc;
  validate(d);
  const xml = toMusicXml(d, { now: new Date(0), software: "test" });
  for (const re of [/<pppp\/>/, /<sfp\/>/, /niente="yes"/, /<words>dim\.<\/words><\/direction-type><direction-type><dashes type="start"/, /<dashes type="stop" number="2"\/><\/direction-type><direction-type><words>tre corde<\/words>/, /size="15"/, /<pedal type="start" line="no" sign="yes"\/>/, /<pedal type="sostenuto" line="yes"\/>/, /times="3"/, /<beat-unit>eighth<\/beat-unit><per-minute>120<\/per-minute>/, /<sound tempo="60"\/>/, /<rehearsal>Trio<\/rehearsal>/, /<rehearsal>1<\/rehearsal>/, /<measure-repeat type="start" slashes="1">1<\/measure-repeat>/, /<measure-repeat type="start" slashes="2">2<\/measure-repeat>/, /<measure-repeat type="stop"\/>/, /<detached-legato\/>/, /<breath-mark\/>/, /<caesura\/>/, /<inverted-turn\/>/, /<delayed-turn\/>/, /<trill-mark\/><accidental-mark>sharp<\/accidental-mark><wavy-line type="start"\/><wavy-line type="stop"\/>/, /<stem>up<\/stem>/]) assert.match(xml, re);
  const r = fromMusicXml(xml, { id: "back", now: 1 });
  const strip = (x) => JSON.parse(JSON.stringify(x, (k, v) => (["id", "createdAt", "updatedAt", "openedAt", "tags"].includes(k) ? undefined : v)));
  const back = strip(r.doc), orig = strip(d);
  for (const b of [0, 1, 2, 3, 4, 5, 6, 7]) {
    assert.deepEqual(back.measures[b].form ?? null, orig.measures[b].form ?? null, `form of bar ${b + 1}`);
    assert.deepEqual(back.measures[b].barline ?? null, orig.measures[b].barline ?? null, `barline of bar ${b + 1}`);
    assert.equal(back.measures[b].simile, orig.measures[b].simile, `simile of bar ${b + 1}`);
    assert.deepEqual((back.measures[b].expressions ?? []).map(({ id, ...x }) => x), (orig.measures[b].expressions ?? []).map(({ id, ...x }) => x), `expressions of bar ${b + 1}`);
  }
  const bn = at(r.doc, 0), on = at(d, 0);
  for (let i = 0; i < 4; i++) { assert.deepEqual(bn[i].art ?? null, on[i].art ?? null, `marks of note ${i + 1}`); assert.deepEqual(bn[i].graces ?? null, on[i].graces ?? null, "graces"); }
  const b8 = at(r.doc, 4);
  assert.deepEqual(b8[0].trill, { line: true, alter: 1 }); assert.equal(b8[1].stem, undefined, "stems are not read back"); assert.equal(b8[2].beam, undefined, "beams are not written");
  assert.equal(tempoMap(r.doc)[0], 60, "♪ = 120 read as ♩ = 60");
  assert.deepEqual(r.warnings, []);
  // a foreign file: a measure repeat over two bars, a sostenuto pedal, dashes with words, an inverted turn and a wavy line on a trill, a repeat three times, an fz
  const foreign = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
    <measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>60</per-minute></metronome></direction-type><staff>1</staff></direction>
      <direction placement="below"><direction-type><words>cresc.</words></direction-type><direction-type><dashes type="start" number="1"/></direction-type><staff>1</staff></direction>
      <direction placement="below"><direction-type><dynamics><fz/></dynamics></direction-type><staff>1</staff></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff><notations><ornaments><trill-mark/><wavy-line type="start"/></ornaments></notations></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff><notations><ornaments><wavy-line type="stop"/><inverted-turn/></ornaments><articulations><breath-mark/></articulations></notations></note>
      <direction placement="below"><direction-type><dashes type="stop" number="1"/></direction-type><staff>1</staff></direction>
      <backup><duration>16</duration></backup>
      <direction placement="below"><direction-type><pedal type="sostenuto" line="yes"/></direction-type><staff>2</staff></direction>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>5</voice><type>whole</type><staff>2</staff></note>
      <direction placement="below"><direction-type><pedal type="stop" line="yes"/></direction-type><staff>2</staff></direction>
      <barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward" times="3"/></barline>
    </measure>
    <measure number="2"><note><pitch><step>E</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
    <measure number="3"><attributes><measure-style><measure-repeat type="start" slashes="2">2</measure-repeat></measure-style></attributes><note><rest measure="yes"/><duration>16</duration><voice>1</voice><staff>1</staff></note></measure>
    <measure number="4"><note><rest measure="yes"/><duration>16</duration><voice>1</voice><staff>1</staff></note></measure>
    <measure number="5"><attributes><measure-style><measure-repeat type="stop"/></measure-style></attributes><note><rest measure="yes"/><duration>16</duration><voice>1</voice><staff>1</staff></note></measure>
  </part></score-partwise>`;
  const f = fromMusicXml(foreign, { id: "f", now: 1 });
  validate(f.doc);
  assert.equal(f.doc.tempo, 90, "♩. = 60 is ♩ = 90"); assert.deepEqual(f.doc.measures[0].form[0], { kind: "tempo", bpm: 60, unit: { base: 4, dots: 1 } });
  const xs = (f.doc.measures[0].expressions ?? []).map((x) => `${x.kind}:${x.value ?? x.text ?? x.style ?? ""}@${x.at}`);
  assert.deepEqual(xs, ["dyn:sfz@0", "textline:cresc.@0", "pedal:sost@0"], xs.join(" "));
  assert.equal(f.doc.measures[0].barline.times, 3);
  const n1 = at(f.doc, 0);
  assert.deepEqual(n1[0].art, ["trill"]); assert.deepEqual(n1[0].trill, { line: true }); assert.deepEqual([...n1[1].art].sort(), ["breath", "invertedTurn"]);
  assert.equal(f.doc.measures[2].simile, 2, "bars 3–4 repeat bars 1–2"); assert.equal(f.doc.measures[3].simile, undefined); assert.equal(f.doc.measures[4].simile, undefined);
  assert.equal(simileSource(f.doc, 2), 0); assert.equal(simileSource(f.doc, 3), 1);
  assert.equal(timeline(f.doc).notes.filter((n) => n.at >= 3 * BAR && n.at < 4 * BAR).length, 1, "bar 4 plays bar 2's whole note");
});
