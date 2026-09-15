// Playback (docs/COMPOSE_DESIGN.md §8.6): the document as a timeline of note
// on / off events in ticks, sequenced on the audio clock through the piano
// voice. `timeline` is pure — node-testable; `createPlayer` owns the clock.
import { PPQ } from "./ticks.js";
import { onsets, midiOf, diatonicOf, barStarts, expressionsOf, spansOf, unroll, tempoMap, simileSource } from "./engine.js";
import { capacity } from "./ticks.js";
import { timeAt as timeOfBar, keyAt } from "./model.js";
import { keyAlterations } from "../music.js";
import { createPiano } from "../keyboard/piano.js";

const LOOKAHEAD_S = 0.18, TICK_MS = 45, GATE = 0.92;
const ROLL_MAX = PPQ / 8;
const VEL = { pppp: 0.2, ppp: 0.27, pp: 0.35, p: 0.45, mp: 0.58, mf: 0.7, f: 0.82, ff: 0.95, fff: 0.98, ffff: 1.0 }, STEP = 0.12, NIENTE = 0.05;
const SUDDEN_V = { sf: null, sfz: null, rfz: null, fp: VEL.f, sfp: VEL.f }; // null = two steps above the level in force; fp / sfp attack at f and drop to p
const rampDir = (x) => (x.kind === "hairpin" ? x.dir : /^(cresc|cres\b)/i.test(x.text) ? "cresc" : /^(dim|decresc|dimin)/i.test(x.text) ? "dim" : null); // a text line "cresc. – – –" ramps like a hairpin
const isSoft = (x) => x.kind === "textline" && /^una corda/i.test(x.text);
/**
 * A velocity per note event (docs/COMPOSE_EXPRESSIONS_DESIGN.md §7, docs/COMPOSE_RAILS2_DESIGN.md §3): the dynamic in
 * force on its staff at its tick (mf until one is written — a dynamic in any voice applies to the staff); inside a
 * hairpin (or a cresc. / dim. text line) the notes ramp from the level at its start to the first dynamic written at
 * or after its end (else a step up / down; a niente hairpin from / to near silence), and the level holds at that
 * target from the end on. A sudden dynamic (sf, sfz, rfz) spikes the notes on its slot two steps up and leaves the
 * level; fp / sfp attack at f and drop the level to p. Notes under an "una corda" line sound at 0.8.
 */
