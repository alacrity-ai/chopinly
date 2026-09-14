// Grand-staff engraver (docs/COMPOSE_DESIGN.md §6): composition → systems →
// coordinates in S (one staff space). Both staves of a bar share one set of
// columns — the union of their onsets — so they align tick for tick. Pure —
// node-testable; render.js turns the result into SVG.
import { keyAlterations, keySignatureGlyphs, CLEFS, staffStep } from "../music.js";
import { ticks, capacity, groupSize } from "./ticks.js";
import { timeAt, keyAt, clefAt } from "./model.js";
import { onsets } from "./engine.js";

export const STAFF_GAP = 8;      // S between the treble's bottom line and the bass's top line
export const SYS_GAP = 10;       // S between systems
export const TOP_PAD = 6, BOTTOM_PAD = 4;
export const BLOCK_H = 4 + STAFF_GAP + 4; // one grand-staff block
export const SYS_H = BLOCK_H + SYS_GAP;
const MAX_BARS_PER_SYSTEM = 6;
const STEM_LEN = 3.5, BEAM_T = 0.5, BEAM_GAP = 0.75;
const HEAD_W = { dblWhole: 2.1, whole: 1.7, half: 1.18, black: 1.18 };
const LEFT = 1.6; // S: brace + margin before the leading symbols
const MIN_BAR = 8; // S: an empty bar

export const headKind = (base) => (base === 0 ? "dblWhole" : base === 1 ? "whole" : base === 2 ? "half" : "black");
const hasStem = (base) => base >= 2;
export const beamCount = (base) => (base >= 8 ? Math.round(Math.log2(base / 4)) : 0);
/** Ideal width of a column whose shortest voice moves after `dur` ticks. */
const colWidth = (dur) => Math.max(1.6, 2.5 + 1.05 * Math.log2(dur / (ticks({ base: 16 }))));

/**
 * Full layout. `width` in px, `unit` = S in px. Returns
 * { S, width, height, systems, drawn, beams, ties, hit } — every coordinate in S.
 */
