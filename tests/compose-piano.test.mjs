// The Piano rail's pure layer (docs/COMPOSE_PIANO_DESIGN.md, WSHED-125): pedal and octave lines as
// spans, fingering on pitches, the engraver's shifts and lines, the pedal in playback, MusicXML both ways.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition, validate } from "../js/lib/compose/model.js";
import { place, addPedal, addOttava, addHairpin, finger, moveSpanEnd, moveExpressions, removeExpressions, cleanExpressions, expressionsOf, spansOf, setTime, trimBars, Nudge } from "../js/lib/compose/engine.js";
import { timeline } from "../js/lib/compose/play.js";
import { layoutComposition } from "../js/lib/compose/layout.js";
import { thingAt, things } from "../js/lib/compose/hit.js";
import { toMusicXml, fromMusicXml } from "../js/lib/compose/musicxml.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const Q = { base: 4, dots: 0, rest: false };
const BAR = 4 * PPQ;
/** Eight bars: four quarters on the upper staff in bar 1 (steps 4 5 6 7), a chord + a quarter on the lower staff in bar 1, a quarter on beat 1 of bars 2–4. */
function piece() {
  let d = newComposition({ id: "piano", title: "Piano", now: 1 });
  for (let i = 0; i < 4; i++) d = place(d, { bar: 0, staff: 0, ticks: i * PPQ, step: 4 + i }, Q).doc;
  d = place(d, { bar: 0, staff: 1, ticks: 0, step: 2 }, Q).doc;
  d = place(d, { bar: 0, staff: 1, ticks: 0, step: 4 }, Q).doc; // a third on top → a chord
  d = place(d, { bar: 0, staff: 1, ticks: 2 * PPQ, step: 6 }, Q).doc;
  for (let b = 1; b < 4; b++) d = place(d, { bar: b, staff: 0, ticks: 0, step: 8 }, Q).doc;
  return d;
}
const first = (d, si = 0, bar = 0) => d.measures[bar].staves[si].voices[0].find((e) => e.kind === "note");
const exprs = (d) => expressionsOf(d).map((e) => `${e.x.kind}${e.x.dir !== undefined ? e.x.dir : ""}@${e.abs / PPQ}-${e.absEnd / PPQ}:${e.x.staff}`);

test("pedal and octave lines are spans: placed, one kind replaces its overlaps, kinds coexist, ends refused, validate agrees", () => {
  let d = piece();
  d = addPedal(d, { staff: 1, bar: 0, at: 0, end: { bar: 1, at: 0 } }).doc;
  d = addOttava(d, { staff: 0, bar: 0, at: 0, dir: 1, end: { bar: 0, at: 3 * PPQ } }).doc;
  d = addHairpin(d, { staff: 1, bar: 0, at: 0, dir: "cresc", end: { bar: 0, at: 3 * PPQ } }).doc;
  validate(d);
  assert.deepEqual(exprs(d), ["ottava1@0-3:0", "hairpincresc@0-3:1", "pedal@0-4:1"], "three kinds share the range");
  d = addPedal(d, { staff: 1, bar: 0, at: 2 * PPQ, end: { bar: 1, at: 2 * PPQ } }).doc; // overlaps the first pedal → it goes
  assert.deepEqual(spansOf(d, "pedal").map((e) => e.abs / PPQ), [2]);
  assert.equal(spansOf(d, "hairpin").length, 1, "the hairpin stays");
  d = addPedal(d, { staff: 1, bar: 1, at: 2 * PPQ, end: { bar: 2, at: 0 } }).doc; // a retake: starts where the last ends
  assert.equal(spansOf(d, "pedal").length, 2);
  validate(d);
  assert.throws(() => addPedal(d, { staff: 1, bar: 1, at: 0, end: { bar: 0, at: 0 } }), /end after it starts/);
  assert.throws(() => addOttava(d, { staff: 0, bar: 0, at: 0, dir: 2, end: { bar: 1, at: 0 } }), /8va or 8vb/);
  assert.throws(() => addPedal(d, { staff: 1, bar: 0, at: 100, end: { bar: 1, at: 0 } }), /off the grid/);
  // moving and stretching work as for a hairpin; a bad document is refused by validate
  const ot = spansOf(d, "ottava")[0].x;
  d = moveSpanEnd(d, ot.id, "end", { bar: 1, at: PPQ });
  assert.equal(spansOf(d, "ottava")[0].absEnd, BAR + PPQ);
  d = moveExpressions(d, [ot.id], PPQ);
  assert.equal(spansOf(d, "ottava")[0].abs, PPQ);
  const bad = structuredClone(d); bad.measures[0].expressions.find((x) => x.kind === "ottava").dir = 3;
  assert.throws(() => validate(bad), /8va/);
  const bad2 = structuredClone(d); bad2.measures[1].expressions.unshift({ ...bad2.measures[1].expressions.find((x) => x.kind === "pedal"), id: "dup", at: 0 });
  assert.throws(() => validate(bad2), /pedals .* overlap/);
  d = removeExpressions(d, [ot.id]);
  assert.equal(spansOf(d, "ottava").length, 0);
});