export function velocities(doc) {
  const { starts } = barStarts(doc);
  const out = new Map();
  const exprs = expressionsOf(doc);
  const levelAt = (ramp, t) => (t >= ramp.t1 ? ramp.to : ramp.from + (ramp.to - ramp.from) * ((t - ramp.t0) / Math.max(1, ramp.t1 - ramp.t0)));
  for (let staff = 0; staff < (doc.parts[0]?.staves ?? 0); staff++) {
    const notes = [];
    for (let b = 0; b < doc.measures.length; b++) doc.measures[b].staves[staff].voices.forEach((v, voice) => { if (v) for (const o of onsets(v)) if (o.ev.kind === "note") notes.push({ ev: o.ev, voice, at: starts[b] + o.start }); });
    notes.sort((a, b) => a.at - b.at || a.voice - b.voice);
    const marks = exprs.filter((e) => e.x.staff === staff && (e.x.kind === "dyn" || e.x.kind === "hairpin" || (e.x.kind === "textline" && rampDir(e.x)))); // time order; a dynamic before a hairpin on the same slot
    const soft = exprs.filter((e) => e.x.staff === staff && isSoft(e.x));
    let cur = VEL.mf, ramp = null, mi = 0, spike = null;
    for (const n of notes) {
      while (mi < marks.length && marks[mi].abs <= n.at) {
        const e = marks[mi++];
        if (ramp && e.abs >= ramp.t1) { cur = ramp.to; ramp = null; }
        if (e.x.kind === "dyn") {
          if (e.x.value in SUDDEN_V) { const now = ramp ? levelAt(ramp, e.abs) : cur; spike = { at: e.abs, v: SUDDEN_V[e.x.value] ?? Math.min(1, now + 2 * STEP) }; if (e.x.value === "fp" || e.x.value === "sfp") { cur = VEL.p; ramp = null; } continue; }
          cur = VEL[e.x.value] ?? cur; ramp = null; continue;
        }
        const dir = rampDir(e.x), niente = e.x.kind === "hairpin" && e.x.niente;
        const from = niente && dir === "cresc" ? NIENTE : ramp ? levelAt(ramp, e.abs) : cur;
        const after = marks.slice(mi).find((o) => o.x.kind === "dyn" && !(o.x.value in SUDDEN_V) && o.abs >= e.absEnd);
        const to = niente && dir === "dim" ? NIENTE : after ? VEL[after.x.value] : Math.max(0.2, Math.min(1, from + (dir === "cresc" ? STEP : -STEP)));
        ramp = { from, to, t0: e.abs, t1: e.absEnd };
      }
      let v = cur;
      if (ramp) { v = levelAt(ramp, n.at); if (n.at >= ramp.t1) { cur = ramp.to; ramp = null; } }
      if (spike && spike.at === n.at) v = spike.v;
      if (soft.some((e) => e.abs <= n.at && n.at < e.absEnd)) v = Math.round(v * 0.8 * 1e4) / 1e4;
      out.set(n.ev, v);
    }
  }
  return out;
}
const S32 = PPQ / 8; // a thirty-second: the ornaments' step
const ORNAMENTS = new Set(["trill", "mordent", "lowerMordent", "turn", "invertedTurn", "delayedTurn"]);
const RIT = /^(rit\.?|ritard\.?|ritardando|rall\.?|rallentando|riten\.?|ritenuto|allarg\.?|allargando)$/i, ACCEL = /^(accel\.?|accelerando|string\.?|stringendo)$/i, A_TEMPO = /^(a tempo|tempo (i|1|primo))$/i;
const RIT_F = 0.7, ACCEL_F = 1.3, FERMATA_F = 1 / 1.5, CAESURA_F = 1 / 5;
/** The pitch `delta` letters away, spelled in the key (`alter` overriding the key's alteration). */
function neighbour(p, delta, keyAlt, alter) {
  const dia = diatonicOf(p) + delta, step = "CDEFGAB"[((dia % 7) + 7) % 7];
  return { step, octave: Math.floor(dia / 7), alter: alter ?? keyAlt.get(step) ?? 0 };
}
/** An ornamented note as its little notes: [{ at, len, midi }] in the note's own span, or null when it is too short (docs/COMPOSE_RAILS2_DESIGN.md §3). */
function ornament(ev, p, at, len, keyAlt) {
  const kind = ev.art.find((m) => ORNAMENTS.has(m));
  if (!kind || len < 3 * S32) return null;
  const main = midiOf(p), up = midiOf(neighbour(p, 1, keyAlt, kind === "trill" ? ev.trill?.alter : undefined)), down = midiOf(neighbour(p, -1, keyAlt));
  const out = [];
  const run = (t0, total, seq) => { const each = Math.floor(total / seq.length); seq.forEach((m, i) => out.push({ at: t0 + i * each, len: i === seq.length - 1 ? total - i * each : each, midi: m })); };
  if (kind === "trill") { let t = at, i = 0; while (t < at + len) { const l = Math.min(S32, at + len - t); out.push({ at: t, len: l, midi: i % 2 ? up : main }); t += S32; i++; } }
  else if (kind === "mordent" || kind === "lowerMordent") { const o = kind === "mordent" ? up : down; out.push({ at, len: S32, midi: main }, { at: at + S32, len: S32, midi: o }, { at: at + 2 * S32, len: len - 2 * S32, midi: main }); }
  else if (kind === "turn") run(at, len, [up, main, down, main]);
  else if (kind === "invertedTurn") run(at, len, [down, main, up, main]);
  else { const half = Math.floor(len / 2); out.push({ at, len: half, midi: main }); run(at + half, len - half, [up, main, down, main]); }
  return out;
}
/**
 * The tempo shapes inside the bars, in DOCUMENT ticks: ramps from rit. / accel. texts, holds from fermatas and
 * caesuras — [{ t0, t1, f }] each, a factor on the tempo in force (docs/COMPOSE_RAILS2_DESIGN.md §3).
 */
