// N-part MusicXML (docs/COMPOSE_PARTS_DESIGN.md §4, WSHED-183): every part of a score becomes an instrument, and an
// ensemble goes out as one <part> per instrument with its part-list and bracket groups. The fixtures are shaped the
// way MuseScore 4 writes files (defaults, credits, part-groups, score/midi-instruments, beams, stems, <sound>).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromMusicXml, toMusicXml, ImportError } from "../js/lib/compose/musicxml.js";
import { newComposition, validate, nStavesOf } from "../js/lib/compose/model.js";
import { templateParts, partsFrom } from "../js/lib/compose/instruments.js";
import { place, addPart, setPartStaves } from "../js/lib/compose/engine.js";
import { parseXml, child, children, textOf } from "../js/lib/compose/xml.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const FIX = new URL("./fixtures/musicxml/", import.meta.url).pathname;
const read = (name) => readFileSync(FIX + name, "utf8");
const shape = (doc) => JSON.stringify(doc.measures, (k, v) => (k === "id" ? "" : v));
const roundTrip = (doc) => fromMusicXml(toMusicXml(doc, { now: new Date(0) }), { id: doc.id });

test("quartet.musicxml (MuseScore shape): four parts with names, abbreviations, instruments and clefs; the melody, dynamics, a tie and a finger land on their staves; nothing dropped, no warnings", () => {
  const { doc, warnings } = fromMusicXml(read("quartet.musicxml"), { id: "q" });
  assert.deepEqual(warnings, []);
  assert.deepEqual(doc.parts, [
    { id: "p1", name: "Violin I", abbr: "Vln. I", instrument: "violin", staves: 1, clefs: ["treble"] },
    { id: "p2", name: "Violin II", abbr: "Vln. II", instrument: "violin", staves: 1, clefs: ["treble"] },
    { id: "p3", name: "Viola", abbr: "Vla.", instrument: "viola", staves: 1, clefs: ["alto"] },
    { id: "p4", name: "Violoncello", abbr: "Vc.", instrument: "cello", staves: 1, clefs: ["bass"] },
  ]);
  assert.equal(doc.title, "Quartet in D"); assert.equal(doc.composer, "Claude"); assert.equal(doc.tempo, 108);
  assert.deepEqual(doc.measures[0].clefs, { 0: "treble", 1: "treble", 2: "alto", 3: "bass" }); assert.deepEqual(doc.measures[0].key, { fifths: 2 });
  assert.equal(doc.measures[0].staves[0].voices[0].filter((e) => e.kind === "note").length, 8, "eight eighths on the first violin");
  assert.equal(doc.measures[7].staves[3].voices[0][0].dur.base, 1, "the cello's last whole");
  assert.deepEqual(doc.measures[0].expressions.map((x) => [x.kind, x.staff, x.value]), [["dyn", 0, "p"], ["dyn", 1, "p"], ["dyn", 2, "p"], ["dyn", 3, "p"]]);
  assert.equal(doc.measures[3].staves[3].voices[0][0].pitches[0].tie, "start"); assert.equal(doc.measures[3].staves[3].voices[0][1].pitches[0].tie, "stop");
  assert.equal(doc.measures[1].staves[0].voices[0][0].pitches[0].finger, 2);
  assert.deepEqual(doc.measures[7].barline, { end: "final" });
  validate(doc);
});

