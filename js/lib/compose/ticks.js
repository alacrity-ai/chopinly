// Time base for Compose (docs/COMPOSE_DESIGN.md §5): ticks at 6720 per quarter
// (960 × 7), so every palette value — dots to two, tuplets 2/3/5/6/7 down to
// the 64th — is an integer.
// A duration is { base, dots, tuplet } — base 0 = double whole, 1 = whole … 64.
// Pure — node-testable.

export const PPQ = 6720;
export const WHOLE = 4 * PPQ;
export const BASES = [0, 1, 2, 4, 8, 16, 32, 64];

/** Ticks of a duration. Throws when the value is not an integer (a guard the palette never trips). */
export function ticks({ base, dots = 0, tuplet = null }) {
  if (!BASES.includes(base)) throw new Error(`bad duration base ${base}`);
  const plain = base === 0 ? 2 * WHOLE : WHOLE / base;
  let t = plain, add = plain;
  for (let i = 0; i < dots; i++) { add /= 2; t += add; }
  if (tuplet) t = (t * tuplet.in) / tuplet.n;
  if (!Number.isInteger(t)) throw new Error("duration not representable in ticks");
  return t;
}

/** Ticks in a bar of this time signature. */
export const capacity = ({ beats, unit }) => (beats * WHOLE) / unit;

/** Beat-group size in ticks: what beams and rests may not cross (whole-bar rests excepted). */
export function groupSize(time) {
  const beat = WHOLE / time.unit;
  const compound = time.beats % 3 === 0 && time.beats > 3;
  return compound ? 3 * beat : beat;
}
/** Group boundaries [0, g, 2g, …, capacity]. */
export function beatGroups(time) {
  const cap = capacity(time), g = groupSize(time), out = [];
  for (let t = 0; t < cap; t += g) out.push(t);
  out.push(cap);
  return out;
}
const groupOf = (t, time) => Math.floor(t / groupSize(time));

const PLAIN = [WHOLE, WHOLE / 2, WHOLE / 4, WHOLE / 8, WHOLE / 16, WHOLE / 32, WHOLE / 64];
const DOTTED = PLAIN.slice(0, -1).map((v) => v * 1.5);
const BASE_OF = new Map(PLAIN.map((v, i) => [v, [1, 2, 4, 8, 16, 32, 64][i]]));
const DOTTED_BASE_OF = new Map(DOTTED.map((v, i) => [v, [1, 2, 4, 8, 16, 32][i]]));

/** { base, dots } for a tick count that is a plain or singly dotted value, else null. */
export function fromTicks(t) {
  if (BASE_OF.has(t)) return { base: BASE_OF.get(t), dots: 0 };
  if (DOTTED_BASE_OF.has(t)) return { base: DOTTED_BASE_OF.get(t), dots: 1 };
  if (t === 2 * WHOLE) return { base: 0, dots: 0 };
  return null;
}

/**
 * The standard rests for a gap of `len` ticks starting at `at` in a bar of
 * `time`: aligned to their own size, longest first, never crossing a beat
 * group. (A bar that is all rests is *drawn* as one whole-bar rest by the
 * layout; its events are still the metre's split, so every bar adds up.)
 */
export function splitRest(len, at, time) {
  if (at === 0 && len === capacity(time) && fromTicks(len)) return [fromTicks(len)]; // a whole empty bar is one rest when one value spans it (whole in 4/4, dotted half in 3/4 and 6/8)
  const compound = groupSize(time) !== WHOLE / time.unit;
  const candidates = compound ? [...PLAIN, ...DOTTED].sort((a, b) => b - a) : PLAIN;
  const out = [];
  let pos = at, left = len;
  while (left > 0) {
    // Simple metres: a rest starts on a multiple of its own size (a half rest on
    // beat 3, never on beat 2). Compound metres: the largest rest that fits
    // inside the dotted group, aligned to the beat unit (eighth + quarter rest
    // after a note on beat 1 of 6/8).
    const gEnd = compound ? (groupOf(pos, time) + 1) * groupSize(time) : Infinity;
    const aligned = compound ? (v) => pos % (WHOLE / time.unit) === 0 : (v) => pos % v === 0;
    const d = candidates.find((v) => v <= left && aligned(v) && pos + v <= gEnd)
      ?? candidates.find((v) => v <= left && pos + v <= gEnd)
      ?? candidates.find((v) => v <= left);
    if (!d) throw new Error(`cannot split a rest of ${left} ticks at ${pos}`);
    out.push(fromTicks(d));
    pos += d; left -= d;
  }
  return out;
}

/** The slot size a tap snaps to inside a rest: the armed duration itself. */
export const grid = (armed) => ticks(armed);
