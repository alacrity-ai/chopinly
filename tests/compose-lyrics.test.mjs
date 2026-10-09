// Lyrics (docs/COMPOSE_LYRICS_DESIGN.md, WSHED-173): the model and engine (§1), the vertical metrics (§2), the
// engraving (§3) and the MusicXML round trip (§1.4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { newComposition, validate, LYRIC_MAX, LYRIC_VERSES_MAX, lyricVersesOf } from "../js/lib/compose/model.js";
import { place, setLyric, removeLyrics, sylFor, nextLyricNote, lyricRuns, tie, toRests, clipFrom, paste, addExpression, addHairpin, addPedal, find, Nudge, retype } from "../js/lib/compose/engine.js";
import { layoutComposition, metricsOf, lyricBand, LYRIC_Y, LYRIC_STEP, STAFF_GAP, SYS_GAP } from "../js/lib/compose/layout.js";
import { thingAt, things } from "../js/lib/compose/hit.js";
import { toMusicXml, fromMusicXml } from "../js/lib/compose/musicxml.js";
import { planPages, inkExtents } from "../js/lib/compose/export/pdf.js";
import { paintScore } from "../js/lib/compose/paint.js";
import { PPQ } from "../js/lib/compose/ticks.js";

const Q = { base: 4, dots: 0, rest: false }, H = { base: 2, dots: 0, rest: false };
const fresh = () => newComposition({ id: "ly", now: 1 });
/** A melody of quarters on the upper staff: `steps` per beat from bar 0, returning the doc and the note ids in order. */
function melody(steps, { staff = 0, bar = 0 } = {}) {
  let d = fresh();
  const ids = [];
  steps.forEach((st, i) => { const r = place(d, { bar: bar + Math.floor(i / 4), staff, ticks: (i % 4) * PPQ, step: st }, Q); d = r.doc; ids.push(r.keys ? r.keys[0].split(":")[0] : d.measures[bar + Math.floor(i / 4)].staves[staff].voices[0].find((e) => e.kind === "note" && !ids.includes(e.id)).id); });
  return { d, ids };
}
const idsOf = (d, bar, staff = 0) => d.measures[bar].staves[staff].voices[0].filter((e) => e.kind === "note").map((e) => e.id);
const lyricsOf = (d, id) => find(d, id).ev.lyrics ?? null;

// --- model (§1.1–1.2) ---
test("validate: lyrics are an array of verses on a note — in order, each once, 1–4, text 1–40 letters, syllabic from the four, ext true or absent", () => {
  let { d, ids } = melody([6, 7, 8, 9]);
  d = setLyric(d, ids[0], 1, { text: "glo", syl: "begin" });
  d = setLyric(d, ids[0], 2, { text: "la", syl: "single" });
  assert.ok(validate(d));
  assert.deepEqual(lyricsOf(d, ids[0]), [{ n: 1, text: "glo", syl: "begin" }, { n: 2, text: "la" }]);
  const bad = (mut, re) => { const x = structuredClone(d); mut(find(x, ids[0]).ev); assert.throws(() => validate(x), re); };
  bad((ev) => { ev.lyrics = []; }, /at least one/);
  bad((ev) => { ev.lyrics = [{ n: 2, text: "a" }, { n: 1, text: "b" }]; }, /in order/);
  bad((ev) => { ev.lyrics = [{ n: 1, text: "a" }, { n: 1, text: "b" }]; }, /each once/);
  bad((ev) => { ev.lyrics = [{ n: 5, text: "a" }]; }, /1–4/);
  bad((ev) => { ev.lyrics = [{ n: 1, text: "" }]; }, /1–40 letters/);
  bad((ev) => { ev.lyrics = [{ n: 1, text: "x".repeat(LYRIC_MAX + 1) }]; }, /1–40 letters/);
  bad((ev) => { ev.lyrics = [{ n: 1, text: "a\nb" }]; }, /line break/);
  bad((ev) => { ev.lyrics = [{ n: 1, text: "a", syl: "start" }]; }, /single, begin, middle or end/);
  bad((ev) => { ev.lyrics = [{ n: 1, text: "a", ext: false }]; }, /melisma is true or absent/);
  bad((ev) => { ev.lyrics = [{ n: 1, text: "a", colour: "red" }]; }, /only n, text, syl and ext/);
  const rest = structuredClone(d); rest.measures[1].staves[0].voices[0][0].lyrics = [{ n: 1, text: "no" }];
  assert.throws(() => validate(rest), /lyrics go on a note/);
  assert.equal(LYRIC_VERSES_MAX, 4);
  assert.deepEqual(lyricVersesOf(d), [2, 0]);
});

