// The metronome clock, shared by the whole app (WSHED-110). One engine and one
// settings object, created on first use and never torn down: the Metronome
// tool binds to it while mounted, the shell shows a "playing" pill when it
// runs elsewhere, and the score reader drives it from its top bar. Switching
// tools no longer stops the click — only you do.
import { makeStore } from "./store.js";
import { getAudio } from "./audio.js";
import { MetronomeEngine } from "../tools/metronome/engine.js";

const store = makeStore("metronome"); // the tool's own namespace, so nothing anyone set is lost
export const MIN_BPM = 20, MAX_BPM = 300;

export const settings = {
  bpm: store.get("bpm", 96),
  beats: store.get("beats", 4),
  beatStates: store.get("beatStates", [2, 1, 1, 1]),
  subdivision: store.get("subdivision", 1),
  voice: store.get("voice", "wood"),
};
const engine = new MetronomeEngine(getAudio, settings);
engine.setVolume(store.get("volume", 0.8));

const listeners = new Set();       // (running: boolean) — state
const tempoListeners = new Set();  // (bpm: number) — tempo and settings edits
engine.onchange = (running) => { for (const fn of listeners) { try { fn(running); } catch { /* one listener's error is not the clock's */ } } };

export function save() {
  store.set("bpm", settings.bpm);
  store.set("beats", settings.beats);
  store.set("beatStates", settings.beatStates);
  store.set("subdivision", settings.subdivision);
  store.set("voice", settings.voice);
}
/** Set the tempo (clamped, rounded), persist it, tell everyone showing it. */
export function setBpm(v) {
  const n = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(Number(v))));
  if (!Number.isFinite(n)) return settings.bpm;
  settings.bpm = n;
  save();
  for (const fn of tempoListeners) { try { fn(n); } catch { /* same */ } }
  return n;
}
export const nudge = (d) => setBpm(settings.bpm + d);
export function setVolume(v) { engine.setVolume(v); store.set("volume", v); }
export const volume = () => store.get("volume", 0.8);

export const clock = {
  engine, settings, save, setBpm, nudge, setVolume, volume,
  get running() { return engine.running; },
  start() { engine.start(); },
  stop() { engine.stop(); },
  toggle() { if (engine.running) engine.stop(); else engine.start(); },
  /** Beat / phase off the audio clock, for anything that wants to flash in time. */
  pointer: () => engine.pointer(),
  preview: (kind) => engine.preview(kind),
  /** Running-state changes; returns the unsubscribe. Fires immediately with the current state. */
  on(fn) { listeners.add(fn); try { fn(engine.running); } catch { /* fine */ } return () => listeners.delete(fn); },
  /** Tempo / settings changes; returns the unsubscribe. */
  onTempo(fn) { tempoListeners.add(fn); return () => tempoListeners.delete(fn); },
};