test("voice-piano.musicxml: a vocal line with lyrics over a two-staff piano → 2 parts, 3 staves, lyrics on the voice, the piano's voice 5 on its lower staff", () => {
  const { doc, warnings } = fromMusicXml(read("voice-piano.musicxml"), { id: "vp" });
  assert.deepEqual(warnings, []);
  assert.deepEqual(doc.parts.map((p) => [p.name, p.instrument, p.staves, p.clefs]), [["Voice", "voice", 1, ["treble"]], ["Piano", "piano", 2, ["treble", "bass"]]]);
  assert.equal(nStavesOf(doc), 3);
  const sung = doc.measures.flatMap((m) => m.staves[0].voices[0].filter((e) => e.kind === "note")).map((e) => e.lyrics?.[0]?.text);
  assert.deepEqual(sung.slice(0, 8), ["A", "ma", "zing", undefined, "grace", "how", "sweet", "the"]);
  assert.equal(doc.measures[0].staves[2].voices[0][0].dur.base, 1, "the piano's whole on its lower staff");
  assert.ok(doc.measures[0].staves[1].voices[0].every((e) => e.kind === "note"), "quarters on the piano's upper staff");
  assert.deepEqual(doc.measures[0].expressions.map((x) => [x.kind, x.staff, x.at, x.value]), [["dyn", 1, 0, "p"], ["dyn", 0, 3 * PPQ, "mp"]], "the piano's p on beat 1, the singer's mp under the pickup quarter");
  validate(doc);
});

test("quintet.musicxml: a part-group'd wind quintet groups by instrument (one bracket over all five); transposing parts are read at written pitch with one warning", () => {
  const { doc, warnings } = fromMusicXml(read("quintet.musicxml"), { id: "w" });
  assert.deepEqual(warnings, ["transposing parts were read at their written pitch"]);
  assert.deepEqual(doc.parts.map((p) => p.instrument), ["flute", "oboe", "clarinet", "horn", "bassoon"]);
  assert.equal(doc.parts[2].name, "Clarinet in B♭");
  validate(doc);
});

test("import → export → import is equal on every fixture (parts, staves, clefs, notes, expressions, lyrics); the export lists every part with its sound and wraps bracket groups", () => {
  for (const f of ["quartet", "voice-piano", "quintet"]) {
    const { doc } = fromMusicXml(read(`${f}.musicxml`), { id: f });
    const xml = toMusicXml(doc, { now: new Date(0) });
    const back = fromMusicXml(xml, { id: f });
    assert.deepEqual(back.doc.parts, doc.parts, f); assert.equal(shape(back.doc), shape(doc), f); assert.equal(back.doc.tempo, doc.tempo);
    assert.deepEqual(back.warnings, [], f);
    const root = parseXml(xml), list = child(root, "part-list");
    assert.equal(children(list, "score-part").length, doc.parts.length);
    assert.equal(children(root, "part").length, doc.parts.length);
    assert.deepEqual(children(list, "score-part").map((sp) => textOf(sp, "part-name")), doc.parts.map((p) => p.name));
    assert.deepEqual(children(list, "score-part").map((sp) => textOf(child(sp, "score-instrument"), "instrument-sound")), ["strings.violin", "strings.violin", "strings.viola", "strings.cello"].slice(0, f === "quartet" ? 4 : 0).concat(f === "voice-piano" ? ["voice.vocals", "keyboard.piano"] : f === "quintet" ? ["wind.flutes.flute", "wind.reed.oboe", "wind.reed.clarinet", "brass.french-horn", "wind.reed.bassoon"] : []));
    const groups = children(list, "part-group");
    if (f === "voice-piano") assert.equal(groups.length, 0, "a brace part needs no group");
    else { assert.equal(groups.length, 2); assert.equal(textOf(groups[0], "group-symbol"), "bracket"); assert.equal(groups[0].attrs.type, "start"); assert.equal(groups[1].attrs.type, "stop"); }
  }
});

