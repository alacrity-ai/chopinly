// Playback (docs/COMPOSE_DESIGN.md §8.6): the document as a timeline of note
// on / off events in ticks, sequenced on the audio clock through the piano
// voice. `timeline` is pure — node-testable; `createPlayer` owns the clock.
import { PPQ } from "./ticks.js";
import { onsets, midiOf, barStarts } from "./engine.js";
import { createPiano } from "../keyboard/piano.js";

const LOOKAHEAD_S = 0.18, TICK_MS = 45, GATE = 0.92; // a note sounds for 92% of its length — a hair of air between repeated notes

/**
 * Every note of the document as { at, len, midi, staff } in absolute ticks,
 * sorted by onset. A pitch tied to the next note of the same pitch in the
 * same staff sounds once, for the combined length.
 */
export function timeline(doc) {
  const { starts, total } = barStarts(doc);
  const notes = [];
  const open = new Map(); // "staff:midi" → the note still sounding through a tie
  for (let b = 0; b < doc.measures.length; b++) {
    doc.measures[b].staves.forEach((s, staff) => {
      for (const o of onsets(s.voices[0])) {
        if (o.ev.kind !== "note") continue;
        const at = starts[b] + o.start;
        for (const p of o.ev.pitches) {
          const midi = midiOf(p), k = `${staff}:${midi}`;
          const held = open.get(k);
          const starts = p.tie === "start" || p.tie === "both";
          if (held && held.at + held.len === at) { held.len += o.len; if (!starts) open.delete(k); continue; }
          const n = { at, len: o.len, midi, staff };
          notes.push(n);
          if (starts) open.set(k, n); else open.delete(k);
        }
      }
    });
  }
  notes.sort((a, b) => a.at - b.at || a.staff - b.staff || a.midi - b.midi);
  return { notes, total };
}

/**
 * The player: play / pause / stop / seek over a document at a tempo, reporting
 * the playhead in ticks each animation frame. `getDoc` is read at play() and
 * refresh() so an edit mid-play is heard from the next note on.
 */
export function createPlayer({ getAudio, getDoc, getTempo, onTick, onEnd }) {
  let piano = null, timer = 0, raf = 0, playing = false;
  let pos = 0;                      // ticks — the playhead when paused
  let anchorT = 0, anchorTicks = 0; // audio-clock time ↔ ticks while playing
  let queue = [], qi = 0, total = 0;
  const secPerTick = () => 60 / (getTempo() * PPQ);
  const ctx = () => getAudio().context;
  const now = () => (playing ? anchorTicks + (ctx().currentTime - anchorT) / secPerTick() : pos);

  function build(fromTicks) {
    const tl = timeline(getDoc());
    total = tl.total;
    // on / off events after the start, in time order; offs first at equal times so a repeated pitch re-strikes
    const evs = [];
    for (const n of tl.notes) {
      if (n.at + n.len <= fromTicks) continue;
      evs.push({ t: Math.max(fromTicks, n.at), on: true, midi: n.midi, late: n.at < fromTicks });
      evs.push({ t: n.at + n.len * GATE, on: false, midi: n.midi });
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
      const e = queue[qi], when = anchorT + (e.t - anchorTicks) * secPerTick();
      if (when > horizon) break;
      if (e.on) p.noteOn(e.midi, 0.7, when); else p.noteOff(e.midi, when);
      qi++;
    }
  }
  function frame() {
    if (!playing) return;
    const t = now();
    if (t >= total) { stopAt(total); onEnd?.(); return; }
    onTick?.(t);
    raf = requestAnimationFrame(frame);
  }
  function stopAt(t) {
    playing = false; pos = Math.max(0, Math.min(total, t));
    clearInterval(timer); timer = 0; cancelAnimationFrame(raf); raf = 0;
    piano?.allOff();
    onTick?.(pos);
  }
  function play(from = pos) {
    if (playing) return;
    const context = ctx();
    if (context.state === "suspended") context.resume?.();
    build(from);
    if (from >= total) from = 0, build(0);
    playing = true; anchorT = context.currentTime + 0.05; anchorTicks = from;
    pump(); timer = setInterval(pump, TICK_MS); raf = requestAnimationFrame(frame);
  }
  return {
    get playing() { return playing; },
    get position() { return now(); },
    get total() { return total || timeline(getDoc()).total; },
    play,
    pause() { if (playing) stopAt(now()); },
    stop() { stopAt(0); },
    toggle() { if (playing) stopAt(now()); else play(); },
    /** Move the playhead (keeps playing if it was). */
    seek(t) { const was = playing; if (was) stopAt(t); else { pos = Math.max(0, t); onTick?.(pos); } if (was) play(pos); },
    /** The document or tempo changed: re-sequence from the current position. */
    refresh() { if (playing) { const t = now(); piano?.allOff(); build(t); anchorT = ctx().currentTime; anchorTicks = t; pump(); } else { pos = Math.min(pos, timeline(getDoc()).total); onTick?.(pos); } },
    destroy() { stopAt(pos); piano?.destroy(); piano = null; },
  };
}
