// MusicXML export + import (docs/COMPOSE_MUSICXML_DESIGN.md, WSHED-119). The golden piece
// serialises byte for byte to tests/fixtures/compose-golden.musicxml (regenerate on purpose:
//   node -e 'import("./tests/fixtures/compose-golden.mjs").then(m=>m.writeXml())'
// ) and round-trips; a multi-voice piece round-trips; hand-written files exercise what other
// programs write. One-off XSD check (2026-09-14): the golden export and the voices export validate
// against the W3C MusicXML 4.0 schema (lxml, xml.xsd / xlink.xsd imports pointed at local copies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { goldenDoc, goldenXml } from "./fixtures/compose-golden.mjs";
import { toMusicXml, fromMusicXml, musicXmlFileName, ImportError } from "../js/lib/compose/musicxml.js";
import { parseXml, decode, esc, child, children, textOf } from "../js/lib/compose/xml.js";
import { readMxl, zipEntries, isZip } from "../js/lib/compose/mxl.js";
import { newComposition, validate } from "../js/lib/compose/model.js";
import { place, tuplet, crossStaff, hideRest, nudgeRest, addExpression, addHairpin, nudgeExpressionY, setClef, setKey, setTime, dot, trimBars } from "../js/lib/compose/engine.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const N = (base, dots = 0) => ({ base, dots, rest: false, tuplet: null, alter: null });
const R = (base) => ({ base, dots: 0, rest: true, tuplet: null, alter: null });
/** The measures with every id gone, for comparing pieces built by different code. */
const bars = (doc) => JSON.parse(JSON.stringify(trimBars(doc).measures, (k, v) => (k === "id" ? undefined : v)));
const kinds = (doc, b, staff = 0, voice = 0) => doc.measures[b].staves[staff].voices[voice].map((e) => `${e.kind === "rest" ? "r" : "n"}${e.dur.base}${e.dur.dots ? "." : ""}${e.dur.tuplet ? "t" : ""}`).join(" ");
const pitches = (doc, b, i, staff = 0, voice = 0) => doc.measures[b].staves[staff].voices[voice][i].pitches.map((p) => `${p.step}${p.alter > 0 ? "#".repeat(p.alter) : "b".repeat(-p.alter)}${p.octave}`).join("+");

/** A piece with two voices on the upper staff, a crossed note, a hidden and a dragged rest, a tuplet, marks with lifts, changes of key / time / clef, a double dot. */
function voicesDoc() {
  let d = newComposition({ id: "voices", title: "Voices", composer: "Test", now: 1 });
  d.tempo = 72;
  for (let q = 0; q < 4; q++) d = place(d, { bar: 0, staff: 0, ticks: q * PPQ, step: 8 + q }, N(4)).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 2, voice: 1 }, N(2)).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 2 * PPQ, step: 1, voice: 1 }, N(4)).doc; // voice 2: half, quarter, quarter rest
  const v2 = d.measures[0].staves[0].voices[1];
  d = nudgeRest(d, [v2[2].id], -2);
  d = place(d, { bar: 0, staff: 1, ticks: 0, step: 4 }, N(8)).doc;
  d = place(d, { bar: 0, staff: 1, ticks: 2 * PPQ, step: 6 }, N(4)).doc;
  const lh = d.measures[0].staves[1].voices[0];
  d = hideRest(d, [lh[1].id]);
  d = crossStaff(d, [lh[0].id], -1); // the bass eighth is drawn on the upper staff
  for (let i = 0; i < 3; i++) d = place(d, { bar: 1, staff: 0, ticks: i * (PPQ / 2), step: 6 }, N(8)).doc;
  d = tuplet(d, d.measures[1].staves[0].voices[0].slice(0, 3).map((e) => e.id), 3);
  d = place(d, { bar: 1, staff: 0, ticks: 2 * PPQ, step: 5 }, N(4)).doc;
  d = dot(d, [d.measures[1].staves[0].voices[0][4].id], 2); // a double-dotted quarter → then rests
  d = setKey(d, 2, -3);
  d = setTime(d, 2, { beats: 3, unit: 4 }).doc;
  d = setClef(d, 2, 1, "tenor", PPQ);
  d = place(d, { bar: 2, staff: 1, ticks: PPQ, step: 4 }, N(4)).doc;
  d = place(d, { bar: 2, staff: 0, ticks: 0, step: 6 }, N(2, 1)).doc;
  let r = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "ff" }); d = nudgeExpressionY(r.doc, [r.id], -3);
  r = addExpression(d, { kind: "text", staff: 1, bar: 0, at: PPQ, value: "espressivo" }); d = nudgeExpressionY(r.doc, [r.id], 4);
  r = addHairpin(d, { staff: 0, bar: 0, at: PPQ * 1.5, dir: "dim", end: { bar: 1, at: PPQ / 2 } }); d = nudgeExpressionY(r.doc, [r.id], -2);
  d = addExpression(d, { kind: "dyn", staff: 1, bar: 1, at: PPQ * 2.5, value: "mp" }).doc; // inside the lower staff's half rest: reached with backup / forward
  validate(d);
  return d;
}

