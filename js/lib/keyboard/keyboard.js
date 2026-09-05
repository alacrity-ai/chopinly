// The keyboard view + input (WSHED-73). Renders a range of keys into a host
// element and turns fingers, mouse and the computer keyboard into
// "noteon"/"noteoff" events. No sound of its own: the Piano tool wires it to
// piano.js; an exercise can mount it silent and light keys as targets.
//
//   const kb = createKeyboard(host, { from: "C4", to: "E4", labels: "all", whiteWidth: "2.4rem" });
//   kb.on("noteon", ({ midi, velocity, source }) => …);
//   kb.light(64, "target"); kb.press(60); kb.release(60); kb.setRange(48, 84);
import { layoutKeys, noteName, velocityAt, KEYMAP } from "./layout.js";

/**
 * Options: from/to — MIDI or names ("C4"), any sub-range (C–E, one octave, four);
 * labels "c" | "all" | "none"; keymap — the computer keyboard plays it;
 * whiteWidth — a CSS length per white key (else the keyboard fills its host);
 * ratio — white-key height ÷ width (default 5.2; 3.5 is a stubby strip).
 */
export function createKeyboard(host, { from = 60, to = 84, labels = "c", keymap = true, whiteWidth = null, ratio = null } = {}) {
  host.classList.add("kb");
  host.setAttribute("role", "group");
  host.setAttribute("aria-label", "piano keyboard");
  const state = { from, to, labels };
  // a fixed key size wins over whatever width the host had
  const fixWidth = (w) => { if (w) { host.style.setProperty("--kb-white-w", w); host.style.width = "calc(var(--kb-whites) * var(--kb-white-w))"; } else { host.style.removeProperty("--kb-white-w"); host.style.removeProperty("width"); } };
  if (whiteWidth) fixWidth(whiteWidth);
  if (ratio) host.style.setProperty("--kb-ratio", String(ratio));
  const listeners = { noteon: new Set(), noteoff: new Set() };
  const emit = (ev, d) => { for (const f of listeners[ev]) f(d); };
  const pointers = new Map(); // pointerId → midi under that finger
  const held = new Map();     // midi → Set(sources holding it)
  let keys = new Map();       // midi → element

  // black keys are narrow: their labels drop the octave
  const labelFor = (k) => state.labels === "all" ? (k.black ? noteName(k.midi, { octave: false }) : k.name) : state.labels === "c" && k.midi % 12 === 0 ? k.name : "";

  function render() {
    const lay = layoutKeys(state.from, state.to);
    state.from = lay.from; state.to = lay.to;
    host.style.setProperty("--kb-whites", lay.whites);
    host.innerHTML = lay.keys.map((k) =>
      `<div class="kb-key ${k.black ? "kb-black" : "kb-white"}" data-midi="${k.midi}" style="--x:${k.x};--w:${k.w}" aria-label="${k.name}"><span class="kb-label">${labelFor(k)}</span></div>`).join("");
    keys = new Map([...host.children].map((el) => [Number(el.dataset.midi), el]));
  }

  function press(midi, source, velocity = 0.8) {
    if (!keys.has(midi)) return;
    let s = held.get(midi);
    if (!s) { s = new Set(); held.set(midi, s); }
    const first = s.size === 0;
    s.add(source);
    if (first) { keys.get(midi).classList.add("down"); emit("noteon", { midi, velocity, source: typeof source === "number" ? "pointer" : source }); }
  }
  function release(midi, source) {
    const s = held.get(midi);
    if (!s || !s.has(source)) return;
    s.delete(source);
    if (s.size === 0) { held.delete(midi); keys.get(midi)?.classList.remove("down"); emit("noteoff", { midi }); }
  }
  function releaseAll() {
    for (const [midi, s] of [...held]) for (const src of [...s]) release(midi, src);
    pointers.clear();
  }

  // --- fingers + mouse: capture on the host so a glide across keys keeps reporting
  const keyAt = (x, y) => { const el = document.elementFromPoint(x, y)?.closest(".kb-key"); return el && host.contains(el) ? el : null; };
  const onDown = (e) => {
    const el = keyAt(e.clientX, e.clientY);
    if (!el) return;
    e.preventDefault();
    host.setPointerCapture?.(e.pointerId);
    const r = el.getBoundingClientRect();
    const midi = Number(el.dataset.midi);
    pointers.set(e.pointerId, midi);
    press(midi, e.pointerId, velocityAt((e.clientY - r.top) / r.height));
  };
  const onMove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const el = keyAt(e.clientX, e.clientY);
    const midi = el ? Number(el.dataset.midi) : null, was = pointers.get(e.pointerId);
    if (midi === was) return;
    if (was !== null) release(was, e.pointerId);
    pointers.set(e.pointerId, midi);
    if (midi !== null) press(midi, e.pointerId, 0.75);
  };
  const onUp = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const was = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (was !== null) release(was, e.pointerId);
  };
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointercancel", onUp);
  host.addEventListener("lostpointercapture", onUp);
  host.addEventListener("contextmenu", (e) => e.preventDefault());

  // --- the computer keyboard: home row = white keys from the bottom C
  const typing = (e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName) || e.target?.isContentEditable;
  const keyMidi = (e) => { const off = KEYMAP[e.key?.toLowerCase()]; return off === undefined ? null : state.from - (state.from % 12) + off; };
  const onKeyDown = (e) => { if (!keymap || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e) || !host.isConnected) return; const m = keyMidi(e); if (m !== null && keys.has(m)) { e.preventDefault(); press(m, "keyboard", 0.8); } };
  const onKeyUp = (e) => { const m = keyMidi(e); if (m !== null) release(m, "keyboard"); };
  const onBlur = () => releaseAll();
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  render();

  return {
    host,
    get from() { return state.from; }, get to() { return state.to; },
    on(ev, fn) { listeners[ev].add(fn); return () => listeners[ev].delete(fn); },
    setRange(f, t) { releaseAll(); state.from = f; state.to = t; render(); },
    /** Resize after mount: { whiteWidth, ratio } (null clears one). */
    setSize({ whiteWidth, ratio } = {}) {
      if (whiteWidth !== undefined) fixWidth(whiteWidth);
      if (ratio !== undefined) { if (ratio) host.style.setProperty("--kb-ratio", String(ratio)); else host.style.removeProperty("--kb-ratio"); }
    },
    setLabels(l) { state.labels = l; for (const [midi, el] of keys) el.querySelector(".kb-label").textContent = labelFor({ midi, name: noteName(midi), black: el.classList.contains("kb-black") }); },
    /** Mark a key: "target" | "correct" | "wrong" | null. */
    light(midi, kind) { const el = keys.get(midi); if (!el) return; if (kind) el.dataset.light = kind; else delete el.dataset.light; },
    clearLights() { for (const el of keys.values()) delete el.dataset.light; },
    /** Programmatic press/release (playback demos); emits like a finger would, source "api". */
    press(midi, { velocity = 0.8 } = {}) { press(midi, "api", velocity); },
    release(midi) { release(midi, "api"); },
    releaseAll,
    held: () => [...held.keys()].sort((a, b) => a - b),
    destroy() {
      releaseAll();
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", onBlur);
      host.replaceChildren(); host.classList.remove("kb"); fixWidth(null); host.style.removeProperty("--kb-ratio"); host.style.removeProperty("--kb-whites");
    },
  };
}
