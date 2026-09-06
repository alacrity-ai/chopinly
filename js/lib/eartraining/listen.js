// What the mic hears → key presses (WSHED-86). Pure — node-tested.
//
// The mic stream gives a pitch estimate every ~50 ms (freq ≤ 0 when quiet or
// unpitched) with the frame's RMS. A note "presses" when the same nearest
// semitone is heard on `stable` consecutive frames — rounding to the nearest
// semitone is the wiggle room (±50 cents) for a piano that isn't perfectly in
// tune, and `a4` honors the tuner's calibration. A *different* note presses
// as soon as it's stable; the *same* note presses again only after real
// silence (`quietFrames`) or a re-strike (an RMS jump of `onsetRatio` once the
// attack has settled), so a decaying sustain never answers twice.

export const freqToMidi = (freq, a4 = 440) => 69 + 12 * Math.log2(freq / a4);
export const midiToFreq = (midi, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);

export function createNoteTracker({ a4 = 440, stable = 2, onsetRatio = 2.2, quietFrames = 4, settleFrames = 3 } = {}) {
  let cand = null, run = 0, held = null, quiet = 0, prevRms = 0, age = 0, armed = true;
  const reset = () => { cand = null; run = 0; held = null; quiet = 0; prevRms = 0; age = 0; armed = true; };
  return {
    reset,
    /** ({ freq, rms }) → { midi, cents, press } — press is the midi note to answer with, or null. */
    feed({ freq, rms = 0 }) {
      if (!(freq > 0)) {
        quiet++; cand = null; run = 0;
        if (quiet >= quietFrames) armed = true; // real silence: the held note may sound again
        prevRms = 0;
        return { midi: null, cents: 0, press: null };
      }
      quiet = 0;
      const exact = freqToMidi(freq, a4), midi = Math.round(exact), cents = Math.round((exact - midi) * 100);
      if (midi !== cand) { cand = midi; run = 1; } else run++;
      let press = null;
      if (run >= stable) {
        const restrike = held === midi && age >= settleFrames && prevRms > 0 && rms > prevRms * onsetRatio;
        if (held !== midi || armed || restrike) { press = midi; held = midi; armed = false; age = 0; }
        else age++;
      }
      prevRms = rms;
      return { midi, cents, press };
    },
  };
}
