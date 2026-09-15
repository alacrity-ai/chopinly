// Playback (docs/COMPOSE_DESIGN.md §8.6): the document as a timeline of note
// on / off events in ticks, sequenced on the audio clock through the piano
// voice. `timeline` is pure — node-testable; `createPlayer` owns the clock.
import { PPQ } from "./ticks.js";
import { onsets, midiOf, barStarts, expressionsOf, unroll, tempoMap } from "./engine.js";
import { capacity } from "./ticks.js";
import { timeAt as timeOfBar } from "./model.js";
import { createPiano } from "../keyboard/piano.js";

const LOOKAHEAD_S = 0.18, TICK_MS = 45, GATE = 0.92;
const ROLL_MAX = PPQ / 8;
const VEL = { pp: 0.35, p: 0.45, mp: 0.58, mf: 0.7, f: 0.82, ff: 0.95 }, STEP = 0.12;
/**
 * A velocity per note event (docs/COMPOSE_EXPRESSIONS_DESIGN.md §7): the dynamic in force on its staff at its
 * tick (mf until one is written — a dynamic in any voice applies to the staff); inside a hairpin the notes ramp
 * from the level at its start to the first dynamic written at or after its end (else a step up / down), and
 * the level holds at that target from the end on.
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
    const marks = exprs.filter((e) => e.x.staff === staff && e.x.kind !== "text"); // time order; a dynamic before a hairpin on the same slot
    let cur = VEL.mf, ramp = null, mi = 0;
    for (const n of notes) {
      while (mi < marks.length && marks[mi].abs <= n.at) {
        const e = marks[mi++];
        if (ramp && e.abs >= ramp.t1) { cur = ramp.to; ramp = null; }
        if (e.x.kind === "dyn") { cur = VEL[e.x.value] ?? cur; ramp = null; continue; }
        const from = ramp ? levelAt(ramp, e.abs) : cur;
        const after = marks.slice(mi).find((o) => o.x.kind === "dyn" && o.abs >= e.absEnd);
        const to = after ? VEL[after.x.value] : Math.max(0.2, Math.min(1, from + (e.x.dir === "cresc" ? STEP : -STEP)));
        ramp = { from, to, t0: e.abs, t1: e.absEnd };
      }
      let v = cur;
      if (ramp) { v = levelAt(ramp, n.at); if (n.at >= ramp.t1) { cur = ramp.to; ramp = null; } }
      out.set(n.ev, v);
    }
  }
  return out;
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
  let perf = 0, prevBar = -2;
  let open = new Map(); // "staff:voice:midi" → the note still sounding through a tie
  let depth = new Map(); // open slurs per staff + voice: notes under a slur play legato (no air before the next note); the slur's last note breathes
  for (const { bar: b, pass } of unroll(doc)) {
    const len = capacity(timeOfBar(doc, b));
    if (b !== prevBar + 1) { open = new Map(); depth = new Map(); } // a jump or a repeat: nothing carries across
    if (!tempos.length || tempos[tempos.length - 1].bpm !== bpms[b]) tempos.push({ at: perf, bpm: bpms[b] });
    passes.push({ bar: b, pass, perfStart: perf, docStart: starts[b], len });
    doc.measures[b].staves.forEach((s, staff) => s.voices.forEach((v, voice) => {
      if (!v) return;
      const line = `${staff}:${voice}`;
      for (const o of onsets(v)) {
        if (o.ev.kind !== "note") continue;
        for (const x of o.ev.slurs ?? []) depth.set(line, Math.max(0, (depth.get(line) ?? 0) + (x.at === "start" ? 1 : -1)));
        const legato = (depth.get(line) ?? 0) > 0;
        const at = perf + o.start;
        // a rolled chord: its pitches enter one after another (up = low to high, down = high to low) and end together
        const roll = o.ev.arp && o.ev.pitches.length > 1 ? Math.min(ROLL_MAX, Math.floor(o.len / (4 * o.ev.pitches.length))) : 0;
        const order = roll ? [...o.ev.pitches].sort((p1, p2) => (o.ev.arp === "down" ? midiOf(p2) - midiOf(p1) : midiOf(p1) - midiOf(p2))) : o.ev.pitches;
        for (const [pi, p] of order.entries()) {
          const midi = midiOf(p), k = `${line}:${midi}`, lag = roll * pi;
          const held = open.get(k);
          const startsTie = p.tie === "start" || p.tie === "both";
          if (held && held.at + held.len === at) { held.len += o.len; if (!startsTie) open.delete(k); continue; }
          const n = { at: at + lag, len: o.len - lag, midi, staff, vel: vel.get(o.ev) ?? VEL.mf, ...(legato ? { legato: true } : {}) };
          notes.push(n);
          if (startsTie) open.set(k, n); else open.delete(k);
        }
      }
    }));
    perf += len;
    prevBar = b;
  }
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