test("golden: the piece serialises byte for byte to the golden file", async () => {
  const want = readFileSync(new URL("./fixtures/compose-golden.musicxml", import.meta.url), "utf8");
  assert.equal(await goldenXml(), want);
});

test("golden: export → import gives back the same measures, tempo, title and composer", async () => {
  const d = goldenDoc();
  const { doc, warnings } = fromMusicXml(await goldenXml(), { id: "back" });
  assert.deepEqual(warnings, []);
  assert.deepEqual(bars(doc), bars(d));
  assert.equal(doc.tempo, d.tempo); assert.equal(doc.title, "golden"); assert.equal(doc.composer, "Golden");
  validate(doc);
});

test("voices: two voices, a crossed note, hidden and dragged rests, a tuplet, lifted marks, key / time / clef changes and a double dot round-trip", () => {
  const d = voicesDoc();
  const xml = toMusicXml(d, { now: new Date(0), software: "t" });
  assert.match(xml, /<voice>2<\/voice>/); assert.match(xml, /<voice>5<\/voice>/, "the lower staff's voice is 5");
  assert.match(xml, /<note print-object="no"><rest\/>/);
  assert.match(xml, /<rest><display-step>/);
  assert.match(xml, /<time-modification><actual-notes>3<\/actual-notes><normal-notes>2<\/normal-notes><\/time-modification>/);
  assert.match(xml, /<tuplet type="start" bracket="yes" show-number="actual"\/>/);
  assert.match(xml, /<dynamics relative-y="-15"><ff\/><\/dynamics>/); assert.match(xml, /<words relative-y="20">espressivo<\/words>/); assert.match(xml, /<wedge type="diminuendo" number="1" relative-y="-10"\/>/);
  assert.match(xml, /<backup><duration>\d+<\/duration><\/backup>\n\s*<direction placement="below"><direction-type><dynamics><mp\/>/, "a mark inside a rest is reached with a backup");
  assert.match(xml, /<clef number="2"><sign>C<\/sign><line>4<\/line><\/clef><\/attributes>\n\s*<note>/, "the tenor clef sits before the note it starts on");
  assert.match(xml, /<type>quarter<\/type><dot\/><dot\/>/);
  assert.match(xml, /<per-minute>72<\/per-minute>/);
  const { doc, warnings } = fromMusicXml(xml, { id: "back" });
  assert.deepEqual(warnings, []);
  assert.deepEqual(bars(doc), bars(d));
  assert.equal(doc.tempo, 72);
  // the crossed note is drawn on the upper staff but belongs to the lower voice
  assert.equal(doc.measures[0].staves[1].voices[0][0].cross, -1);
  assert.equal(doc.measures[0].staves[0].voices[1][2].restY, -2);
});

test("file name: composer – title, nothing a file system minds", () => {
  assert.equal(musicXmlFileName({ title: "Étude: no. 1?", composer: "Taylor / Leif" }), "Taylor - Leif – Étude- no. 1-.musicxml");
  assert.equal(musicXmlFileName({ title: "" }), "composition.musicxml");
});

