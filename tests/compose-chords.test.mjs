// The Libertango round (docs/COMPOSE_CHORDS_DESIGN.md; WSHED-165…170): chord symbols (model, rail grammar in the
// engine, engraving, PDF, MusicXML), the open and cross-system glissando, clefs on the half beat, the subtitle, beam
// join and whole tuplet beams, stem-side articulations in two voices, mid-system clefs, one roll over two voices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadUmd } from "../dev/lib/umd.mjs";
import { newComposition, validate } from "../js/lib/compose/model.js";
import { place, addExpression, setExpressionValue, moveExpressions, expressionsOf, cleanTies, gliss, setClef, setTime, beamBreak, find, chordOf, Nudge } from "../js/lib/compose/engine.js";
import { parseChord, chordText, qualityRuns, prettyQuality, xmlKind, CHORD_QUALITIES } from "../js/lib/compose/chordsym.js";
import { layoutComposition } from "../js/lib/compose/layout.js";
import { thingAt } from "../js/lib/compose/hit.js";
import { planPages, renderPdf } from "../js/lib/compose/export/pdf.js";
import { toMusicXml, fromMusicXml } from "../js/lib/compose/musicxml.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const ROOT = new URL("../", import.meta.url).pathname;
const libs = {
  PDFLib: loadUmd(ROOT + "vendor/pdflib/pdf-lib.min.js"),
  fontkit: loadUmd(ROOT + "vendor/pdflib/fontkit.umd.min.js"),
  fonts: { regular: readFileSync(ROOT + "fonts/Fraunces-Regular.ttf"), italic: readFileSync(ROOT + "fonts/Fraunces-Italic.ttf") },
};
const Q = { base: 4, dots: 0, rest: false }, E = { base: 8, dots: 0, rest: false };
/** Four quarters on each staff of bar 1 and bar 2. */
function piece() {
  let d = newComposition({ id: "chords", title: "Chords", now: 1 });
  for (const bar of [0, 1]) for (let i = 0; i < 4; i++) { d = place(d, { bar, staff: 0, ticks: i * PPQ, step: 4 + i }, Q).doc; d = place(d, { bar, staff: 1, ticks: i * PPQ, step: 2 }, Q).doc; }
  return d;
}
const chordsOf = (d) => expressionsOf(d).filter((e) => e.x.kind === "chord").map((e) => `${chordText(e.x)}@${e.abs / PPQ}`);

test("chord symbols: the parser reads what a source prints and keeps its spelling", () => {
  assert.deepEqual(parseChord("Bm7(b5)/A"), { root: { step: "B", alter: 0 }, q: "m7(♭5)", bass: { step: "A", alter: 0 } });
  assert.deepEqual(parseChord("F#dim7"), { root: { step: "F", alter: 1 }, q: "dim7" });
  assert.deepEqual(parseChord("Bbmaj7/A"), { root: { step: "B", alter: -1 }, q: "maj7", bass: { step: "A", alter: 0 } });
  assert.deepEqual(parseChord("Gm/B♭"), { root: { step: "G", alter: 0 }, q: "m", bass: { step: "B", alter: -1 } });
  assert.equal(parseChord("E7alt.").q, "7alt.");
  assert.equal(parseChord("C6/9").q, "6/9", "a 6/9 is a quality, not a slash bass");
  assert.equal(parseChord("Am(add9)").q, "m(add9)");
  assert.equal(parseChord("H7"), null);
  assert.equal(prettyQuality("7#9b13"), "7♯9♭13");
  assert.equal(chordText(parseChord("Bbmaj7/A")), "B♭maj7/A");
  assert.deepEqual(qualityRuns("m7(♭5)"), [{ t: "m7" }, { t: "(♭5)", sup: true }], "an alteration after a digit is raised");
  assert.deepEqual(qualityRuns("m(add9)"), [{ t: "m(add9)" }], "a bracket after a letter stays on the line");
  for (const q of CHORD_QUALITIES) assert.ok(chordOf({ root: { step: "C" }, q }), `rail quality ${q} is a chord`);
  assert.equal(xmlKind("m7(♭5)"), "half-diminished"); assert.equal(xmlKind("7alt."), "dominant"); assert.equal(xmlKind(""), "major");
});

