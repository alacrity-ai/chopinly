// A single-voice piece exercising most of the engraver: both staves, chords with a second, beams,
// a tuplet, ties across a barline, a slur, marks, a dynamic + hairpin, a clef change, a roll,
// accidentals. tests/compose-layout.test.mjs lays it out and compares against
// compose-golden.json (written by the code before multi-voice landed, WSHED-120), so a
// piece that never uses voice 2 keeps its exact layout. Regenerate only on purpose:
//   node -e 'import("./tests/fixtures/compose-golden.mjs").then(m=>m.write())'
import { newComposition } from "../../js/lib/compose/model.js";
import { place, tuplet, tie, slur, articulate, dynamic, hairpin, setClef, arpeggio, accidental, exprText } from "../../js/lib/compose/engine.js";
import { layoutComposition } from "../../js/lib/compose/layout.js";
import { PPQ } from "../../js/lib/compose/ticks.js";

const N = (base, dots = 0) => ({ base, dots, rest: false, tuplet: null, alter: null });
export function goldenDoc() {
  let d = newComposition({ id: "golden", title: "golden", now: 1 });
  const v = (b, s = 0) => d.measures[b].staves[s].voices[0];
  for (const [t, st] of [[0, 4], [PPQ, 6], [2 * PPQ, 8], [3 * PPQ, 2]]) d = place(d, { bar: 0, staff: 0, ticks: t, step: st }, N(4)).doc;
  d = place(d, { bar: 0, staff: 0, ticks: 0, step: 5 }, N(4)).doc;                       // a second in the first chord
  for (const [t, st] of [[0, 4], [2 * PPQ, 2]]) d = place(d, { bar: 0, staff: 1, ticks: t, step: st }, N(2)).doc;
  for (let i = 0; i < 4; i++) d = place(d, { bar: 1, staff: 0, ticks: (i * PPQ) / 2, step: 5 + i }, N(8)).doc;
  for (let i = 0; i < 4; i++) d = place(d, { bar: 1, staff: 0, ticks: 2 * PPQ + (i * PPQ) / 4, step: 9 - i }, N(16)).doc;
  d = place(d, { bar: 1, staff: 1, ticks: 0, step: 6 }, N(1)).doc;
  for (let i = 0; i < 3; i++) d = place(d, { bar: 2, staff: 0, ticks: i * (PPQ / 2), step: 4 }, N(8)).doc;
  d = tuplet(d, v(2).slice(0, 3).map((e) => e.id), 3);
  d = place(d, { bar: 2, staff: 0, ticks: 3 * PPQ, step: 3 }, N(4)).doc;
  d = place(d, { bar: 3, staff: 0, ticks: 0, step: 3 }, N(2)).doc;
  d = tie(d, [{ ev: v(2)[v(2).length - 1].id }]);
  d = slur(d, [v(1)[0].id, v(1)[3].id]);
  d = articulate(d, [v(0)[1].id], "staccato"); d = articulate(d, [v(0)[2].id], "trill"); d = articulate(d, [v(0)[3].id], "fermata");
  d = dynamic(d, [v(0)[0].id], "p"); d = hairpin(d, [v(0)[0].id, v(0)[3].id], "cresc");
  d = exprText(d, [v(1)[0].id], "dolce");
  d = accidental(d, [{ ev: v(0)[1].id, pi: 0 }], 1); d = accidental(d, [{ ev: v(1)[2].id, pi: 0 }], -1);
  d = arpeggio(d, [v(0)[0].id], "up");
  d = setClef(d, 3, 1, "tenor", 2 * PPQ);
  d = place(d, { bar: 3, staff: 1, ticks: 2 * PPQ, step: 4 }, N(4)).doc;
  for (let b = 4; b < 8; b++) for (let q = 0; q < 4; q++) d = place(d, { bar: b, staff: b % 2, ticks: q * PPQ, step: 2 + q }, N(4)).doc;
  return d;
}
/** The layout with ids and unknown keys stripped, so it can be compared across versions. */
export function goldenLayout(width = 1024) {
  const L = layoutComposition(goldenDoc(), { unit: 12, width });
  const strip = (x) => {
    if (Array.isArray(x)) return x.map(strip);
    if (x && typeof x === "object") { const o = {}; for (const [k, val] of Object.entries(x)) { if (k === "id" || k === "tupletId" || k === "pitches" || k === "m" || k === "clefFor") continue; if (typeof val === "number") o[k] = Math.round(val * 1000) / 1000; else o[k] = strip(val); } return o; }
    return x;
  };
  return strip({ width: L.width, height: L.height, drawn: L.drawn, beams: L.beams, ties: L.ties, slurs: L.slurs, tuplets: L.tuplets, marks: L.marks, glisses: L.glisses, arps: L.arps, dynamics: L.dynamics, hairpins: L.hairpins, texts: L.texts, clefs: L.clefs, hit: L.hit, systems: L.systems.map((s) => ({ top: s.top, staffTop: s.staffTop, barlines: s.barlines, endX: s.endX, scale: s.scale, leading: s.leading.map((l) => ({ x: l.x, w: l.w, keyX: l.keyX, timeX: l.timeX })) })) });
}
export async function write() {
  const fs = await import("node:fs");
  fs.writeFileSync(new URL("./compose-golden.json", import.meta.url), JSON.stringify({ w1024: goldenLayout(1024), w700: goldenLayout(700) }));
  console.log("written");
}