// --- engine (§1.3) ---
test("setLyric sets a verse, retypes it, removes it with an empty text (the key goes with the last verse); rests refuse; verses are clamped", () => {
  let { d, ids } = melody([6, 7]);
  d = setLyric(d, ids[0], 1, { text: "  Glo  ", syl: "begin" });
  assert.deepEqual(lyricsOf(d, ids[0]), [{ n: 1, text: "Glo", syl: "begin" }]);
  d = setLyric(d, ids[0], 1, { text: "Hal", syl: "begin", ext: true });
  assert.deepEqual(lyricsOf(d, ids[0]), [{ n: 1, text: "Hal", syl: "begin", ext: true }]);
  d = setLyric(d, ids[0], 3, { text: "three" });
  assert.deepEqual(lyricsOf(d, ids[0]).map((l) => l.n), [1, 3]);
  d = setLyric(d, ids[0], 1, { text: "" });
  assert.deepEqual(lyricsOf(d, ids[0]), [{ n: 3, text: "three" }]);
  d = setLyric(d, ids[0], 3, { text: null });
  assert.equal(lyricsOf(d, ids[0]), null);
  assert.equal("lyrics" in find(d, ids[0]).ev, false);
  const restId = d.measures[0].staves[0].voices[0].find((e) => e.kind === "rest").id;
  assert.throws(() => setLyric(d, restId, 1, { text: "no" }), (e) => e instanceof Nudge && /lyrics go on notes/.test(e.message));
  assert.throws(() => setLyric(d, ids[0], 5, { text: "no" }), /verses go 1–4/);
  assert.throws(() => setLyric(d, ids[0], 1, { text: "x".repeat(41) }), /at most 40/);
  assert.ok(validate(d));
});

test("removeLyrics drops one verse or all; an unmatched call returns the same document", () => {
  let { d, ids } = melody([6, 7]);
  d = setLyric(d, ids[0], 1, { text: "a" }); d = setLyric(d, ids[0], 2, { text: "b" }); d = setLyric(d, ids[1], 1, { text: "c" });
  const one = removeLyrics(d, [ids[0], ids[1]], 2);
  assert.deepEqual(lyricsOf(one, ids[0]), [{ n: 1, text: "a" }]); assert.deepEqual(lyricsOf(one, ids[1]), [{ n: 1, text: "c" }]);
  const all = removeLyrics(d, ids);
  assert.equal(lyricsOf(all, ids[0]), null); assert.equal(lyricsOf(all, ids[1]), null);
  assert.equal(removeLyrics(all, ids), all, "nothing matched: the same document");
});

test("sylFor: a hyphen after a word's start continues it (middle), else begins one; a space ends a started word, else the syllable is a whole word", () => {
  assert.equal(sylFor(null, "hyphen"), "begin"); assert.equal(sylFor("single", "hyphen"), "begin"); assert.equal(sylFor("end", "hyphen"), "begin");
  assert.equal(sylFor("begin", "hyphen"), "middle"); assert.equal(sylFor("middle", "hyphen"), "middle");
  assert.equal(sylFor("begin", "space"), "end"); assert.equal(sylFor("middle", "space"), "end");
  assert.equal(sylFor(null, "space"), "single"); assert.equal(sylFor("end", "space"), "single");
});