test("fingering: stamps heads and whole notes, the same digit again clears, rests refused, validate checks the range, a re-cut keeps it", () => {
  let d = piece();
  const ch = first(d, 1);
  d = finger(d, [{ ev: ch.id, pi: 1 }], 5);
  assert.deepEqual(first(d, 1).pitches.map((p) => p.finger ?? null), [null, 5]);
  d = finger(d, [{ ev: ch.id }], 1);
  assert.deepEqual(first(d, 1).pitches.map((p) => p.finger), [1, 1]);
  assert.deepEqual(first(finger(d, [{ ev: ch.id }], 1), 1).pitches.map((p) => p.finger ?? null), [null, null], "the same digit on every head clears them");
  d = finger(d, [{ ev: ch.id }], null);
  assert.deepEqual(first(d, 1).pitches.map((p) => p.finger ?? null), [null, null]);
  assert.throws(() => finger(d, [{ ev: ch.id }], 6), Nudge);
  const rest = d.measures[1].staves[1].voices[0][0];
  assert.throws(() => finger(d, [{ ev: rest.id }], 2), /no finger/);
  d = finger(d, [{ ev: first(d, 0).id }], 3);
  validate(d);
  const bad = structuredClone(d); first(bad, 0).pitches[0].finger = 0;
  assert.throws(() => validate(bad), /finger is 1/);
  const re = setTime(d, 0, { beats: 3, unit: 4 }).doc;
  assert.equal(first(re, 0).pitches[0].finger, 3, "the note's pitch keeps its finger through a re-cut");
});

