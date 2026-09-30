// A plucked string for the chord diagrams (WSHED-160): Karplus–Strong rendered
// once per note into an AudioBuffer (cached), then strummed or arpeggiated on
// the shared audio clock. Nylon-ish for the ukulele, a touch brighter for steel.
import { midiToFreq } from "../music.js";

const cache = new Map();

function ksBuffer(context, midi, bright) {
  const k = `${context.sampleRate}:${midi}:${bright}`;
  if (cache.has(k)) return cache.get(k);
  const sr = context.sampleRate, freq = midiToFreq(midi);
  const len = Math.floor(sr * 2.4);
  const buf = context.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  // y[n] = decay · ½(d[n] + d[n-1]), d[n] = y[n-P] with P = sr/f − ½ (the averager's own half-sample
  // delay), the fractional part by linear interpolation — so the loop's total delay is exactly one period.
  const P = sr / freq - 0.5, N = Math.floor(P), frac = P - N;
  let seed = midi * 9301 + 49297;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280) * 2 - 1;
  let lp = 0;
  for (let n = 0; n <= N + 1 && n < len; n++) { lp += bright * (rand() - lp); out[n] = lp; } // the pick: lowpassed noise
  const t60 = Math.max(2.5, 6 - (midi - 40) * 0.08);  // seconds to fade 60 dB: low strings ring longer
  const decay = 10 ** (-3 / (t60 * freq));               // applied once per trip round the loop
  const d = (n) => (1 - frac) * out[n - N] + frac * out[n - N - 1];
  for (let n = N + 2; n < len; n++) out[n] = decay * 0.5 * (d(n) + d(n - 1));
  let peak = 0;
  for (let n = 0; n < 4000 && n < len; n++) peak = Math.max(peak, Math.abs(out[n]));
  const norm = peak > 0 ? 0.8 / peak : 1;
  for (let n = 0; n < len; n++) out[n] *= norm * Math.min(1, (len - n) / (sr * 0.3)); // fade the tail
  cache.set(k, buf);
  return buf;
}

/**
 * Play notes (MIDI, low string first) as a strum or an arpeggio.
 * → { stop(), endsAt }. Each call gets its own bus so stop() only silences this one.
 */
export function pluck(getAudio, notes, { mode = "strum", instrument = "guitar", gain = 0.45 } = {}) {
  const { context, master } = getAudio();
  const bus = context.createGain();
  bus.gain.value = gain / Math.sqrt(Math.max(1, notes.length) / 2);
  bus.connect(master);
  const bright = instrument === "ukulele" ? 0.45 : 0.7;
  const gap = mode === "strum" ? 0.028 : 0.22;
  const t0 = context.currentTime + 0.03;
  notes.forEach((m, i) => {
    const src = context.createBufferSource();
    src.buffer = ksBuffer(context, m, bright);
    src.connect(bus);
    src.start(t0 + i * gap);
  });
  const endsAt = t0 + notes.length * gap + 2.4;
  return {
    endsAt,
    stop() {
      const now = context.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0.0001, now, 0.04);
      setTimeout(() => bus.disconnect(), 400);
    },
  };
}
