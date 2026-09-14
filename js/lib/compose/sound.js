// Audition (docs/COMPOSE_DESIGN.md §8.5): the piano voice plays what was just
// placed, or each step of a drag. Chords sound together.
import { createPiano } from "../keyboard/piano.js";
import { midiOf } from "./engine.js";

export function createSound(getAudio, { volume = 0.6 } = {}) {
  let piano = null, muted = false;
  const get = () => (piano ??= createPiano(getAudio, { volume }));
  return {
    get muted() { return muted; },
    setMuted(m) { muted = !!m; if (muted) piano?.allOff(); },
    /** Sound the pitches for `ms`. */
    play(pitches, ms = 250) {
      if (muted || !pitches?.length) return;
      const p = get(), midis = pitches.map(midiOf);
      for (const m of midis) p.noteOn(m, 0.75);
      setTimeout(() => { for (const m of midis) p.noteOff(m); }, ms);
    },
    destroy() { piano?.destroy(); piano = null; },
  };
}
