// Voicings for the chord diagrams (WSHED-160): the instruments, the compact
// voicing code the vendored data is written in, what each string sounds, and
// the theory check every vendored voicing has to pass (dev/vendor-chords.mjs
// drops the ones that fail; tests/chords.test.mjs re-checks the committed data).
import { chordPcs, degreeSemis } from "./theory.js";

export const INSTRUMENTS = {
  guitar: { id: "guitar", name: "Guitar", strings: ["E", "A", "D", "G", "B", "E"], tuning: [40, 45, 50, 55, 59, 64] },
  ukulele: { id: "ukulele", name: "Ukulele", strings: ["G", "C", "E", "A"], tuning: [67, 60, 64, 69] },
};

/**
 * A voicing code: "x32010:032010@1" or "133211:134211@5b1".
 *   before ":" — one char per string, low string first: x = muted, 0 = open, n = nth fret of the box
 *   after ":"  — the finger per string (0 = none, T = thumb)
 *   "@n"       — the fret the box starts at (1 = the nut)
 *   "b…"       — barred box frets, comma-separated
 */
export function encode({ frets, fingers, baseFret, barres = [] }) {
  const f = frets.map((x) => (x < 0 ? "x" : String(x))).join("");
  const g = fingers.map((x) => (x === "T" || x === 5 ? "T" : String(x))).join("");
  return `${f}:${g}@${baseFret}${barres.length ? "b" + barres.join(",") : ""}`;
}
export function decode(code) {
  const m = /^([x0-9]+):([0-9T]+)@(\d+)(?:b([\d,]+))?$/.exec(code);
  if (!m) throw new Error(`bad voicing code ${code}`);
  const frets = [...m[1]].map((c) => (c === "x" ? -1 : Number(c)));
  const fingers = [...m[2]].map((c) => (c === "T" ? "T" : Number(c)));
  return { code, frets, fingers, baseFret: Number(m[3]), barres: m[4] ? m[4].split(",").map(Number) : [] };
}

/** The absolute fret each string is stopped at (-1 muted, 0 open). */
export const absFrets = (v) => v.frets.map((f) => (f <= 0 ? f : v.baseFret + f - 1));
/** The MIDI note each string sounds, or null when muted. */
export const midis = (v, inst) => absFrets(v).map((f, i) => (f < 0 ? null : inst.tuning[i] + f));

/**
 * Does this voicing honestly play the chord? Every sounded note must be a chord
 * tone; every tone the type doesn't list as optional must sound; a slash chord's
 * bass must be the lowest note. → null when fine, else the reason.
 */
export function checkVoicing(v, inst, rootPc, q, bassPc = null) {
  const notes = midis(v, inst).filter((n) => n !== null);
  if (notes.length < 2) return "fewer than two strings";
  const pcs = chordPcs(rootPc, q);
  const also = q.also.map((d) => (rootPc + degreeSemis(d)) % 12);
  const allowed = new Set([...pcs, ...also, ...(bassPc === null ? [] : [bassPc])]);
  const heard = new Set(notes.map((n) => n % 12));
  for (const pc of heard) if (!allowed.has(pc)) return `sounds pc ${pc}, not in the chord`;
  for (const d of q.degrees) {
    if (q.optional.includes(d)) continue;
    if (!heard.has((rootPc + degreeSemis(d)) % 12)) return `missing ${d}`;
  }
  if (bassPc !== null && Math.min(...notes) % 12 !== bassPc) return "bass is not the lowest note";
  if (v.frets.some((f) => f > 5)) return "reaches past the box";
  return null;
}

/** Barre spans: for each barred box fret, the strings it covers (first..last string at that fret with that finger). */
export function barreSpans(v) {
  return v.barres.map((fret) => {
    const idx = v.frets.map((f, i) => (f === fret ? i : -1)).filter((i) => i >= 0);
    const finger = v.fingers[idx[0]];
    const same = idx.filter((i) => v.fingers[i] === finger);
    const from = Math.min(...same), to = Math.max(...same);
    return { fret, from, to, finger };
  }).filter((b) => b.to > b.from);
}
