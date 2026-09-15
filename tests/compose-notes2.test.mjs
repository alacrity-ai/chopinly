// The extended Notes rail's pure layer (docs/COMPOSE_NOTES2_DESIGN.md, WSHED-126): grace notes on the
// note they precede, tremolo, marcato / staccatissimo, the engraver, playback, MusicXML both ways.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition, validate } from "../js/lib/compose/model.js";
import { place, graceAt, toggleGrace, removeGraces, tremolo, articulate, setPitch, setTime, trimBars, Nudge } from "../js/lib/compose/engine.js";
import { timeline } from "../js/lib/compose/play.js";
import { layoutComposition } from "../js/lib/compose/layout.js";
import { toMusicXml, fromMusicXml } from "../js/lib/compose/musicxml.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const Q = { base: 4, dots: 0, rest: false };
/** Eight bars: quarters on beats 1–4 of bar 1 (upper staff, steps 4–7), a quarter on beat 1 of bars 2–4. */
function piece() {
  let d = newComposition({ id: "n2", title: "Notes2", now: 1 });
  for (let i = 0; i < 4; i++) d = place(d, { bar: 0, staff: 0, ticks: i * PPQ, step: 4 + i }, Q).doc;
  for (let b = 1; b < 4; b++) d = place(d, { bar: b, staff: 0, ticks: 0, step: 8 }, Q).doc;
  return d;
}
const notesOf = (d, bar = 0) => d.measures[bar].staves[0].voices[0].filter((e) => e.kind === "note");
const D5 = { step: "D", octave: 5, alter: 0 }, E5 = { step: "E", octave: 5, alter: 0 }, FS5 = { step: "F", octave: 5, alter: 1 };

test("grace notes: the tap's target, toggle by pitch, a chord grace, base refused, clear, a dragged note takes them along, validate", () => {
  let d = piece();
  const n = notesOf(d);
  assert.equal(graceAt(d, { bar: 0, staff: 0, ticks: PPQ + PPQ / 2 })?.ev.id, n[2].id, "at or after the tick");
  assert.equal(graceAt(d, { bar: 0, staff: 0, ticks: PPQ + 1 })?.ev.id, n[1].id, "a hair past an onset still means that note");
  assert.equal(graceAt(d, { bar: 0, staff: 0, ticks: 3 * PPQ + PPQ / 2 })?.ev.id, notesOf(d, 1)[0].id, "into the next bar");
  assert.equal(graceAt(d, { bar: 7, staff: 0, ticks: 0 }), null);
  let r = toggleGrace(d, n[1].id, { pitch: D5, base: 8, slash: true });
  assert.equal(r.added, true); d = r.doc;
  assert.deepEqual(notesOf(d)[1].graces, [{ base: 8, pitches: [D5], slash: true }]);
  r = toggleGrace(d, n[1].id, { pitch: E5, base: 16, slash: false }); d = r.doc;
  assert.equal(notesOf(d)[1].graces.length, 2, "appended in tap order");
  r = toggleGrace(d, n[1].id, { pitch: D5 }); assert.equal(r.added, false); d = r.doc;
  assert.deepEqual(notesOf(d)[1].graces, [{ base: 16, pitches: [E5] }], "the same pitch again removes that grace");
  assert.throws(() => toggleGrace(d, n[1].id, { pitch: D5, base: 4 }), Nudge);
  assert.throws(() => toggleGrace(d, d.measures[4].staves[0].voices[0][0].id, { pitch: D5 }), /before a note/);
  validate(d);
  // a whole note dragged takes its graces with it; a chord's single moved head leaves them
  const moved = setPitch(d, [{ ev: n[1].id }], 2).doc;
  assert.deepEqual(notesOf(moved)[1].graces[0].pitches, [{ step: "G", octave: 5, alter: 0 }]);
  const re = setTime(d, 0, { beats: 3, unit: 4 }).doc;
  assert.equal(notesOf(re)[1].graces.length, 1, "a re-cut keeps them on their note");
  d = removeGraces(d, [n[1].id]);
  assert.equal(notesOf(d)[1].graces, undefined);
  assert.equal(removeGraces(d, [n[1].id]), d);
  const bad = structuredClone(d); notesOf(bad)[0].graces = [{ base: 4, pitches: [D5] }];
  assert.throws(() => validate(bad), /grace note/);
  const bad2 = structuredClone(d); bad2.measures[4].staves[0].voices[0][0].graces = [{ base: 8, pitches: [D5] }];
  assert.throws(() => validate(bad2), /belong on a note/);
});