function tempoShapes(doc) {
  const { starts, total } = barStarts(doc);
  const exprs = expressionsOf(doc).filter((e) => e.x.kind === "text");
  const tempoAt = doc.measures.map((m, b) => ((m.form ?? []).some((f) => f.kind === "tempo") ? starts[b] : null)).filter((t) => t !== null);
  const ramps = [], seen = new Set();
  for (const e of exprs) {
    const f = RIT.test(e.x.value) ? RIT_F : ACCEL.test(e.x.value) ? ACCEL_F : null;
    if (f === null || seen.has(e.abs)) continue;
    seen.add(e.abs);
    const ends = [total, starts[e.bar + 2] ?? total, ...tempoAt.filter((t) => t > e.abs), ...exprs.filter((o) => o.abs > e.abs && A_TEMPO.test(o.x.value)).map((o) => o.abs)];
    const t1 = Math.min(...ends);
    if (t1 > e.abs) ramps.push({ t0: e.abs, t1, f });
  }
  const holds = [];
  doc.measures.forEach((m, b) => m.staves.forEach((s) => s.voices.forEach((v) => { if (v) for (const o of onsets(v)) { if (o.ev.kind !== "note" || !o.ev.art) continue; const a = starts[b] + o.start; if (o.ev.art.includes("fermata")) holds.push({ t0: a, t1: a + o.len, f: FERMATA_F }); if (o.ev.art.includes("caesura")) holds.push({ t0: Math.max(a, a + o.len - S32), t1: a + o.len, f: CAESURA_F }); } })));
  return { ramps, holds };
} // a rolled chord staggers its notes by at most a 32nd each, never past a quarter of the chord // a note sounds for 92% of its length — a hair of air between repeated notes

/**
 * The performance (docs/COMPOSE_FORM_DESIGN.md §4): every note as { at, len, midi, staff, vel } in
 * PERFORMANCE ticks — the bars in the order the form plays them (`unroll`), so a repeated bar sounds
 * twice — with `passes` [{ bar, pass, perfStart, docStart, len }] mapping performance time back to
 * the score, `total` in performance ticks, and `tempos` [{ at, bpm }] from the tempo marks (the
 * piece's tempo — `tempo` overrides it — until the first mark). Every voice of every staff is
 * walked; a pitch tied to the next note of the same pitch in the same voice sounds once, for the
 * combined length; a tie never reaches across a jump. Two voices on one pitch at one onset re-strike.
 */
