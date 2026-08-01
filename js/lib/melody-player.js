// Melody playback on the shared audio clock. Takes a timeline from
// melodies.toTimeline() (ties merged, times in seconds) and schedules every
// note up front — sample-accurate, nothing to chase. Callers drive highlights
// by comparing context.currentTime against the returned start time.
import { midiToFreq } from "./music.js";

const VOICE_GAIN = 0.5;

function scheduleTone(context, dest, freq, t0, t1) {
  const g = context.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(1, t0 + 0.035);
  g.gain.setValueAtTime(1, Math.max(t1 - 0.07, t0 + 0.04));
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  const lp = context.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.min(freq * 4, 9000);
  const osc = context.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  osc.connect(lp).connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t1 + 0.03);
  return osc;
}

/** Play a timeline. Returns { t0, endsAt, stop() }. */
export function playMelody(getAudio, timeline, { a4 = 440, gain = VOICE_GAIN, delay = 0.15 } = {}) {
  const { context, master } = getAudio();
  const out = context.createGain();
  out.gain.value = gain;
  out.connect(master);
  const t0 = context.currentTime + delay;
  const oscs = timeline.units.map((u) =>
    scheduleTone(context, out, midiToFreq(u.midi, a4), t0 + u.t0, t0 + u.t1));
  return {
    t0,
    endsAt: t0 + timeline.total,
    stop() {
      const now = context.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0.0001, now, 0.03);
      for (const o of oscs) { try { o.stop(now + 0.1); } catch { /* already stopped */ } }
    },
  };
}

/** Sustain a chord (midis) from atTime for dur seconds — the count-in tonic.
 *  Pass `out` to route through a caller-owned (killable) bus. */
export function playChord(getAudio, midis, atTime, dur, { a4 = 440, gain = 0.3, out: dest } = {}) {
  const { context, master } = getAudio();
  const out = context.createGain();
  out.gain.value = gain / Math.sqrt(midis.length);
  out.connect(dest ?? master);
  for (const m of midis) scheduleTone(context, out, midiToFreq(m, a4), atTime, atTime + dur);
}

/** One count-in / practice click at an exact audio time (optionally via a bus). */
export function scheduleClick(getAudio, atTime, accent = false, dest = null) {
  const { context, master } = getAudio();
  const osc = context.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(accent ? 2100 : 1700, atTime);
  osc.frequency.exponentialRampToValueAtTime((accent ? 2100 : 1700) * 0.6, atTime + 0.03);
  const g = context.createGain();
  g.gain.setValueAtTime(accent ? 0.5 : 0.3, atTime);
  g.gain.exponentialRampToValueAtTime(0.001, atTime + 0.05);
  osc.connect(g).connect(dest ?? master);
  osc.start(atTime);
  osc.stop(atTime + 0.07);
}