test("tremolo and the two marks: stamp, the same again clears, validate the range", () => {
  let d = piece();
  const ids = notesOf(d).slice(0, 2).map((e) => e.id);
  d = tremolo(d, ids, 2);
  assert.deepEqual(notesOf(d).map((e) => e.trem ?? null), [2, 2, null, null]);
  d = tremolo(d, [ids[0]], 3);
  assert.deepEqual(notesOf(d).map((e) => e.trem ?? null), [3, 2, null, null]);
  d = tremolo(d, ids, 2);
  assert.deepEqual(notesOf(d).map((e) => e.trem ?? null), [2, 2, null, null], "a mixed selection takes the value");
  d = tremolo(d, ids, 2);
  assert.deepEqual(notesOf(d).map((e) => e.trem ?? null), [null, null, null, null], "the same on all clears");
  assert.throws(() => tremolo(d, ids, 4), Nudge);
  d = articulate(d, [ids[0]], "marcato"); d = articulate(d, [ids[1]], "staccatissimo");
  assert.deepEqual(notesOf(d).slice(0, 2).map((e) => e.art), [["marcato"], ["staccatissimo"]]);
  validate(d);
  const bad = structuredClone(d); notesOf(bad)[0].trem = 0;
  assert.throws(() => validate(bad), /tremolo/);
});

test("layout: graces stand left of the principal in their own room, two beam, a lone one flags, the slash and the slur; tremolo bars sit on the stem; marcato goes above", () => {
  let d = piece();
  const n = notesOf(d);
  const L0 = layoutComposition(d, { unit: 10, width: 900 });
  const x0 = L0.drawn.find((x) => x.id === n[1].id).x;
  d = toggleGrace(d, n[1].id, { pitch: D5, base: 8, slash: true }).doc;
  d = toggleGrace(d, n[1].id, { pitch: FS5, base: 8, slash: true }).doc;
  d = toggleGrace(d, n[3].id, { pitch: E5, base: 16, slash: false }).doc;
  d = tremolo(d, [n[0].id], 2); d = articulate(d, [n[0].id], "marcato");
  const L = layoutComposition(d, { unit: 10, width: 900 });
  const p1 = L.drawn.find((x) => x.id === n[1].id), g1 = L.graces.filter((g) => g.ev === n[1].id), g3 = L.graces.filter((g) => g.ev === n[3].id);
  assert.equal(g1.length, 2); assert.equal(g3.length, 1);
  assert.ok(g1[0].x < g1[1].x && g1[1].x + g1[1].headW < p1.x, "left of the principal, in order");
  assert.ok(p1.x > x0 + 2.5, "the column made room for two graces");
  assert.equal(L.graceBeams.length, 1, "two graces share a beam"); assert.equal(g1[0].flag, false); assert.equal(g3[0].flag, true);
  assert.equal(g1[0].slash, true); assert.equal(g3[0].slash, false);
  assert.equal(g1[1].heads[0].acc, 1, "the F♯ grace shows its sharp");
  assert.equal(L.graceSlurs.length, 2);
  const sl = L.graceSlurs.find((s) => Math.abs(s.x2 - p1.x) < 0.5);
  assert.ok(sl && sl.x1 > g1[0].x, "the slur runs from the first grace to the principal");
  const p0 = L.drawn.find((x) => x.id === n[0].id), tr = L.trems[0];
  assert.equal(tr.bars.length, 2); assert.equal(tr.x, p0.stemX);
  assert.ok(tr.bars.every((y) => (p0.stem === "up" ? y > p0.stemTipY && y < p0.topY : y < p0.stemTipY && y > p0.botY)), "the bars sit on the stem between head and tip");
  const mk = L.marks.find((m) => m.mark === "marcato");
  assert.ok(mk.above && mk.y < p0.stemTipY, "marcato above the stem tip");
});

