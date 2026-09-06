// Pitch training (WSHED-81). Pure — node-tested. A setup is six plain choices;
// a run is generated from a setup and a seed so a drill can be replayed (and
// tested) exactly. Judging is immediate: one press, one verdict.

export const OPTIONS = {
  notes: [["key", "in the key"], ["all", "all twelve"]],
  range: [[1, "one octave"], [2, "two octaves"], [4, "four octaves"], [8, "whole piano"]],
  count: [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]],
  mode: [["melodic", "one after another"], ["harmonic", "together"]],
  reference: [["each", "every question"], ["start", "once at the start"], ["never", "never"]],
  questions: [[10, "10"], [20, "20"], [35, "35"]],
};
export const LEVELS = {
  beginner: { notes: "key", range: 1, count: 1, mode: "melodic", reference: "each", questions: 10 },
  intermediate: { notes: "key", range: 2, count: 2, mode: "melodic", reference: "each", questions: 10 },
  advanced: { notes: "all", range: 2, count: 3, mode: "melodic", reference: "start", questions: 20 },
};
export const LEVEL_NAMES = [...Object.keys(LEVELS), "custom"];
export const DEFAULT_SETUP = { ...LEVELS.beginner };
const KEYS = ["notes", "range", "count", "mode", "reference", "questions"];

/** The preset a setup matches, or "custom". */
export function levelOf(setup) {
  return Object.keys(LEVELS).find((l) => KEYS.every((k) => LEVELS[l][k] === setup[k])) ?? "custom";
}
/** A setup with only known values (bad storage → defaults). */
export function cleanSetup(s) {
  const out = { ...DEFAULT_SETUP };
  for (const k of KEYS) if (s && OPTIONS[k].some(([v]) => v === s[k])) out[k] = s[k];
  if (out.count === 1) out.mode = "melodic";
  return out;
}

/** Keyboard range: around middle C, widening; 8 = the whole piano. */
export function rangeMidi(range) {
  return range >= 8 ? { from: 21, to: 108 } : range >= 4 ? { from: 36, to: 84 } : range >= 2 ? { from: 48, to: 72 } : { from: 60, to: 72 };
}

