// Parts (docs/COMPOSE_PARTS_DESIGN.md, WSHED-179): the v4 model (§1), its upgrade, the engine guards and the part
// operations (§1.4). The engraving and MusicXML halves live in compose-parts-layout / compose-parts-musicxml.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition, validate, staffList, nStavesOf, partOfStaff, partStart, pianoPart, SCHEMA, PARTS_MAX, STAVES_MAX, PART_STAVES_MAX, clefAt } from "../js/lib/compose/model.js";
import { INSTRUMENTS, TEMPLATES, templateParts, partsFrom, partFor, instrumentOf } from "../js/lib/compose/instruments.js";
import { place, upgrade, crossStaff, addPedal, addTextLine, addOttava, clipFrom, paste, addPart, removePart, movePart, renamePart, setPartStaves, setPartInstrument, shiftStaffRefs, setClef, addExpression, find, Nudge, partIsEmpty, finger } from "../js/lib/compose/engine.js";
import { CLEFS } from "../js/lib/music.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const Q = { base: 4, dots: 0, rest: false };
const piano = () => newComposition({ id: "p", now: 1 });
const quartet = () => newComposition({ id: "q", now: 1, parts: templateParts("quartet") });
const voicePiano = () => newComposition({ id: "vp", now: 1, parts: templateParts("voice") });
/** The measures with every event id blanked — what "nothing moved" compares. */
const shape = (doc) => JSON.stringify(doc.measures, (k, v) => (k === "id" ? "" : v));
const put = (d, bar, staff, beat, step = 4) => { const r = place(d, { bar, staff, ticks: beat * PPQ, step }, Q); return { d: r.doc, id: r.ev.id }; };

test("the catalogue: every instrument's clefs are real clefs and its staves match them; templates resolve to numbered parts; a name or a sound finds its instrument", () => {
  for (const [k, ins] of Object.entries(INSTRUMENTS)) {
    assert.ok(ins.clefs.length === ins.staves && ins.clefs.every((c) => CLEFS[c]), k);
    assert.ok(["keyboard", "voice", "strings", "woodwind", "brass", "other"].includes(ins.group), k);
    assert.equal(ins.sound, "piano");
  }
  assert.deepEqual(TEMPLATES.map((t) => t.key), ["piano", "voice", "quartet", "satb", "guitar"]);
  const q = templateParts("quartet");
  assert.deepEqual(q.map((p) => [p.id, p.name, p.abbr, p.instrument, p.staves, p.clefs[0]]), [["p1", "Violin I", "Vln. I", "violin", 1, "treble"], ["p2", "Violin II", "Vln. II", "violin", 1, "treble"], ["p3", "Viola", "Vla.", "viola", 1, "alto"], ["p4", "Cello", "Vc.", "cello", 1, "bass"]]);
  assert.deepEqual(partsFrom(["organ"])[0], { id: "p1", name: "Organ", abbr: "Org.", instrument: "organ", staves: 3, clefs: ["treble", "bass", "bass"] });
  assert.equal(partFor("nonsense", 1).instrument, "other");
  assert.equal(partFor("piano", 2, { staves: 1 }).clefs.length, 1, "a piano on one staff keeps one default clef");
  assert.equal(instrumentOf("strings.violin"), "violin"); assert.equal(instrumentOf("keyboard.piano.grand"), "piano");
  assert.equal(instrumentOf("", "Violoncello"), "cello"); assert.equal(instrumentOf("", "Klavier"), "piano"); assert.equal(instrumentOf("", "Bass"), "bass"); assert.equal(instrumentOf("", "Kazoo"), "other");
});