test("nextLyricNote walks the voice across bars, skipping rests and tied-in notes, both ways; null at the ends", () => {
  let d = fresh();
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 6 }, Q).doc;            // bar 1: n r r r
  d = place(d, { bar: 0, staff: 0, ticks: 3 * PPQ, step: 6 }, Q).doc;      // bar 1: n r r n  (same pitch → tie into bar 2)
  d = place(d, { bar: 1, staff: 0, ticks: 0, step: 6 }, H).doc;            // bar 2: n(h) r r
  d = place(d, { bar: 1, staff: 0, ticks: 2 * PPQ, step: 8 }, Q).doc;      // bar 2: n(h) n r
  const [a, b] = idsOf(d, 0), [c, e] = idsOf(d, 1);
  d = tie(d, [{ ev: b }]);
  assert.equal(find(d, c).ev.pitches[0].tie, "stop");
  const at = (id) => find(d, id);
  assert.equal(nextLyricNote(d, at(a)).ev.id, b, "over the rests");
  assert.equal(nextLyricNote(d, at(b)).ev.id, e, "over the tied-in half into the next bar");
  assert.equal(nextLyricNote(d, at(e)), null, "the end of the voice");
  assert.equal(nextLyricNote(d, at(e), -1).ev.id, b, "back over the tied-in note");
  assert.equal(nextLyricNote(d, at(a), -1), null);
});

test("lyricRuns: per staff and verse in time order; lyrics ride a note through retype, tie, clip and paste; a note turned rest loses them", () => {
  let { d, ids } = melody([6, 7, 8, 9]);
  d = setLyric(d, ids[0], 1, { text: "one", syl: "begin" }); d = setLyric(d, ids[2], 1, { text: "two" }); d = setLyric(d, ids[1], 2, { text: "v2" });
  const runs = lyricRuns(d);
  assert.deepEqual(runs.map((r) => [r.staff, r.n, r.items.map((i) => i.lyric.text)]), [[0, 1, ["one", "two"]], [0, 2, ["v2"]]]);
  assert.deepEqual(runs[0].items.map((i) => i.abs), [0, 2 * PPQ]);
  const dotted = retype(d, [ids[0]], { base: 8, dots: 1 });
  assert.deepEqual(lyricsOf(dotted, ids[0]), [{ n: 1, text: "one", syl: "begin" }], "retype keeps the words");
  const clip = clipFrom(d, [{ ev: ids[0] }, { ev: ids[2] }]);
  assert.deepEqual(clip.events.map((e) => e.lyrics ?? null), [[{ n: 1, text: "one", syl: "begin" }], [{ n: 1, text: "two" }]]);
  const pasted = paste(d, clip, { bar: 2, ticks: 0, staff: 0 }).doc;
  const got = idsOf(pasted, 2).map((id) => lyricsOf(pasted, id));
  assert.deepEqual(got, [[{ n: 1, text: "one", syl: "begin" }], [{ n: 1, text: "two" }]]);
  const rests = toRests(d, [ids[0]]);
  assert.equal(lyricsOf(rests, ids[0]) ?? null, null);
  assert.ok(validate(rests));
});

// --- vertical metrics (§2, WSHED-175) ---
test("metricsOf: a piece without lyrics has the historic constants (blockH 16, sysH 26); a verse on the upper staff widens the gap by its band; verses on the lower staff grow the system gap only past two", () => {
  const plain = metricsOf(fresh());
  assert.deepEqual([plain.blockH, plain.sysH, plain.sysGap, plain.topPad, plain.bottomPad], [16, 26, 10, 6, 4]);
  assert.deepEqual(plain.staffTop, [0, 12]); assert.deepEqual(plain.gaps, [12 - 4, 0]);
  assert.equal(plain.systemAt(6, 3), 0); assert.equal(plain.systemAt(6 + 26 * 2 + 16 + 8, 3), 2);
  let { d, ids } = melody([6, 7]);
  const up = metricsOf(setLyric(d, ids[0], 1, { text: "la" }));
  assert.equal(lyricBand(1), 3.0);
  assert.equal(up.gaps[0], STAFF_GAP + 3.0); assert.equal(up.staffTop[1], 4 + 8 + 3.0); assert.equal(up.blockH, 19); assert.equal(up.sysH, 29); assert.equal(up.sysGap, SYS_GAP);
  const low = (verses) => { let x = fresh(); const r = place(x, { bar: 0, staff: 1, ticks: 0, step: 4 }, Q); x = r.doc; const id = idsOf(x, 0, 1)[0]; for (let n = 1; n <= verses; n++) x = setLyric(x, id, n, { text: `v${n}` }); return metricsOf(x); };
  assert.equal(low(2).blockH, 16); assert.equal(low(2).sysGap, 10, "two verses hang in the system gap as a pedal line does");
  assert.equal(low(3).blockH, 16); assert.equal(Math.round(low(3).sysGap * 10) / 10, 10.2); assert.equal(Math.round(low(4).sysGap * 10) / 10, 11.8);
  const L = layoutComposition(setLyric(d, ids[0], 1, { text: "la" }), { unit: 12, width: 1024 });
  assert.equal(L.metrics.sysH, 29);
  for (const sys of L.systems) assert.equal(sys.staffTop[1] - sys.staffTop[0], 15, "every system's lower staff moved down by the band");
  assert.equal(L.height, (6 + L.systems.length * 29 - 10 + 4) * 12);
  assert.ok(L.hit.systems.every((hs, i) => hs.bottom - hs.top === 19 + 6));
});

