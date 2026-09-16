// The Form rail's pure layer (docs/COMPOSE_FORM_DESIGN.md, WSHED-124): barlines, endings, marks,
// the unrolled performance, the tempo map and clock, the layout's form lane, MusicXML round trip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition, validate } from "../js/lib/compose/model.js";
import { place, setBarline, setEnding, toggleFormMark, formMarksOf, rehearsalLetter, unroll, tempoMap, trimBars, Nudge } from "../js/lib/compose/engine.js";
import { timeline, clockOf } from "../js/lib/compose/play.js";
import { layoutComposition } from "../js/lib/compose/layout.js";
import { toMusicXml, fromMusicXml } from "../js/lib/compose/musicxml.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const Q = { base: 4, dots: 0, rest: false };
const BAR = 4 * PPQ;
const passes = (d) => unroll(d).map((p) => `${p.bar + 1}${p.pass > 1 ? "'" : ""}`).join(" ");
/** Eight bars with a quarter on beat 1 of the first seven (the last stays empty so no bar is appended), tempo 100. */
function piece() {
  let d = newComposition({ id: "form", title: "Form", now: 1 });
  for (let b = 0; b < 7; b++) d = place(d, { bar: b, staff: 0, ticks: 0, step: 4 + (b % 4) }, Q).doc;
  return d;
}
/** A form with everything: |: bars 2–4 :| with endings 1 (bar 4) and 2 (bar 5), segno on 2, coda sign on 7, To Coda at 5, D.S. al Coda at 6, Fine at 8, rehearsal A on 1 and B on 5, Adagio 60 at 5, final on 8, double on 1. */
function formed() {
  let d = piece();
  d = setBarline(d, 0, { end: "double" });
  d = setBarline(d, 1, { start: "repeat" });
  d = setBarline(d, 3, { end: "repeat" });
  d = setEnding(d, 3, 1, 3); d = setEnding(d, 4, 2, 4);
  d = toggleFormMark(d, 1, { kind: "segno" }); d = toggleFormMark(d, 6, { kind: "coda" });
  d = toggleFormMark(d, 4, { kind: "toCoda" }); d = toggleFormMark(d, 5, { kind: "dsAlCoda" }); d = toggleFormMark(d, 7, { kind: "fine" });
  d = toggleFormMark(d, 0, { kind: "rehearsal" }); d = toggleFormMark(d, 4, { kind: "rehearsal" });
  d = toggleFormMark(d, 4, { kind: "tempo", bpm: 60, text: "Adagio" });
  d = setBarline(d, 7, { end: "final" });
  validate(d);
  return d;
}

test("barlines: set, keep the other end, clear, refuse nonsense; the same again is the same document", () => {
  let d = piece();
  d = setBarline(d, 2, { end: "double" });
  assert.deepEqual(d.measures[2].barline, { end: "double" });
  d = setBarline(d, 2, { start: "repeat" });
  assert.deepEqual(d.measures[2].barline, { end: "double", start: "repeat" });
  assert.equal(setBarline(d, 2, { start: "repeat" }), d, "nothing changed → the same document");
  d = setBarline(d, 2, { end: null });
  assert.deepEqual(d.measures[2].barline, { start: "repeat" });
  d = setBarline(d, 2, { start: null });
  assert.equal(d.measures[2].barline, undefined);
  assert.throws(() => setBarline(d, 2, { end: "thick" }), Nudge);
  assert.throws(() => setBarline(d, 2, { start: "double" }), Nudge);
  assert.throws(() => setBarline(d, 99, { end: "double" }), Nudge);
  validate(d);
});

test("endings: a bracket over bars, the same number there again → off, overlaps and backwards refused, validate agrees", () => {
  let d = piece();
  d = setEnding(d, 2, 1, 3);
  assert.deepEqual(d.measures[2].ending, { n: 1, end: 3 });
  assert.throws(() => setEnding(d, 3, 2, 4), /overlap/);
  assert.throws(() => setEnding(d, 4, 2, 3), /after it starts/);
  assert.throws(() => setEnding(d, 4, 0, 4), /run 1 to 9/);
  d = setEnding(d, 4, 2); // one bar
  assert.deepEqual(d.measures[4].ending, { n: 2, end: 4 });
  d = setEnding(d, 2, 1, 3);
  assert.equal(d.measures[2].ending, undefined, "off again");
  validate(d);
  const bad = structuredClone(d); bad.measures[1].ending = { n: 1, end: 5 };
  assert.throws(() => validate(bad), /overlap/);
});