test("staffList / nStavesOf / partOfStaff / partStart: a piano, a quartet, an organ with a voice", () => {
  assert.deepEqual(staffList(piano()), [{ part: 0, index: 0, first: true, last: false }, { part: 0, index: 1, first: false, last: true }]);
  assert.equal(nStavesOf(quartet()), 4); assert.deepEqual(staffList(quartet()).map((s) => s.part), [0, 1, 2, 3]);
  const ov = newComposition({ id: "ov", now: 1, parts: partsFrom(["organ", "voice"]) });
  assert.equal(nStavesOf(ov), 4); assert.deepEqual(staffList(ov).map((s) => [s.part, s.index, s.last]), [[0, 0, false], [0, 1, false], [0, 2, true], [1, 0, true]]);
  assert.equal(partOfStaff(ov, 3), 1); assert.equal(partOfStaff(ov, 4), -1); assert.equal(partStart(ov, 1), 3);
  assert.deepEqual(ov.measures[0].clefs, { 0: "treble", 1: "bass", 2: "bass", 3: "treble" });
  validate(ov); validate(quartet()); validate(voicePiano());
});

test("a new piece is v4 with the piano part filled in; a v3 piece upgrades with its measures byte-identical; the upgrade of a current document is the same object", () => {
  const d = piano();
  assert.equal(d.v, SCHEMA); assert.equal(SCHEMA, 4);
  assert.deepEqual(d.parts, [{ id: "p1", name: "Piano", abbr: "", instrument: "piano", staves: 2, clefs: ["treble", "bass"] }]);
  assert.deepEqual(pianoPart(), d.parts[0]);
  let v3 = put(d, 0, 0, 0).d; v3 = put(v3, 1, 1, 2, 0).d;
  v3 = structuredClone(v3); v3.v = 3; v3.parts = [{ id: "p1", name: "Piano", staves: 2 }];
  validate(v3);
  const u = upgrade(v3);
  assert.equal(u.v, 4); assert.deepEqual(u.parts, d.parts);
  assert.equal(JSON.stringify(u.measures), JSON.stringify(v3.measures), "nothing in the measures moved");
  assert.equal(upgrade(u), u);
  const one = structuredClone(v3); one.parts = [{ id: "p1", name: "Melody", staves: 1 }]; one.measures.forEach((m) => m.staves.pop()); delete one.measures[0].clefs[1];
  assert.deepEqual(upgrade(one).parts[0], { id: "p1", name: "Melody", abbr: "", instrument: "voice", staves: 1, clefs: ["treble"] }, "a one-staff v3 part is a voice, its name kept");
});

test("validate (v4): the part shapes, the maxima, the staff count, clefs on real staves, a cross inside its instrument", () => {
  const bad = (mut, re) => { const d = quartet(); mut(d); assert.throws(() => validate(d), re); };
  bad((d) => { d.parts[1].id = "p1"; }, /own id/);
  bad((d) => { d.parts[0].name = ""; }, /name is 1/);
  bad((d) => { d.parts[0].abbr = "x".repeat(13); }, /abbreviation/);
  bad((d) => { d.parts[0].instrument = "kazoo"; }, /no such instrument/);
  bad((d) => { d.parts[0].staves = 4; }, /staff count|1–3 staves/);
  bad((d) => { d.parts[0].clefs = ["treble", "bass"]; }, /one default clef per staff/);
  bad((d) => { d.parts[0].extra = 1; }, /carries only/);
  bad((d) => { d.parts = []; }, /needs one instrument/);
  bad((d) => { d.measures[0].clefs[7] = "treble"; }, /not there/);
  bad((d) => { delete d.measures[0].clefs[2]; }, /has no clef/);
  bad((d) => { for (let i = 0; i < PARTS_MAX; i++) d.parts.push({ ...d.parts[0], id: `p${10 + i}` }); }, new RegExp(`${PARTS_MAX} instruments`));
  bad((d) => { d.parts[0].staves = 3; d.parts[0].clefs = ["treble", "bass", "bass"]; for (let i = 0; i < 5; i++) d.parts.push({ ...d.parts[0], id: `p${10 + i}` }); }, new RegExp(`${STAVES_MAX} staves`));
  // a cross from Violin II onto the Viola is not a cross
  const d = put(quartet(), 0, 1, 0).d;
  d.measures[0].staves[1].voices[0][0].cross = 1;
  assert.throws(() => validate(d), /crosses out of its instrument/);
  const p = put(piano(), 0, 0, 0).d; p.measures[0].staves[0].voices[0][0].cross = 1; validate(p);
});

