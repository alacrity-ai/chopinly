// Melody utilities over the corpus (see corpus/ for the melodies themselves).
// Notation reference lives in corpus/notation.js.
import { parsePitch } from "../../lib/music.js";
import { toMeasures } from "../../lib/staff/layout.js";
import { MELODIES, byId, pool } from "./corpus/index.js";

export { MELODIES, byId, pool };
export { BOOKS, LESSONS, STAR_THRESHOLDS, starsFor } from "./corpus/index.js";
export { seq } from "./corpus/notation.js";

const CLEF_RANGE = { treble: [-4, 12], soprano: [-4, 12], alto: [-4, 12], bass: [-4, 12] };

/** Throws if any melody is malformed. Returns the corpus. */
export function validateCorpus(list = MELODIES) {
  const ids = new Set();
  for (const m of list) {
    if (ids.has(m.id)) throw new Error(`duplicate id ${m.id}`);
    ids.add(m.id);
    if (!(m.tempo >= 54 && m.tempo <= 132)) throw new Error(`${m.id}: tempo ${m.tempo} outside 54–132`);
    toMeasures(m); // exact measure fill + duration vocabulary
    m.notes.forEach((n, i) => {
      if (n.r) { if (n.tie) throw new Error(`${m.id}: rest ${i} cannot tie`); return; }
      const p = parsePitch(n.p);
      const bottom = { treble: "E4", soprano: "C4", alto: "F3", bass: "G2" }[m.clef];
      const step = p.diatonic - parsePitch(bottom).diatonic;
      const [lo, hi] = CLEF_RANGE[m.clef];
      if (step < lo || step > hi) throw new Error(`${m.id}: note ${i} (${n.p}) outside staff range`);
      if (n.tie) {
        const next = m.notes[i + 1];
        if (!next || next.r || next.p !== n.p) throw new Error(`${m.id}: tie at ${i} must join the same pitch`);
      }
    });
    const last = [...m.notes].reverse().find((n) => !n.r);
    if (!last.p.startsWith(m.key[0])) throw new Error(`${m.id}: should end on the tonic`);
  }
  return list;
}

/**
 * Sung units: ties merged, rests dropped. Times in seconds at the given tempo
 * (quarter = beat). Each unit lists the drawn-note indices it grades.
 */
export function toTimeline(melody, tempo = melody.tempo) {
  const secPerUnit = 60 / tempo / 4;
  const units = [];
  let t = 0;
  for (let i = 0; i < melody.notes.length; i++) {
    const n = melody.notes[i];
    const dur = n.d * secPerUnit;
    if (n.r) { t += dur; continue; }
    const prev = melody.notes[i - 1];
    if (prev && prev.tie && !prev.r && prev.p === n.p && units.length) {
      const u = units[units.length - 1];
      u.t1 += dur;
      u.drawn.push(i);
    } else {
      units.push({ t0: t, t1: t + dur, midi: parsePitch(n.p).midi, drawn: [i] });
    }
    t += dur;
  }
  return { units, total: t, secPerBeat: 60 / tempo };
}

/**
 * Deal a random melody. Either the classic signature `deal(difficulty, lastId)`
 * or an options object `deal({ difficulty, clefs, exclude })`.
 */
export function deal(arg = 0, lastId = null) {
  const opts = typeof arg === "object" && arg !== null
    ? { ...arg, exclude: [...(arg.exclude ?? [])] }
    : { difficulty: arg, exclude: lastId ? [lastId] : [] };
  const candidates = pool(opts);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? MELODIES[0];
}

/** Deal n distinct melodies (a challenge drill). Falls back gracefully if the pool is small. */
export function dealSet(n, { difficulty = 0, clefs = null } = {}) {
  const out = [];
  while (out.length < n) {
    const m = deal({ difficulty, clefs, exclude: out.map((x) => x.id) });
    if (out.some((x) => x.id === m.id)) break; // pool exhausted
    out.push(m);
  }
  return out;
}
