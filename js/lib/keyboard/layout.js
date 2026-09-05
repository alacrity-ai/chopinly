// Keyboard layout math (WSHED-73). Pure — node-testable. MIDI 60 = C4.
// Positions are in "white-key units" from the keyboard's left edge, so the
// view scales them with one CSS variable (--kb-whites).

import { parsePitch } from "../music.js";

const BLACK = new Set([1, 3, 6, 8, 10]);
/** A MIDI number, or a name like "C4" / "F#3" / "Bb2" → MIDI. */
export const toMidi = (x) => (typeof x === "number" ? x : parsePitch(x).midi);
export const isBlack = (midi) => BLACK.has(((midi % 12) + 12) % 12);
export const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
/** "C4", "F♯3"… (octave omitted with { octave: false }). */
export const noteName = (midi, { octave = true } = {}) => NAMES[((midi % 12) + 12) % 12] + (octave ? Math.floor(midi / 12) - 1 : "");

// A black key sits on the boundary between its two whites, nudged the way a
// real keyboard nudges them (C♯ and F♯ lean left, D♯ and A♯ lean right).
const BLACK_W = 0.6;
const BLACK_SHIFT = { 1: -0.06, 3: 0.06, 6: -0.09, 8: 0, 10: 0.09 };

/** Lowest MIDI ≥ lo / highest ≤ hi that is a white key. */
export const whiteFloor = (midi) => (isBlack(midi) ? midi - 1 : midi);
export const whiteCeil = (midi) => (isBlack(midi) ? midi + 1 : midi);

/**
 * All keys from `from` to `to` inclusive (both snapped outward to white keys).
 * → { from, to, whites, keys: [{ midi, black, name, x, w }] } with x/w in white-key units.
 */
export function layoutKeys(from, to) {
  from = whiteFloor(toMidi(from)); to = whiteCeil(toMidi(to));
  if (to < from) [from, to] = [to, from];
  const keys = [];
  let wx = 0;
  for (let m = from; m <= to; m++) {
    if (isBlack(m)) {
      const centre = wx + BLACK_SHIFT[m % 12];
      keys.push({ midi: m, black: true, name: noteName(m), x: centre - BLACK_W / 2, w: BLACK_W });
    } else {
      keys.push({ midi: m, black: false, name: noteName(m), x: wx, w: 1 });
      wx++;
    }
  }
  return { from, to, whites: wx, keys };
}

/** How many octaves fit a width with touchable white keys (≥ minWhite px), 1–4.
 *  25 px is the floor: a phone's 388 px of content gets two octaves. */
export function fitOctaves(width, minWhite = 25) {
  return Math.max(1, Math.min(4, Math.floor(width / (7 * minWhite))));
}

/** The octave count to start a player on: fat keys (≥ 40 px) — one on a phone, three on a desk. */
export const autoOctaves = (width) => fitOctaves(width, 40);

/**
 * The biggest keyboard that fits a box: white-key width and height÷width ratio
 * for `whites` keys in availW × availH px. Fills the width; when the box is
 * short (a phone on its side) the keys get stubbier, down to `minRatio`, and
 * then narrower — never taller or wider than the box.
 */
export function fitBox(whites, availW, availH, { maxWhite = 64, maxRatio = 5.2, minRatio = 3.2 } = {}) {
  let white = Math.max(8, Math.min(availW / whites, maxWhite));
  let ratio = Math.min(maxRatio, availH / white);
  if (ratio < minRatio) { ratio = minRatio; white = Math.max(8, availH / minRatio); }
  return { white, ratio };
}

/** The range for `octaves` octaves starting at the C `base`, top C included. */
export const rangeFor = (base, octaves) => ({ from: toMidi(base), to: toMidi(base) + 12 * octaves });

export const LOWEST_C = 24;  // C1
export const HIGHEST_C = 108; // C8
/** Clamp a base C so the whole range stays on the 88-key piano. */
export const clampBase = (base, octaves) => Math.max(LOWEST_C, Math.min(HIGHEST_C - 12 * octaves, base - (base % 12)));

/** Velocity from where on the key you strike (0 = top, 1 = bottom edge): 0.55–1. */
export const velocityAt = (yFrac) => 0.55 + 0.45 * Math.max(0, Math.min(1, yFrac));

// The usual DAW mapping: the home row is the white keys from the range's
// bottom C, the row above is the black keys.
export const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16, "'": 17 };
