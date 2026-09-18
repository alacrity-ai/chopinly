// Pickup bars (docs/COMPOSE_DESIGN.md §8.5p, WSHED-151, v113): a bar may be shorter than its time signature —
// the anacrusis that opens a piece or a section (its beats counted from the barline that follows) and the bar
// that completes it. The metre, the cut and its undoing, the rests, the beat groups, insert / delete, the
// time change, playback and the MusicXML round trip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition, validate, timeAt, sigAt, shortMetre, isEmptyBar } from "../js/lib/compose/model.js";
import { place, setShort, insertBar, deleteBar, setTime, setBarline, snap, barStarts, Nudge } from "../js/lib/compose/engine.js";
import { PPQ, WHOLE, capacity, splitRest, groupOf, beatGroups, inMetre } from "../js/lib/compose/ticks.js";
import { layoutComposition } from "../js/lib/compose/layout.js";
import { timeline } from "../js/lib/compose/play.js";
import { toMusicXml, fromMusicXml } from "../js/lib/compose/musicxml.js";

const E = PPQ / 2; // an eighth
const N = (base, dots = 0) => ({ base, dots, rest: false, tuplet: null, alter: null });
const kinds = (doc, b, staff = 0, voice = 0) => doc.measures[b].staves[staff].voices[voice].map((e) => `${e.kind === "rest" ? "r" : "n"}${e.dur.base}${e.dur.dots ? "." : ""}`).join(" ");
const strip = (doc) => JSON.parse(JSON.stringify(doc.measures, (k, v) => (k === "id" ? undefined : v)));

/** A 12/8 piece of six bars (eight of 4/4 re-cut): three eighths on beats 10–12 of bar 1 (the pickup to come), a note on beat 1 of bar 2, an eighth opening the last bar. */
let LAST = 0; // the last bar's index (the re-cut decides the count)
function twelveEight() {
  let d = setTime(newComposition({ id: "p", title: "Pickup", now: 1 }), 0, { beats: 12, unit: 8 }).doc;
  LAST = d.measures.length - 1;
  for (let k = 9; k < 12; k++) d = place(d, { bar: 0, staff: 0, ticks: k * E, step: 4 + k }, N(8)).doc;
  d = place(d, { bar: 1, staff: 0, ticks: 0, step: 6 }, N(4, 1)).doc;
  d = place(d, { bar: LAST, staff: 0, ticks: 0, step: 6 }, N(8)).doc;
  return d;
}

test("ticks: a short bar's capacity is its own length; its ticks sit in the metre by the offset; beat groups and the rest split follow the metre, not the bar's start", () => {
  const sig = { beats: 12, unit: 8 }, m = shortMetre(sig, { len: 3 * E, from: "end" });
  assert.equal(capacity(sig), 12 * E); assert.equal(capacity(m), 3 * E); assert.equal(m.offset, 9 * E);
  assert.equal(inMetre(0, m), 9 * E); assert.equal(groupOf(0, m), 3); assert.equal(groupOf(2 * E, m), 3, "the whole pickup is beat 4");
  assert.deepEqual(beatGroups(m), [0, 3 * E]);
  assert.deepEqual(splitRest(3 * E, 0, m), [{ base: 4, dots: 1 }], "a one-beat pickup's silence is one dotted-quarter rest");
  const five = shortMetre({ beats: 4, unit: 4 }, { len: 5 * E, from: "end" }); // five eighths of 4/4: the & of 2, then beats 3–4
  assert.deepEqual(beatGroups(five), [0, E, 3 * E, 5 * E]);
  assert.deepEqual(splitRest(5 * E, 0, five), [{ base: 8, dots: 0 }, { base: 2, dots: 0 }], "an eighth rest on the & of 2, then a half rest on beat 3");
  const close = shortMetre({ beats: 4, unit: 4 }, { len: 3 * E, from: "start" });
  assert.equal(close.offset, 0); assert.deepEqual(beatGroups(close), [0, 2 * E, 3 * E]);
});

