// Chord symbols (docs/COMPOSE_CHORDS_DESIGN.md, WSHED-166): reading a typed symbol, spelling one back,
// the qualities the Chords rail offers, and the MusicXML <kind> of a quality. Pure — node-testable.
// A chord symbol is an expression { kind: "chord", root: { step, alter }, q, bass? } — root and bass are
// structured, the quality is the text as engraved ("m7(♭5)", "7alt.", "(add9)") so a source's spelling survives.
import { CHORD_Q_MAX } from "./model.js";

const ACC_IN = { "": 0, "#": 1, "♯": 1, b: -1, "♭": -1, "##": 2, "𝄪": 2, x: 2, bb: -2, "𝄫": -2 };
export const ACC_TEXT = { "-2": "𝄫", "-1": "♭", 0: "", 1: "♯", 2: "𝄪" };
/** The qualities on the rail, in the order a player reaches for them (engraved spellings). "" = major. */
export const CHORD_QUALITIES = ["", "m", "7", "maj7", "m7", "m7(♭5)", "dim", "dim7", "aug", "sus4", "7sus4", "sus2", "6", "m6", "add9", "m(add9)", "9", "m9", "maj9", "7alt.", "7♭9", "7♯9", "7♯11", "11", "m11", "13", "7♭5", "7♯5", "m(maj7)", "6/9", "5"];

/** A quality as engraved: ASCII b / # after a digit or inside brackets become ♭ / ♯ ("m7(b5)" → "m7(♭5)", "7#9" → "7♯9"). */
export function prettyQuality(q) {
  return String(q ?? "").trim().replace(/(^|[\d(,\s])b(?=\d)/g, "$1♭").replace(/(^|[\d(,\s])#(?=\d)/g, "$1♯").slice(0, CHORD_Q_MAX);
}
const pitchOf = (letter, acc) => ({ step: letter.toUpperCase(), alter: ACC_IN[acc ?? ""] ?? 0 });

/**
 * Read a typed chord symbol: "Am", "Bm7(b5)/A", "F#dim7", "Bbmaj7/A", "E7alt.", "C(add9)", "Gm/B♭".
 * → { root, q, bass? } or null when it does not start with a root. A "b" right after the root letter is a flat.
 */
export function parseChord(input) {
  const s = String(input ?? "").trim();
  const m = /^([A-Ga-g])(##|bb|#|b|♯|♭|𝄪|𝄫)?(.*)$/u.exec(s);
  if (!m) return null;
  let rest = m[3].trim(), bass;
  const slash = /^(.*?)\s*\/\s*([A-Ga-g])(##|bb|#|b|♯|♭)?$/u.exec(rest);
  if (slash && !/^\d/.test(slash[2])) { rest = slash[1].trim(); bass = pitchOf(slash[2], slash[3]); }
  const q = prettyQuality(rest);
  if (rest.length > CHORD_Q_MAX) return null;
  return { root: pitchOf(m[1], m[2]), q, ...(bass ? { bass } : {}) };
}
/** One line of text for a chord symbol: "B♭maj7/A". */
export const chordText = (x) => `${x.root.step}${ACC_TEXT[x.root.alter ?? 0]}${x.q}${x.bass ? `/${x.bass.step}${ACC_TEXT[x.bass.alter ?? 0]}` : ""}`;
/**
 * The engraved runs of a quality: a bracketed alteration straight after a digit is raised and small
 * ("m7(♭5)" → [{ t: "m7" }, { t: "(♭5)", sup: true }]); everything else sits on the baseline ("m(add9)", "7alt.").
 */
export function qualityRuns(q) {
  const out = [];
  const re = /(\d)(\([^)]*\))/g;
  let last = 0, mm;
  while ((mm = re.exec(q))) { const cut = mm.index + 1; if (cut > last) out.push({ t: q.slice(last, cut) }); out.push({ t: mm[2], sup: true }); last = cut + mm[2].length; }
  if (last < q.length) out.push({ t: q.slice(last) });
  return out.filter((r) => r.t);
}

// --- MusicXML <kind> (docs/COMPOSE_MUSICXML_DESIGN.md §harmony) -------------------------------------
const KIND = [ // [quality as written (♭/♯, no spaces), MusicXML kind] — the first match by exact text wins; the text= attribute keeps the spelling
  ["", "major"], ["m", "minor"], ["7", "dominant"], ["maj7", "major-seventh"], ["m7", "minor-seventh"], ["m7(♭5)", "half-diminished"], ["m7♭5", "half-diminished"], ["ø", "half-diminished"], ["ø7", "half-diminished"],
  ["dim", "diminished"], ["dim7", "diminished-seventh"], ["°", "diminished"], ["°7", "diminished-seventh"], ["aug", "augmented"], ["+", "augmented"], ["7♯5", "augmented-seventh"], ["aug7", "augmented-seventh"],
  ["sus4", "suspended-fourth"], ["sus2", "suspended-second"], ["7sus4", "dominant"], ["6", "major-sixth"], ["m6", "minor-sixth"], ["9", "dominant-ninth"], ["maj9", "major-ninth"], ["m9", "minor-ninth"],
  ["11", "dominant-11th"], ["m11", "minor-11th"], ["13", "dominant-13th"], ["m(maj7)", "major-minor"], ["5", "power"], ["6/9", "major-sixth"], ["add9", "major"], ["(add9)", "major"], ["m(add9)", "minor"],
];
const KIND_OF = new Map(KIND.map(([q, k]) => [q, k]));
/** The MusicXML kind of a quality ("other" when nothing names it; the engraved text travels in text=). */
export function xmlKind(q) {
  const k = KIND_OF.get(q.replace(/\s+/g, ""));
  if (k) return k;
  if (/^m(?!aj)/.test(q)) return /7/.test(q) ? "minor-seventh" : "minor";
  if (/^7|^9|^13/.test(q)) return "dominant";
  if (/^maj/.test(q)) return "major-seventh";
  return "other";
}
const KIND_TEXT = { major: "", minor: "m", augmented: "aug", diminished: "dim", dominant: "7", "major-seventh": "maj7", "minor-seventh": "m7", "diminished-seventh": "dim7", "augmented-seventh": "7♯5", "half-diminished": "m7(♭5)", "major-minor": "m(maj7)", "major-sixth": "6", "minor-sixth": "m6", "dominant-ninth": "9", "major-ninth": "maj9", "minor-ninth": "m9", "dominant-11th": "11", "major-11th": "maj11", "minor-11th": "m11", "dominant-13th": "13", "major-13th": "maj13", "minor-13th": "m13", "suspended-second": "sus2", "suspended-fourth": "sus4", power: "5", other: "" };
/** A quality read back from MusicXML: the text= spelling when there is one, else the kind's usual spelling. */
export const qualityFromXml = (kind, text) => prettyQuality(text !== undefined && text !== null ? text : KIND_TEXT[kind] ?? "");