// --- engraving (§3, WSHED-176) ---
/** Four quarters on the upper staff with "Glo-ry be_ to" (hyphenated word, a melisma over the third note's neighbour, a whole word). */
function song() {
  let { d, ids } = melody([6, 7, 8, 9, 6, 7, 8, 9]);
  d = setLyric(d, ids[0], 1, { text: "Glo", syl: "begin" });
  d = setLyric(d, ids[1], 1, { text: "ry", syl: "end" });
  d = setLyric(d, ids[2], 1, { text: "be", ext: true });
  d = setLyric(d, ids[4], 1, { text: "to" });
  return { d, ids };
}
test("the lyric line: every syllable of a system, staff and verse shares one baseline LYRIC_Y under the bottom line; verse 2 one LYRIC_STEP lower; a low note pushes the whole line down in its system only", () => {
  const { d, ids } = song();
  const L = layoutComposition(d, { unit: 12, width: 1024 });
  const ly = L.lyrics;
  assert.equal(ly.length, 4);
  const sys0 = L.systems[0].staffTop[0];
  for (const l of ly) { assert.equal(l.system, 0); assert.ok(Math.abs(l.y - (sys0 + 4 + LYRIC_Y)) < 1e-9, `baseline ${l.y}`); }
  // centred on the head
  const d0 = L.drawn.find((x) => x.id === ids[0]);
  assert.ok(Math.abs(ly[0].x - (d0.x + d0.headW / 2)) < 1e-9);
  // verse 2 stacks under verse 1
  const two = layoutComposition(setLyric(d, ids[0], 2, { text: "Two" }), { unit: 12, width: 1024 });
  const v2 = two.lyrics.find((l) => l.n === 2);
  assert.ok(Math.abs(v2.y - (ly[0].y + LYRIC_STEP)) < 1e-9);
  // a low ledger note in bar 1 (step -6, stem up) reaches below the staff: the whole line drops for that system; a later system keeps the standard place
  let low = place(d, { bar: 1, staff: 0, ticks: 0, step: -6 }, Q).doc; low = setLyric(low, idsOf(low, 1)[0], 1, { text: "deep" });
  low = setLyric(low, idsOf(low, 4 - 1)[0] ?? idsOf(low, 1)[0], 1, { text: "deep" });
  const L2 = layoutComposition(low, { unit: 12, width: 420 }); // narrow: several systems
  const sysOf = (bar) => L2.hit.systems.findIndex((hs) => hs.bars.some((b) => b.index === bar));
  const s1 = sysOf(1), base1 = L2.systems[s1].staffTop[0] + 4 + LYRIC_Y;
  const inSys1 = L2.lyrics.filter((l) => l.system === s1);
  assert.ok(inSys1.length >= 1);
  assert.ok(inSys1.every((l) => l.y > base1 + 0.5), "the system with the ledger note carries its lyrics lower");
  assert.ok(inSys1.every((l) => Math.abs(l.y - inSys1[0].y) < 1e-9), "and still on one line");
  const other = L2.lyrics.filter((l) => l.system !== s1);
  if (other.length) assert.ok(other.every((l) => Math.abs(l.y - (L2.systems[l.system].staffTop[0] + 4 + LYRIC_Y)) < 1e-9), "other systems keep the standard place");
});