export function layoutComposition(doc, { unit: S = 12, width = 800 } = {}) {
  const nStaves = doc.parts[0].staves;
  const widthS = width / S;

  // -- per bar: columns (union of onsets across staves), leading symbols, ideal width --
  const bars = doc.measures.map((m, bi) => {
    const time = timeAt(doc, bi), key = keyAt(doc, bi), cap = capacity(time);
    const clefs = Array.from({ length: nStaves }, (_, si) => clefAt(doc, bi, si));
    const onsetMap = new Map();
    m.staves.forEach((s, si) => {
      for (const o of onsets(s.voices[0])) {
        if (!onsetMap.has(o.start)) onsetMap.set(o.start, { ticks: o.start, evs: [] });
        onsetMap.get(o.start).evs.push({ staff: si, ev: o.ev, len: o.len });
      }
    });
    const cols = [...onsetMap.values()].sort((a, b) => a.ticks - b.ticks);
    const allRest = m.staves.map((s) => s.voices[0].every((e) => e.kind === "rest"));
    cols.forEach((c, i) => {
      const next = cols[i + 1]?.ticks ?? cap;
      c.w = colWidth(next - c.ticks);
      c.accPad = 0; c.dotPad = 0; // set by the accidental pass below
    });
    return { index: bi, time, key, clefs, cap, cols, allRest, showTime: bi === 0 || !!m.time, showKey: !!m.key, showClef: !!m.clefs, m };
  });

  // -- accidentals + pads (per bar, per staff: key alterations, then a memory that resets at the barline) --
  for (const b of bars) {
    const keyAlt = keyAlterations(b.key.fifths);
    const memory = Array.from({ length: nStaves }, () => new Map());
    for (const c of b.cols) {
      let acc = 0, dot = 0;
      for (const x of c.evs) {
        if (x.ev.dur.dots) dot = 1;
        if (x.ev.kind !== "note") continue;
        x.accs = x.ev.pitches.map((p) => {
          const k = p.step + p.octave, mem = memory[x.staff];
          const eff = mem.has(k) ? mem.get(k) : (keyAlt.get(p.step) ?? 0);
          const show = p.acc === "show" ? true : p.acc === "hide" ? false : p.alter !== eff;
          if (show || p.acc === "show") mem.set(k, p.alter);
          return show ? p.alter : null;
        });
        if (x.accs.some((a) => a !== null)) acc = 1;
      }
      c.accPad = acc ? 1.4 : 0; c.dotPad = dot ? 0.9 : 0;
    }
  }

  const keysigW = (b, si) => keySignatureGlyphs(b.key.fifths, b.clefs[si]).length;
  const leadingW = (b, first) => {
    const clef = first || b.showClef ? 3.4 : 0;
    const ks = first || b.showKey ? Math.max(...b.clefs.map((_, si) => keysigW(b, si))) * 1.15 + (Math.max(...b.clefs.map((_, si) => keysigW(b, si))) ? 0.8 : 0) : 0;
    const ts = b.showTime ? 3.0 : 0;
    return clef + ks + ts + (clef || ks || ts ? 0.6 : 0);
  };
  const bodyW = (b) => Math.max(MIN_BAR, 1.0 + b.cols.reduce((n, c) => n + c.w + c.accPad + c.dotPad, 0) + 1.0);

  // -- pack bars into systems --
  const systems = [];
  let i = 0;
  while (i < bars.length) {
    const sys = { bars: [], first: systems.length === 0 };
    let sum = 0;
    const avail = widthS - LEFT - 0.5;
    while (i < bars.length && sys.bars.length < MAX_BARS_PER_SYSTEM) {
      const b = bars[i];
      const w = leadingW(b, sys.bars.length === 0) + bodyW(b);
      if (sys.bars.length && sum + w > avail) break;
      sys.bars.push(b); sum += w; i++;
    }
    const lead = sys.bars.reduce((n, b, k) => n + leadingW(b, k === 0), 0);
    const body = sum - lead;
    sys.scale = Math.min((avail - lead) / body, i >= bars.length ? 1.25 : 10);
    systems.push(sys);
  }

  // -- coordinates --
  const drawn = [], beams = [], ties = [];
  const hit = { systems: [] };
  systems.forEach((sys, si) => {
    const sysTop = TOP_PAD + si * SYS_H;
    const staffTop = (st) => sysTop + st * (4 + STAFF_GAP);
    const yOfStep = (st, step) => staffTop(st) + (8 - step) / 2;
    sys.top = sysTop; sys.staffTop = Array.from({ length: nStaves }, (_, st) => staffTop(st));
    sys.leading = [];
    sys.barlines = [];
    const hsys = { top: sysTop - 3, bottom: sysTop + BLOCK_H + 3, staves: sys.staffTop.map((t) => ({ topY: t })), bars: [] };
    let cursor = LEFT;
    sys.bars.forEach((b, k) => {
      const first = k === 0;
      const barX0 = cursor;
      // leading symbols
      const lead = { x: cursor, clef: first || b.showClef, key: first || b.showKey, time: b.showTime, staves: [] };
      for (let st = 0; st < nStaves; st++) {
        const clef = b.clefs[st], ks = keySignatureGlyphs(b.key.fifths, clef);
        lead.staves.push({ clef: CLEFS[clef], clefName: clef, keysig: ks, topY: staffTop(st) });
      }
      const lw = leadingW(b, first);
      lead.w = lw;
      lead.keyX = cursor + (lead.clef ? 3.4 : 0);
      lead.timeX = lead.keyX + (lead.key ? Math.max(...b.clefs.map((_, s2) => keysigW(b, s2))) * 1.15 + (Math.max(...b.clefs.map((_, s2) => keysigW(b, s2))) ? 0.8 : 0) : 0);
      sys.leading.push(lead);
      cursor += lw;
      const bodyStart = cursor;
      const bw = bodyW(b) * sys.scale;
      const hbar = { index: b.index, x0: barX0, x1: bodyStart + bw, bodyX0: bodyStart, cols: [], cap: b.cap };
      let off = 1.0;
      for (const c of b.cols) {
        const x = bodyStart + (off + c.accPad) * sys.scale;
        c.x = x;
        hbar.cols.push({ ticks: c.ticks, x });
        for (const ev of c.evs) {
          const st = ev.staff;
          if (ev.ev.kind === "rest") {
            if (b.allRest[st]) { if (c.ticks === 0) drawn.push({ id: ev.ev.id, bar: b.index, staff: st, system: si, rest: true, whole: true, base: 1, dots: 0, x: (bodyStart + hbar.x1) / 2 - 0.85, y: yOfStep(st, 6) }); continue; }
            const base = ev.ev.dur.base;
            drawn.push({ id: ev.ev.id, bar: b.index, staff: st, system: si, rest: true, base, dots: ev.ev.dur.dots, x, y: yOfStep(st, base <= 1 ? 6 : 4) });
            continue;
          }
          const base = ev.ev.dur.base, kind = headKind(base), headW = HEAD_W[kind];
          const clef = b.clefs[st];
          const steps = ev.ev.pitches.map((p) => staffStep({ letter: p.step, acc: 0, octave: p.octave, diatonic: p.octave * 7 + "CDEFGAB".indexOf(p.step) }, clef));
          const far = steps.reduce((m, s2) => (Math.abs(s2 - 4) > Math.abs(m - 4) ? s2 : m), steps[0]);
          const stem = hasStem(base) ? (far >= 4 ? "down" : "up") : null;
          const d = { id: ev.ev.id, bar: b.index, staff: st, system: si, rest: false, base, dots: ev.ev.dur.dots, kind, headW, x, stem, ticks: c.ticks, group: Math.floor(c.ticks / groupSize(b.time)), heads: [], ledgers: [] };
          // heads: sorted by step; seconds flip to the other side of the stem
          const order = steps.map((s2, pi) => ({ step: s2, pi })).sort((a, b2) => a.step - b2.step);
          const walk = stem === "down" ? [...order].reverse() : order;
          let prevStep = null, prevFlip = false;
          for (const h of walk) {
            const flip = prevStep !== null && Math.abs(h.step - prevStep) === 1 && !prevFlip;
            const hx = flip ? (stem === "down" ? x - headW : x + headW) : x;
            d.heads.push({ pi: h.pi, step: h.step, x: hx, y: yOfStep(st, h.step), acc: ev.accs?.[h.pi] ?? null, flip });
            prevStep = h.step; prevFlip = flip;
          }
          d.heads.sort((a, b2) => a.step - b2.step);
          for (const h of d.heads) { for (let s2 = -2; s2 >= h.step; s2 -= 2) d.ledgers.push({ x: h.x, y: yOfStep(st, s2) }); for (let s2 = 10; s2 <= h.step; s2 += 2) d.ledgers.push({ x: h.x, y: yOfStep(st, s2) }); }
          d.topY = d.heads[d.heads.length - 1].y; d.botY = d.heads[0].y;
          if (stem) {
            const outer = stem === "up" ? d.heads[d.heads.length - 1] : d.heads[0];
            const len = Math.max(STEM_LEN, Math.abs(outer.step - 4) / 2);
            d.stemX = stem === "up" ? x + headW - 0.07 : x + 0.07;
            d.stemTipY = stem === "up" ? outer.y - len : outer.y + len;
            d.stemFromY = stem === "up" ? d.botY : d.topY;
          }
          d.beams = beamCount(base);
          drawn.push(d);
        }
        off += c.w + c.accPad + c.dotPad;
      }
      cursor = hbar.x1;
      hsys.bars.push(hbar);
      sys.barlines.push({ x: cursor, final: b.index === bars.length - 1 });
    });
    hit.systems.push(hsys);
  });

  // -- beams: runs of stemmed eighths-or-shorter in one staff, one voice, one beat group, no rests between --
  const byStaffSys = new Map();
  for (const d of drawn) {
    if (d.rest) continue;
    const k = `${d.system}:${d.staff}:${d.bar}`;
    if (!byStaffSys.has(k)) byStaffSys.set(k, []);
    byStaffSys.get(k).push(d);
  }
  for (const list of byStaffSys.values()) {
    list.sort((a, b) => a.ticks - b.ticks);
    let run = [];
    const flush = () => { if (run.length >= 2) makeBeam(run, beams); run = []; };
    for (let k = 0; k < list.length; k++) {
      const d = list[k], prev = list[k - 1];
      const contiguous = prev && prev.group === d.group && !restBetween(drawn, prev, d);
      if (d.beams >= 1 && (run.length === 0 || contiguous)) run.push(d);
      else { flush(); if (d.beams >= 1) run.push(d); }
    }
    flush();
  }

  const height = (TOP_PAD + systems.length * SYS_H - SYS_GAP + BOTTOM_PAD) * S;
  return { S, unit: S, width, height, systems, drawn, beams, ties, hit, nStaves };
}