test("model: timeAt is the bar's real metre and sigAt the signature; validate wants a short bar on the grid, shorter than the signature, from the end or the start, never a bar repeat", () => {
  const d = twelveEight();
  d.measures[0].short = { len: 3 * E, from: "end" };
  assert.deepEqual(timeAt(d, 0), { beats: 12, unit: 8, cap: 3 * E, offset: 9 * E }); assert.deepEqual(sigAt(d, 0), { beats: 12, unit: 8 });
  assert.equal(timeAt(d, 1), sigAt(d, 1), "a full bar's metre is the stored signature itself");
  for (const bad of [{ len: 3 * E }, { len: 3 * E, from: "middle" }, { len: 12 * E, from: "end" }, { len: 0, from: "end" }, { len: 3 * E + 1, from: "end" }, "short", { len: E / 4, from: "start" }]) { d.measures[0].short = bad; assert.throws(() => validate(d), /short bar/, JSON.stringify(bad)); }
  d.measures[0].short = { len: 3 * E, from: "end" };
  assert.throws(() => validate(d), /ticks, bar holds/, "the voices must add up to the short length");
});

test("setShort: bar 1 loses the three beats of silence before its eighths and counts from the barline (the lower staff's rest is a dotted quarter); the tap again fills it; the last bar of the music loses its trailing rests; undoing either is exact", () => {
  const d0 = twelveEight();
  assert.equal(kinds(d0, 0), "r4. r4. r4. n8 n8 n8");
  const d1 = setShort(d0, 0);
  assert.deepEqual(d1.measures[0].short, { len: 3 * E, from: "end" });
  assert.equal(kinds(d1, 0), "n8 n8 n8"); assert.equal(kinds(d1, 0, 1), "r4.");
  validate(d1);
  assert.deepEqual(strip(d0), strip(twelveEight()), "the old document is untouched");
  const back = setShort(d1, 0);
  assert.equal(back.measures[0].short, undefined); assert.equal(kinds(back, 0), "r4. r4. r4. n8 n8 n8"); assert.equal(kinds(back, 0, 1), "r1."); validate(back);
  // the closing bar: the last bar holds an eighth; with an empty bar appended after it (as the editor keeps one) it is still the last bar of the music
  const d2 = setShort(d1, LAST);
  assert.deepEqual(d2.measures[LAST].short, { len: E, from: "start" });
  assert.equal(kinds(d2, LAST), "n8"); assert.equal(kinds(d2, LAST, 1), "r8"); validate(d2);
  assert.equal(kinds(setShort(d2, LAST), LAST), "n8 r4 r4. r4. r4.", "filled again from the back"); // a quarter rest completes beat 1 (the compound rule: the largest rest inside the group), then three dotted-quarter rests
  const padded = insertBar(d1, LAST + 1); assert.ok(isEmptyBar(padded.measures[LAST + 1]));
  assert.deepEqual(setShort(padded, LAST).measures[LAST].short, { len: E, from: "start" }, "an empty bar after the music does not make the music's last bar a middle one");
  const { starts, total } = barStarts(d2);
  assert.equal(starts[1], 3 * E); assert.equal(total, 3 * E + (d2.measures.length - 2) * 12 * E + E);
});

test("setShort refuses: an empty bar, a bar in the middle of the music, a bar whose front (back) is a note; a section boundary makes a middle bar an opening or closing one", () => {
  const d = twelveEight();
  assert.throws(() => setShort(d, 3), (e) => e instanceof Nudge && /write the pickup first/.test(e.message));
  const mid = place(d, { bar: 3, staff: 0, ticks: 3 * E, step: 4 }, N(8)).doc;
  assert.throws(() => setShort(mid, 3), /opens or closes a section/);
  assert.throws(() => setShort(d, 1), /opens or closes a section/, "bar 2 follows a plain barline and is not the last bar of the music");
  const closing = setBarline(mid, 3, { end: "double" }); // a double bar closes bar 4: the tap cuts its back (the note sits on beat 2, the rest of the bar is silence)
  assert.deepEqual(setShort(closing, 3).measures[3].short, { len: 4 * E, from: "start" });
  const opening = setBarline(mid, 2, { end: "double" }); // a double bar before bar 4: the tap cuts its front
  assert.deepEqual(setShort(opening, 3).measures[3].short, { len: 9 * E, from: "end" });
  const noteFirst = place(d, { bar: 0, staff: 1, ticks: 0, step: 2 }, N(8)).doc; // the lower staff sounds at the start: nothing shared to cut
  assert.throws(() => setShort(noteFirst, 0), /starts with a note/);
});

test("a sixteenth pickup in 4/4 leaves an eighth bar with a sixteenth rest in front (the cut rounds down to the expression grid)", () => {
  let d = newComposition({ id: "s", title: "S", now: 1 });
  d = place(d, { bar: 0, staff: 0, ticks: 15 * (PPQ / 4), step: 4 }, N(16)).doc;
  d = place(d, { bar: 1, staff: 0, ticks: 0, step: 4 }, N(4)).doc;
  const s = setShort(d, 0);
  assert.deepEqual(s.measures[0].short, { len: E, from: "end" });
  assert.equal(kinds(s, 0), "r16 n16"); assert.equal(kinds(s, 0, 1), "r8"); validate(s);
});