test("marks: toggle off, a jump replaces a jump, a tempo replaces a tempo, sorted by kind, one of each; letters run A…Z, AA", () => {
  let d = piece();
  d = toggleFormMark(d, 3, { kind: "dcAlFine" });
  d = toggleFormMark(d, 3, { kind: "fine" });
  d = toggleFormMark(d, 3, { kind: "ds" });
  assert.deepEqual(d.measures[3].form.map((f) => f.kind), ["ds", "fine"], "the D.S. replaced the D.C. al Fine; sorted");
  d = toggleFormMark(d, 3, { kind: "tempo", bpm: 120, text: "  Allegro   molto " });
  assert.deepEqual(d.measures[3].form[2], { kind: "tempo", bpm: 120, text: "Allegro molto" });
  d = toggleFormMark(d, 3, { kind: "tempo", bpm: 96 });
  assert.deepEqual(d.measures[3].form[2], { kind: "tempo", bpm: 96 });
  d = toggleFormMark(d, 3, { kind: "tempo", bpm: 96 });
  assert.equal(d.measures[3].form.length, 2, "the same tempo again → off");
  d = toggleFormMark(d, 3, { kind: "ds" }); d = toggleFormMark(d, 3, { kind: "fine" });
  assert.equal(d.measures[3].form, undefined);
  assert.throws(() => toggleFormMark(d, 3, { kind: "tempo", bpm: 10 }), /tempo runs/);
  assert.throws(() => toggleFormMark(d, 3, { kind: "loop" }), /no such mark/);
  for (let b = 0; b < 8; b++) d = toggleFormMark(d, b, { kind: "rehearsal" });
  assert.deepEqual(formMarksOf(d).map((f) => f.letter), ["A", "B", "C", "D", "E", "F", "G", "H"]);
  assert.equal(rehearsalLetter(25), "Z"); assert.equal(rehearsalLetter(26), "AA"); assert.equal(rehearsalLetter(27), "AB");
  validate(d);
  const bad = structuredClone(d); bad.measures[0].form = [{ kind: "dc" }, { kind: "ds" }];
  assert.throws(() => validate(bad), /two jumps/);
});

test("trimBars keeps a bar the form uses; a piece with no form is unchanged", () => {
  let d = newComposition({ id: "t" });
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 4 }, Q).doc;
  for (let i = 0; i < 6; i++) d.measures.push(structuredClone(d.measures[7]));
  assert.equal(trimBars(d).measures.length, 1, "one bar of music: a file holds one bar (v104)"); assert.equal(trimBars(d, { forEditing: true }).measures.length, 8);
  d = toggleFormMark(d, 11, { kind: "fine" });
  assert.equal(trimBars(d).measures.length, 12, "bar 12 carries a mark: kept, the last");
  d = toggleFormMark(d, 11, { kind: "fine" });
  d = setEnding(d, 9, 1, 12);
  assert.equal(trimBars(d).measures.length, 13, "the ending's last bar is the last");
});

test("unroll: a plain piece plays straight; a repeat plays its span twice; endings by pass; repeat start at the piece's start when there is none", () => {
  const d = piece();
  assert.equal(passes(d), "1 2 3 4 5 6 7 8");
  let r = setBarline(d, 3, { end: "repeat" });
  assert.equal(passes(r), "1 2 3 4 1' 2' 3' 4' 5 6 7 8");
  r = setBarline(r, 1, { start: "repeat" });
  assert.equal(passes(r), "1 2 3 4 2' 3' 4' 5 6 7 8");
  r = setEnding(r, 3, 1, 3); r = setEnding(r, 4, 2, 4);
  assert.equal(passes(r), "1 2 3 4 2' 3' 5' 6 7 8", "the first ending is skipped on the second pass");
  // two repeats in a row: the second span starts after the first's end
  let two = setBarline(d, 1, { end: "repeat" }); two = setBarline(two, 3, { end: "repeat" });
  assert.equal(passes(two), "1 2 1' 2' 3 4 3' 4' 5 6 7 8");
});

