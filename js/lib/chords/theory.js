// Chord theory for the Almanac's chord diagrams (WSHED-160): the chord types,
// the twelve keys, spelling a chord's notes, and reading a typed chord symbol.
// Pure and DOM-free — the vendoring script and the unit tests use it too.

/** The twelve keys, in the spellings a guitarist reads (sharps for C♯ and F♯, flats elsewhere). */
export const KEYS = [
  { id: "C", pc: 0, name: "C" }, { id: "C#", pc: 1, name: "C♯", alt: "D♭" }, { id: "D", pc: 2, name: "D" },
  { id: "Eb", pc: 3, name: "E♭", alt: "D♯" }, { id: "E", pc: 4, name: "E" }, { id: "F", pc: 5, name: "F" },
  { id: "F#", pc: 6, name: "F♯", alt: "G♭" }, { id: "G", pc: 7, name: "G" }, { id: "Ab", pc: 8, name: "A♭", alt: "G♯" },
  { id: "A", pc: 9, name: "A" }, { id: "Bb", pc: 10, name: "B♭", alt: "A♯" }, { id: "B", pc: 11, name: "B" },
];
export const keyById = (id) => KEYS.find((k) => k.id === id) ?? null;

export const CATEGORIES = [
  { id: "triads", name: "Triads" },
  { id: "sixths", name: "Sixths" },
  { id: "sevenths", name: "Sevenths" },
  { id: "ninths", name: "Ninths" },
  { id: "upper", name: "Elevenths & thirteenths" },
  { id: "altered", name: "Altered" },
  { id: "slash", name: "Slash chords" },
];