export const PC_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const noteName = (m) => `${PC_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/** The setup as one sentence. */
export function describe(setup, tonic = null) {
  const key = setup.notes === "key" ? `${tonic === null ? "a major key" : PC_NAMES[tonic % 12] + " major"}` : "all twelve notes";
  const range = OPTIONS.range.find(([v]) => v === setup.range)[1] + (setup.range < 8 ? " around middle C" : "");
  const what = setup.count === 1 ? "single notes" : `${setup.count} notes ${setup.mode === "harmonic" ? "together" : "one after another"}`;
  const ref = setup.reference === "each" ? "a reference before each question" : setup.reference === "start" ? "a reference once at the start" : "no reference — absolute pitch";
  return `${key}, ${range}, ${what}, ${ref}, ${setup.questions} questions.`;
}
/** The short form for a logbook line / history row. */
export function shortDescribe(setup) {
  return [OPTIONS.notes.find(([v]) => v === setup.notes)[1], setup.range >= 8 ? "88 keys" : `${setup.range} oct`, setup.count === 1 ? "single" : `${setup.count} ${setup.mode === "harmonic" ? "together" : "in a row"}`, setup.reference === "never" ? "no ref" : null].filter(Boolean).join(" · ");
}

/** mulberry32: a tiny seeded PRNG → () => [0, 1). */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * A whole run: the tonic (also the reference note) and the questions.
 * Beginners always get C; otherwise a white-key tonic in the middle octave.
 * "in the key" draws from the tonic's major scale; notes in a question are
 * distinct (harmonic ones ascending).
 */
export function generate(setup, seed = Date.now()) {
  const r = rng(seed);
  const { from, to } = rangeMidi(setup.range);
  const mid = Math.floor((from + to) / 2);
  const octaveC = 60 + 12 * Math.round((mid - 60) / 12);
  const tonic = levelOf(setup) === "beginner" ? 60 : octaveC + MAJOR[Math.floor(r() * MAJOR.length)];
  const inKey = (m) => MAJOR.includes((((m - tonic) % 12) + 12) % 12);
  const pool = [];
  for (let m = from; m <= to; m++) if (setup.notes === "all" || inKey(m)) pool.push(m);
  const questions = [];
  for (let q = 0; q < setup.questions; q++) {
    const notes = [];
    while (notes.length < setup.count && notes.length < pool.length) {
      const m = pool[Math.floor(r() * pool.length)];
      if (!notes.includes(m)) notes.push(m);
    }
    if (setup.mode === "harmonic") notes.sort((a, b) => a - b);
    questions.push({ notes });
  }
  return { seed, tonic, key: setup.notes === "key" ? `${PC_NAMES[tonic % 12]} major` : null, questions };
}

export const pc = (m) => ((m % 12) + 12) % 12;
/** Semitones between two pitch classes, the short way round (0–6). */
const pcDist = (a, b) => { const d = Math.abs(pc(a) - pc(b)); return Math.min(d, 12 - d); };
/**
 * Judge one press against a question in progress. The answer keyboard is one
 * octave, so a press counts by pitch class: the question plays C6, any C is
 * right (also when the real piano answers through the mic, WSHED-86). `hits` = the question's notes already credited (push `expected` on a
 * hit). → { correct, expected } — expected is the question note this press
 * answered (melodic: the next one; harmonic: the matching one, else the
 * nearest unhit by pitch class) for the miss analysis.
 */
export function judgePress(question, hits, midi, mode) {
  if (mode === "harmonic") {
    const left = question.notes.filter((n) => !hits.includes(n));
    const hit = left.find((n) => pc(n) === pc(midi));
    if (hit !== undefined) return { correct: true, expected: hit };
    const expected = left.reduce((best, n) => (pcDist(n, midi) < pcDist(best, midi) ? n : best), left[0]);
    return { correct: false, expected };
  }
  const expected = question.notes[hits.length];
  return { correct: pc(midi) === pc(expected), expected };
}
/** The one-octave answer keyboard for a tonic: the C below it to the C above. */
export function answerOctave(tonic) { const from = tonic - pc(tonic); return { from, to: from + 12 }; }
/** Where a question note sits on the answer keyboard (its pitch class in that octave). */
export const onAnswerKeyboard = (midi, from) => from + pc(midi);

/** results: [{ notes, hits: number }] → { points, max, pct, right (questions fully right) }. */
export function scoreRun(results) {
  const points = results.reduce((s, x) => s + x.hits, 0), max = results.reduce((s, x) => s + x.notes.length, 0);
  return { points, max, pct: max ? Math.round((points / max) * 100) : 0, right: results.filter((x) => x.hits === x.notes.length).length };
}
export const starsFor = (pct) => (pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0);

const INTERVALS = ["unison", "minor second", "major second", "minor third", "major third", "fourth", "tritone", "fifth", "minor sixth", "major sixth", "minor seventh", "major seventh"];
export const intervalName = (semis) => { const s = ((Math.round(semis) % 12) + 12) % 12; return s === 0 && Math.abs(semis) >= 12 ? "octave" : INTERVALS[s]; };
/**
 * One sentence about the misses, as intervals above the tonic:
 * "you heard the fifth as a fourth three times". Empty when nothing was missed.
 */
export function missLine(misses, tonic) {
  if (!misses.length) return "";
  const by = new Map();
  for (const m of misses) {
    const k = pc(m.expected) === pc(m.heard) ? "octave" : `${intervalName(m.expected - tonic)}|${intervalName(m.heard - tonic)}`;
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  const [k, n] = [...by].sort((a, b) => b[1] - a[1])[0];
  if (k === "octave") return n === 1 ? "one slip: the right interval in the wrong octave" : `${n} slips: the right interval in the wrong octave`;
  const [exp, heard] = k.split("|");
  const an = (w) => (w === "octave" ? "an" : "a"); // "a unison"
  const times = n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
  return misses.length === 1 ? `one slip: you heard the ${exp} as ${an(heard)} ${heard}` : `you heard the ${exp} as ${an(heard)} ${heard} ${times}`;
}