test("guards: cross-staff across parts, the pedal and una corda off the piano, a two-staff paste across parts — each refuses with the bar; the voice + piano keeps its pedal and everyone keeps 8va", () => {
  const { d: q, id } = put(quartet(), 1, 1, 0);
  assert.throws(() => crossStaff(q, [id], 1), (e) => e instanceof Nudge && /within an instrument/.test(e.message) && e.bar === 1);
  assert.throws(() => crossStaff(q, [id], -1), /within an instrument/);
  assert.throws(() => addPedal(q, { staff: 3, bar: 1, at: 0, end: { bar: 1, at: PPQ } }), (e) => e instanceof Nudge && /belongs to the piano/.test(e.message) && e.bar === 1);
  assert.throws(() => addTextLine(q, { staff: 0, bar: 1, at: 0, end: { bar: 1, at: PPQ }, text: "una corda", endText: "tre corde" }), /belongs to the piano/);
  addOttava(q, { staff: 0, bar: 1, at: 0, dir: 1, end: { bar: 1, at: PPQ } });
  addTextLine(q, { staff: 0, bar: 1, at: 0, end: { bar: 1, at: PPQ }, text: "cresc." });
  const vp = voicePiano();
  addPedal(vp, { staff: 2, bar: 0, at: 0, end: { bar: 0, at: PPQ } });
  assert.throws(() => addPedal(vp, { staff: 0, bar: 0, at: 0, end: { bar: 0, at: PPQ } }), /belongs to the piano/);
  // a two-staff phrase from the piano lands only on the piano's two staves
  let p = put(piano(), 0, 0, 0).d; p = put(p, 0, 1, 0, 0).d;
  const clip = clipFrom(p, p.measures[0].staves.flatMap((s) => s.voices[0].filter((e) => e.kind === "note").map((e) => ({ ev: e.id }))));
  assert.equal(clip.staves, 2);
  assert.throws(() => paste(vp, clip, { bar: 2, ticks: 0, staff: 0 }), (e) => e instanceof Nudge && /2 staves of one instrument/.test(e.message) && e.bar === 2);
  const ok = paste(vp, clip, { bar: 2, ticks: 0, staff: 1 }).doc;
  validate(ok); assert.equal(ok.measures[2].staves[1].voices[0][0].kind, "note"); assert.equal(ok.measures[2].staves[2].voices[0][0].kind, "note");
  assert.throws(() => paste(q, clip, { bar: 2, ticks: 0, staff: 0 }), /2 staves of one instrument/); // on a quartet staves 0–1 are two parts
});

test("shiftStaffRefs re-indexes clefs, clef changes and expressions at or after the point; addPart in the middle moves everything below it and leaves a crossed piano note crossed", () => {
  let d = voicePiano(); // voice (0), piano (1, 2)
  d = put(d, 0, 1, 0).d; d = put(d, 0, 2, 0, 0).d;
  d.measures[0].staves[1].voices[0][0].cross = 1; // the piano's upper note drawn on the lower staff
  d = setClef(d, 1, 2, "treble", PPQ);
  d = addExpression(d, { kind: "dyn", staff: 2, bar: 0, at: 0, value: "p" }).doc;
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "f" }).doc;
  validate(d);
  const e = addPart(d, "cello", { at: 1 }); // voice, cello, piano
  validate(e);
  assert.deepEqual(e.parts.map((p) => [p.id, p.instrument]), [["p1", "voice"], ["p3", "cello"], ["p2", "piano"]], "ids are never reused — the new part is p3");
  assert.equal(nStavesOf(e), 4);
  assert.deepEqual(e.measures[0].clefs, { 0: "treble", 1: "bass", 2: "treble", 3: "bass" });
  assert.deepEqual(e.measures[1].clefChanges, [{ staff: 3, at: PPQ, clef: "treble" }]);
  assert.deepEqual(e.measures[0].expressions.map((x) => [x.staff, x.value]), [[0, "f"], [3, "p"]]);
  assert.equal(e.measures[0].staves[2].voices[0][0].cross, 1, "the crossed note moved with its staff and still crosses within the piano");
  assert.ok(e.measures[0].staves[1].voices[0].every((ev) => ev.kind === "rest"), "the cello's bars are rests");
  assert.equal(e.measures[0].staves[2].voices[0][0].kind, "note");
  // the bare helper
  const f = structuredClone(d); shiftStaffRefs(f, 1, 5);
  assert.deepEqual(Object.keys(f.measures[0].clefs).map(Number).sort(), [0, 6, 7]); assert.equal(f.measures[1].clefChanges[0].staff, 7); assert.deepEqual(f.measures[0].expressions.map((x) => x.staff), [0, 7]);
  // the maxima
  assert.throws(() => { let g = quartet(); for (let i = 0; i < PARTS_MAX - 4; i++) g = addPart(g, "violin"); addPart(g, "violin"); }, new RegExp(`${PARTS_MAX} instruments`));
  assert.throws(() => { let g = quartet(); for (let i = 0; i < 4; i++) g = addPart(g, "organ"); addPart(g, "violin"); }, new RegExp(`${STAVES_MAX} staves`));
  assert.throws(() => addPart(d, "kazoo"), /no such instrument/);
  assert.equal(addPart(d, "violin", { name: "  Fiddle  ", abbr: "Fdl." }).parts[2].name, "Fiddle");
});