// A chord type: id (URL-safe, the vendored data's key), sym (what follows the root), name (spoken),
// degrees (the formula), optional (degrees a real voicing may leave out), aliases (typed spellings).
// Degrees: "1".."13" with ♭/♯ prefixes written b/#; "bb7" is the diminished seventh.
// also: tones a voicing may add beyond the formula (a full thirteenth stacks the eleventh too).
const Q = (id, sym, name, cat, degrees, optional, aliases = [], also = []) => ({ id, sym, name, cat, degrees: degrees.split(" "), optional: optional ? optional.split(" ") : [], aliases, also });
export const QUALITIES = [
  Q("major", "", "major", "triads", "1 3 5", "", ["", "maj", "major", "M", "Δ"]),
  Q("minor", "m", "minor", "triads", "1 b3 5", "", ["m", "min", "minor", "-", "mi"]),
  Q("dim", "dim", "diminished", "triads", "1 b3 b5", "", ["dim", "diminished", "°", "o"]),
  Q("aug", "aug", "augmented", "triads", "1 3 #5", "", ["aug", "augmented", "+", "#5", "+5"]),
  Q("sus2", "sus2", "suspended second", "triads", "1 2 5", "5", ["sus2", "suspended2", "suspendedsecond"]),
  Q("sus4", "sus4", "suspended fourth", "triads", "1 4 5", "5", ["sus4", "sus", "suspended4", "suspendedfourth", "suspended"]),
  Q("5", "5", "power chord", "triads", "1 5", "", ["5", "power", "powerchord", "no3"]),
  Q("6", "6", "sixth", "sixths", "1 3 5 6", "5", ["6", "maj6", "major6", "sixth", "majorsixth", "add6"]),
  Q("m6", "m6", "minor sixth", "sixths", "1 b3 5 6", "5", ["m6", "min6", "-6", "minor6", "minorsixth"]),
  Q("69", "6/9", "six-nine", "sixths", "1 3 5 6 9", "1 5", ["69", "6/9", "6add9", "sixnine"]),
  Q("m69", "m6/9", "minor six-nine", "sixths", "1 b3 5 6 9", "1 5", ["m69", "m6/9", "-69", "min69", "minorsixnine"]),
  Q("7", "7", "dominant seventh", "sevenths", "1 3 5 b7", "5", ["7", "dom7", "dominant7", "seventh", "dominantseventh", "dom"]),
  Q("maj7", "maj7", "major seventh", "sevenths", "1 3 5 7", "5", ["maj7", "M7", "Δ7", "Δ", "ma7", "major7", "majorseventh", "j7"]),
  Q("m7", "m7", "minor seventh", "sevenths", "1 b3 5 b7", "5", ["m7", "min7", "-7", "mi7", "minor7", "minorseventh"]),
  Q("mmaj7", "m(maj7)", "minor major seventh", "sevenths", "1 b3 5 7", "5", ["mmaj7", "m(maj7)", "mM7", "minmaj7", "-Δ7", "mΔ7", "m(M7)", "-maj7", "minormajor7", "minormajorseventh"]),
  Q("dim7", "dim7", "diminished seventh", "sevenths", "1 b3 b5 bb7", "", ["dim7", "°7", "o7", "diminished7", "diminishedseventh"]),
  Q("m7b5", "m7♭5", "half-diminished", "sevenths", "1 b3 b5 b7", "", ["m7b5", "ø", "ø7", "-7b5", "min7b5", "halfdiminished", "halfdim", "m7-5", "minor7flat5"]),
  Q("7sus4", "7sus4", "seventh suspended fourth", "sevenths", "1 4 5 b7", "5", ["7sus4", "7sus", "sus7", "dominant7sus4"]),
  Q("aug7", "7♯5", "augmented seventh", "sevenths", "1 3 #5 b7", "", ["aug7", "7#5", "+7", "7+5", "7+", "augmented7", "augmentedseventh"]),
  Q("7b5", "7♭5", "seventh flat five", "sevenths", "1 3 b5 b7", "", ["7b5", "7-5", "seventhflatfive"]),
  Q("maj7b5", "maj7♭5", "major seventh flat five", "sevenths", "1 3 b5 7", "", ["maj7b5", "Δ7b5", "M7b5", "maj7-5"]),
  Q("maj7#5", "maj7♯5", "major seventh sharp five", "sevenths", "1 3 #5 7", "", ["maj7#5", "Δ7#5", "M7#5", "maj7+5", "+maj7", "augmaj7"]),
  Q("mmaj7b5", "m(maj7)♭5", "minor major seventh flat five", "sevenths", "1 b3 b5 7", "", ["mmaj7b5", "m(maj7)b5", "mM7b5"]),
  Q("add9", "add9", "added ninth", "ninths", "1 3 5 9", "5", ["add9", "add2", "addnine", "addedninth"]),
  Q("madd9", "m(add9)", "minor added ninth", "ninths", "1 b3 5 9", "5", ["madd9", "m(add9)", "madd2", "-add9", "minadd9", "minoradd9"]),
  Q("9", "9", "dominant ninth", "ninths", "1 3 5 b7 9", "1 5", ["9", "dom9", "ninth", "dominant9", "dominantninth"]),
  Q("maj9", "maj9", "major ninth", "ninths", "1 3 5 7 9", "1 5", ["maj9", "M9", "Δ9", "ma9", "major9", "majorninth"]),
  Q("m9", "m9", "minor ninth", "ninths", "1 b3 5 b7 9", "1 5", ["m9", "min9", "-9", "mi9", "minor9", "minorninth"]),
  Q("mmaj9", "m(maj9)", "minor major ninth", "ninths", "1 b3 5 7 9", "1 5", ["mmaj9", "m(maj9)", "mM9", "-Δ9", "minmaj9"]),
  Q("7b9", "7♭9", "seventh flat nine", "ninths", "1 3 5 b7 b9", "1 5", ["7b9", "7-9", "seventhflatnine"]),
  Q("7#9", "7♯9", "seventh sharp nine", "ninths", "1 3 5 b7 #9", "1 5", ["7#9", "7+9", "hendrix", "seventhsharpnine"]),
  Q("9b5", "9♭5", "ninth flat five", "ninths", "1 3 b5 b7 9", "1", ["9b5", "9-5"]),
  Q("aug9", "9♯5", "augmented ninth", "ninths", "1 3 #5 b7 9", "1", ["aug9", "9#5", "+9", "9+5", "augmented9"]),
  Q("11", "11", "eleventh", "upper", "1 3 5 b7 9 11", "1 3 5 9", ["11", "dom11", "eleventh", "dominant11"]),
  Q("m11", "m11", "minor eleventh", "upper", "1 b3 5 b7 9 11", "1 5 9", ["m11", "min11", "-11", "minor11", "minoreleventh"]),
  Q("maj11", "maj11", "major eleventh", "upper", "1 3 5 7 9 11", "1 3 5 9", ["maj11", "M11", "Δ11", "major11"]),
  Q("mmaj11", "m(maj11)", "minor major eleventh", "upper", "1 b3 5 7 9 11", "1 5 9", ["mmaj11", "m(maj11)", "mM11", "minmaj11"]),
  Q("9#11", "9♯11", "ninth sharp eleven", "upper", "1 3 5 b7 9 #11", "1 5 9", ["9#11", "9+11", "7#11", "lydiandominant"]),
  Q("13", "13", "thirteenth", "upper", "1 3 5 b7 9 13", "1 5 9", ["13", "dom13", "thirteenth", "dominant13"], ["11"]),
  Q("maj13", "maj13", "major thirteenth", "upper", "1 3 5 7 9 13", "1 5 9", ["maj13", "M13", "Δ13", "major13"], ["11"]),
  Q("m9b5", "m9♭5", "minor ninth flat five", "altered", "1 b3 b5 b7 9", "1", ["m9b5", "ø9", "-9b5"]),
  Q("7b9#5", "7♯5♭9", "seventh sharp five flat nine", "altered", "1 3 #5 b7 b9", "1", ["7b9#5", "7#5b9", "+7b9", "aug7b9"]),
  Q("13b9", "13♭9", "thirteenth flat nine", "altered", "1 3 5 b7 b9 13", "1 5", ["13b9", "13-9"]),
  Q("b13b9", "7♭9♭13", "seventh flat nine flat thirteen", "altered", "1 3 5 b7 b9 b13", "1 5", ["b13b9", "7b9b13", "7b13b9"]),
  Q("b13#9", "7♯9♭13", "seventh sharp nine flat thirteen", "altered", "1 3 5 b7 #9 b13", "1 5", ["b13#9", "7#9b13", "7b13#9"]),
];
export const qualityById = (id) => QUALITIES.find((q) => q.id === id) ?? null;

