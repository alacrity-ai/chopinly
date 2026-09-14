// Grand-staff engraver (docs/COMPOSE_DESIGN.md §6, voices: docs/COMPOSE_VOICES_DESIGN.md §5):
// composition → systems → coordinates in S (one staff space). Both staves of a
// bar share one set of columns — the union of their onsets across every voice —
// so they align tick for tick. Pure — node-testable; render.js turns the result
// into SVG.
import { keyAlterations, keySignatureGlyphs, CLEFS, staffStep } from "../music.js";
import { ticks, capacity, groupSize } from "./ticks.js";
import { timeAt, keyAt, clefAt, evTicks } from "./model.js";
import { onsets, diatonicOf, nextEvent, slurEnd, expressionsOf, barStarts } from "./engine.js";
import { xOfTicks } from "./hit.js";

export const STAFF_GAP = 8;      // S between the treble's bottom line and the bass's top line
export const SYS_GAP = 10;       // S between systems
export const TOP_PAD = 6, BOTTOM_PAD = 4;
export const BLOCK_H = 4 + STAFF_GAP + 4; // one grand-staff block
export const SYS_H = BLOCK_H + SYS_GAP;
const MAX_BARS_PER_SYSTEM = 6;
const STEM_LEN = 3.5, BEAM_T = 0.5, BEAM_GAP = 0.75, MIN_STEM = 2.75;
const HEAD_W = { dblWhole: 2.1, whole: 1.7, half: 1.18, black: 1.18 };
const LEFT = 1.6; // S: brace + margin before the leading symbols
const MIN_BAR = 8; // S: an empty bar
/** Rest offsets in steps when a staff holds more than one voice in the bar: voice 1 high, 2 low, 3 higher, 4 lower. */
const REST_STEP = [2, -2, 4, -4];

export const headKind = (base) => (base === 0 ? "dblWhole" : base === 1 ? "whole" : base === 2 ? "half" : "black");
const hasStem = (base) => base >= 2;
export const beamCount = (base) => (base >= 8 ? Math.round(Math.log2(base / 4)) : 0);
/** Ideal width of a column whose shortest voice moves after `dur` ticks. */
const colWidth = (dur) => Math.max(1.6, 2.5 + 1.05 * Math.log2(dur / (ticks({ base: 16 }))));
/** Stem direction: by voice when the staff holds more than one in the bar (1 up, 2 down, 3 up, 4 down), else away from the middle line. */
export const stemFor = (vi, nVoices, farStep) => (nVoices > 1 ? (vi % 2 === 0 ? "up" : "down") : farStep >= 4 ? "down" : "up");
const stepsOf = (pitches, clef) => pitches.map((p) => staffStep({ letter: p.step, acc: 0, octave: p.octave, diatonic: p.octave * 7 + "CDEFGAB".indexOf(p.step) }, clef));

/**
 * Full layout. `width` in px, `unit` = S in px. Returns
 * { S, width, height, systems, drawn, beams, ties, hit } — every coordinate in S.
 */