export function timeline(doc, { tempo } = {}) {
  const { starts } = barStarts(doc);
  const bpms = tempoMap(doc, tempo);
  const notes = [];
  const vel = velocities(doc);
  const passes = [], tempos = [];
  const { ramps, holds } = tempoShapes(doc);
  const factorAt = (t) => { // the tempo's factor over the half-beat step starting at t: a ramp read at the step's end (so the last step reaches the target), every hold that covers it
    let f = 1;
    for (const r of ramps) if (t >= r.t0 && t < r.t1) { const m = Math.min(r.t1, t + PPQ / 2); f *= 1 + (r.f - 1) * ((m - r.t0) / (r.t1 - r.t0)); }
    for (const h of holds) if (t >= h.t0 && t < h.t1) f *= h.f;
    return f;
  };
  const pushTempo = (at, bpm) => { const b = Math.round(bpm * 1e4) / 1e4; if (!tempos.length || tempos[tempos.length - 1].bpm !== b) tempos.push({ at, bpm: b }); };
  const pedalsBy = Array.from({ length: doc.parts[0]?.staves ?? 0 }, (_, s) => spansOf(doc, "pedal", s)); // docs/COMPOSE_PIANO_DESIGN.md §7
  const pedaled = pedalsBy.map(() => []); // per staff: [{ from, to }] in performance ticks, adjacent pieces merged
  let perf = 0, prevBar = -2;
  let open = new Map(); // "staff:voice:midi" → the note still sounding through a tie
  let prev = new Map(); // "staff:voice" → the notes of the line's previous onset (a slashed grace run cuts them short)
  const GRACE = PPQ / 8; // a slashed grace is a thirty-second before the beat (docs/COMPOSE_NOTES2_DESIGN.md §6)
  let depth = new Map(); // open slurs per staff + voice: notes under a slur play legato (no air before the next note); the slur's last note breathes
  for (const { bar: b, pass } of unroll(doc)) {
    const len = capacity(timeOfBar(doc, b));
    if (b !== prevBar + 1) { open = new Map(); depth = new Map(); prev = new Map(); } // a jump or a repeat: nothing carries across
    { // the tempo through the bar: the bar's tempo, shaped by any ramp or hold that touches it (the breakpoints: their edges and every half beat inside a ramp)
      const a = starts[b], z = a + len, pts = new Set([a]);
      for (const r of ramps) { if (r.t1 <= a || r.t0 >= z) continue; for (let t = Math.max(a, r.t0); t < Math.min(z, r.t1); t += PPQ / 2) pts.add(t); pts.add(Math.max(a, r.t0)); if (r.t1 < z) pts.add(r.t1); }
      for (const h of holds) { if (h.t1 <= a || h.t0 >= z) continue; pts.add(Math.max(a, h.t0)); if (h.t1 < z) pts.add(h.t1); }
      for (const t of [...pts].sort((p, q) => p - q)) pushTempo(perf + (t - a), bpms[b] * factorAt(t));
    }
    passes.push({ bar: b, pass, perfStart: perf, docStart: starts[b], len });
    pedalsBy.forEach((list, staff) => { for (const pd of list) { // the pedal's piece inside this bar, in performance time
      const from = Math.max(pd.abs, starts[b]), to = Math.min(pd.absEnd, starts[b] + len);
      if (from >= to) continue;
      const seg = { from: perf + (from - starts[b]), to: perf + (to - starts[b]) }, last = pedaled[staff][pedaled[staff].length - 1];
      if (last && last.to === seg.from) last.to = seg.to; else pedaled[staff].push(seg);
    } });
    const keyAlt = keyAlterations(keyAt(doc, b).fifths);
    doc.measures[simileSource(doc, b)].staves.forEach((s, staff) => s.voices.forEach((v, voice) => { // a % bar plays the bar(s) before it
      if (!v) return;
      const line = `${staff}:${voice}`;
      for (const o of onsets(v)) {
        if (o.ev.kind !== "note") continue;
        for (const x of o.ev.slurs ?? []) depth.set(line, Math.max(0, (depth.get(line) ?? 0) + (x.at === "start" ? 1 : -1)));
        const legato = (depth.get(line) ?? 0) > 0;
        let at = perf + o.start, len = o.len;
        const v0 = vel.get(o.ev) ?? VEL.mf;
        // grace notes: a slashed run steals a thirty-second each from before the beat (the previous notes of the line end early); a plain run takes the first half of the principal
        if (o.ev.graces?.length) {
          const gs = o.ev.graces, n = gs.length;
          if (gs[0].slash) { const total = n * GRACE; for (const pn of prev.get(line) ?? []) if (pn.at + pn.len > at - total) pn.len = Math.max(PPQ / 16, at - total - pn.at); gs.forEach((g, i) => { for (const p of g.pitches) notes.push({ at: at - total + i * GRACE, len: GRACE, midi: midiOf(p), staff, vel: v0, grace: true }); }); }
          else { const half = Math.floor(len / 2), each = Math.floor(half / n); gs.forEach((g, i) => { for (const p of g.pitches) notes.push({ at: at + i * each, len: each, midi: midiOf(p), staff, vel: v0, grace: true }); }); at += half; len -= half; }
        }
        // a rolled chord: its pitches enter one after another (up = low to high, down = high to low) and end together
        const roll = o.ev.arp && o.ev.pitches.length > 1 ? Math.min(ROLL_MAX, Math.floor(len / (4 * o.ev.pitches.length))) : 0;
        const order = roll ? [...o.ev.pitches].sort((p1, p2) => (o.ev.arp === "down" ? midiOf(p2) - midiOf(p1) : midiOf(p1) - midiOf(p2))) : o.ev.pitches;
        const mine = [];
        for (const [pi, p] of order.entries()) {
          const midi = midiOf(p), k = `${line}:${midi}`, lag = roll * pi;
          if (o.ev.trem) { // a tremolo re-strikes the pitch every PPQ / 2^n ticks; it neither joins nor opens a tie
            const slice = Math.max(1, Math.min(len, PPQ / 2 ** o.ev.trem));
            for (let t = at; t < at + len; t += slice) { const n = { at: t, len: Math.min(slice, at + len - t), midi, staff, vel: v0, ...(legato ? { legato: true } : {}) }; notes.push(n); mine.push(n); }
            open.delete(k);
            continue;
          }
          if (o.ev.art?.some((m) => ORNAMENTS.has(m))) { // a trill, mordent or turn: its little notes (a note too short for them plays plain); it ends a tie chain like a tremolo
            const little = ornament(o.ev, p, at + lag, len - lag, keyAlt);
            if (little) { for (const x of little) { const n = { ...x, staff, vel: v0, ...(legato ? { legato: true } : {}) }; notes.push(n); mine.push(n); } open.delete(k); continue; }
          }
          const held = open.get(k);
          const startsTie = p.tie === "start" || p.tie === "both";
          if (held && held.at + held.len === at) { held.len += len; if (!startsTie) open.delete(k); continue; }
          const n = { at: at + lag, len: len - lag, midi, staff, vel: v0, ...(legato ? { legato: true } : {}) };
          if (o.ev.art?.includes("portato")) n.len = Math.max(1, Math.floor(n.len * 0.75)); // docs/COMPOSE_RAILS2_DESIGN.md §3
          if (o.ev.art?.includes("breath")) n.len = Math.max(S32, n.len - PPQ / 4);
          if (o.ev.art?.includes("caesura")) n.len = Math.max(S32, n.len - S32); // the last thirty-second is the pause (the clock slows over it)
          notes.push(n); mine.push(n);
          if (startsTie) open.set(k, n); else open.delete(k);
        }
        prev.set(line, mine);
      }
    }));
    perf += len;
    prevBar = b;
  }
  for (const n of notes) { const seg = pedaled[n.staff].find((sg) => sg.from <= n.at && n.at < sg.to); if (seg && seg.to > n.at + n.len) { n.len = seg.to - n.at; n.pedal = true; } } // a note under the pedal sounds until it lifts
  notes.sort((a, b) => a.at - b.at || a.staff - b.staff || a.midi - b.midi);
  return { notes, total: perf, passes, tempos };
}
/** Seconds ↔ performance ticks over a tempo map [{ at, bpm }] (ticks at PPQ per quarter). */
export function clockOf(tempos) {
  const segs = tempos.length ? tempos : [{ at: 0, bpm: 100 }];
  const spt = (bpm) => 60 / (bpm * PPQ);
  const secAt = []; // seconds at each segment start
  let acc = 0;
  segs.forEach((sg, i) => { secAt.push(acc); if (i + 1 < segs.length) acc += (segs[i + 1].at - sg.at) * spt(sg.bpm); });
  return {
    seconds(t) { let i = segs.length - 1; while (i > 0 && segs[i].at > t) i--; return secAt[i] + (t - segs[i].at) * spt(segs[i].bpm); },
    ticks(sec) { let i = segs.length - 1; while (i > 0 && secAt[i] > sec) i--; return Math.round((segs[i].at + (sec - secAt[i]) / spt(segs[i].bpm)) * 1e6) / 1e6; },
  };
}