test("chord symbols are expressions: placed on half-beat slots, one per slot, retyped by parts, moved, validated", () => {
  let d = piece();
  d = addExpression(d, { kind: "chord", staff: 0, bar: 0, at: 0, value: "Am" }).doc;
  d = addExpression(d, { kind: "chord", staff: 0, bar: 0, at: PPQ * 1.5, value: { root: { step: "F", alter: 1 }, q: "7alt." } }).doc;
  d = addExpression(d, { kind: "chord", staff: 0, bar: 1, at: 0, value: "Bm7(b5)/A" }).doc;
  validate(d);
  assert.deepEqual(chordsOf(d), ["Am@0", "F♯7alt.@1.5", "Bm7(♭5)/A@4"]);
  d = addExpression(d, { kind: "chord", staff: 0, bar: 0, at: 0, value: "E7" }).doc; // the slot's owner is replaced
  assert.deepEqual(chordsOf(d), ["E7@0", "F♯7alt.@1.5", "Bm7(♭5)/A@4"]);
  assert.throws(() => addExpression(d, { kind: "chord", staff: 0, bar: 0, at: 100, value: "C" }), Nudge, "off the grid");
  assert.throws(() => addExpression(d, { kind: "chord", staff: 0, bar: 0, at: 0, value: "nope" }), Nudge);
  const ids = expressionsOf(d).filter((e) => e.x.kind === "chord").map((e) => e.x.id);
  let r = setExpressionValue(d, ids, { q: "m7" });
  assert.deepEqual(chordsOf(r), ["Em7@0", "F♯m7@1.5", "Bm7/A@4"], "a quality alone keeps each root and bass");
  r = setExpressionValue(r, ids, { root: { alter: -1 } });
  assert.deepEqual(chordsOf(r), ["E♭m7@0", "F♭m7@1.5", "B♭m7/A@4"], "an alter alone keeps each letter");
  r = setExpressionValue(r, ids, { bass: undefined });
  assert.deepEqual(chordsOf(r), ["E♭m7@0", "F♭m7@1.5", "B♭m7@4"], "the bass goes");
  assert.equal(setExpressionValue(r, ids, { q: "m7" }), r, "no change, the same document");
  r = moveExpressions(r, [ids[2]], PPQ / 2);
  assert.deepEqual(chordsOf(r), ["E♭m7@0", "F♭m7@1.5", "B♭m7@4.5"]);
  validate(r);
  const bad = structuredClone(r); bad.measures[0].expressions.find((x) => x.kind === "chord").q = "x".repeat(17);
  assert.throws(() => validate(bad), /chord symbol/);
});

test("chord symbols engrave on one line per system, clear of the highest ink, with the form lane above them", () => {
  let d = piece();
  d = place(d, { bar: 1, staff: 0, ticks: 2 * PPQ, step: 16 }, Q).doc; // a high A6 in bar 2: three ledger lines up
  d = addExpression(d, { kind: "chord", staff: 0, bar: 0, at: 0, value: "Am" }).doc;
  d = addExpression(d, { kind: "chord", staff: 0, bar: 1, at: 0, value: "Bm7(b5)/A" }).doc;
  d.measures[0].form = [{ kind: "tempo", bpm: 170 }];
  const L = layoutComposition(d, { unit: 10, width: 1600 });
  assert.equal(L.chords.length, 2);
  const [a, b] = L.chords, top = L.systems[0].staffTop[0];
  assert.equal(a.system, b.system); assert.equal(a.y, b.y, "one baseline in a system");
  const high = L.drawn.find((x) => x.bar === 1 && x.ticks === 2 * PPQ && x.staff === 0);
  assert.ok(a.y < high.topY - 1, "above the high note");
  assert.ok(a.y <= top - 2.8, "never lower than the floor over the staff");
  assert.deepEqual(b.runs, [{ t: "m7" }, { t: "(♭5)", sup: true }]);
  const tempo = L.form.find((f) => f.kind === "tempo");
  assert.ok(tempo.y < a.y - a.size, "the tempo mark moved above the chord line");
  // a tap on a symbol selects it as a chord
  const t = thingAt(L, a.x + 0.5, a.y - 0.4);
  assert.equal(t?.type, "chord"); assert.equal(t.ev, d.measures[0].expressions.find((x) => x.kind === "chord").id);
});