test("layout: heads under an 8va draw seven steps lower (an 8vb seven higher), the lines and signs land, fingers stack above the upper staff and below the lower, spans are hit-testable", () => {
  let d = piece();
  const L0 = layoutComposition(d, { unit: 10, width: 900 });
  const y0 = L0.drawn.filter((x) => !x.rest && x.staff === 0 && x.bar === 0).map((x) => x.heads[0].y);
  d = addOttava(d, { staff: 0, bar: 0, at: 0, dir: 1, end: { bar: 0, at: PPQ } }).doc; // covers beats 1 and 2 (the end slot too)
  d = addOttava(d, { staff: 1, bar: 0, at: 2 * PPQ, dir: -1, end: { bar: 0, at: 2 * PPQ + PPQ / 2 } }).doc;
  d = addPedal(d, { staff: 1, bar: 0, at: 0, end: { bar: 0, at: 2 * PPQ } }).doc;
  d = addPedal(d, { staff: 1, bar: 0, at: 2 * PPQ, end: { bar: 1, at: 0 } }).doc; // a retake at beat 3
  const ch = first(d, 1); d = finger(d, [{ ev: ch.id, pi: 0 }], 1); d = finger(d, [{ ev: ch.id, pi: 1 }], 3);
  const up = first(d, 0); d = finger(d, [{ ev: up.id }], 2);
  const L = layoutComposition(d, { unit: 10, width: 900 });
  const y1 = L.drawn.filter((x) => !x.rest && x.staff === 0 && x.bar === 0).map((x) => x.heads[0].y);
  assert.deepEqual(y1.map((y, i) => y - y0[i]), [3.5, 3.5, 0, 0], "beats 1 and 2 draw an octave (seven steps = 3.5 S) lower; 3 and 4 do not");
  const low = L.drawn.find((x) => !x.rest && x.staff === 1 && x.ticks === 2 * PPQ);
  assert.equal(low.ottava, -1); assert.equal(low.heads[0].step, 6 + 7, "the 8vb head is drawn seven steps higher");
  assert.equal(L.ottavas.length, 2);
  const [ova, ovb] = L.ottavas.sort((a, b) => a.dir < b.dir ? 1 : -1);
  assert.ok(ova.y < L.systems[0].staffTop[0] - 2, "8va above the upper staff"); assert.ok(ovb.y > L.systems[0].staffTop[1] + 4 + 2, "8vb below the lower");
  assert.ok(ova.x2 > L.drawn.find((x) => x.staff === 0 && x.ticks === PPQ).x + 1, "the 8va reaches past the beat-2 head");
  assert.equal(L.pedals.length, 2);
  const [p1, p2] = L.pedals;
  assert.ok(p1.notch && p2.retake && p2.x1 > p1.x2, "a retake: the first pedal ends in a notch, the second starts after it without a sign");
  assert.ok(p1.y > L.systems[0].staffTop[1] + 4 + 2.6, "the pedal line runs under the lower staff's expression line");
  assert.equal(L.fingers.length, 3);
  const fl = L.fingers.filter((f) => f.ev === ch.id).sort((a, b) => a.y - b.y), fu = L.fingers.find((f) => f.ev === up.id);
  assert.deepEqual(fl.map((f) => f.n), [3, 1], "below the lower staff the digits keep the notes' order: the upper head's 3 nearest the staff, the lower head's 1 under it");
  const chd = L.drawn.find((x) => x.id === ch.id), upd = L.drawn.find((x) => x.id === up.id);
  const chOuter = chd.stem === "down" ? chd.stemTipY : chd.botY, upOuter = upd.stem === "up" ? upd.stemTipY : upd.topY;
  assert.ok(Math.abs(fl[0].y - (chOuter + 1.91)) < 1e-9, `under the chord: the digit's baseline 1.91 S below the outer edge (ink 0.91 tall → a space of air), got ${(fl[0].y - chOuter).toFixed(2)}`);
  assert.ok(Math.abs(fl[1].y - fl[0].y - 1.25) < 1e-9, "the stack steps 1.25 S");
  assert.ok(Math.abs(fu.y - (upOuter - 1.0)) < 1e-9 && fu.n === 2, `above the upper staff's note: the baseline a space above the outer edge, got ${(upOuter - fu.y).toFixed(2)}`);
  // hit: the pedal line answers as a pedal, its ends as handles when selected; things() lists the spans once
  const t = thingAt(L, (p1.x1 + p1.x2) / 2 + 1.5, p1.y);
  assert.equal(t?.type, "pedal");
  assert.equal(thingAt(L, p1.x1, p1.y, new Set([p1.id]))?.type, "pedal-start");
  assert.equal(thingAt(L, ova.x1 + 4, ova.y)?.type, "ottava");
  assert.deepEqual(things(L).filter((x) => x.type === "pedal" || x.type === "ottava").length, 4);
});

test("playback: a note under the pedal sounds until it lifts; one after it is untouched; the octave line changes nothing", () => {
  let d = piece();
  d = addPedal(d, { staff: 0, bar: 0, at: 0, end: { bar: 0, at: 3 * PPQ } }).doc;
  d = addOttava(d, { staff: 0, bar: 0, at: 0, dir: 1, end: { bar: 0, at: 3 * PPQ } }).doc;
  const plain = timeline(piece()), tl = timeline(d);
  const upper = (t) => t.notes.filter((n) => n.staff === 0 && n.at < BAR).sort((a, b) => a.at - b.at);
  assert.deepEqual(upper(tl).map((n) => n.len / PPQ), [3, 2, 1, 1], "beats 1–3 hold to the lift on beat 4; beat 4 is its own quarter");
  assert.deepEqual(upper(tl).map((n) => n.midi), upper(plain).map((n) => n.midi), "the 8va leaves the pitches alone");
  assert.equal(tl.total, plain.total);
});