test("removePart drops a middle part with its notes, expressions and clef changes and closes the gap; the last part refuses", () => {
  let d = quartet(); // Vln I, Vln II, Vla, Vc
  d = put(d, 0, 0, 0).d; d = put(d, 0, 1, 0).d; d = put(d, 0, 2, 0, 2).d; d = put(d, 0, 3, 0, 0).d;
  d = setClef(d, 2, 1, "alto", PPQ); d = setClef(d, 2, 3, "tenor", PPQ);
  d = addExpression(d, { kind: "dyn", staff: 1, bar: 0, at: 0, value: "p" }).doc; d = addExpression(d, { kind: "dyn", staff: 3, bar: 0, at: 0, value: "f" }).doc;
  const e = removePart(d, "p2");
  validate(e);
  assert.deepEqual(e.parts.map((p) => p.name), ["Violin I", "Viola", "Cello"]);
  assert.equal(nStavesOf(e), 3); assert.deepEqual(e.measures[0].clefs, { 0: "treble", 1: "alto", 2: "bass" });
  assert.deepEqual(e.measures[2].clefChanges, [{ staff: 2, at: PPQ, clef: "tenor" }]);
  assert.deepEqual(e.measures[0].expressions.map((x) => [x.staff, x.value]), [[2, "f"]]);
  assert.equal(e.measures[0].staves[1].voices[0][0].kind, "note", "the viola's note followed its staff");
  assert.equal(clefAt(e, 5, 1), "alto");
  let one = e; one = removePart(one, "p1"); one = removePart(one, "p3");
  assert.throws(() => removePart(one, "p4"), /needs one instrument/);
  assert.throws(() => removePart(d, "p9"), /no such instrument/);
});

test("movePart swaps neighbours with their staves, clefs, changes and expressions; the ends refuse", () => {
  let d = voicePiano(); // voice (0), piano (1, 2)
  d = put(d, 0, 0, 0).d; d = put(d, 0, 2, 0, 0).d;
  d = setClef(d, 1, 2, "treble", PPQ);
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "f" }).doc; d = addExpression(d, { kind: "dyn", staff: 1, bar: 0, at: 0, value: "p" }).doc;
  const e = movePart(d, "p1", 1); // piano (0, 1), voice (2)
  validate(e);
  assert.deepEqual(e.parts.map((p) => p.instrument), ["piano", "voice"]);
  assert.deepEqual(e.measures[0].clefs, { 0: "treble", 1: "bass", 2: "treble" });
  assert.deepEqual(e.measures[1].clefChanges, [{ staff: 1, at: PPQ, clef: "treble" }]);
  assert.deepEqual(e.measures[0].expressions.map((x) => [x.staff, x.value]), [[0, "p"], [2, "f"]]);
  assert.equal(e.measures[0].staves[2].voices[0][0].kind, "note"); assert.equal(e.measures[0].staves[1].voices[0][0].kind, "note");
  assert.equal(JSON.stringify(movePart(e, "p1", -1).measures), JSON.stringify(d.measures), "moving it back restores the measures exactly");
  assert.throws(() => movePart(e, "p1", 1), /already last/); assert.throws(() => movePart(e, "p2", -1), /already first/);
});