test("hyphens and extenders: one hyphen centred between Glo and ry, none after a whole word; a melisma's extender runs to the last note before the next syllable; the hyphen is dropped when syllables nearly touch", () => {
  const { d, ids } = song();
  const L = layoutComposition(d, { unit: 12, width: 1024 });
  const hy = L.lyricLines.filter((l) => l.kind === "hyphen"), ex = L.lyricLines.filter((l) => l.kind === "extend");
  assert.equal(hy.length, 1);
  const [glo, ry, be] = L.lyrics;
  assert.ok(hy[0].x > glo.x + glo.w / 2 && hy[0].x < ry.x - ry.w / 2); assert.equal(hy[0].y, glo.y);
  assert.equal(ex.length, 1);
  const d3 = L.drawn.find((x) => x.id === ids[3]);
  assert.ok(Math.abs(ex[0].x1 - (be.x + be.w / 2 + 0.3)) < 1e-9); assert.ok(Math.abs(ex[0].x2 - (d3.x + d3.headW)) < 1e-9, "to the fourth note, the melisma's last");
  // a long syllable widens its column: the bar with lyrics is wider than the same bar without
  const plain = layoutComposition(melody([6, 7, 8, 9, 6, 7, 8, 9]).d, { unit: 12, width: 1024 });
  const wide = layoutComposition(setLyric(d, ids[1], 1, { text: "ryryryryryryry", syl: "end" }), { unit: 12, width: 1024 });
  const barW = (LL) => { const hb = LL.hit.systems[0].bars[0]; return hb.x1 - hb.x0; };
  assert.ok(barW(wide) > barW(L) && barW(L) >= barW(plain) - 1e-9, `${barW(plain)} ${barW(L)} ${barW(wide)}`);
  // squeezed: sixteenth syllables in a crowded bar lose the hyphen
  let fast = fresh(); const X = { base: 16, dots: 0, rest: false };
  for (let i = 0; i < 8; i++) fast = place(fast, { bar: 0, staff: 0, ticks: (i * PPQ) / 4, step: 6 }, X).doc;
  const fids = idsOf(fast, 0);
  fast = setLyric(fast, fids[0], 1, { text: "ab", syl: "begin" }); fast = setLyric(fast, fids[1], 1, { text: "cd", syl: "end" });
  const Lf = layoutComposition(fast, { unit: 12, width: 400 });
  const a = Lf.lyrics[0], b = Lf.lyrics[1], gap = (b.x - b.w / 2) - (a.x + a.w / 2);
  assert.ok(gap >= 0.3, `the syllables keep their air: ${gap}`);
  assert.equal(Lf.lyricLines.filter((l) => l.kind === "hyphen").length, gap >= 0.9 ? 1 : 0);
});

test("a tied-in note draws no syllable (the word is still sounding) unless it is a whole word; the band and the line follow the staff that sings", () => {
  let d = fresh();
  d = place(d, { bar: 0, staff: 1, ticks: 0, step: 4 }, H).doc; d = place(d, { bar: 0, staff: 1, ticks: 2 * PPQ, step: 4 }, H).doc;
  const [a, b] = idsOf(d, 0, 1);
  d = tie(d, [{ ev: a }]);
  d = setLyric(d, a, 1, { text: "sing", syl: "begin" }); d = setLyric(d, b, 1, { text: "ing", syl: "end" });
  let L = layoutComposition(d, { unit: 12, width: 1024 });
  assert.deepEqual(L.lyrics.map((l) => l.text), ["sing"], "the tied-in 'ing' is silent");
  assert.equal(L.lyrics[0].staff, 1); assert.ok(Math.abs(L.lyrics[0].y - (L.systems[0].staffTop[1] + 4 + LYRIC_Y)) < 1e-9);
  assert.equal(L.metrics.blockH, 16, "a verse on the lower staff hangs in the system gap");
  L = layoutComposition(setLyric(d, b, 1, { text: "whole" }), { unit: 12, width: 1024 });
  assert.deepEqual(L.lyrics.map((l) => l.text), ["sing", "whole"], "a whole word on a tied-in note is drawn");
});