/**
 * The player: play / pause / stop / seek over a document at a tempo, reporting
 * the playhead in ticks each animation frame. `getDoc` is read at play() and
 * refresh() so an edit mid-play is heard from the next note on.
 */
export function createPlayer({ getAudio, getDoc, getTempo, onTick, onEnd }) {
  let piano = null, timer = 0, raf = 0, playing = false;
  let pos = 0;                      // performance ticks — the playhead when paused
  let anchorT = 0, anchorSec = 0;   // audio-clock time ↔ performance seconds while playing
  let queue = [], qi = 0, tl = null, clock = clockOf([]);
  const ctx = () => getAudio().context;
  const fresh = () => { tl = timeline(getDoc(), { tempo: getTempo?.() }); clock = clockOf(tl.tempos); return tl; };
  const total = () => (tl ?? fresh()).total;
  const now = () => (playing ? clock.ticks(anchorSec + (ctx().currentTime - anchorT)) : pos);
  /** Performance ticks → the score's tick (the bar the pass plays). */
  const docOf = (t) => { const ps = (tl ?? fresh()).passes; if (!ps.length) return 0; let p = ps[ps.length - 1]; for (const q of ps) if (t < q.perfStart + q.len) { p = q; break; } return p.docStart + Math.max(0, Math.min(p.len - 1, t - p.perfStart)); };
  /** A score tick → the first pass that plays it (past the last pass: the end). */
  const perfOf = (d) => { const ps = (tl ?? fresh()).passes; for (const q of ps) if (d >= q.docStart && d < q.docStart + q.len) return q.perfStart + (d - q.docStart); return d <= 0 ? 0 : total(); };

  function build(fromTicks) {
    fresh();
    // on / off events after the start, in time order; offs first at equal times so a repeated pitch re-strikes
    const evs = [];
    for (const n of tl.notes) {
      if (n.at + n.len <= fromTicks) continue;
      evs.push({ t: Math.max(fromTicks, n.at), on: true, midi: n.midi, vel: n.vel, late: n.at < fromTicks });
      evs.push({ t: n.at + n.len * (n.legato ? 1 : GATE), on: false, midi: n.midi });
    }
    evs.sort((a, b) => a.t - b.t || (a.on ? 1 : 0) - (b.on ? 1 : 0));
    queue = evs.filter((e) => !(e.on && e.late)); // a note already sounding at the start is not re-struck
    qi = 0;
  }
  function pump() {
    if (!playing) return;
    const p = piano ??= createPiano(getAudio, { volume: 0.6 });
    const horizon = ctx().currentTime + LOOKAHEAD_S;
    while (qi < queue.length) {
      const e = queue[qi], when = anchorT + (clock.seconds(e.t) - anchorSec);
      if (when > horizon) break;
      if (e.on) p.noteOn(e.midi, e.vel ?? 0.7, when); else p.noteOff(e.midi, when);
      qi++;
    }
  }
  function frame() {
    if (!playing) return;
    const t = now();
    if (t >= total()) { stopAt(total()); onEnd?.(); return; }
    onTick?.(docOf(t));
    raf = requestAnimationFrame(frame);
  }
  function stopAt(t) {
    playing = false; pos = Math.max(0, Math.min(total(), t));
    clearInterval(timer); timer = 0; cancelAnimationFrame(raf); raf = 0;
    piano?.allOff();
    onTick?.(docOf(pos));
  }
  function play(from = pos) {
    if (playing) return;
    const context = ctx();
    if (context.state === "suspended") context.resume?.();
    build(from);
    if (from >= total()) from = 0, build(0);
    playing = true; anchorT = context.currentTime + 0.05; anchorSec = clock.seconds(from);
    pump(); timer = setInterval(pump, TICK_MS); raf = requestAnimationFrame(frame);
  }
  return {
    get playing() { return playing; },
    /** The playhead as a tick of the SCORE (the bar being played; it jumps back on a repeat). */
    get position() { return docOf(now()); },
    get total() { return total(); },
    play,
    pause() { if (playing) stopAt(now()); },
    stop() { stopAt(0); },
    toggle() { if (playing) stopAt(now()); else play(); },
    /** Move the playhead to a tick of the score — the first pass that plays it (keeps playing if it was). */
    seek(d) { const t = perfOf(Math.max(0, d)); const was = playing; if (was) stopAt(t); else { pos = t; onTick?.(docOf(pos)); } if (was) play(pos); },
    /** The document or tempo changed: re-sequence from the current position. */
    refresh() { if (playing) { const t = now(); piano?.allOff(); build(t); anchorT = ctx().currentTime; anchorSec = clock.seconds(t); pump(); } else { fresh(); pos = Math.min(pos, total()); onTick?.(docOf(pos)); } },
    destroy() { stopAt(pos); piano?.destroy(); piano = null; },
  };
}