export function layoutComposition(doc, { unit: S = 12, width = 800 } = {}) {
  const nStaves = doc.parts[0].staves;
  const widthS = width / S;

  // -- per bar: columns (union of onsets across staves and voices), leading symbols, ideal width --
  const bars = doc.measures.map((m, bi) => {
    const time = timeAt(doc, bi), key = keyAt(doc, bi), cap = capacity(time);
    const clefs = Array.from({ length: nStaves }, (_, si) => clefAt(doc, bi, si));
    const onsetMap = new Map();
    m.staves.forEach((s, si) => s.voices.forEach((v, vi) => {
      if (!v) return;
      for (const o of onsets(v)) {
        if (!onsetMap.has(o.start)) onsetMap.set(o.start, { ticks: o.start, evs: [] });
        onsetMap.get(o.start).evs.push({ staff: si, voice: vi, drawStaff: si + (o.ev.cross ?? 0), ev: o.ev, len: o.len, index: v.indexOf(o.ev) });
      }
    }));
    const cols = [...onsetMap.values()].sort((a, b) => a.ticks - b.ticks);
    for (const c of cols) c.evs.sort((a, b) => a.staff - b.staff || a.voice - b.voice);
    const nVoices = m.staves.map((s) => s.voices.filter(Boolean).length);
    const allRest = m.staves.map((s) => s.voices.map((v) => (v ? v.every((e) => e.kind === "rest") : null)));
    cols.forEach((c, i) => {
      const next = cols[i + 1]?.ticks ?? cap;
      c.w = colWidth(next - c.ticks);
      c.accPad = 0; c.dotPad = 0; c.collPad = 0; // set by the accidental / collision pass below
      c.clefPad = 0; c.clefs = [];  // clef changes drawn just before this column
    });
    // a clef change inside the bar draws before the first column on or after its beat, else at the bar's end
    const tailClefs = [];
    for (const ch of m.clefChanges ?? []) {
      const c = cols.find((x) => x.ticks >= ch.at);
      if (c) { c.clefs.push(ch); c.clefPad = 2.6; } else tailClefs.push(ch);
    }
    const tailPad = tailClefs.length ? 2.6 : 0;
    const clefFor = (st, t) => ((m.clefChanges ?? []).length ? clefAt(doc, bi, st, t) : clefs[st]);
    return { index: bi, time, key, clefs, clefFor, cap, cols, tailClefs, tailPad, allRest, nVoices, showTime: bi === 0 || !!m.time, showKey: !!m.key, showClef: !!m.clefs, m };
  });

  // -- accidentals, collisions + pads (per bar, per drawn staff: key alterations, then a memory that resets at the barline) --
  for (const b of bars) {
    const keyAlt = keyAlterations(b.key.fifths);
    const memory = Array.from({ length: nStaves }, () => new Map());
    for (const c of b.cols) {
      let acc = 0, dot = 0, arp = 0, coll = 0;
      const stacks = new Map(); // drawn staff → accidental columns shared by every voice's heads in this column
      const placed = new Map(); // drawn staff → notes already placed, for second / unison collisions between voices
      for (const x of c.evs) {
        if (x.ev.dur.dots) dot = 1;
        if (x.ev.kind !== "note") continue;
        if (x.ev.arp) arp = 1;
        const clef = b.clefFor(x.drawStaff, c.ticks);
        x.steps = stepsOf(x.ev.pitches, clef);
        const far = x.steps.reduce((m, s2) => (Math.abs(s2 - 4) > Math.abs(m - 4) ? s2 : m), x.steps[0]);
        x.stem = hasStem(x.ev.dur.base) ? (x.ev.cross ? (x.ev.cross < 0 ? "down" : "up") : stemFor(x.voice, b.nVoices[x.staff], far)) : null; // a crossed note's stem points home
        x.stemForced = b.nVoices[x.staff] > 1 || !!x.ev.cross;
        x.accs = x.ev.pitches.map((p) => {
          const k = p.step + p.octave, mem = memory[x.drawStaff];
          const eff = mem.has(k) ? mem.get(k) : (keyAlt.get(p.step) ?? 0);
          const tiedIn = p.tie === "stop" || p.tie === "both";
          const show = tiedIn ? false : p.acc === "show" ? true : p.acc === "hide" ? false : p.alter !== eff;
          if (show || tiedIn || p.acc === "show") mem.set(k, p.alter);
          return show ? p.alter : null;
        });
        // stack: top down, each accidental takes the first column with nothing within six steps of it — one stack per drawn staff, every voice's heads in it
        const cols = stacks.get(x.drawStaff) ?? [];
        stacks.set(x.drawStaff, cols);
        x.accCol = x.ev.pitches.map(() => 0);
        const order = x.ev.pitches.map((p, pi) => ({ pi, dia: diatonicOf(p) })).sort((a, b2) => b2.dia - a.dia);
        for (const o of order) {
          if (x.accs[o.pi] === null) continue;
          let col = 0;
          while ((cols[col] ?? []).some((dia) => Math.abs(dia - o.dia) < 6)) col++;
          (cols[col] ??= []).push(o.dia); x.accCol[o.pi] = col;
        }
        acc = Math.max(acc, cols.length);
        // collisions: a second voice whose head sits within a second of (or on) a placed voice's head moves right of that voice's stem;
        // a unison of one pitch each, the same value, stems opposite, shares the head (two stems)
        const headW = HEAD_W[headKind(x.ev.dur.base)];
        x.dx = 0; x.shared = false;
        const others = placed.get(x.drawStaff) ?? [];
        for (const o of others) {
          const near = x.steps.some((s1) => o.steps.some((s2) => Math.abs(s1 - s2) <= 1));
          if (!near) continue;
          const unison = x.steps.length === 1 && o.steps.length === 1 && x.steps[0] === o.steps[0] && x.ev.dur.base === o.ev.dur.base && x.ev.dur.dots === o.ev.dur.dots && x.stem && o.stem && x.stem !== o.stem && !o.shared;
          if (unison) { x.shared = true; x.dx = o.dx; x.sharedWith = o; break; }
          x.shared = false; x.dx = Math.max(x.dx, o.dx + headW + 0.1);
        }
        others.push(x); placed.set(x.drawStaff, others);
        coll = Math.max(coll, x.dx);
      }
      c.accPad = acc ? 1.4 + (acc - 1) * 1.15 : 0; c.dotPad = dot ? 0.9 : 0; c.arpPad = arp ? 1.4 : 0; c.collPad = coll; // the roll sign stands left of the accidentals
    }
  }

  /** The naturals that cancel the previous key at a change (fewer accidentals, or the other kind), in drawing order. */
  const cancels = (b, si) => {
    if (!b.showKey || b.index === 0) return [];
    const prev = keyAt(doc, b.index - 1).fifths, next = b.key.fifths;
    if (prev === 0 || (Math.sign(prev) === Math.sign(next) && Math.abs(next) >= Math.abs(prev))) return [];
    const glyphs = keySignatureGlyphs(prev, b.clefs[si]);
    return (Math.sign(prev) === Math.sign(next) ? glyphs.slice(Math.abs(next)) : glyphs).map((g) => ({ acc: 0, step: g.step }));
  };
  const keysigW = (b, si) => keySignatureGlyphs(b.key.fifths, b.clefs[si]).length + cancels(b, si).length;
  const leadingW = (b, first) => {
    const clef = first || b.showClef ? 3.4 : 0;
    const ks = first || b.showKey ? Math.max(...b.clefs.map((_, si) => keysigW(b, si))) * 1.15 + (Math.max(...b.clefs.map((_, si) => keysigW(b, si))) ? 0.8 : 0) : 0;
    const ts = b.showTime ? 3.0 : 0;
    return clef + ks + ts + (clef || ks || ts ? 0.6 : 0);
  };
  const bodyW = (b) => Math.max(MIN_BAR, 1.0 + b.cols.reduce((n, c) => n + c.w + c.clefPad + c.accPad + c.arpPad + c.dotPad + c.collPad, 0) + b.tailPad + 1.0);

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
    // a courtesy key / time at the end when the next system opens with a change
    const nb = bars[i];
    sys.courtesy = nb && (nb.showKey || nb.showTime || nb.showClef) ? { clef: nb.showClef ? nb : null, key: nb.showKey ? nb : null, time: nb.showTime ? nb : null, w: (nb.showClef ? 2.8 : 0) + (nb.showKey ? Math.max(...nb.clefs.map((_, si) => keysigW(nb, si))) * 1.15 + 0.8 : 0) + (nb.showTime ? 3.0 : 0) + 1.0 } : null;
    sys.scale = Math.min((avail - lead - (sys.courtesy?.w ?? 0)) / body, i >= bars.length ? 1.25 : 10);
    systems.push(sys);
  }

  // -- coordinates --
  const drawn = [], beams = [], ties = [], clefs = [];
  const clefY = (topY, clef) => topY + (8 - (CLEFS[clef].line - 1) * 2) / 2;
  const hit = { systems: [] };
  systems.forEach((sys, si) => {
    const sysTop = TOP_PAD + si * SYS_H;
    const staffTop = (st) => sysTop + st * (4 + STAFF_GAP);
    const yOfStep = (st, step) => staffTop(st) + (8 - step) / 2;
    sys.top = sysTop; sys.staffTop = Array.from({ length: nStaves }, (_, st) => staffTop(st));
    sys.leading = [];
    sys.barlines = [];
    sys.courtesyLead = null;
    sys.endX = null; // where the staff lines stop when it is not the last barline
    const hsys = { top: sysTop - 3, bottom: sysTop + BLOCK_H + 3, staves: sys.staffTop.map((t) => ({ topY: t })), bars: [] };
    let cursor = LEFT;
    sys.bars.forEach((b, k) => {
      const first = k === 0;
      const barX0 = cursor;
      // leading symbols
      const lead = { x: cursor, clef: first || b.showClef, small: !first && b.showClef, key: first || b.showKey, time: b.showTime, staves: [] };
      for (let st = 0; st < nStaves; st++) {
        const clef = b.clefs[st], ks = keySignatureGlyphs(b.key.fifths, clef);
        lead.staves.push({ clef: CLEFS[clef], clefName: clef, keysig: [...cancels(b, st), ...ks], topY: staffTop(st) });
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
        for (const ch of c.clefs) clefs.push({ x: bodyStart + off * sys.scale + 0.15, y: clefY(staffTop(ch.staff), ch.clef), glyph: CLEFS[ch.clef].glyph, staff: ch.staff, bar: b.index, at: ch.at, system: si });
        const x = bodyStart + (off + c.clefPad + c.arpPad + c.accPad) * sys.scale;
        c.x = x;
        hbar.cols.push({ ticks: c.ticks, x });
        const colNotes = []; // every note of this column, for accidental x by drawn staff
        for (const ev of c.evs) {
          const st = ev.staff, vi = ev.voice, ds = ev.drawStaff, nV = b.nVoices[st];
          if (ev.ev.kind === "rest") {
            const hidden = !!ev.ev.hidden;
            if (b.allRest[st][vi]) { if (c.ticks === 0) drawn.push({ id: ev.ev.id, bar: b.index, staff: st, drawStaff: st, voice: vi, system: si, rest: true, whole: true, hidden, base: 1, dots: 0, x: (bodyStart + hbar.x1) / 2 - 0.85, y: yOfStep(st, 6 + (nV > 1 ? REST_STEP[vi] : 0) + (ev.ev.restY ?? 0)) }); continue; }
            const base = ev.ev.dur.base;
            drawn.push({ id: ev.ev.id, bar: b.index, staff: st, drawStaff: st, voice: vi, system: si, rest: true, hidden, base, dots: ev.ev.dur.dots, x, y: yOfStep(st, (base <= 1 ? 6 : 4) + (nV > 1 ? REST_STEP[vi] : 0) + (ev.ev.restY ?? 0)), ticks: c.ticks, tupletId: ev.ev.dur.tuplet?.id ?? null, tupletN: ev.ev.dur.tuplet?.n ?? null, index: ev.index });
            continue;
          }
          const base = ev.ev.dur.base, kind = headKind(base), headW = HEAD_W[kind];
          const steps = ev.steps;
          const stem = ev.stem;
          const nx = x + ev.dx; // a colliding voice sits right of the other voice's stem
          const d = { id: ev.ev.id, bar: b.index, staff: st, drawStaff: ds, voice: vi, cross: ev.ev.cross ?? 0, system: si, rest: false, base, dots: ev.ev.dur.dots, kind, headW, x: nx, colX: x, stem, stemForced: ev.stemForced, shared: ev.shared, ticks: c.ticks, group: Math.floor(c.ticks / groupSize(b.time)), heads: [], ledgers: [], tupletId: ev.ev.dur.tuplet?.id ?? null, tupletN: ev.ev.dur.tuplet?.n ?? null, index: ev.index, pitches: ev.ev.pitches, art: ev.ev.art ?? null, gliss: ev.ev.gliss ?? null, arp: ev.ev.arp ?? null, slurs: ev.ev.slurs ?? null, accLeft: x - c.accPad * sys.scale };
          // heads: sorted by step; seconds flip to the other side of the stem
          const order = steps.map((s2, pi) => ({ step: s2, pi })).sort((a, b2) => a.step - b2.step);
          const walk = stem === "down" ? [...order].reverse() : order;
          let prevStep = null, prevFlip = false;
          for (const h of walk) {
            const flip = prevStep !== null && Math.abs(h.step - prevStep) === 1 && !prevFlip;
            const hx = flip ? (stem === "down" ? nx - headW : nx + headW) : nx;
            d.heads.push({ pi: h.pi, step: h.step, x: hx, y: yOfStep(ds, h.step), acc: ev.accs?.[h.pi] ?? null, accCol: ev.accCol?.[h.pi] ?? 0, flip, tie: ev.ev.pitches[h.pi].tie ?? null, ...(ev.shared ? { shared: true } : {}) });
            prevStep = h.step; prevFlip = flip;
          }
          d.heads.sort((a, b2) => a.step - b2.step);
          for (const h of d.heads) { for (let s2 = -2; s2 >= h.step; s2 -= 2) d.ledgers.push({ x: h.x, y: yOfStep(ds, s2) }); for (let s2 = 10; s2 <= h.step; s2 += 2) d.ledgers.push({ x: h.x, y: yOfStep(ds, s2) }); }
          d.topY = d.heads[d.heads.length - 1].y; d.botY = d.heads[0].y;
          if (stem) {
            const outer = stem === "up" ? d.heads[d.heads.length - 1] : d.heads[0];
            const len = Math.max(STEM_LEN, Math.abs(outer.step - 4) / 2);
            d.stemX = stem === "up" ? nx + headW - 0.07 : nx + 0.07;
            d.stemTipY = stem === "up" ? outer.y - len : outer.y + len;
            d.stemFromY = stem === "up" ? d.botY : d.topY;
          }
          d.beams = beamCount(base);
          drawn.push(d);
          colNotes.push(d);
        }
        // accidentals stand left of everything the column's voices own on that staff (flipped heads, a colliding voice's offset)
        for (const d of colNotes) {
          const left = Math.min(...colNotes.filter((o) => o.drawStaff === d.drawStaff).flatMap((o) => o.heads.map((h) => h.x).concat(o.colX)));
          for (const h of d.heads) if (h.acc !== null) h.accX = left - 1.35 - h.accCol * 1.15;
        }
        off += c.w + c.clefPad + c.arpPad + c.accPad + c.dotPad + c.collPad;
      }
      for (const ch of b.tailClefs) clefs.push({ x: hbar.x1 - b.tailPad * sys.scale + 0.15, y: clefY(staffTop(ch.staff), ch.clef), glyph: CLEFS[ch.clef].glyph, staff: ch.staff, bar: b.index, at: ch.at, system: si });
      cursor = hbar.x1;
      hsys.bars.push(hbar);
      sys.barlines.push({ x: cursor, final: b.index === bars.length - 1 });
    });
    if (sys.courtesy) {
      const nb = sys.courtesy.key ?? sys.courtesy.time ?? sys.courtesy.clef;
      const c = { x: cursor + 0.4, staves: [], clef: !!sys.courtesy.clef, key: !!sys.courtesy.key, time: !!sys.courtesy.time, keyX: 0, timeX: 0 };
      for (let st = 0; st < nStaves; st++) c.staves.push({ clef: sys.courtesy.clef && nb.m.clefs?.[st] ? { glyph: CLEFS[nb.m.clefs[st]].glyph, y: clefY(staffTop(st), nb.m.clefs[st]) } : null, keysig: sys.courtesy.key ? [...cancels(nb, st), ...keySignatureGlyphs(nb.key.fifths, nb.clefs[st])] : [], topY: staffTop(st) });
      c.keyX = c.x + (c.clef ? 2.8 : 0);
      c.timeX = c.keyX + (sys.courtesy.key ? Math.max(...c.staves.map((x) => x.keysig.length)) * 1.15 + 0.8 : 0);
      c.beats = nb.time.beats; c.unit = nb.time.unit;
      sys.courtesyLead = c;
      sys.endX = cursor + sys.courtesy.w - 0.3; // the staff runs on under the courtesy symbols
    }
    hit.systems.push(hsys);
  });

  // -- beams: runs of stemmed eighths-or-shorter in one staff, one voice, one beat group, no rests between --
  const byStaffSys = new Map();
  for (const d of drawn) {
    if (d.rest) continue;
    const k = `${d.system}:${d.staff}:${d.bar}:${d.voice}`;
    if (!byStaffSys.has(k)) byStaffSys.set(k, []);
    byStaffSys.get(k).push(d);
  }
  for (const list of byStaffSys.values()) {
    list.sort((a, b) => a.ticks - b.ticks);
    let run = [];
    const flush = () => { if (run.length >= 2) makeBeam(run, beams); run = []; };
    for (let k = 0; k < list.length; k++) {
      const d = list[k], prev = list[k - 1];
      const contiguous = prev && prev.group === d.group && prev.tupletId === d.tupletId && !restBetween(drawn, prev, d);
      if (d.beams >= 1 && (run.length === 0 || contiguous)) run.push(d);
      else { flush(); if (d.beams >= 1) run.push(d); }
    }
    flush();
  }
  // a shared unison head: the second voice's stem starts where the first's head is (its own head is not drawn)
  const evOf = (d) => doc.measures[d.bar].staves[d.staff].voices[d.voice][d.index];
  const lineOf = (d) => ({ bar: d.bar, staff: d.staff, voice: d.voice, ev: evOf(d) });

  // -- ties: from a head to the same pitch in the voice's next event; a system break makes two half ties --
  const byId = new Map(drawn.map((d) => [d.id, d]));
  for (const d of drawn) {
    if (d.rest) continue;
    const median = (d.heads[0].step + d.heads[d.heads.length - 1].step) / 2;
    for (const h of d.heads) {
      if (h.tie !== "start" && h.tie !== "both") continue;
      const p = d.pitches[h.pi];
      const nx = nextEvent(doc, lineOf(d));
      const d2 = nx && byId.get(nx.id);
      const h2 = d2 && !d2.rest ? d2.heads.find((g) => { const q = d2.pitches[g.pi]; return q.step === p.step && q.octave === p.octave && q.alter === p.alter; }) : null;
      if (!h2) continue;
      // in a bar with more than one voice the voices' ties curve outward (voice 1 up, voice 2 down) so the lines stay apart; alone, away from the stem
      const dir = d.heads.length > 1 ? (h.step >= median ? "up" : "down") : d.stemForced && !d.cross ? (d.voice % 2 === 0 ? "up" : "down") : d.stem ? (d.stem === "down" ? "up" : "down") : (h.step >= 4 ? "up" : "down");
      if (d2.system === d.system) ties.push({ x1: h.x + d.headW, y1: h.y, x2: h2.x, y2: h2.y, dir, system: d.system, voice: d.voice });
      else {
        const endX = systems[d.system].barlines[systems[d.system].barlines.length - 1].x, startX = hit.systems[d2.system].bars[0].bodyX0;
        ties.push({ x1: h.x + d.headW, y1: h.y, x2: endX - 0.3, y2: h.y, dir, system: d.system, half: "out", voice: d.voice });
        ties.push({ x1: startX + 0.3, y1: h2.y, x2: h2.x, y2: h2.y, dir, system: d2.system, half: "in", voice: d.voice });
      }
    }
  }
  // -- articulations: opposite the stem (fermata and ornaments always above), stacked outward --
  const marks = [];
  const onLine = (y, top) => Number.isInteger(Math.round((y - top) * 2) / 2) && Math.abs(((y - top) * 2) % 2) < 1e-6; // an integer number of spaces from the staff top = on a line
  for (const d of drawn) {
    if (d.rest || !d.art?.length) continue;
    const stemUp = d.stem === "up";
    const staffTopY = systems[d.system].staffTop[d.drawStaff], staffBotY = staffTopY + 4;
    // articulations hug the head on the side away from the stem (in a space, never on a line); fermata and ornaments go above the staff
    let near = stemUp ? d.botY + 1 : d.topY - 1;
    if (near >= staffTopY && near <= staffBotY && onLine(near, staffTopY)) near += stemUp ? 0.5 : -0.5;
    let high = Math.min(staffTopY - 1.4, (d.stem === "up" ? d.stemTipY : d.topY) - 1.2);
    for (const m of d.art) {
      const ornament = m === "fermata" || m === "trill" || m === "mordent" || m === "lowerMordent" || m === "turn";
      if (ornament) { marks.push({ x: d.x + d.headW / 2, y: high, mark: m, above: true, system: d.system }); high -= m === "fermata" ? 1.8 : 1.4; }
      else { marks.push({ x: d.x + d.headW / 2, y: near, mark: m, above: !stemUp, system: d.system }); near += stemUp ? 1.1 : -1.1; if (!stemUp) high = Math.min(high, near - 0.4); }
    }
  }
  // -- slurs: from the first note's head to the last's, on the side away from the stems (mixed stems: above), arched
  //    high enough to clear whatever lies between in the voice; a system break makes two half slurs like a tie --
  const slurs = [];
  const spans = [];
  for (const d of drawn) {
    if (d.rest || !d.slurs) continue;
    for (const sl of d.slurs) {
      if (sl.at !== "start") continue;
      const end = slurEnd(doc, d.staff, d.voice, evOf(d), sl.id);
      const d2 = end && byId.get(end.id);
      if (d2 && !d2.rest) spans.push({ id: sl.id, d, d2 });
    }
  }
  // shortest first, so an outer slur can see the inner ones it must clear
  const pos = (x) => x.bar * 1e4 + x.index;
  const sameLine = (x, d) => x.staff === d.staff && x.voice === d.voice;
  spans.sort((p, q) => (pos(p.d2) - pos(p.d)) - (pos(q.d2) - pos(q.d)));
  for (const { id, d, d2 } of spans) {
    const between = drawn.filter((x) => !x.rest && sameLine(x, d) && pos(x) >= pos(d) && pos(x) <= pos(d2));
    // on the head side: every stemmed note points up → below the heads; any stem down (or no stems) → above.
    // In a bar with more than one voice the slur goes outward instead (voice 1 above, voice 2 below), clear of the other voice.
    const stemmed = between.filter((x) => x.stem);
    const shared = between.length > 0 && between.every((x) => x.stemForced && !x.cross);
    const up = shared ? d.voice % 2 === 0 : !(stemmed.length && stemmed.every((x) => x.stem === "up"));
    const edge = (x) => (up ? Math.min(x.topY, x.stem === "up" ? x.stemTipY : x.topY) : Math.max(x.botY, x.stem === "down" ? x.stemTipY : x.botY));
    // an end sits past the head on the head side, past the stem tip when the stem points into the slur's side
    const endAt = (x, first) => {
      const onStem = up ? x.stem === "up" : x.stem === "down";
      const px0 = onStem ? x.stemX + (first ? 0.1 : -0.1) : x.x + x.headW / 2 + (first ? 0.15 : -0.15);
      const py = onStem ? x.stemTipY + (up ? -0.6 : 0.6) : (up ? x.topY : x.botY) + (up ? -0.75 : 0.75);
      return [px0, py];
    };
    const [x1, y1] = endAt(d, true), [x2, y2] = endAt(d2, false);
    const inner = slurs.filter((o) => o.staff === d.staff && o.voice === d.voice && o.dir === (up ? "up" : "down") && o.x1 >= x1 - 0.5 && o.x2 <= x2 + 0.5);
    const arc = (xa, xb, ya, yb, items, system) => {
      const len = Math.max(1, xb - xa), mid = (ya + yb) / 2;
      let h = Math.max(1.2, Math.min(3.2, len / 5));
      let ext = up ? Infinity : -Infinity;
      for (const x of items) ext = up ? Math.min(ext, edge(x)) : Math.max(ext, edge(x));
      for (const o of inner) if (o.system === system) { const peak = (o.y1 + o.y2) / 2 + (up ? -0.75 : 0.75) * o.h; ext = up ? Math.min(ext, peak) : Math.max(ext, peak); }
      if (Number.isFinite(ext)) { const need = (up ? mid - ext : ext - mid) + 0.9; if (need / 0.75 > h) h = Math.min(7, need / 0.75); }
      return h;
    };
    const dir = up ? "up" : "down", staff = d.staff, voice = d.voice;
    if (d2.system === d.system) {
      const items = between.filter((x) => x !== d && x !== d2);
      slurs.push({ id, staff, voice, x1, y1, x2, y2, dir, system: d.system, h: arc(x1, x2, y1, y2, items, d.system) });
    } else {
      const endX = systems[d.system].barlines[systems[d.system].barlines.length - 1].x, startX = hit.systems[d2.system].bars[0].bodyX0;
      const first = between.filter((x) => x.system === d.system && x !== d), second = between.filter((x) => x.system === d2.system && x !== d2);
      slurs.push({ id, staff, voice, x1, y1, x2: endX - 0.3, y2: y1, dir, system: d.system, half: "out", h: arc(x1, endX, y1, y1, first, d.system) });
      slurs.push({ id, staff, voice, x1: startX + 0.3, y1: y2, x2, y2, dir, system: d2.system, half: "in", h: arc(startX, x2, y2, y2, second, d2.system) });
    }
  }
  // -- expressions (docs/COMPOSE_EXPRESSIONS_DESIGN.md §3): from each bar's list at the slot's x (interpolated between the
  //    columns, so a slot with no note still has a place); dynamics and hairpins on the staff's expression line — below the
  //    staff and below whatever sounds under them — text above; a hairpin over a system break is drawn in open halves --
  const dynamics = [], hairpins = [], texts = [];
  const { starts: barStart } = barStarts(doc);
  const hbarOf = new Map(); hit.systems.forEach((hs, si) => hs.bars.forEach((hb) => hbarOf.set(hb.index, { si, hb })));
  const belowOf = (d) => (d.rest ? d.y + 1 : Math.max(d.botY, d.stem === "down" ? d.stemTipY : d.botY) + (d.art?.some((m) => m !== "fermata" && m !== "trill" && m !== "mordent" && m !== "lowerMordent" && m !== "turn") && d.stem !== "down" ? 1.3 : 0));
  const aboveOf = (d) => (d.rest ? d.y - 1 : Math.min(d.topY, d.stem === "up" ? d.stemTipY : d.topY)) - (d.rest ? 0 : (d.art ?? []).reduce((n, m) => n + (m === "fermata" ? 1.8 : ["trill", "mordent", "lowerMordent", "turn"].includes(m) ? 1.4 : 0), 0));
  const exprLine = (si, staff, items) => Math.max(systems[si].staffTop[staff] + 4 + 2.6, ...items.map((d) => belowOf(d) + 1.6));
  /** Drawn things (not hidden rests) on a staff sounding inside [a, b) absolute ticks, in one system when given. */
  const under = (staff, a, b, si = null) => drawn.filter((d) => d.drawStaff === staff && !d.hidden && (si === null || d.system === si) && barStart[d.bar] + (d.ticks ?? 0) < b && barStart[d.bar] + (d.ticks ?? 0) + (d.whole ? capacity(timeAt(doc, d.bar)) : evTicks(evOf(d))) > a); // a whole-bar rest sounds the bar
  const exprs = expressionsOf(doc);
  const dynAt = new Set(exprs.filter((e) => e.x.kind === "dyn").map((e) => `${e.x.staff}:${e.abs}`));
  for (const e of exprs) {
    const x0 = e.x, where = hbarOf.get(e.bar);
    if (!where) continue;
    const { si, hb } = where, x = xOfTicks(hb, x0.at), base = { id: x0.id, staff: x0.staff, bar: e.bar, at: x0.at };
    if (x0.kind === "dyn") { dynamics.push({ ...base, x: x + 0.59, y: exprLine(si, x0.staff, under(x0.staff, e.abs, e.abs + 1)), dyn: x0.value, system: si }); continue; }
    if (x0.kind === "text") {
      const items = under(x0.staff, e.abs, e.abs + 1);
      texts.push({ ...base, x, y: Math.min(systems[si].staffTop[x0.staff] - 2.3, ...items.map((d) => aboveOf(d) - 1.3)), text: x0.value, system: si });
      continue;
    }
    const to = hbarOf.get(x0.end.bar);
    if (!to) continue;
    const x1 = x + (dynAt.has(`${x0.staff}:${e.abs}`) ? 2.3 : 0), xe = xOfTicks(to.hb, x0.end.at), x2 = xe + (dynAt.has(`${x0.staff}:${e.absEnd}`) ? -0.7 : 1.18); // a dynamic's ink is centred 0.59 (half a black head) right of the slot, where a note's head centre is
    const hp = { ...base, kind: x0.dir, end: x0.end };
    if (to.si === si) { hairpins.push({ ...hp, x1, x2, y: exprLine(si, x0.staff, under(x0.staff, e.abs, e.absEnd)), system: si }); continue; }
    for (let k = si; k <= to.si; k++) { // open at every break: out of the first system, through any middle one, into the last
      const endX = systems[k].barlines[systems[k].barlines.length - 1].x - 0.3, startX = hit.systems[k].bars[0].bodyX0 + 0.3;
      hairpins.push({ ...hp, x1: k === si ? x1 : startX, x2: k === to.si ? x2 : endX, y: exprLine(k, x0.staff, under(x0.staff, e.abs, e.absEnd, k)), system: k, half: k === si ? "out" : k === to.si ? "in" : "both" });
    }
  }
  // -- rolled chords: a vertical wiggle left of everything the chord owns (flipped heads, accidentals), a space past the outer heads --
  const arps = [];
  for (const d of drawn) {
    if (d.rest || !d.arp) continue;
    const left = Math.min(d.accLeft, ...d.heads.map((h) => h.x));
    arps.push({ x: left - 0.75, y1: d.botY + 1.0, y2: d.topY - 1.0, kind: d.arp, system: d.system });
  }
  // -- glissandi: a line from the note to the next note of its voice (in one system) --
  const glisses = [];
  for (const d of drawn) {
    if (d.rest || d.gliss !== "start") continue;
    const nx = nextEvent(doc, lineOf(d));
    const d2 = nx && byId.get(nx.id);
    if (!d2 || d2.rest || d2.system !== d.system) continue;
    const y1 = (d.topY + d.botY) / 2, y2 = (d2.topY + d2.botY) / 2;
    glisses.push({ x1: d.x + d.headW + 0.35, y1, x2: d2.x - 0.35, y2, system: d.system });
  }
  // -- tuplets: a bracket (unless one beamed run) and the digit over each group --
  const tuplets = [];
  const groups = new Map();
  for (const d of drawn) { if (!d.tupletId) continue; const k = `${d.system}:${d.staff}:${d.tupletId}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); }
  for (const list of groups.values()) {
    list.sort((a, b) => a.ticks - b.ticks);
    const notes = list.filter((d) => !d.rest);
    const stems = notes.filter((d) => d.stem);
    const above = !stems.length || stems.filter((d) => d.stem === "up").length >= stems.length / 2;
    const first = list[0], last = list[list.length - 1];
    const x1 = first.x - 0.3, x2 = last.x + (last.rest ? 1.5 : last.headW) + 0.3;
    let y = above ? Infinity : -Infinity;
    for (const d of list) {
      const ext = d.rest ? [d.y - 1, d.y + 1] : [Math.min(d.topY, d.stem === "up" ? d.stemTipY : d.topY), Math.max(d.botY, d.stem === "down" ? d.stemTipY : d.botY)];
      y = above ? Math.min(y, ext[0]) : Math.max(y, ext[1]);
    }
    y += above ? -1.3 : 1.3;
    const bracket = !(notes.length === list.length && notes.every((d) => d.beamed && d.beamRun === notes[0].beamRun));
    tuplets.push({ x1, x2, y, above, n: first.tupletN, bracket, system: first.system });
  }
  const height = (TOP_PAD + systems.length * SYS_H - SYS_GAP + BOTTOM_PAD) * S;
  /** The expression line of a staff in a system over [a, b) absolute ticks, and the text line at `a` — where a ghost mark would land. */
  const exprLineAt = (si, staff, a, b) => exprLine(si, staff, under(staff, a, b, si));
  const textLineAt = (si, staff, a) => Math.min(systems[si].staffTop[staff] - 2.3, ...under(staff, a, a + 1, si).map((d) => aboveOf(d) - 1.3));
  return { S, unit: S, width, height, systems, drawn, beams, ties, slurs, tuplets, marks, glisses, arps, dynamics, hairpins, texts, clefs, hit, nStaves, exprLine: exprLineAt, textLine: textLineAt };
}

function restBetween(drawn, a, b) {
  return drawn.some((d) => d.rest && d.bar === a.bar && d.staff === a.staff && d.voice === a.voice && !d.whole && d.x > a.x && d.x < b.x);
}

function makeBeam(run, beams) {
  if (new Set(run.map((d) => d.drawStaff)).size > 1) return makeCrossBeam(run, beams);
  const avg = run.reduce((n, d) => n + (d.heads[0].step + d.heads[d.heads.length - 1].step) / 2, 0) / run.length;
  const dir = run[0].stemForced ? run[0].stem : avg >= 4 ? "down" : "up"; // a bar with more than one voice keeps the voice's direction
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
  for (const d of run) { const need = dir === "up" ? (outer(d) - MIN_STEM) - lineY(d.stemX) : lineY(d.stemX) - (outer(d) + MIN_STEM); if (need < 0) shift = Math.max(shift, -need); }
  if (dir === "up") { y1 -= shift; y2 -= shift; } else { y1 += shift; y2 += shift; }
  for (const d of run) { d.stemTipY = lineY(d.stemX); d.beamed = true; d.beamRun = beams.length; }
  beamLevels(run, beams, lineY, dir, dir === "up" ? 1 : -1);
}
/**
 * A beam whose notes are drawn on both staves (docs/COMPOSE_VOICES_DESIGN.md §5): one straight beam
 * through the gap, halfway between the upper notes' lowest head and the lower notes' highest head;
 * the upper notes' stems point down to it, the lower notes' stems up. Secondary beams sit toward the
 * side with more notes.
 */
function makeCrossBeam(run, beams) {
  const top = Math.min(...run.map((d) => d.drawStaff));
  const upper = run.filter((d) => d.drawStaff === top), lower = run.filter((d) => d.drawStaff !== top);
  const yMin = Math.max(...upper.map((d) => d.botY)) + MIN_STEM, yMax = Math.min(...lower.map((d) => d.topY)) - MIN_STEM;
  const y = yMin <= yMax ? Math.max(yMin, Math.min(yMax, (Math.max(...upper.map((d) => d.botY)) + Math.min(...lower.map((d) => d.topY))) / 2)) : (yMin + yMax) / 2;
  for (const d of run) {
    d.stem = d.drawStaff === top ? "down" : "up";
    d.stemX = d.stem === "up" ? d.x + d.headW - 0.07 : d.x + 0.07;
    d.stemFromY = d.stem === "up" ? d.botY : d.topY;
    d.stemTipY = y; d.beamed = true; d.beamRun = beams.length; d.crossBeam = true;
  }
  const dir = lower.length >= upper.length ? "up" : "down"; // which side the secondary beams take
  beamLevels(run, beams, () => y, dir, dir === "up" ? 1 : -1, true);
}
/** The primary beam and each secondary level (a fragment hooks toward the run when a single note carries it). */
function beamLevels(run, beams, lineY, dir, sgn, cross = false) {
  const a = run[0], b = run[run.length - 1];
  const levels = Math.max(...run.map((d) => d.beams));
  const voice = a.voice;
  for (let lvl = 1; lvl <= levels; lvl++) {
    const off = (lvl - 1) * (BEAM_T + BEAM_GAP) * sgn;
    if (lvl === 1) { beams.push({ x1: a.stemX, y1: lineY(a.stemX), x2: b.stemX, y2: lineY(b.stemX), dir, t: BEAM_T, voice, ...(cross ? { cross: true } : {}) }); continue; }
    let k = 0;
    while (k < run.length) {
      if (run[k].beams < lvl) { k++; continue; }
      let j = k;
      while (j + 1 < run.length && run[j + 1].beams >= lvl) j++;
      if (j > k) { const a2 = run[k], b2 = run[j]; beams.push({ x1: a2.stemX, y1: lineY(a2.stemX) + off, x2: b2.stemX, y2: lineY(b2.stemX) + off, dir, t: BEAM_T, voice }); }
      else { const d = run[k], toRight = k === 0, x2 = toRight ? d.stemX + 1.2 : d.stemX - 1.2; beams.push({ x1: d.stemX, y1: lineY(d.stemX) + off, x2, y2: lineY(x2) + off, dir, t: BEAM_T, voice }); }
      k = j + 1;
    }
  }
}
