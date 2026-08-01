// The referee. Pure and node-tested: sung-unit timeline + pitch samples →
// per-note tier + overall score. Octave-agnostic by design: sight singing
// tests pitch class and contour in *your* register, so the written G counts
// sung in any octave. See docs/SIGHTSINGING_PLAN.md §5.

export const TIERS = ["nailed", "good", "rough", "missed"];
export const TIER_SCORE = { nailed: 100, good: 75, rough: 40, missed: 0 };
// One notch easier than v1 by request: old standard is today's strict.
export const STRICTNESS = { relaxed: 2.0, standard: 1.5, strict: 1.0 };

const BASE_PRECISION = [15, 45, 90];   // cents, tier ceilings
const BASE_COVERAGE = [0.75, 0.55, 0.30];
const SAMPLE_SPAN = 0.085;             // expected mic cadence, seconds

/** Octave-folded pitch error in cents: distance to nearest octave of target. */
export function centsOff(sampleMidi, targetMidi) {
  const semis = ((sampleMidi - targetMidi) % 12 + 18) % 12 - 6;
  return semis * 100;
}

/**
 * units: [{ t0, t1, midi }] seconds from singing start.
 * samples: [{ t, midi(float) }] same clock.
 * Returns { notes: [{ tier, precision, coverage }], score, counts }.
 */
export function judge(units, samples, { strictness = 1, latency = 0.13, headGrace = 0.06 } = {}) {
  const prec = BASE_PRECISION.map((v) => v * strictness);
  const cov = BASE_COVERAGE.map((v) => Math.min(0.9, v / strictness));
  const shifted = samples.map((s) => ({ t: s.t - latency, midi: s.midi }));

  const notes = units.map((u) => {
    const w0 = u.t0 + headGrace, w1 = u.t1;
    const win = shifted.filter((s) => s.t >= w0 && s.t < w1);
    const errors = win.map((s) => Math.abs(centsOff(s.midi, u.midi)));
    const matching = errors.filter((e) => e <= prec[2]);
    const coverage = Math.min(1, (matching.length * SAMPLE_SPAN) / Math.max(w1 - w0, SAMPLE_SPAN));
    const sorted = [...matching].sort((a, b) => a - b);
    const precision = sorted.length ? sorted[Math.floor(sorted.length / 2)] : Infinity;

    let tier = "missed";
    if (precision <= prec[0] && coverage >= cov[0]) tier = "nailed";
    else if (precision <= prec[1] && coverage >= cov[1]) tier = "good";
    else if (precision <= prec[2] && coverage >= cov[2]) tier = "rough";
    return { tier, precision, coverage };
  });

  const counts = Object.fromEntries(TIERS.map((t) => [t, notes.filter((n) => n.tier === t).length]));
  const score = notes.length
    ? Math.round(notes.reduce((s, n) => s + TIER_SCORE[n.tier], 0) / notes.length)
    : 0;
  return { notes, score, counts };
}

/**
 * Optimistic live tier for a note still sounding. Precision-only — coverage
 * can't be known until the note ends, so we assume the singer will hold it and
 * let the end-of-window judge() pass correct the color if they don't.
 * Returns null until there's enough evidence (≥2 in-tolerance samples, or ≥5
 * voiced samples with none in tolerance → "missed").
 */
export function provisionalTier(unit, samples, { strictness = 1, latency = 0.13, headGrace = 0.06 } = {}) {
  const prec = BASE_PRECISION.map((v) => v * strictness);
  const w0 = unit.t0 + headGrace;
  const errors = [];
  for (const s of samples) {
    const t = s.t - latency;
    if (t >= w0 && t < unit.t1) errors.push(Math.abs(centsOff(s.midi, unit.midi)));
  }
  const matching = errors.filter((e) => e <= prec[2]).sort((a, b) => a - b);
  if (matching.length >= 2) {
    const precision = matching[Math.floor(matching.length / 2)];
    return precision <= prec[0] ? "nailed" : precision <= prec[1] ? "good" : "rough";
  }
  return errors.length >= 5 ? "missed" : null;
}