test("unroll: D.C. al Fine stops at Fine without taking the repeat; D.S. al Coda jumps at To Coda; D.C. alone plays to the end; a form that only loops is cut by the guard", () => {
  const d = formed();
  assert.equal(passes(d), "1 2 3 4 2' 3' 5' 6 2 3 5 7 8", "D.S. at bar 6 → segno at 2; the repeat is not taken so bar 4 (ending 1) is skipped; To Coda at 5 → coda at 7; Fine ignored after al Coda");
  let f = piece(); f = toggleFormMark(f, 5, { kind: "dcAlFine" }); f = toggleFormMark(f, 2, { kind: "fine" }); f = setBarline(f, 1, { end: "repeat" });
  assert.equal(passes(f), "1 2 1' 2' 3 4 5 6 1 2 3");
  let dc = piece(); dc = toggleFormMark(dc, 3, { kind: "dc" });
  assert.equal(passes(dc), "1 2 3 4 1 2 3 4 5 6 7 8", "a plain D.C. goes back once and then runs to the end");
  let loop = piece(); loop = toggleFormMark(loop, 0, { kind: "dc" }); loop = toggleFormMark(loop, 1, { kind: "ds" });
  const n = unroll(loop).length;
  assert.ok(n > 8 && n <= 8 * 8 + 8, "a second jump is not taken, so the walk ends: " + n);
});

test("tempoMap and the clock: the piece's tempo until the first mark, then each mark; performance seconds ↔ ticks", () => {
  const d = formed();
  assert.deepEqual(tempoMap(d), [100, 100, 100, 100, 60, 60, 60, 60]);
  assert.deepEqual(tempoMap(d, 90).slice(0, 5), [90, 90, 90, 90, 60]);
  const c = clockOf([{ at: 0, bpm: 120 }, { at: BAR, bpm: 60 }]);
  assert.equal(c.seconds(BAR), 2, "four quarters at 120 = 2 s");
  assert.equal(c.seconds(2 * BAR), 6, "then four at 60 = 4 s more");
  assert.equal(c.ticks(6), 2 * BAR); assert.equal(c.ticks(1), BAR / 2);
  const one = clockOf([]);
  assert.equal(one.seconds(PPQ), 0.6, "no map: 100 bpm");
});

test("timeline: the performance is the unrolled form — passes map back to the score, notes repeat, tempos change where the marks are, nothing ties across a jump", () => {
  const d = formed();
  const tl = timeline(d);
  assert.equal(tl.passes.length, 13); assert.equal(tl.total, 13 * BAR);
  assert.deepEqual(tl.passes.slice(3, 6).map((p) => [p.bar, p.pass, p.perfStart / BAR, p.docStart / BAR]), [[3, 1, 3, 3], [1, 2, 4, 1], [2, 2, 5, 2]]);
  assert.equal(tl.notes.length, 12, "one quarter per pass of bars 1–7");
  assert.deepEqual(tl.tempos, [{ at: 0, bpm: 100 }, { at: 6 * BAR, bpm: 60 }, { at: 8 * BAR, bpm: 100 }, { at: 10 * BAR, bpm: 60 }], "bar 5 is Adagio each time it is reached; the D.S. back to bar 2 is at 100 again");
  const t2 = timeline(d, { tempo: 80 });
  assert.equal(t2.tempos[0].bpm, 80);
  // a tie from the bar before a repeat end into the next bar does not sound across the jump back
  let t = piece();
  t = place(t, { bar: 3, staff: 0, ticks: 3 * PPQ, step: 4 }, Q).doc; t = place(t, { bar: 4, staff: 0, ticks: 0, step: 4 }, Q).doc;
  t.measures[3].staves[0].voices[0][3].pitches[0].tie = "start";
  t = setBarline(t, 3, { end: "repeat" });
  const held = timeline(t).notes.filter((n) => n.at === 4 * BAR - PPQ);
  assert.equal(held[0].len, PPQ, "the tied quarter at the end of bar 4 on pass 1 sounds one quarter: bar 1 follows, not bar 5");
  const tied = timeline(t).notes.find((n) => n.at === 8 * BAR - PPQ);
  assert.equal(tied.len, 2 * PPQ, "on pass 2 it ties into bar 5");
});

