// Shared pitch/key math: pitch parsing, key signatures, clef geometry,
// tonic triads. Pure — node-testable. Staff geometry speaks in "steps":
// half-space increments from the bottom staff line (line1=0 … line5=8).

const LETTER_STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const LETTER_SEMIS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const ACC_CHAR = { "-1": "♭", 0: "", 1: "♯" };

/** "F#4" | "Bb3" | "C5" → { letter, acc, octave, midi, diatonic } */
export function parsePitch(str) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(str);
  if (!m) throw new Error(`bad pitch: ${str}`);
  const letter = m[1];
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const octave = Number(m[3]);
  return {
    letter, acc, octave,
    midi: (octave + 1) * 12 + LETTER_SEMIS[letter] + acc,
    diatonic: octave * 7 + LETTER_STEP[letter],
  };
}

// --- keys -------------------------------------------------------------------

const MAJOR_FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };
const MINOR_FIFTHS = { A: 0, E: 1, B: 2, "F#": 3, "C#": 4, "G#": 5, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6 };

export function keyFifths(key, mode = "major") {
  const table = mode === "minor" ? MINOR_FIFTHS : MAJOR_FIFTHS;
  const f = table[key];
  if (f === undefined) throw new Error(`unknown ${mode} key: ${key}`);
  return f;
}

export const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
export const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

/** fifths → Map(letter → +1|-1) of the key signature's alterations */
export function keyAlterations(fifths) {
  const map = new Map();
  if (fifths > 0) for (let i = 0; i < fifths; i++) map.set(SHARP_ORDER[i], 1);
  if (fifths < 0) for (let i = 0; i < -fifths; i++) map.set(FLAT_ORDER[i], -1);
  return map;
}

// --- clefs ------------------------------------------------------------------

// line: which staff line (1..5, bottom-up) the clef glyph anchors on.
// bottom: the pitch sitting on line 1 (step 0), from which all steps derive.
export const CLEFS = {
  treble:  { glyph: "gClef", line: 2, bottom: "E4" },
  soprano: { glyph: "cClef", line: 1, bottom: "C4" },
  alto:    { glyph: "cClef", line: 3, bottom: "F3" },
  bass:    { glyph: "fClef", line: 4, bottom: "G2" },
};

/** Vertical step (half-spaces above line 1) of a pitch on a given clef. */
export function staffStep(pitch, clef) {
  const p = typeof pitch === "string" ? parsePitch(pitch) : pitch;
  return p.diatonic - parsePitch(CLEFS[clef].bottom).diatonic;
}

// Key-signature accidental placements (letter+octave per clef, standard
// engraving tables — see docs/STAFF_DESIGN.md §4).
const KEYSIG_OCTAVES = {
  treble:  { sharp: ["F5", "C5", "G5", "D5", "A4", "E5", "B4"], flat: ["B4", "E5", "A4", "D5", "G4", "C5", "F4"] },
  bass:    { sharp: ["F3", "C3", "G3", "D3", "A2", "E3", "B2"], flat: ["B2", "E3", "A2", "D3", "G2", "C3", "F2"] },
  alto:    { sharp: ["F4", "C4", "G4", "D4", "A3", "E4", "B3"], flat: ["B3", "E4", "A3", "D4", "G3", "C4", "F3"] },
  soprano: { sharp: ["F4", "C5", "G4", "D5", "A4", "E4", "B4"], flat: ["B4", "E4", "A4", "D4", "G4", "C4", "F4"] },
};

/** fifths + clef → [{ acc: 1|-1, step }] in drawing order */
export function keySignatureGlyphs(fifths, clef) {
  if (!fifths) return [];
  const kind = fifths > 0 ? "sharp" : "flat";
  return KEYSIG_OCTAVES[clef][kind].slice(0, Math.abs(fifths)).map((p) => ({
    acc: fifths > 0 ? 1 : -1,
    step: staffStep(p, clef),
  }));
}

// --- misc -------------------------------------------------------------------

/** Tonic triad midi notes (root positioned just below `nearMidi`). */
export function tonicTriad(key, mode, nearMidi) {
  let root = parsePitch(`${key}4`).midi;
  while (root > nearMidi - 4) root -= 12;
  while (root < nearMidi - 16) root += 12;
  return [root, root + (mode === "minor" ? 3 : 4), root + 7];
}

export const NOTE_NAMES_SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export function midiToFreq(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}
