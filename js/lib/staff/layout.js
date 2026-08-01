// Staff layout: melody → measures → systems → coordinates (in staff-space
// units S). Pure — node-testable. See docs/STAFF_DESIGN.md §3–4.
import { parsePitch, keyFifths, keyAlterations, keySignatureGlyphs, staffStep, CLEFS } from "../music.js";

const MAX_MEASURES_PER_SYSTEM = 4;
const STEM_LEN = 3.5;            // S
const HEAD_W = { black: 1.18, half: 1.18, whole: 1.7 };

export function headKind(d) {
  return d >= 16 ? "whole" : d >= 8 ? "half" : "black";
}
const hasStem = (d) => d < 16;
const hasFlagOrBeam = (d) => d === 2 || d === 3;
const isDotted = (d) => d === 3 || d === 6 || d === 12;

function noteWidth(d) {
  return 2.5 + 1.05 * Math.log2(d);
}

/** Validate + split into measures of exact capacity; annotate parsed pitches. */
export function toMeasures(melody) {
  const capacity = melody.time[0] * (16 / melody.time[1]);
  const measures = [];
  let cur = { notes: [], fill: 0 };
  melody.notes.forEach((n, i) => {
    if (!n.r && !n.p) throw new Error(`${melody.id}: note ${i} has no pitch and is not a rest`);
    if (![2, 3, 4, 6, 8, 12, 16].includes(n.d)) throw new Error(`${melody.id}: note ${i} bad duration ${n.d}`);
    if (cur.fill + n.d > capacity) throw new Error(`${melody.id}: note ${i} crosses a barline (use a tie)`);
    cur.notes.push({ ...n, index: i, start: cur.fill, pitch: n.r ? null : parsePitch(n.p) });
    cur.fill += n.d;
    if (cur.fill === capacity) { measures.push(cur.notes); cur = { notes: [], fill: 0 }; }
  });
  if (cur.notes.length) throw new Error(`${melody.id}: final measure incomplete (${cur.fill}/${capacity})`);
  return measures;
}

/**
 * Full layout. Returns { S, width, height, systems, drawn } where `drawn`
 * is one entry per drawn note/rest carrying every coordinate render.js needs.
 */
