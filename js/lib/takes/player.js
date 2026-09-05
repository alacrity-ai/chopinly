// One player for every take on screen (WSHED-75): only one take plays at a
// time. Duration comes from the take's metadata, not the blob (MediaRecorder
// WebM reports Infinity). Compare mode holds an A and a B: play runs A then
// B; flip jumps to the other side at the same place in the passage.
import { takeStore } from "./store.js";

const audio = typeof Audio !== "undefined" ? new Audio() : null;
let url = null, cur = null, playing = false, pair = null, side = null, timer = 0;
const listeners = new Set();
const emit = () => { const s = snapshot(); for (const fn of listeners) fn(s); };

export function snapshot() {
  const t = audio?.currentTime ?? 0;
  return { id: cur?.id ?? null, playing, t: t * 1000, dur: cur?.durationMs ?? 0, frac: cur ? Math.min(1, (t * 1000) / cur.durationMs) : 0, pair, side };
}

async function load(take) {
  if (cur?.id === take.id) return true;
  const blob = await takeStore.get(take.id);
  if (!blob) return false;
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(blob);
  audio.src = url;
  cur = take;
  return true;
}

function tick() { clearInterval(timer); if (playing) timer = setInterval(emit, 100); }

if (audio) {
  audio.addEventListener("ended", () => {
    playing = false;
    if (pair && side === "a") { play(pair.b, "b"); return; }
    tick(); emit();
  });
  audio.addEventListener("pause", () => { playing = false; tick(); emit(); });
  audio.addEventListener("play", () => { playing = true; tick(); emit(); });
}

/** Play a take from the start (or from `at` ms). */
export async function play(take, s = null, at = 0) {
  if (!audio) return false;
  if (s) side = s; else if (!pair || (pair.a.id !== take.id && pair.b.id !== take.id)) { pair = null; side = null; } else side = pair.a.id === take.id ? "a" : "b";
  if (!(await load(take))) return false;
  audio.currentTime = Math.max(0, at) / 1000;
  try { await audio.play(); } catch { return false; }
  return true;
}
export function pause() { audio?.pause(); }
export function stop() { if (!audio) return; audio.pause(); audio.currentTime = 0; playing = false; emit(); }
export async function toggle(take) {
  if (cur?.id === take.id && playing) { pause(); return; }
  if (cur?.id === take.id) { try { await audio.play(); } catch { /* blocked */ } return; }
  await play(take);
}
export function seek(take, frac) {
  if (!audio || cur?.id !== take.id) { play(take, null, frac * take.durationMs); return; }
  audio.currentTime = (frac * take.durationMs) / 1000; emit();
}
/** Compare: A then B. `flip()` swaps sides at the same relative position. */
export function compare(a, b) { pair = { a, b }; side = "a"; return play(a, "a"); }
export function flip() {
  if (!pair || !cur) return;
  const frac = cur.durationMs ? (audio.currentTime * 1000) / cur.durationMs : 0;
  const to = side === "a" ? "b" : "a";
  play(pair[to], to, frac * pair[to].durationMs);
}
export function endCompare() { pair = null; side = null; emit(); }
export const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const player = { play, pause, stop, toggle, seek, compare, flip, endCompare, on, snapshot };