test("dynamics and hairpins flip above the staff on a system that draws lyrics, stay below on a plain one; the pedal goes under the lyric band; the chord line and form lane clear them", () => {
  let { d, ids } = song();
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "mf" }).doc;
  d = addExpression(d, { kind: "dyn", staff: 0, bar: 1, at: 0, value: "p" }).doc; // bar 2 (same system in a wide layout; its own in a narrow one)
  d = addHairpin(d, { staff: 0, bar: 0, at: PPQ, dir: "cresc", end: { bar: 0, at: 3 * PPQ } }).doc;
  d = addPedal(d, { staff: 0, bar: 0, at: 0, end: { bar: 0, at: 3 * PPQ } }).doc;
  const L = layoutComposition(d, { unit: 12, width: 1024 });
  const top = L.systems[0].staffTop[0];
  for (const dy of L.dynamics.filter((x) => x.system === 0)) assert.ok(dy.y < top, `dynamic above: ${dy.y} < ${top}`);
  assert.ok(L.hairpins[0].y < top, "hairpin above");
  assert.ok(L.pedals[0].y > L.lyrics[0].y + 1.0, `pedal under the lyric line: ${L.pedals[0].y} vs ${L.lyrics[0].y}`);
  assert.ok(L.chordLine(0, 0) < Math.min(...L.dynamics.map((x) => x.y)) - 1.5, "the chord line clears the flipped dynamics");
  // the same marks on a plain piece stay below
  let plain = melody([6, 7, 8, 9, 6, 7, 8, 9]).d;
  plain = addExpression(plain, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "mf" }).doc;
  const Lp = layoutComposition(plain, { unit: 12, width: 1024 });
  assert.ok(Lp.dynamics[0].y > Lp.systems[0].staffTop[0] + 4);
  // narrow: bar 1's system sings, a later system of the same staff without lyrics keeps the old placement
  let two = melody([6, 7, 8, 9, 6, 7, 8, 9, 6, 7, 8, 9, 6, 7, 8, 9]).d;
  two = setLyric(two, idsOf(two, 0)[0], 1, { text: "la" });
  two = addExpression(two, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "f" }).doc;
  two = addExpression(two, { kind: "dyn", staff: 0, bar: 3, at: 0, value: "p" }).doc;
  const Ln = layoutComposition(two, { unit: 12, width: 300 });
  const s3 = Ln.hit.systems.findIndex((hs) => hs.bars.some((b) => b.index === 3));
  assert.ok(s3 > 0, "bar 4 is on a later system");
  const f = Ln.dynamics.find((x) => x.bar === 0), p = Ln.dynamics.find((x) => x.bar === 3);
  assert.ok(f.y < Ln.systems[0].staffTop[0]); assert.ok(p.y > Ln.systems[s3].staffTop[0] + 4);
  assert.equal(Ln.lyricOn(0, 0), true); assert.equal(Ln.lyricOn(s3, 0), false);
});

test("hit-testing: a syllable answers as a lyric with its note and verse; the lasso sees lyrics; both painters draw them upright and the ink meter sees the band", async () => {
  const { d } = song();
  const L = layoutComposition(d, { unit: 12, width: 1024 });
  const ly = L.lyrics[1];
  const t = thingAt(L, ly.x, ly.y - 0.4);
  assert.equal(t.type, "lyric"); assert.equal(t.ev, ly.id); assert.equal(t.note, ly.ev); assert.equal(t.n, 1);
  assert.equal(things(L).filter((x) => x.type === "lyric").length, 4);
  // the painter: four cp-lyric groups, one hyphen text, one extender line, all upright
  const calls = [];
  paintScore(L, { at() {}, group(cls, data) { calls.push(["group", cls, data]); }, end() {}, line(x1, y1, x2, y2, cls) { calls.push(["line", cls]); }, rect() {}, polygon() {}, polyline() {}, path() {}, circle() {}, glyph() {}, text(x, y, str, cls) { calls.push(["text", cls, str]); } });
  assert.equal(calls.filter((c) => c[0] === "group" && c[1] === "cp-lyric").length, 4);
  assert.deepEqual(calls.filter((c) => c[0] === "text" && /cp-lyric-text/.test(c[1])).map((c) => c[2]), ["Glo", "ry", "be", "to", "-"]);
  assert.equal(calls.filter((c) => c[0] === "line" && c[1] === "cp-lyric-ext").length, 1);
  const plan = planPages(d, {}), plainPlan = planPages(melody([6, 7, 8, 9, 6, 7, 8, 9]).d, {});
  assert.ok(inkExtents(plan.L)[0].below < inkExtents(plainPlan.L)[0].below + 3.5 && plan.L.metrics.blockH === 19, "the band is in the block, the lyrics inside it");
  assert.ok(plan.L.lyrics.length === 4);
});

