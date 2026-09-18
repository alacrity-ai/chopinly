// Layout pins for paper (docs/COMPOSE_LAYOUT_DESIGN.md §3, WSHED-156): a break / keep on the barline that
// closes a bar, a weight in the row's justification. Pure — every operation returns a new document. The
// engraver reads them only when asked for paper (`layoutComposition(doc, { pins: true })`).
import { clone, LAY_BREAKS, LAY_W_MIN, LAY_W_MAX } from "./model.js";
import { Nudge } from "./engine.js";

const put = (m, patch) => {
  const lay = { ...(m.lay ?? {}), ...patch };
  for (const k of Object.keys(lay)) if (lay[k] === undefined || lay[k] === null) delete lay[k];
  if (Object.keys(lay).length) m.lay = lay; else delete m.lay;
};
const bar = (doc, i) => { if (!doc.measures[i]) throw new Nudge("no such bar"); return i; };
/** A weight as it is stored: clamped, to 0.01; 1 (natural) is nothing. */
export const roundWeight = (w) => { const r = Math.round(Math.max(LAY_W_MIN, Math.min(LAY_W_MAX, w)) * 100) / 100; return r === 1 ? null : r; };

/** The barline that closes `i`: "break" ends the row there, "keep" never does, null is automatic again. */
export function setBreak(doc, i, brk) {
  if (brk !== null && !LAY_BREAKS.includes(brk)) throw new Nudge("no such pin");
  const d = clone(doc); put(d.measures[bar(d, i)], { brk }); return d;
}
/** Bar `i`'s share of its row's stretch (1 = natural). */
export function setWeight(doc, i, w) {
  const d = clone(doc); put(d.measures[bar(d, i)], { w: w === null ? null : roundWeight(w) }); return d;
}
/** The row is exactly bars first…last, whatever happens around it. */
export function lockRow(doc, first, last) {
  const d = clone(doc); bar(d, first); bar(d, last);
  if (first > 0) put(d.measures[first - 1], { brk: "break" });
  for (let i = first; i < last; i++) put(d.measures[i], { brk: "keep" });
  put(d.measures[last], { brk: "break" });
  return d;
}
/** Every pin on bars first…last goes, and the break that opened the row. */
export function releaseBars(doc, first, last) {
  const d = clone(doc); bar(d, first); bar(d, last);
  if (first > 0 && d.measures[first - 1].lay?.brk === "break") put(d.measures[first - 1], { brk: null });
  for (let i = first; i <= last; i++) delete d.measures[i].lay;
  return d;
}
export function clearPins(doc) { const d = clone(doc); for (const m of d.measures) delete m.lay; return d; }
export function pinCount(doc) {
  const n = { breaks: 0, keeps: 0, weights: 0 };
  for (const m of doc.measures) { if (m.lay?.brk === "break") n.breaks++; if (m.lay?.brk === "keep") n.keeps++; if (m.lay?.w !== undefined) n.weights++; }
  return { ...n, total: n.breaks + n.keeps + n.weights };
}
/** "3 breaks · 1 keep · 2 widths", or "automatic". */
export function pinSummary(doc) {
  const n = pinCount(doc), word = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : null);
  return [word(n.breaks, "break", "breaks"), word(n.keeps, "keep", "keeps"), word(n.weights, "width", "widths")].filter(Boolean).join(" · ") || "automatic";
}
/** A row is locked when nothing automatic is left in it: a break before it (or the piece's start), keeps inside, a break (or the piece's end) after. */
export function rowLocked(doc, first, last) {
  const m = doc.measures;
  if (first > 0 && m[first - 1].lay?.brk !== "break") return false;
  for (let i = first; i < last; i++) if (m[i].lay?.brk !== "keep") return false;
  return last === m.length - 1 || m[last].lay?.brk === "break";
}
/**
 * The weight that gives bar `k` of a laid-out paper row (`L.hit.systems[i]`) the stretch width `width` (S), the
 * other bars' weights held. A justified row shares `room`: w = T·A / (s·(room − T)), A = the others' Σ s·w; a
 * capped row (the last, not stretched past its cap) grows freely, w = T / (s·cap), until it fills the room.
 */
export function weightFor(row, k, width) {
  const b = row.bars[k], A = row.bars.reduce((n, o, j) => (j === k ? n : n + o.stretch * o.weight), 0);
  const T = Math.max(0.01, width);
  const free = T / (b.stretch * row.cap);
  if (A + b.stretch * free <= row.room / row.cap) return free; // still short of the room at the cap
  return T >= row.room ? LAY_W_MAX : (T * A) / (b.stretch * (row.room - T));
}
/** The row's scales with bar `k` at weight `w`: [{ scale }] — what the engraver would give, without laying out. */
export function scalesWith(row, k, w) {
  const body = row.bars.reduce((n, o, j) => n + o.stretch * (j === k ? w : o.weight), 0), scale = Math.min(row.room / body, row.cap);
  return row.bars.map((o, j) => scale * (j === k ? w : o.weight));
}
/** Row indices of a paper layout that do not fit. */
export const tightRows = (L) => L.hit.systems.map((s, i) => (s.tight ? i : -1)).filter((i) => i >= 0);