// --- what other programs write ---------------------------------------------------------------
/** A part-wise piano score around hand-written measures (divisions 4: a quarter is 4). */
const score = (measures, { staves = 2, extra = "", partList = '<score-part id="P1"><part-name>Piano</part-name></score-part>', head = "" } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">${head}<part-list>${partList}</part-list><part id="P1">${measures.map((m, i) => `<measure number="${i + 1}"${m.attrs ?? ""}>${i === 0 ? `<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>${staves}</staves><clef number="1"><sign>G</sign><line>2</line></clef>${staves > 1 ? '<clef number="2"><sign>F</sign><line>4</line></clef>' : ""}</attributes>` : ""}${m.body ?? m}</measure>`).join("")}</part>${extra}</score-partwise>`;
const note = (step, oct, dur, type, more = "") => `<note><pitch><step>${step}</step><octave>${oct}</octave></pitch><duration>${dur}</duration><voice>1</voice><type>${type}</type><staff>1</staff>${more}</note>`;
const rest = (dur, type, more = "") => `<note><rest/><duration>${dur}</duration><voice>1</voice>${type ? `<type>${type}</type>` : ""}<staff>1</staff>${more}</note>`;

test("import: a pickup bar is filled from the front; gaps become the metre's rests; the lower staff rests; title from the file name; tag kept", () => {
  const xml = score([{ attrs: ' implicit="yes"', body: note("G", 4, 4, "quarter") }, note("C", 5, 8, "half") + note("D", 5, 4, "quarter")]);
  const { doc, warnings } = fromMusicXml(xml, { id: "p", fileName: "Pickup study.musicxml", tags: ["imported"] });
  assert.equal(kinds(doc, 0), "r2 r4 n4"); assert.equal(pitches(doc, 0, 2), "G4");
  assert.equal(kinds(doc, 1), "n2 n4 r4");
  assert.equal(kinds(doc, 0, 1), "r1");
  assert.equal(doc.title, "Pickup study"); assert.deepEqual(doc.tags, ["imported"]);
  assert.equal(doc.measures.length, 8, "padded to the default count with an empty bar after the last");
  assert.deepEqual(warnings, ["the pickup bar was filled from the front"]);
  validate(doc);
});

test("import: a time-wise score with two single-staff parts becomes the upper and lower staff; a third part is ignored; title and composer read", () => {
  const p = (id, s, o) => `<part id="${id}">${id === "P1" ? '<attributes><divisions>1</divisions><key><fifths>2</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : id === "P2" ? '<attributes><divisions>1</divisions><clef><sign>F</sign><line>4</line></clef></attributes>' : '<attributes><divisions>1</divisions></attributes>'}<note><pitch><step>${s}</step><octave>${o}</octave></pitch><duration>2</duration><type>half</type></note></part>`;
  const xml = `<score-timewise version="4.0"><work><work-title>Two hands</work-title></work><identification><creator type="composer">Someone</creator><creator type="lyricist">Else</creator></identification><part-list><score-part id="P1"><part-name>RH</part-name></score-part><score-part id="P2"><part-name>LH</part-name></score-part><score-part id="P3"><part-name>Voice</part-name></score-part></part-list><measure number="1">${p("P1", "A", 4)}${p("P2", "D", 3)}${p("P3", "C", 4)}</measure></score-timewise>`;
  const { doc } = fromMusicXml(xml, { id: "t" });
  assert.equal(doc.title, "Two hands"); assert.equal(doc.composer, "Someone");
  assert.deepEqual(doc.measures[0].key, { fifths: 2 }); assert.deepEqual(doc.measures[0].time, { beats: 2, unit: 4 }); assert.deepEqual(doc.measures[0].clefs, { 0: "treble", 1: "bass" });
  assert.equal(pitches(doc, 0, 0), "A4"); assert.equal(pitches(doc, 0, 0, 1), "D3");
  validate(doc);
});

test("import: a two-staff part among others is the one taken; voices are ranked per staff; a note on the other staff crosses", () => {
  const m = `<note><pitch><step>C</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <backup><duration>16</duration></backup>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><voice>3</voice><type>half</type><staff>1</staff></note>
    <note><rest/><duration>8</duration><voice>3</voice><type>half</type><staff>1</staff></note>
    <backup><duration>16</duration></backup>
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>5</voice><type>half</type><staff>2</staff></note>
    <note><pitch><step>G</step><octave>3</octave></pitch><duration>8</duration><voice>5</voice><type>half</type><staff>1</staff></note>`;
  const xml = `<score-partwise version="4.0"><part-list><score-part id="V"><part-name>Flute</part-name></score-part><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="V"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${note("A", 5, 16, "whole")}</measure></part>${score([m]).replace(/^[\s\S]*?<part id="P1">/, '<part id="P1">').replace(/<\/part>[\s\S]*$/, "</part>")}</score-partwise>`;
  const { doc } = fromMusicXml(xml, { id: "v" });
  assert.equal(kinds(doc, 0, 0, 0), "n1"); assert.equal(kinds(doc, 0, 0, 1), "n2 r2", "voice 3 of the file is the upper staff's second voice");
  assert.equal(kinds(doc, 0, 1, 0), "n2 n2"); assert.equal(doc.measures[0].staves[1].voices[0][1].cross, -1, "the G3 is drawn on the upper staff");
  validate(doc);
});

test("import: tuplets without <tuplet> marks group by run; a whole run that is not whole is cut; 9:8 sixteenths refuse with the bar", () => {
  const tm = "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>";
  const trip = (s) => `<note><pitch><step>${s}</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type>${tm}<staff>1</staff></note>`;
  const xml = score([{ body: `<attributes><divisions>6</divisions></attributes>${trip("C")}${trip("D")}${trip("E")}${trip("F")}${trip("G")}${trip("A")}<note><pitch><step>B</step><octave>4</octave></pitch><duration>12</duration><voice>1</voice><type>half</type><staff>1</staff></note>` }]);
  const { doc } = fromMusicXml(xml, { id: "tup" });
  assert.equal(kinds(doc, 0), "n8t n8t n8t n8t n8t n8t n2");
  const ids = doc.measures[0].staves[0].voices[0].slice(0, 6).map((e) => e.dur.tuplet.id);
  assert.equal(new Set(ids).size, 2, "two groups of three"); assert.equal(ids[0], ids[2]); assert.notEqual(ids[2], ids[3]);
  validate(doc);
  const nine = `<note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>16th</type><time-modification><actual-notes>9</actual-notes><normal-notes>8</normal-notes></time-modification><staff>1</staff></note>`;
  assert.throws(() => fromMusicXml(score([`<attributes><divisions>36</divisions></attributes>${nine.repeat(9)}${rest(72, "half")}`]), { id: "x" }), (e) => e instanceof ImportError && /bar 1: a 9:8 tuplet of 16ths does not fit/.test(e.message));
});

test("import: overlapping notes in one voice refuse with the bar; an unreadable file refuses; a score with no parts refuses", () => {
  const xml = score([note("C", 4, 8, "half") + "<backup><duration>4</duration></backup>" + note("D", 4, 8, "half")]);
  assert.throws(() => fromMusicXml(xml, { id: "o" }), (e) => e instanceof ImportError && /bar 1: notes overlap in voice 1 of staff 1/.test(e.message));
  assert.throws(() => fromMusicXml("<score-partwise><part-list/>", { id: "b" }), /not readable XML/);
  assert.throws(() => fromMusicXml("<html><body/></html>", { id: "b" }), /not a MusicXML score/);
});

test("import: directions — dynamics fold, words trim, a wedge pairs by number, a stray wedge warns, a grace note rides the next note, tempo from <sound>, offsets and off-grid ticks snap", () => {
  const dir = (inner, more = "") => `<direction placement="below"><direction-type>${inner}</direction-type>${more}<staff>1</staff></direction>`;
  const xml = score([
    `${dir("<dynamics><fff/></dynamics>")}${dir("<words>  dolce   assai </words>")}${dir('<wedge type="crescendo" number="2"/>')}${note("C", 4, 4, "quarter")}<note><grace/><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice><type>16th</type><staff>1</staff></note>${dir("<dynamics><sfz/></dynamics>", "<offset>1</offset>")}${note("D", 4, 4, "quarter")}${dir('<wedge type="stop" number="2"/>')}${dir('<wedge type="diminuendo"/>')}${note("E", 4, 8, "half")}<sound tempo="88"/>`,
    `${dir("<dynamics><niente/></dynamics>")}${note("F", 4, 16, "whole")}`,
  ]);
  const { doc, warnings } = fromMusicXml(xml, { id: "d" });
  const x = doc.measures[0].expressions.map((e) => `${e.kind}:${e.value ?? e.dir}@${e.at}${e.end ? `→${e.end.bar}:${e.end.at}` : ""}`);
  assert.deepEqual(x, ["dyn:fff@0", "hairpin:cresc@0→0:13440", "text:dolce assai@0", "dyn:sfz@10080"], "fff and sfz are their own dynamics since v98; the sfz a division past beat 2 lands on the & of 2; the wedge ends where its stop is written");
  assert.equal(doc.measures[1].expressions, undefined, "niente is not a dynamic Compose holds");
  assert.equal(doc.tempo, 88);
  assert.deepEqual(warnings.sort(), ["a hairpin without an end was dropped"]);
  assert.deepEqual(doc.measures[0].staves[0].voices[0][1].graces, [{ base: 16, pitches: [{ step: "D", alter: 0, octave: 4 }] }], "the grace note rides the D that follows it (v97)");
  validate(doc);
});

test("import: accidentals — a cautionary the key implies is kept as shown; with <supports accidental> a missing one the engraver would draw is hidden; without that support nothing is hidden", () => {
  const acc = (step, alter, more) => `<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type>${more}<staff>1</staff></note>`;
  const body = acc("F", 1, "") + acc("F", 1, "<accidental>sharp</accidental>") + acc("G", 0, "<accidental>natural</accidental>") + acc("F", 0, "");
  const supported = fromMusicXml(score([body], { head: '<identification><encoding><supports element="accidental" type="yes"/></encoding></identification>' }), { id: "a" }).doc;
  const v = supported.measures[0].staves[0].voices[0];
  assert.equal(v[0].pitches[0].acc, "hide", "the first F# is drawn without its sharp because the file omits it");
  assert.equal(v[1].pitches[0].acc, undefined, "the bar remembers the sharp — nothing to force");
  assert.equal(v[2].pitches[0].acc, "show", "a natural on G in C major is a cautionary");
  assert.equal(v[3].pitches[0].acc, "hide", "the F natural after an F# would get a natural; the file has none");
  const plain = fromMusicXml(score([body]), { id: "b" }).doc.measures[0].staves[0].voices[0];
  assert.equal(plain[0].pitches[0].acc, undefined); assert.equal(plain[3].pitches[0].acc, undefined); assert.equal(plain[2].pitches[0].acc, "show");
});

test("import: a note without a type is split into tied plain values; a rest without a type into plain rests; a whole-measure rest is the metre's rest; 128th notes refuse", () => {
  const xml = score([`<note><pitch><step>C</step><octave>4</octave></pitch><duration>10</duration><voice>1</voice><staff>1</staff></note><note><rest/><duration>6</duration><voice>1</voice><staff>1</staff></note>`, `<note><rest measure="yes"/><duration>16</duration><voice>1</voice><staff>1</staff></note>`]);
  const { doc } = fromMusicXml(xml, { id: "n" });
  assert.equal(kinds(doc, 0), "n2 n8 r8 r4"); // ten sixteenths = half + eighth, tied; the six left = eighth + quarter as the metre's rests
  assert.equal(doc.measures[0].staves[0].voices[0][0].pitches[0].tie, "start"); assert.equal(doc.measures[0].staves[0].voices[0][1].pitches[0].tie, "stop");
  assert.equal(kinds(doc, 1), "r1");
  assert.throws(() => fromMusicXml(score([`<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>128th</type><staff>1</staff></note>` + rest(15, "")]), { id: "z" }), /128th notes are shorter/);
});

test("import: a bar holding more than its time signature refuses; five voices on a staff refuse", () => {
  assert.throws(() => fromMusicXml(score([note("C", 4, 20, "whole")]), { id: "x" }), /bar 1 holds more than its 4\/4/);
  const five = [1, 2, 3, 4, 6].map((v) => `<note><pitch><step>C</step><octave>${v}</octave></pitch><duration>16</duration><voice>${v}</voice><type>whole</type><staff>1</staff></note><backup><duration>16</duration></backup>`).join("");
  assert.throws(() => fromMusicXml(score([five]), { id: "x" }), /staff 1 has 5 voices/);
});

// --- the containers ----------------------------------------------------------------------------
/** A zip with stored or deflated entries, as any archiver writes it. */
function zip(entries) {
  const enc = new TextEncoder();
  const le16 = (n) => [n & 255, (n >> 8) & 255], le32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const locals = [], central = [];
  let off = 0;
  for (const [name, text, method] of entries) {
    const nm = enc.encode(name), raw = enc.encode(text), data = method === 8 ? deflateRawSync(raw) : raw;
    const head = [...le32(0x04034b50), ...le16(20), ...le16(0), ...le16(method), ...le16(0), ...le16(0), ...le32(0), ...le32(data.length), ...le32(raw.length), ...le16(nm.length), ...le16(0)];
    locals.push(Uint8Array.from([...head, ...nm]), data);
    central.push(Uint8Array.from([...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0), ...le16(method), ...le16(0), ...le16(0), ...le32(0), ...le32(data.length), ...le32(raw.length), ...le16(nm.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(off), ...nm]));
    off += head.length + nm.length + data.length;
  }
  const cd = central.reduce((n, c) => n + c.length, 0);
  const eocd = Uint8Array.from([...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(entries.length), ...le16(entries.length), ...le32(cd), ...le32(off), ...le16(0)]);
  const all = [...locals, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

test("mxl: the container names the root file (deflated); without a container the first .xml entry is taken (stored); text is not a zip", async () => {
  const xml = score([note("E", 4, 16, "whole")]);
  const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';
  const a = zip([["META-INF/container.xml", container, 0], ["other.txt", "not this", 8], ["score.musicxml", xml, 8]]);
  assert.ok(isZip(a)); assert.equal(zipEntries(a).length, 3);
  assert.equal(await readMxl(a), xml);
  const b = zip([["piece.xml", xml, 0]]);
  assert.equal(await readMxl(b), xml);
  assert.ok(!isZip(new TextEncoder().encode(xml)));
  await assert.rejects(readMxl(zip([["readme.txt", "x", 0]])), /no MusicXML inside/);
  assert.throws(() => zipEntries(new Uint8Array(10)), /not a zip/);
});

test("xml: elements, attributes with both quotes, entities and character references, CDATA, comments, a DOCTYPE with an internal subset, a BOM, and malformed input", () => {
  const r = parseXml(`﻿<?xml version="1.0"?><!DOCTYPE a [ <!ENTITY x "y"> ]><!-- hi --><a x='1' y="a &amp; b"><b>&lt;&#65;&#x42;&gt;</b><c><![CDATA[<raw>]]></c><d/> tail </a>`);
  assert.equal(r.name, "a"); assert.deepEqual(r.attrs, { x: "1", y: "a & b" });
  assert.equal(textOf(r, "b"), "<AB>"); assert.equal(textOf(r, "c"), "<raw>"); assert.equal(children(r, "d").length, 1); assert.equal(r.text, "tail");
  assert.equal(child(r, "zz"), null);
  assert.equal(decode("&quot;&apos;&unknown;"), "\"'&unknown;"); assert.equal(esc('<a href="x">&</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  assert.throws(() => parseXml("<a><b></a>"), /closes <b>/);
  assert.throws(() => parseXml("<a>"), /unclosed element/);
  assert.throws(() => parseXml("<a x=1/>"), /not quoted/);
  assert.throws(() => parseXml("<a/><b/>"), /more than one root/);
});