function restBetween(drawn, a, b) {
  return drawn.some((d) => d.rest && d.bar === a.bar && d.staff === a.staff && !d.whole && d.x > a.x && d.x < b.x);
}

function makeBeam(run, beams) {
  const avg = run.reduce((n, d) => n + (d.heads[0].step + d.heads[d.heads.length - 1].step) / 2, 0) / run.length;
  const dir = avg >= 4 ? "down" : "up";
  for (const d of run) {
    d.stem = dir;
    d.stemX = dir === "up" ? d.x + d.headW - 0.07 : d.x + 0.07;
    d.stemFromY = dir === "up" ? d.botY : d.topY;
  }
  const outer = (d) => (dir === "up" ? d.topY : d.botY);
  const a = run[0], b = run[run.length - 1];
  let y1 = dir === "up" ? outer(a) - STEM_LEN : outer(a) + STEM_LEN;
  let y2 = dir === "up" ? outer(b) - STEM_LEN : outer(b) + STEM_LEN;
  const dy = Math.max(-1, Math.min(1, y2 - y1));
  const mid = (y1 + y2) / 2; y1 = mid - dy / 2; y2 = mid + dy / 2;
  const lineY = (x) => y1 + ((x - a.stemX) / Math.max(1e-6, b.stemX - a.stemX)) * (y2 - y1);
  // every stem at least 2.75S long: shift the whole beam away from the heads
  let shift = 0;
  for (const d of run) { const need = dir === "up" ? (outer(d) - 2.75) - lineY(d.stemX) : lineY(d.stemX) - (outer(d) + 2.75); if (need < 0) shift = Math.max(shift, -need); }
  if (dir === "up") { y1 -= shift; y2 -= shift; } else { y1 += shift; y2 += shift; }
  for (const d of run) { d.stemTipY = lineY(d.stemX); d.beamed = true; }
  const levels = Math.max(...run.map((d) => d.beams));
  const sgn = dir === "up" ? 1 : -1; // secondary beams sit toward the heads
  for (let lvl = 1; lvl <= levels; lvl++) {
    const off = (lvl - 1) * (BEAM_T + BEAM_GAP) * sgn;
    if (lvl === 1) { beams.push({ x1: a.stemX, y1, x2: b.stemX, y2, dir, t: BEAM_T }); continue; }
    let k = 0;
    while (k < run.length) {
      if (run[k].beams < lvl) { k++; continue; }
      let j = k;
      while (j + 1 < run.length && run[j + 1].beams >= lvl) j++;
      if (j > k) { const a2 = run[k], b2 = run[j]; beams.push({ x1: a2.stemX, y1: lineY(a2.stemX) + off, x2: b2.stemX, y2: lineY(b2.stemX) + off, dir, t: BEAM_T }); }
      else { const d = run[k], toRight = k === 0, x2 = toRight ? d.stemX + 1.2 : d.stemX - 1.2; beams.push({ x1: d.stemX, y1: lineY(d.stemX) + off, x2, y2: lineY(x2) + off, dir, t: BEAM_T }); }
      k = j + 1;
    }
  }
}