test("renamePart, setPartInstrument and setPartStaves: names bounded, instrument swaps rename a catalogue-named part, a staff is added with the next default clef and removed only when empty", () => {
  let d = quartet();
  d = renamePart(d, "p4", { name: "Violoncello", abbr: "" });
  assert.deepEqual([d.parts[3].name, d.parts[3].abbr], ["Violoncello", ""]);
  assert.equal(renamePart(d, "p4", { name: "   " }).parts[3].name, "Violoncello", "an empty name keeps the old one");
  assert.equal(renamePart(d, "p1", { name: "x".repeat(60) }).parts[0].name.length, 40);
  const e = setPartInstrument(d, "p3", "cello");
  assert.deepEqual([e.parts[2].name, e.parts[2].abbr, e.parts[2].instrument, e.parts[2].clefs], ["Cello", "Vc.", "cello", ["alto"]], "the catalogue name follows, the clef in force does not");
  const f = setPartInstrument(d, "p3", "cello", { resetClefs: true });
  assert.deepEqual(f.parts[2].clefs, ["bass"]); assert.equal(f.measures[0].clefs[2], "bass");
  assert.throws(() => setPartInstrument(put(d, 0, 2, 0).d, "p3", "cello", { resetClefs: true }), /empty the instrument/);
  // staves
  let g = setPartStaves(voicePiano(), "p1", 2); // the voice gets a second staff
  validate(g);
  assert.equal(nStavesOf(g), 4); assert.deepEqual(g.parts[0].clefs, ["treble", "bass"]); assert.deepEqual(g.measures[0].clefs, { 0: "treble", 1: "bass", 2: "treble", 3: "bass" });
  assert.ok(partIsEmpty(g, 0));
  g = put(g, 0, 1, 0, 0).d;
  assert.throws(() => setPartStaves(g, "p1", 1), /empty the staff first/);
  g = put(g, 0, 0, 0).d;
  const h = setPartStaves(setPartStaves(voicePiano(), "p1", 2), "p1", 1);
  assert.equal(shape(h), shape(voicePiano())); assert.deepEqual(h.parts, voicePiano().parts);
  assert.equal(setPartStaves(g, "p1", 2), g, "the same count is the same document");
  assert.throws(() => setPartStaves(g, "p1", 4), new RegExp(`1–${PART_STAVES_MAX}`));
  const o = setPartStaves(newComposition({ id: "o", now: 1, parts: partsFrom(["organ"]) }), "p1", 2);
  validate(o); assert.deepEqual(o.parts[0].clefs, ["treble", "bass"]); assert.equal(nStavesOf(o), 2);
  // a finger goes on any instrument
  const { d: q, id } = put(quartet(), 0, 2, 0);
  assert.equal(find(finger(q, [{ ev: id, pi: 0 }], 2), id).ev.pitches[0].finger, 2);
});

test("playback (WSHED-184): a quartet's timeline carries every part's notes with their staff; every part sounds on the piano", async () => {
  const { timeline } = await import("../js/lib/compose/play.js");
  let d = quartet();
  for (let st = 0; st < 4; st++) for (let q = 0; q < 4; q++) d = put(d, 0, st, q, 4 + st).d;
  const { notes } = timeline(d);
  assert.equal(notes.length, 16, "sixteen notes across four staves");
  assert.deepEqual([...new Set(notes.map((n) => n.staff))].sort(), [0, 1, 2, 3]);
  assert.ok(Object.values(INSTRUMENTS).every((i) => i.sound === "piano"));
});
