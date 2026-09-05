// A piano-ish voice on the shared AudioContext (WSHED-73). Additive: a
// triangle fundamental with a few stretched sine partials through a lowpass
// whose cutoff opens with velocity and closes as the note decays. Polyphonic,
// with a sustain pedal. No samples — the app stays small and offline.
import { midiToFreq } from "../music.js";

const PARTIALS = [[1, "triangle", 1], [2, "sine", 0.5], [3, "sine", 0.22], [4, "sine", 0.1], [5, "sine", 0.05]];
const MAX_VOICES = 16;

export function createPiano(getAudio, { a4 = 440, volume = 0.7 } = {}) {
  const voices = new Map();      // midi → voice (key held)
  const ringing = new Set();     // voices let go under the pedal
  let sustain = false, out = null, ctx = null;
  const opts = { a4, volume };

  function bus() {
    const { context, master } = getAudio();
    if (!out) { ctx = context; out = context.createGain(); out.gain.value = opts.volume; out.connect(master); }
    return context;
  }

  function damp(vc, tail) {
    const t = vc.context.currentTime;
    vc.env.gain.cancelScheduledValues(t);
    vc.env.gain.setValueAtTime(Math.max(vc.env.gain.value, 0.0001), t);
    vc.env.gain.exponentialRampToValueAtTime(0.0001, t + tail);
    for (const o of vc.oscs) { try { o.stop(t + tail + 0.05); } catch { /* already stopped */ } }
  }

  function noteOn(midi, velocity = 0.8) {
    const context = bus();
    if (voices.has(midi)) { damp(voices.get(midi), 0.03); voices.delete(midi); }
    if (voices.size >= MAX_VOICES) { const [oldest] = voices.keys(); damp(voices.get(oldest), 0.08); voices.delete(oldest); }
    const f = midiToFreq(midi, opts.a4), t = context.currentTime, v = Math.max(0.05, Math.min(1, velocity));
    // low notes ring longer than high ones
    const decay = 1.0 + Math.max(0, 84 - midi) * 0.045;
    const env = context.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(v * 0.9, t + 0.004);
    env.gain.setTargetAtTime(0.0001, t + 0.012, decay / 3);
    const lp = context.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(Math.min(f * (2.5 + 7 * v), 14000), t);
    lp.frequency.setTargetAtTime(Math.max(f * 1.6, 500), t + 0.01, 0.45);
    lp.connect(env).connect(out);
    const oscs = PARTIALS.filter(([n]) => f * n < 10000).map(([n, type, g]) => {
      const o = context.createOscillator(), gg = context.createGain();
      o.type = type;
      o.frequency.value = f * n * (1 + 0.0003 * n * n); // string stretch: partials run a hair sharp
      gg.gain.value = g * (n === 1 ? 1 : 0.85 + 0.15 * v);
      o.connect(gg).connect(lp);
      o.start(t); o.stop(t + decay * 2.5 + 1); // silent long before this; frees the node
      return o;
    });
    voices.set(midi, { midi, oscs, env, lp, context });
  }

  function noteOff(midi) {
    const vc = voices.get(midi);
    if (!vc) return;
    voices.delete(midi);
    if (sustain) ringing.add(vc); else damp(vc, 0.16);
  }

  function setSustain(on) {
    sustain = !!on;
    if (!sustain) { for (const vc of ringing) damp(vc, 0.22); ringing.clear(); }
  }

  function allOff() {
    for (const vc of voices.values()) damp(vc, 0.1);
    for (const vc of ringing) damp(vc, 0.1);
    voices.clear(); ringing.clear();
  }

  return {
    noteOn, noteOff, setSustain, allOff,
    get sustain() { return sustain; },
    setVolume(v) { opts.volume = v; if (out) out.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
    setA4(hz) { opts.a4 = hz; },
    destroy() { allOff(); if (out) { const o = out; setTimeout(() => o.disconnect(), 400); out = null; } },
  };
}