test("playback: a slashed run steals thirty-seconds from before the beat and shortens the previous note; a plain run takes half; a tremolo re-strikes", () => {
  let d = piece();
  const n = notesOf(d);
  d = toggleGrace(d, n[1].id, { pitch: D5, base: 8, slash: true }).doc;
  d = toggleGrace(d, n[1].id, { pitch: E5, base: 8, slash: true }).doc;
  d = toggleGrace(d, n[2].id, { pitch: D5, base: 16, slash: false }).doc;
  d = tremolo(d, [n[3].id], 1);
  const tl = timeline(d), us = tl.notes.filter((x) => x.staff === 0 && x.at < 4 * PPQ).sort((a, b) => a.at - b.at);
  const G = PPQ / 8;
  assert.deepEqual(us.map((x) => [x.at, x.len]), [[0, PPQ - 2 * G], [PPQ - 2 * G, G], [PPQ - G, G], [PPQ, PPQ], [2 * PPQ, PPQ / 2], [2 * PPQ + PPQ / 2, PPQ / 2], [3 * PPQ, PPQ / 2], [3 * PPQ + PPQ / 2, PPQ / 2]]);
  assert.equal(us.filter((x) => x.grace).length, 3);
});

test("MusicXML: graces, tremolo and the marks round-trip exactly; a foreign grace chord and a two-note tremolo are read / warned", () => {
  let d = piece();
  const n = notesOf(d);
  d = toggleGrace(d, n[1].id, { pitch: D5, base: 8, slash: true }).doc;
  d = toggleGrace(d, n[1].id, { pitch: E5, base: 16, slash: false }).doc;
  d = tremolo(d, [n[2].id], 3); d = articulate(d, [n[3].id], "marcato"); d = articulate(d, [n[0].id], "staccatissimo");
  const xml = toMusicXml(d, { now: new Date("2026-09-15T00:00:00Z"), software: "test" });
  assert.match(xml, /<note><grace slash="yes"\/><pitch><step>D<\/step><octave>5<\/octave><\/pitch><voice>1<\/voice><type>eighth<\/type><staff>1<\/staff><\/note>/);
  assert.match(xml, /<grace\/><pitch><step>E<\/step>/); assert.match(xml, /<tremolo type="single">3<\/tremolo>/); assert.match(xml, /<strong-accent\/>/); assert.match(xml, /<staccatissimo\/>/);
  const back = fromMusicXml(xml, { id: "n2", now: 1 }).doc;
  const strip = (doc) => trimBars(doc).measures.map((m) => m.staves.map((s) => s.voices.map((v) => v && v.map((e) => ({ kind: e.kind, dur: e.dur, graces: e.graces ?? null, trem: e.trem ?? null, art: e.art ?? null })))));
  assert.deepEqual(strip(back), strip(d));
  const foreign = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1">
    <measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><grace slash="yes"/><pitch><step>C</step><octave>5</octave></pitch><voice>1</voice><type>16th</type></note>
      <note><grace slash="yes"/><chord/><pitch><step>E</step><octave>5</octave></pitch><voice>1</voice><type>16th</type></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>half</type><notations><ornaments><tremolo type="start">2</tremolo></ornaments></notations></note>
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>half</type><notations><ornaments><tremolo type="stop">2</tremolo></ornaments></notations></note>
    </measure></part></score-partwise>`;
  const r = fromMusicXml(foreign, { id: "f", now: 1 });
  assert.deepEqual(notesOf(r.doc)[0].graces, [{ base: 16, pitches: [{ step: "C", alter: 0, octave: 5 }, { step: "E", alter: 0, octave: 5 }], slash: true }]);
  assert.equal(notesOf(r.doc)[0].trem, undefined);
  assert.ok(r.warnings.includes("a two-note tremolo was skipped"), r.warnings.join("; "));
});