export function layoutMelody(melody, { unit: S = 10, width = 640 } = {}) {
  const fifths = keyFifths(melody.key, melody.mode);
  const keyAlt = keyAlterations(fifths);
  const clef = melody.clef;
  const measures = toMeasures(melody);
  const beatUnits = 16 / melody.time[1];

  // -- per-measure: accidental logic + ideal widths --------------------------
  const measureInfos = measures.map((notes) => {
    const altered = new Map(); // "letter+octave" → acc, resets per measure
    let w = 2.0; // lead-in + pre-barline padding
    for (const n of notes) {
      n.dot = isDotted(n.d);
      n.accDrawn = null;
      if (!n.r) {
        const prev = melody.notes[n.index - 1];
        const tiedIn = prev && prev.tie && prev.p === n.p;
        const key0 = n.pitch.letter + n.pitch.octave;
        const eff = altered.has(key0) ? altered.get(key0) : (keyAlt.get(n.pitch.letter) ?? 0);
        if (n.pitch.acc !== eff && !tiedIn) {
          n.accDrawn = n.pitch.acc; // 0 renders as a natural
          altered.set(key0, n.pitch.acc);
        } else if (tiedIn) {
          altered.set(key0, n.pitch.acc);
        }
        n.step = staffStep(n.pitch, clef);
      }
      n.w = noteWidth(n.d) + (n.accDrawn !== null ? 1.4 : 0) + (n.dot ? 0.9 : 0);
      w += n.w;
    }
    return { notes, idealW: w };
  });

  // -- leading symbols -------------------------------------------------------
  const keysig = keySignatureGlyphs(fifths, clef);
  const leadingW = (first) => 1.0 + 3.4 + keysig.length * 1.15 + (keysig.length ? 0.8 : 0) + (first ? 3.0 : 0.6);

  // -- pack measures into systems -------------------------------------------
  const widthS = width / S;
  const systems = [];
  let i = 0;
  while (i < measureInfos.length) {
    const first = systems.length === 0;
    const avail = widthS - leadingW(first);
    const sys = { measures: [], first };
    let sum = 0;
    while (i < measureInfos.length && sys.measures.length < MAX_MEASURES_PER_SYSTEM) {
      const m = measureInfos[i];
      if (sys.measures.length && sum + m.idealW > avail) break;
      sys.measures.push(m);
      sum += m.idealW;
      i++;
    }
    sys.scale = Math.min(avail / sum, i >= measureInfos.length ? 1.25 : 10);
    systems.push(sys);
  }

  // -- coordinates -----------------------------------------------------------
  const TOP_PAD = 6, SYS_H = 15, BOTTOM_PAD = 3;
  const drawn = [];
  systems.forEach((sys, si) => {
    const topY = TOP_PAD + si * SYS_H;         // top staff line, in S
    const yOfStep = (step) => topY + (8 - step) / 2;
    sys.topY = topY;
    sys.leading = { clef: CLEFS[clef], keysig, x: 1.0, topY };
    let cursor = leadingW(sys.first);
    sys.barlines = [];
    for (const m of sys.measures) {
      let off = 1.0;
      for (const n of m.notes) {
        const x = cursor + (off + (n.accDrawn !== null ? 1.4 : 0)) * sys.scale;
        const d = {
          index: n.index, rest: n.r === true, dur: n.d, dot: n.dot,
          kind: n.r ? null : headKind(n.d), x, system: si,
          accDrawn: n.accDrawn, tie: n.tie === true,
          start: n.start, beat: Math.floor(n.start / beatUnits),
        };
        if (!n.r) {
          d.step = n.step;
          d.y = yOfStep(n.step);
          d.headW = HEAD_W[d.kind];
          d.stem = hasStem(n.d) ? (n.step >= 4 ? "down" : "up") : null;
          d.flagOrBeam = hasFlagOrBeam(n.d);
          // ledger lines: even steps outside 0..8
          d.ledgers = [];
          for (let s = -2; s >= n.step; s -= 2) d.ledgers.push(yOfStep(s));
          for (let s = 10; s <= n.step; s += 2) d.ledgers.push(yOfStep(s));
        } else {
          d.y = yOfStep(n.d >= 16 ? 6 : 4); // whole rest hangs line 4, others middle
        }
        drawn.push(d);
        off += n.w;
      }
      cursor += m.idealW * sys.scale;
      sys.barlines.push(cursor);
    }
  });

  // -- stems, beams ----------------------------------------------------------
  const beams = [];
  for (const d of drawn) {
    if (!d.stem) continue;
    const len = Math.max(STEM_LEN, Math.abs(d.step - 4) / 2); // reach middle line
    d.stemX = d.stem === "up" ? d.x + d.headW - 0.07 : d.x + 0.07;
    d.stemTipY = d.stem === "up" ? d.y - len : d.y + len;
  }
  // pairwise beams: consecutive 8ths, same measure beat, same system
  for (let k = 0; k < drawn.length - 1; k++) {
    const a = drawn[k], b = drawn[k + 1];
    if (a.dur === 2 && b.dur === 2 && !a.rest && !b.rest && a.system === b.system
        && b.index === a.index + 1 && a.beat === b.beat && a.start < b.start) {
      const dir = (a.step + b.step) / 2 >= 4 ? "down" : "up";
      for (const n of [a, b]) {
        n.stem = dir;
        n.stemX = dir === "up" ? n.x + n.headW - 0.07 : n.x + 0.07;
      }
      const len = STEM_LEN;
      let ya = dir === "up" ? a.y - len : a.y + len;
      let yb = dir === "up" ? b.y - len : b.y + len;
      const mid = (ya + yb) / 2, half = Math.min(Math.abs(ya - yb), 1.0) / 2 * Math.sign(yb - ya);
      ya = mid - half; yb = mid + half;
      // both stems must reach the beam
      a.stemTipY = dir === "up" ? Math.min(ya, a.y - 2.75) : Math.max(ya, a.y + 2.75);
      b.stemTipY = dir === "up" ? Math.min(yb, b.y - 2.75) : Math.max(yb, b.y + 2.75);
      a.beamed = b.beamed = true;
      beams.push({ x1: a.stemX, y1: a.stemTipY, x2: b.stemX, y2: b.stemTipY, dir });
      k++;
    }
  }

  // -- ties ------------------------------------------------------------------
  const ties = [];
  for (const d of drawn) {
    if (!d.tie || d.rest) continue;
    const next = drawn[d.index + 1];
    if (!next || next.rest) continue;
    const dirUp = d.stem !== "up"; // curve opposite the stem
    if (d.system === next.system) {
      ties.push({ x1: d.x + d.headW + 0.15, y1: d.y, x2: next.x - 0.15, y2: next.y, up: dirUp });
    } else {
      ties.push({ x1: d.x + d.headW + 0.15, y1: d.y, x2: d.x + d.headW + 2.2, y2: d.y, up: dirUp });
      ties.push({ x1: next.x - 2.2, y1: next.y, x2: next.x - 0.15, y2: next.y, up: dirUp });
    }
  }

  const height = (TOP_PAD + systems.length * SYS_H + BOTTOM_PAD - 4) * S;
  return { S, unit: S, width, height, systems, drawn, beams, ties, fifths };
}