test("export per part: staff and voice numbers are local to the part, the tempo and the form go on the first part only, every part carries its barlines; the piano's <staves> is 2", () => {
  let d = newComposition({ id: "vp", title: "S", now: 1, parts: templateParts("voice") });
  d = place(d, { bar: 0, staff: 2, ticks: 0, step: 4 }, { base: 4, dots: 0, rest: false }).doc;
  d = place(d, { bar: 0, staff: 1, ticks: 0, step: 4, voice: 1 }, { base: 4, dots: 0, rest: false }).doc;
  d.measures[0].barline = { end: "repeat" }; d.measures[1].form = [{ kind: "rehearsal" }];
  const xml = toMusicXml(d, { now: new Date(0) }), root = parseXml(xml), parts = children(root, "part");
  const piano = parts[1], m0 = children(piano, "measure")[0];
  assert.equal(textOf(child(m0, "attributes"), "staves"), "2");
  assert.deepEqual(children(child(m0, "attributes"), "clef").map((c) => c.attrs.number), ["1", "2"]);
  const staffs = children(m0, "note").map((n) => textOf(n, "staff")), voices = children(m0, "note").map((n) => textOf(n, "voice"));
  assert.ok(staffs.every((s) => s === "1" || s === "2") && staffs.includes("2"), "the piano's staves are 1 and 2 in its own part");
  assert.ok(voices.includes("2") && voices.includes("5"), "voice 2 on the upper staff, voice 5 on the lower");
  assert.equal(children(children(parts[0], "measure")[0], "direction").filter((x) => child(child(x, "direction-type"), "metronome")).length, 1, "the tempo on the voice (first part)");
  assert.equal(children(m0, "direction").filter((x) => child(child(x, "direction-type"), "metronome")).length, 0, "not on the piano");
  assert.equal(children(children(parts[0], "measure")[1], "direction").some((x) => child(child(x, "direction-type"), "rehearsal")), true);
  assert.equal(children(children(piano, "measure")[1], "direction").some((x) => child(child(x, "direction-type"), "rehearsal")), false);
  assert.ok(children(m0, "barline").length === 1 && children(children(parts[0], "measure")[0], "barline").length === 1, "the repeat barline is on every part");
  assert.equal(roundTrip(d).doc.measures[1].form?.[0].kind, "rehearsal"); assert.deepEqual(roundTrip(d).doc.measures[0].barline, { end: "repeat" });
});

test("refusals and limits: too many staves in one part, too many in the score; an organ's three staves are kept; the solo-piano part-list is the historic one", () => {
  const part = (id, staves, bars = 1) => `<part id="${id}">${Array.from({ length: bars }, (_, b) => `<measure number="${b + 1}">${b === 0 ? `<attributes><divisions>1</divisions><staves>${staves}</staves>${Array.from({ length: staves }, (_, k) => `<clef number="${k + 1}"><sign>G</sign><line>2</line></clef>`).join("")}</attributes>` : ""}<note><rest measure="yes"/><duration>4</duration><voice>1</voice><staff>1</staff></note></measure>`).join("")}</part>`;
  const list = (n) => `<part-list>${Array.from({ length: n }, (_, i) => `<score-part id="P${i + 1}"><part-name>X${i + 1}</part-name></score-part>`).join("")}</part-list>`;
  assert.throws(() => fromMusicXml(`<score-partwise>${list(1)}${part("P1", 4)}</score-partwise>`, { id: "x" }), (e) => e instanceof ImportError && /X1 has 4 staves; Compose holds 3/.test(e.message));
  assert.throws(() => fromMusicXml(`<score-partwise>${list(6)}${Array.from({ length: 6 }, (_, i) => part(`P${i + 1}`, 3)).join("")}</score-partwise>`, { id: "x" }), /18 staves; Compose holds 16/);
  const organ = fromMusicXml(`<score-partwise>${list(1).replace("X1", "Organ")}${part("P1", 3)}</score-partwise>`, { id: "o" }).doc;
  assert.deepEqual(organ.parts.map((p) => [p.instrument, p.staves]), [["organ", 3]]); assert.equal(nStavesOf(organ), 3);
  assert.ok(toMusicXml(newComposition({ id: "p", now: 1 }), { now: new Date(0) }).includes('<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'), "a solo piano writes what it always wrote (the golden file)");
  const q = newComposition({ id: "q", now: 1, parts: templateParts("quartet") });
  assert.ok(toMusicXml(q, { now: new Date(0) }).includes('<part-abbreviation>Vln. I</part-abbreviation>'));
  let o = newComposition({ id: "o", now: 1, parts: partsFrom(["organ"]) });
  assert.deepEqual(roundTrip(o).doc.parts, o.parts);
});