test("MusicXML: pedal, octave lines and fingering round-trip exactly; a foreign file's pedal change and octave-shift are read", () => {
  let d = piece();
  d = addPedal(d, { staff: 1, bar: 0, at: 0, end: { bar: 0, at: 2 * PPQ } }).doc;
  d = addPedal(d, { staff: 1, bar: 0, at: 2 * PPQ, end: { bar: 1, at: 0 } }).doc;
  d = addOttava(d, { staff: 0, bar: 0, at: PPQ, dir: 1, end: { bar: 0, at: 3 * PPQ } }).doc;
  d = addOttava(d, { staff: 1, bar: 2, at: 0, dir: -1, end: { bar: 3, at: 0 } }).doc;
  const ch = first(d, 1); d = finger(d, [{ ev: ch.id, pi: 0 }], 5); d = finger(d, [{ ev: ch.id, pi: 1 }], 1);
  d = finger(d, [{ ev: first(d, 0).id }], 2);
  const xml = toMusicXml(d, { now: new Date("2026-09-15T00:00:00Z"), software: "test" });
  assert.match(xml, /<pedal type="start" line="yes"\/>/); assert.match(xml, /<pedal type="stop" line="yes"\/>/);
  assert.match(xml, /<octave-shift type="down" size="8" number="1"\/>/); assert.match(xml, /<octave-shift type="up" size="8" number="1"\/>/);
  assert.match(xml, /<technical><fingering>5<\/fingering><\/technical>/);
  assert.equal((xml.match(/<pedal type="stop"/g) ?? []).length, 2, "the retake is a stop and a start on one tick");
  const back = fromMusicXml(xml, { id: "piano", now: 1 }).doc;
  const strip = (doc) => { const t = trimBars(doc); for (const m of t.measures) for (const x of m.expressions ?? []) delete x.id; return t.measures.map((m) => ({ ...m, staves: m.staves.map((s) => ({ voices: s.voices.map((v) => v && v.map((e) => ({ kind: e.kind, dur: e.dur, pitches: e.pitches?.map((p) => ({ step: p.step, octave: p.octave, alter: p.alter, finger: p.finger ?? null })) }))) })) })); };
  assert.deepEqual(strip(back), strip(d));
  // a file from another program: a pedal with a change, an octave line by <octave-shift> of size 15 — read as a 15ma since v98
  const foreign = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
    <measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
      <direction placement="above"><direction-type><octave-shift type="down" size="15"/></direction-type><staff>1</staff></direction>
      <note><pitch><step>C</step><octave>6</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff><notations><technical><fingering>4</fingering></technical></notations></note>
      <direction placement="above"><direction-type><octave-shift type="stop" size="15"/></direction-type><staff>1</staff></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <direction placement="below"><direction-type><pedal type="start" line="yes"/></direction-type><staff>2</staff></direction>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>5</voice><type>half</type><staff>2</staff></note>
      <direction placement="below"><direction-type><pedal type="change" line="yes"/></direction-type><staff>2</staff></direction>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>8</duration><voice>5</voice><type>half</type><staff>2</staff></note>
      <direction placement="below"><direction-type><pedal type="stop" line="yes"/></direction-type><staff>2</staff></direction>
    </measure></part></score-partwise>`;
  const r = fromMusicXml(foreign, { id: "f", now: 1 });
  assert.deepEqual(exprs(r.doc), ["ottava1@0-2:0", "pedal@0-2:1", "pedal@2-4:1"]);
  assert.equal(first(r.doc, 0).pitches[0].finger, 4);
  assert.ok(!r.warnings.some((w) => /15ma/.test(w)), r.warnings.join("; "));
  assert.equal(spansOf(r.doc, "ottava")[0].x.size, 15, "a 15ma is its own size since v98");
  const L = layoutComposition(r.doc, { unit: 10, width: 800 });
  assert.equal(L.ottavas.length, 1); assert.equal(L.ottavas[0].size, 15); assert.equal(L.pedals.length, 2);
});