test("layout: room for repeat signs, barline kinds on the systems, the form lane above the top staff, ending brackets with hooks; a piece without form is untouched", () => {
  const plain = layoutComposition(piece(), { unit: 12, width: 1024 });
  assert.deepEqual(plain.form, []); assert.deepEqual(plain.endings, []);
  assert.ok(plain.systems.every((s) => s.barlines.every((b) => b.kind === undefined && b.startX === undefined)));
  const L = layoutComposition(formed(), { unit: 12, width: 1024 });
  const bls = L.systems.flatMap((s) => s.barlines);
  assert.equal(bls[0].kind, "double"); assert.equal(bls[3].kind, "repeat"); assert.equal(bls[7].kind, "final");
  assert.ok(bls[1].startX > 0, "the repeat start of bar 2 is placed");
  const b1 = L.hit.systems[0].bars[1], b0 = L.hit.systems[0].bars[0];
  assert.ok(b1.cols[0].x - b1.bodyX0 > b0.cols[0].x - b0.bodyX0 + 1.5, "bar 2's first note stands clear of the repeat sign");
  const kinds = L.form.map((f) => `${f.bar + 1}:${f.kind}${f.text ? `=${f.text}` : ""}${f.sign ? `=${f.sign}` : ""}`);
  assert.deepEqual(kinds, ["1:rehearsal=A", "2:sign=segno", "5:rehearsal=B", "5:tempo=Adagio", "5:words=To Coda", "6:words=D.S. al Coda", "7:sign=coda", "8:words=Fine"]);
  const top = L.systems[0].staffTop[0];
  for (const f of L.form.filter((x) => x.system === 0 && x.kind !== "sign")) assert.equal(f.y, top - 3.2);
  assert.ok(L.form[3].x > L.form[2].x + 2, "the tempo stands right of the rehearsal box");
  assert.ok(L.form[4].x > L.form[3].noteX, "To Coda sits at the bar's end");
  assert.deepEqual(L.endings.map((e) => [e.n, e.hookStart, e.hookEnd, e.half]), [[1, true, true, null], [2, true, false, null]]);
  assert.ok(L.endings[0].y < top - 5 && L.endings[0].x2 <= bls[3].x, "the first ending's bracket closes at the repeat barline");
});

test("MusicXML: the form round-trips exactly; barlines, endings, signs, jumps, rehearsal letters and tempo marks are written the standard way", () => {
  const d = formed();
  const xml = toMusicXml(d, { now: new Date(0), software: "t" });
  assert.match(xml, /<barline location="right"><bar-style>light-light<\/bar-style><\/barline>/);
  assert.match(xml, /<barline location="left"><bar-style>heavy-light<\/bar-style><repeat direction="forward"\/><\/barline>/);
  assert.match(xml, /<barline location="left"><ending number="1" type="start"\/><\/barline>/);
  assert.match(xml, /<barline location="right"><bar-style>light-heavy<\/bar-style><ending number="1" type="stop"\/><repeat direction="backward"\/><\/barline>/);
  assert.match(xml, /<ending number="2" type="discontinue"\/>/);
  assert.match(xml, /<rehearsal>B<\/rehearsal>/); assert.match(xml, /<segno\/><\/direction-type><staff>1<\/staff><sound segno="segno"\/>/);
  assert.match(xml, /<words>D\.S\. al Coda<\/words><\/direction-type><staff>1<\/staff><sound dalsegno="segno"\/>/);
  assert.match(xml, /<words>Adagio<\/words><\/direction-type><direction-type><metronome><beat-unit>quarter<\/beat-unit><per-minute>60<\/per-minute>/);
  const back = fromMusicXml(xml, { id: "back" });
  assert.deepEqual(back.warnings, []);
  const strip = (doc) => JSON.parse(JSON.stringify(doc.measures, (k, v) => (k === "id" ? undefined : v)));
  assert.deepEqual(strip(back.doc), strip(d));
  assert.equal(back.doc.tempo, 100);
  // a tempo mark on bar 1 with a word comes back as the piece's tempo AND the mark
  let t = piece(); t = toggleFormMark(t, 0, { kind: "tempo", bpm: 72, text: "Andante" });
  const tx = toMusicXml(t, { now: new Date(0), software: "t" });
  assert.equal((tx.match(/<per-minute>/g) ?? []).length, 1, "no second metronome mark for the piece's own tempo");
  const tb = fromMusicXml(tx, { id: "tb" }).doc;
  assert.equal(tb.tempo, 72); assert.deepEqual(tb.measures[0].form, [{ kind: "tempo", bpm: 72, text: "Andante" }]);
  // words other programs write
  const alt = xml.replace("D.S. al Coda", "d.s. al coda").replace("To Coda", "to coda").replace("Fine", "FINE");
  assert.deepEqual(strip(fromMusicXml(alt, { id: "alt" }).doc), strip(d));
});
