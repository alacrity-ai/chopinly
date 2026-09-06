// The bar as data (WSHED-85). Pure: no Web Audio here, so node can test it.
//
// The engine renders one bar of clicks into a buffer and loops it on the
// audio thread, so the beat survives a locked screen (no JS timers involved).
// A bar at an arbitrary tempo is not a whole number of samples; it rounds to
// one (≤ half a sample, ~10 µs, the same every bar — beats stay perfectly
// even, the tempo is off by a few parts per million).

/** Seconds rendered past the bar end and folded onto its start (longest voice decay is ~0.11 s). */
export const TAIL_S = 0.2;

const clampInt = (v, lo, hi, fallback) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };

/**
 * Where every click of one bar falls.
 * settings: { bpm, beats, beatStates[], subdivision } — beatStates: 2 accent · 1 normal · 0 muted.
 * → { bpm, beats, subdivision, barSamples, barDur, beatDur, clicks: [{ t, kind, beat }] } (t in seconds from the bar start)
 */
export function barPlan(settings, sampleRate) {
  const bpm = clampInt(settings.bpm, 20, 300, 96);
  const beats = clampInt(settings.beats, 1, 12, 4);
  const subdivision = clampInt(settings.subdivision, 1, 4, 1);
  const barSamples = Math.max(1, Math.round((beats * 60 / bpm) * sampleRate));
  const barDur = barSamples / sampleRate;
  const beatDur = barDur / beats; // divides the rounded bar evenly so the loop closes on a beat
  const clicks = [];
  for (let i = 0; i < beats; i++) {
    const state = settings.beatStates?.[i] ?? 1;
    if (state === 0) continue; // a muted beat mutes its subdivisions too
    clicks.push({ t: i * beatDur, kind: state === 2 ? "accent" : "beat", beat: i });
    for (let k = 1; k < subdivision; k++) clicks.push({ t: i * beatDur + (k * beatDur) / subdivision, kind: "sub", beat: i });
  }
  return { bpm, beats, subdivision, barSamples, barDur, beatDur, clicks };
}

/** Rendered samples (bar + tail) → one bar, the tail added onto the start so the seam carries the last click's decay. */
export function fold(data, barSamples) {
  const out = new Float32Array(barSamples);
  out.set(data.subarray(0, barSamples));
  const tail = Math.min(data.length - barSamples, barSamples);
  for (let i = 0; i < tail; i++) out[i] += data[barSamples + i];
  return out;
}

/** The settings that change the rendered bar. */
export const signature = (s) => `${s.bpm}|${s.beats}|${s.subdivision}|${s.voice}|${Array.from({ length: Math.max(1, s.beats | 0) }, (_, i) => s.beatStates?.[i] ?? 1).join("")}`;

/**
 * The first beat boundary of `anchor` at or after `notBefore` (audio-clock seconds).
 * anchor: { time, beat, beats, beatDur, elapsed } — the loop in force (or the last one scheduled).
 * → { time, beat, elapsed } where beat is that boundary's index in the anchor's meter.
 */
export function nextBeatBoundary(anchor, notBefore) {
  const n = Math.max(0, Math.ceil((notBefore - anchor.time) / anchor.beatDur - 1e-9));
  return { time: anchor.time + n * anchor.beatDur, beat: (anchor.beat + n) % anchor.beats, elapsed: anchor.elapsed + n, n };
}

/** Seconds into a new bar (plan) where beat `beat` of the old meter should land: same beat number, wrapped to the new meter. */
export function swapOffset(plan, beat) {
  return (beat % plan.beats) * plan.beatDur;
}

/** Where the beat is at audio time `now`, given the anchor in force. */
export function pointerAt(anchor, now) {
  const k = Math.max(0, (now - anchor.time) / anchor.beatDur);
  const whole = Math.floor(k);
  return { beat: (anchor.beat + whole) % anchor.beats, phase: k - whole, beatsElapsed: anchor.elapsed + k };
}