// Degree → semitones above the root, and its letter distance (for spelling).
const DEG = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 14, 11: 17, 13: 21 };
export function degreeSemis(d) {
  const m = /^(bb|b|#)?(\d+)$/.exec(d);
  const shift = m[1] === "bb" ? -2 : m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0;
  return DEG[m[2]] + shift;
}
const degreeSteps = (d) => (Number(/\d+/.exec(d)[0]) - 1) % 7;
/** Pitch classes of a chord type on a root pc. */
export const chordPcs = (rootPc, q) => q.degrees.map((d) => (rootPc + degreeSemis(d)) % 12);
/** A degree for display: "b3" → "♭3", "bb7" → "𝄫7". */
export const prettyDegree = (d) => d.replace(/^bb/, "𝄫").replace(/^b/, "♭").replace(/^#/, "♯");

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC = { "-2": "𝄫", "-1": "♭", 0: "", 1: "♯", 2: "𝄪" };
/** "E♭" → { letter: "E", acc: -1 }. Accepts ♯/♭ or #/b. */
export function parseNoteName(s) {
  const m = /^([A-Ga-g])(##|bb|#|b|♯|♭|𝄪|𝄫)?$/.exec(s);
  if (!m) return null;
  const a = m[2] ?? "";
  const acc = { "": 0, "#": 1, "♯": 1, b: -1, "♭": -1, "##": 2, "𝄪": 2, bb: -2, "𝄫": -2 }[a];
  const letter = m[1].toUpperCase();
  return { letter, acc, pc: (LETTER_PC[letter] + acc + 12) % 12 };
}
export const noteName = (letter, acc) => letter + ACC[acc];

/** Spell every tone of a chord from a spelled root ("E♭" + m7 → E♭ G♭ B♭ D♭). */
export function spellChord(rootName, q) {
  const r = parseNoteName(rootName);
  const li = LETTERS.indexOf(r.letter);
  return q.degrees.map((d) => {
    const letter = LETTERS[(li + degreeSteps(d)) % 7];
    const target = (r.pc + degreeSemis(d)) % 12;
    let acc = ((target - LETTER_PC[letter]) % 12 + 12) % 12;
    if (acc > 6) acc -= 12;
    return { degree: d, pc: target, name: noteName(letter, Math.max(-2, Math.min(2, acc))) };
  });
}
/** Note name for a pitch class as heard in a chord: the chord's own spelling if it's a chord tone. */
export function nameInChord(pc, spelled) {
  const hit = spelled.find((n) => n.pc === pc);
  return hit ? hit.name : KEYS[pc].name;
}

/** "C" + m7 → "Cm7"; a slash chord carries its bass. */
export const chordSymbol = (rootName, q, bass = null) => rootName + q.sym + (bass ? `/${bass}` : "");
export const chordLongName = (rootName, q, bass = null) =>
  q.id === "major" ? `${rootName} major${bass ? ` over ${bass}` : ""}`
  : q.id === "5" ? `${rootName} power chord`
  : `${rootName} ${q.name}${bass ? ` over ${bass}` : ""}`;

// --- reading what someone typed ----------------------------------------------
const squash = (s) => s.replace(/[\s()_]/g, "").replace(/♯/g, "#").replace(/♭/g, "b").replace(/–|—/g, "-").replace(/maj(or)?/gi, (m) => m.toLowerCase());
const ALIAS = new Map(); // exact alias (case kept for M vs m) → quality
const ALIAS_CI = new Map(); // lowercased → quality (only when unambiguous)
for (const q of QUALITIES) for (const a of q.aliases) {
  const k = squash(a);
  ALIAS.set(k, q);
  const lc = k.toLowerCase();
  if (!ALIAS_CI.has(lc)) ALIAS_CI.set(lc, q);
}
for (const k of ["m", "m6", "m7", "m9", "m11", "m69", "m7b5"]) ALIAS_CI.set(k, qualityById(k === "m" ? "minor" : k)); // lower-case m is always minor
/** "m7" → quality, case-aware ("M7" is maj7, "m7" minor 7). null when unknown. */
export function readQuality(text) {
  const k = squash(text);
  return ALIAS.get(k) ?? ALIAS_CI.get(k.toLowerCase()) ?? null;
}

/**
 * Parse a chord symbol: "F#m7b5", "Bbmaj9", "C-7", "Am/G", "Db".
 * → { root: {letter, acc, pc, name}, rest, quality|null, bass|null } or null when there's no root.
 */
export function parseSymbol(input) {
  const s = input.trim().replace(/♯/g, "#").replace(/♭/g, "b");
  const m = /^([A-Ga-g])(#|b)?(.*)$/.exec(s); // a "b" right after the letter is always a flat (Bb, Ebm7)
  if (!m) return null;
  let rest = m[3].trim();
  let bass = null;
  const slash = /^(.*)\/([A-Ga-g][#b]?)$/.exec(rest);
  if (slash) { rest = slash[1]; bass = parseNoteName(slash[2]); }
  const root = parseNoteName(m[1] + (m[2] ?? ""));
  // Written-out words: "C minor seventh", "A sharp minor"
  const words = rest.replace(/^\s*(sharp)\b/i, () => { root.acc += 1; root.pc = (root.pc + 1) % 12; return ""; })
    .replace(/^\s*(flat)\b/i, () => { root.acc -= 1; root.pc = (root.pc + 11) % 12; return ""; }).trim();
  root.name = noteName(root.letter, root.acc);
  return { root, rest: words, quality: readQuality(words), bass: bass ? { ...bass, name: noteName(bass.letter, bass.acc) } : null };
}

/**
 * Search the catalogue. `chords` is the instrument's list of { key, q, bass? } (bass = key-relative slash).
 * Returns [{ chord, score, rootName }] best first. Empty query → [].
 *  - a full symbol ("Am7") → that chord first, then its relatives in the same key (prefix matches)
 *  - a type alone ("m7", "minor seventh") → that type in all twelve keys
 *  - a root alone ("Db") → every chord in that key, spelled as typed
 *  - a word ("diminished") → every type whose name holds it
 */
export function search(chords, input) {
  const text = input.trim();
  if (!text) return [];
  const out = [];
  const add = (chord, score, rootName) => out.push({ chord, score, rootName });
  const sym = parseSymbol(text);
  const keyOf = (pc) => KEYS[pc];
  if (sym) {
    const inKey = chords.filter((c) => keyById(c.key).pc === sym.root.pc);
    const typed = sym.root.name;
    const rest = squash(sym.rest);
    for (const c of inKey) {
      if (sym.bass) {
        if (c.bass && c.bass.pc === sym.bass.pc && (sym.quality ? c.q === sym.quality : !rest || c.q.id === "major")) add(c, 100, typed);
        continue;
      }
      if (c.bass) { if (!rest) add(c, 10, typed); continue; }
      if (sym.quality && c.q === sym.quality) add(c, 100, typed);
      else if (!rest) add(c, c.q.id === "major" ? 90 : 50 - QUALITIES.indexOf(c.q) / 100, typed);
      else if (squash(c.q.sym).startsWith(rest) || c.q.aliases.some((a) => squash(a).startsWith(rest) && squash(a) !== "")) add(c, 40 - QUALITIES.indexOf(c.q) / 100, typed);
    }
    if (out.length) return out.sort((a, b) => b.score - a.score);
  }
  // no root: a chord type first, then every type whose name holds the words ("diminished" → dim, dim7, half-diminished)
  const q = readQuality(text);
  const words = text.toLowerCase().replace(/[^a-z0-9#♯♭ -]/g, " ").split(/\s+/).filter(Boolean);
  for (const c of chords) {
    if (c.bass) continue;
    const kname = keyOf(keyById(c.key).pc).name;
    if (q && c.q === q) add(c, 80 - keyById(c.key).pc / 100, kname);
    else if (words.length && words.every((w) => c.q.name.includes(w) || squash(c.q.sym).toLowerCase() === w)) add(c, 30 - QUALITIES.indexOf(c.q) / 100 - keyById(c.key).pc / 10000, kname);
  }
  return out.sort((a, b) => b.score - a.score);
}