test("chord symbols on paper: upright face, Bravura accidentals, every run on its own system's page", async () => {
  let d = piece();
  d = addExpression(d, { kind: "chord", staff: 0, bar: 0, at: 0, value: "Bbm7(b5)/F#" }).doc;
  const plan = planPages(d, {});
  const bytes = await renderPdf(plan, libs, { title: "C", subtitle: "As played by someone", composer: "X", now: new Date(0) });
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(/Fraunces-Regular|FrauncesRoman|Fraunces/.test(text));
  assert.ok((text.match(/\/Subtype \/Form/g) ?? []).length > 3, "glyph outlines as forms (the flats, the sharp)");
});

test("glissando: open up / down need no note after; to the next note survives a system break as two halves; MusicXML doit / falloff", () => {
  let d = piece();
  const lastOf = (doc, bar) => doc.measures[bar].staves[0].voices[0].at(-1);
  // the last note of the piece has nothing after it: an open gliss only
  const tail = lastOf(d, 1).id;
  assert.throws(() => gliss(d, [tail]), Nudge);
  d = gliss(d, [tail], "up");
  cleanTies(d); validate(d);
  assert.equal(find(d, tail).ev.gliss, "up", "survives cleanTies");
  d = gliss(d, [tail], "up"); assert.equal(find(d, tail).ev.gliss, undefined, "the same again removes it");
  d = gliss(d, [tail], "down");
  // a gliss to the next bar's first note, with the bars on two systems
  const fromId = lastOf(d, 0).id;
  d = gliss(d, [fromId]);
  d.measures[0].lay = { brk: "break" };
  const L = layoutComposition(d, { unit: 10, width: 1600, pins: true });
  const halves = L.glisses.filter((g) => g.half);
  assert.deepEqual(halves.map((g) => g.half), ["out", "in"]);
  assert.notEqual(halves[0].system, halves[1].system);
  const open = L.glisses.find((g) => g.open === "down");
  assert.ok(open && open.y2 > open.y1, "a fall goes down");
  const xml = toMusicXml(d, { now: new Date(0) });
  assert.ok(xml.includes("<falloff/>"));
  const back = fromMusicXml(xml.replace("<falloff/>", "<doit/>"), { id: "b", now: 1 }).doc;
  assert.equal(back.measures[1].staves[0].voices[0].at(-1).gliss, "up");
});

test("clef changes sit on the half beat: validate, setClef, setTime re-flow, layout reads the chord before in the old clef", () => {
  let d = piece();
  d = setClef(d, 0, 1, "treble", PPQ * 1.5);
  validate(d);
  assert.deepEqual(d.measures[0].clefChanges, [{ staff: 1, at: PPQ * 1.5, clef: "treble" }]);
  assert.throws(() => setClef(d, 0, 1, "alto", PPQ / 4), Nudge, "a sixteenth is off the grid");
  const L = layoutComposition(d, { unit: 10, width: 1600 });
  const clef = L.clefs.find((c) => c.bar === 0 && c.staff === 1);
  const beat1 = L.drawn.find((x) => x.bar === 0 && x.staff === 1 && x.ticks === PPQ), beat2 = L.drawn.find((x) => x.bar === 0 && x.staff === 1 && x.ticks === 2 * PPQ);
  assert.ok(clef.x > beat1.x && clef.x < beat2.x, "drawn between the note before and the note after");
  const t = setTime(d, 0, { beats: 3, unit: 4 }).doc;
  validate(t);
  assert.deepEqual(t.measures[0].clefChanges, [{ staff: 1, at: PPQ * 1.5, clef: "treble" }], "the half beat survives the re-flow");
});

test("subtitle: validated, carried by MusicXML both ways, pushes the composer down on page 1", () => {
  const d = piece(); d.subtitle = "As played by Ayatoshi Oikawa"; d.composer = "Astor Piazzolla";
  validate(d);
  const xml = toMusicXml(d, { now: new Date(0) });
  assert.ok(xml.includes("<credit-type>subtitle</credit-type>"));
  assert.equal(fromMusicXml(xml, { id: "s", now: 1 }).doc.subtitle, "As played by Ayatoshi Oikawa");
  const with_ = planPages(d, {}), without = planPages({ ...d, subtitle: undefined }, {});
  assert.ok(with_.pages[0].top > without.pages[0].top, "the title block grows by the subtitle's line");
  const bad = { ...d, subtitle: "" }; assert.throws(() => validate(bad), /subtitle/);
});