// --- MusicXML (§1.4) ---
test("MusicXML: lyrics go out as <lyric number syllabic text extend> on a chord's first note and come back intact — verses, syllabics, extends, a chord with one syllable, a word-named verse, verses past 4 dropped with a warning", () => {
  let { d, ids } = song();
  d = setLyric(d, ids[0], 2, { text: "Zwei", syl: "begin" }); d = setLyric(d, ids[1], 2, { text: "te", syl: "end" });
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 8 }, Q).doc; // a chord on the first beat: the syllable stays on the note
  const xml = toMusicXml(d, { now: new Date(0) });
  assert.match(xml, /<lyric number="1"><syllabic>begin<\/syllabic><text>Glo<\/text><\/lyric><lyric number="2"><syllabic>begin<\/syllabic><text>Zwei<\/text><\/lyric>/);
  assert.match(xml, /<lyric number="1"><syllabic>single<\/syllabic><text>be<\/text><extend type="start"\/><\/lyric>/);
  assert.equal((xml.match(/<lyric /g) ?? []).length, 6, "six syllables, none repeated on the chord's second note");
  const back = fromMusicXml(xml, { id: "rt" });
  assert.deepEqual(back.warnings, []);
  const chordNote = back.doc.measures[0].staves[0].voices[0].find((e) => e.kind === "note");
  assert.deepEqual(chordNote.lyrics, [{ n: 1, text: "Glo", syl: "begin" }, { n: 2, text: "Zwei", syl: "begin" }]);
  assert.deepEqual(back.doc.measures[0].staves[0].voices[0].filter((e) => e.kind === "note").map((e) => e.lyrics ?? null), [[{ n: 1, text: "Glo", syl: "begin" }, { n: 2, text: "Zwei", syl: "begin" }], [{ n: 1, text: "ry", syl: "end" }, { n: 2, text: "te", syl: "end" }], [{ n: 1, text: "be", ext: true }], null]);
  assert.equal(toMusicXml(back.doc, { now: new Date(0) }).match(/<lyric [^]*?<\/lyric>/g).join(""), xml.match(/<lyric [^]*?<\/lyric>/g).join(""), "a second trip is byte-identical in its lyrics");
  // Sibelius names its verses; a file with five verses loses the fifth with one warning; <extend/> with no type is a start
  const named = xml.replace('<lyric number="2"><syllabic>begin</syllabic><text>Zwei</text></lyric>', '<lyric number="verse2"><syllabic>begin</syllabic><text>Zwei</text></lyric><lyric number="5"><syllabic>single</syllabic><text>five</text></lyric>').replace('<extend type="start"/>', "<extend/>");
  const r2 = fromMusicXml(named, { id: "n" });
  assert.deepEqual(r2.warnings, ["verses past 4 were dropped"]);
  const first = r2.doc.measures[0].staves[0].voices[0].find((e) => e.kind === "note");
  assert.deepEqual(first.lyrics, [{ n: 1, text: "Glo", syl: "begin" }, { n: 2, text: "Zwei", syl: "begin" }], "the named verse took the next free number");
  assert.equal(r2.doc.measures[0].staves[0].voices[0].filter((e) => e.kind === "note")[2].lyrics[0].ext, true);
  assert.ok(validate(r2.doc));
});