test("snap in a pickup bar counts the grid from the barline that follows; a tap places there and the layout beams the pickup's eighths as one beat and writes the lower staff's silence as a real rest, not a whole-bar one", () => {
  const d = setShort(twelveEight(), 0);
  const s = snap(d, { bar: 0, staff: 1, ticks: E + 10 }, N(8)); // the & of the pickup's beat, in voice 1 of the lower staff (all rest)
  assert.equal(s.onset, E);
  const placed = place(d, { bar: 0, staff: 1, ticks: E + 10, step: 2 }, N(8)).doc;
  assert.equal(kinds(placed, 0, 1), "r8 n8 r8"); validate(placed);
  const L = layoutComposition(d, { width: 1000, unit: 8 });
  const heads = L.drawn.filter((x) => x.bar === 0 && !x.rest);
  assert.equal(heads.length, 3); assert.ok(heads.every((h) => h.group === 3), "all three in beat 4: " + heads.map((h) => h.group));
  const rests = L.drawn.filter((x) => x.bar === 0 && x.rest);
  assert.equal(rests.length, 1); assert.ok(!rests[0].whole && rests[0].base === 4 && rests[0].dots === 1, "a dotted-quarter rest, drawn at its column");
  const fullBar = L.systems[0].bars.find((b) => b.index === 1), pickup = L.systems[0].bars.find((b) => b.index === 0);
  assert.ok(pickup && fullBar);
});

test("insertBar and deleteBar: a new bar is never short and the pickup keeps its shortness; deleting the bar after the pickup leaves it short; a time change re-flows the stretch full", () => {
  const d = setShort(twelveEight(), 0);
  const ins = insertBar(d, 0);
  assert.equal(ins.measures[0].short, undefined); assert.deepEqual(ins.measures[1].short, { len: 3 * E, from: "end" }); assert.equal(kinds(ins, 0), "r1."); validate(ins);
  const ins2 = insertBar(d, 1);
  assert.equal(kinds(ins2, 1), "r1.", "the bar after a pickup is a full bar of the signature"); validate(ins2);
  const del = deleteBar(d, 1);
  assert.deepEqual(del.measures[0].short, { len: 3 * E, from: "end" }); validate(del);
  const t = setTime(d, 0, { beats: 6, unit: 8 }).doc;
  assert.equal(t.measures[0].short, undefined); validate(t);
  assert.equal(kinds(t, 0), "n8 n8 n8 n4.", "the pickup's three eighths open the first 6/8 bar and bar 2's dotted quarter completes it; the shortness is gone with the re-cut");
});

test("playback: the timeline plays the pickup for its own length and the first full bar starts after it", () => {
  const d = setShort(twelveEight(), 0);
  const tl = timeline(d, { tempo: 120 });
  assert.equal(tl.passes[0].len, 3 * E); assert.equal(tl.passes[1].docStart, 3 * E); assert.equal(tl.passes[1].perfStart, 3 * E);
});

test("MusicXML: a pickup exports as measure 0, implicit, and the bars after it count from 1; export → import gives the same short bars at both ends", () => {
  const d = setShort(setShort(twelveEight(), 0), LAST);
  const xml = toMusicXml(d);
  assert.match(xml, /<measure number="0" implicit="yes">/);
  assert.match(xml, /<measure number="1">/); assert.doesNotMatch(xml, new RegExp(`<measure number="${LAST + 1}">`));
  assert.match(xml, new RegExp(`<measure number="${LAST}">`));
  const { doc: back, warnings } = fromMusicXml(xml, { id: "back" });
  assert.deepEqual(warnings, []);
  assert.deepEqual(back.measures[0].short, { len: 3 * E, from: "end" }); assert.equal(kinds(back, 0), "n8 n8 n8"); assert.equal(kinds(back, 0, 1), "r4.");
  assert.deepEqual(back.measures[LAST].short, { len: E, from: "start" }); assert.equal(kinds(back, LAST), "n8"); assert.equal(kinds(back, LAST, 1), "r8");
  validate(back);
  const plain = toMusicXml(twelveEight());
  assert.match(plain, /<measure number="1">/); assert.doesNotMatch(plain, /implicit/);
});