test("beams: a tuplet beams whole across beats; join beams across the beat; break still breaks", () => {
  let d = newComposition({ id: "beams", title: "B", now: 1 });
  for (let i = 0; i < 8; i++) d = place(d, { bar: 0, staff: 0, ticks: i * PPQ / 2, step: 4 + (i % 3) }, E).doc;
  const ev = (k) => d.measures[0].staves[0].voices[0][k];
  const runs = (doc) => { const L = layoutComposition(doc, { unit: 10, width: 1600 }); return new Set(L.drawn.filter((x) => !x.rest && x.bar === 0 && x.staff === 0).map((x) => x.beamRun)).size; };
  assert.equal(runs(d), 4, "by the beat");
  d = beamBreak(d, [ev(2).id, ev(6).id], "join");
  validate(d);
  assert.equal(runs(d), 2, "joined by the half bar");
  d = beamBreak(d, [ev(2).id], "join"); assert.equal(runs(d), 3, "the same again: automatic");
  // a sextuplet of eighths over two beats is one beam with no bracket
  const sx = structuredClone(d), id = "t6";
  sx.measures[0].staves[0].voices[0] = Array.from({ length: 6 }, (_, k) => ({ id: `s${k}`, kind: "note", dur: { base: 8, dots: 0, tuplet: { n: 6, in: 4, id } }, pitches: [{ step: "C", alter: 0, octave: 5 }] })).concat([{ id: "r1", kind: "rest", dur: { base: 2, dots: 0 } }]);
  validate(sx);
  const L = layoutComposition(sx, { unit: 10, width: 1600 });
  assert.equal(new Set(L.drawn.filter((x) => x.tupletId === id).map((x) => x.beamRun)).size, 1);
  assert.equal(L.tuplets.find((t) => t.n === 6).bracket, false);
});

test("two voices on a staff: articulations go to the stem end; a roll on both voices' chords is one roll", () => {
  let d = newComposition({ id: "v", title: "V", now: 1 });
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 8 }, { base: 1, dots: 0, rest: false }).doc; // voice 1: a whole note
  const v2 = structuredClone(d);
  v2.measures[0].staves[0].voices[1] = [{ id: "a", kind: "note", dur: { base: 4, dots: 0 }, pitches: [{ step: "E", alter: 0, octave: 4 }], art: ["staccato"], arp: "plain" }, { id: "b", kind: "rest", dur: { base: 4, dots: 0 } }, { id: "c", kind: "rest", dur: { base: 2, dots: 0 } }];
  v2.measures[0].staves[0].voices[0][0].arp = "plain";
  v2.measures[0].staves[0].voices[0][0].pitches.push({ step: "G", alter: 0, octave: 5 });
  validate(v2);
  const L = layoutComposition(v2, { unit: 10, width: 1600 });
  const a = L.drawn.find((x) => x.id === "a"), mk = L.marks.find((m) => m.mark === "staccato");
  assert.equal(a.stem, "down");
  assert.ok(mk.y > a.stemTipY, "the staccato sits past the stem's end, under the voice-2 note");
  assert.equal(L.arps.length, 1, "one roll");
  assert.ok(L.arps[0].y1 >= a.botY + 0.9, "it reaches the lower voice");
});

test("mid-system clef change: only the changing staff shows a clef, and it stands before the barline", () => {
  let d = piece();
  d = setClef(d, 1, 1, "treble");
  const L = layoutComposition(d, { unit: 10, width: 1600 });
  const lead = L.systems[0].leading[1];
  assert.equal(lead.clef, true);
  assert.deepEqual(lead.staves.map((s) => s.showClef), [false, true]);
  const bl = L.systems[0].barlines[0];
  assert.ok(bl.x > lead.x + 1.5, "the barline that closes bar 1 stands after the clef");
});
