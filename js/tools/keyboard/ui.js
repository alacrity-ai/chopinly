// Piano: a keyboard sized to the screen (two octaves on a phone, up to four on
// a desk), octave shift, sustain pedal, labels, A4 and volume. Held notes are
// read out above the keys.
import { createKeyboard } from "../../lib/keyboard/keyboard.js";
import { createPiano } from "../../lib/keyboard/piano.js";
import { autoOctaves, fitBox, rangeFor, clampBase, noteName } from "../../lib/keyboard/layout.js";
import { haptic } from "../logbook/motion.js";

export function buildUI(root, { getAudio, store }) {
  const state = {
    base: store.get("base", 60),          // the bottom C
    octaves: store.get("octaves", null),  // null = pick for the screen
    sustain: store.get("sustain", false),
    labels: store.get("labels", "c"),
    volume: store.get("volume", 0.7),
    a4: store.get("a4", 440),
  };
  let octaves = 2;

  root.innerHTML = `
    <section class="piano">
      <div class="piano-read" id="kb-read" aria-live="polite"><span class="piano-read-notes" id="kb-notes">tap a key</span></div>
      <div class="piano-wrap" id="kb-wrap"><div id="kb-host"></div></div>
      <div class="params piano-params">
        <div class="param">octaves<div class="segmented" id="kb-octaves" role="radiogroup" aria-label="octaves shown">
          ${[1, 2, 3, 4].map((n) => `<button data-n="${n}" role="radio" aria-checked="false" aria-pressed="false">${n}</button>`).join("")}
        </div></div>
        <div class="param">range
          <button class="nudge" id="kb-down" aria-label="an octave lower">−</button>
          <span class="piano-range" id="kb-range"></span>
          <button class="nudge" id="kb-up" aria-label="an octave higher">+</button>
        </div>
        <div class="param"><button type="button" class="tap piano-pedal" id="kb-sustain" aria-pressed="${state.sustain}">sustain</button></div>
        <div class="param">labels<div class="segmented" id="kb-labels">
          <button data-l="c" aria-pressed="${state.labels === "c"}">C</button><button data-l="all" aria-pressed="${state.labels === "all"}">all</button><button data-l="none" aria-pressed="${state.labels === "none"}">none</button>
        </div></div>
        <label class="param">A4
          <input type="range" id="kb-a4" min="430" max="450" step="0.5" value="${state.a4}" aria-label="A4 calibration in hertz">
          <output id="kb-a4-out">${state.a4}</output>
        </label>
        <label class="param">volume
          <input type="range" id="kb-volume" min="0" max="1" step="0.01" value="${state.volume}" aria-label="volume">
        </label>
      </div>
      <p class="piano-hint">on a keyboard: A S D F G H J K play the white keys from the bottom C, W E T Y U the black ones</p>
    </section>`;

  const el = (id) => root.querySelector(`#${id}`);
  const wrap = el("kb-wrap"), notes = el("kb-notes"), rangeEl = el("kb-range"), section = root.querySelector(".piano"), params = root.querySelector(".piano-params"), hint = root.querySelector(".piano-hint");
  const piano = createPiano(getAudio, { a4: state.a4, volume: state.volume });
  piano.setSustain(state.sustain);
  const kb = createKeyboard(el("kb-host"), { ...rangeFor(state.base, octaves), labels: state.labels });

  const save = () => { for (const k of ["base", "octaves", "sustain", "labels", "volume", "a4"]) store.set(k, state[k]); };

  let lastChord = [];
  function readout() {
    const h = kb.held();
    if (h.length) { lastChord = h; notes.textContent = h.map((m) => noteName(m)).join(" · "); notes.classList.remove("dim"); }
    else if (lastChord.length) { notes.textContent = lastChord.map((m) => noteName(m)).join(" · "); notes.classList.add("dim"); }
  }
  kb.on("noteon", ({ midi, velocity, source }) => { piano.noteOn(midi, velocity); if (source === "pointer") haptic(6); readout(); });
  kb.on("noteoff", ({ midi }) => { piano.noteOff(midi); readout(); });

  // The biggest keyboard the screen allows for the chosen octaves: fills the
  // width, and on a short screen (a phone on its side) gets stubbier, then
  // narrower — never past the edge, never under the controls.
  const PAD = 2 * 9 + 2;
  function fit() {
    const availW = Math.max(120, (section.clientWidth || root.clientWidth || 360) - PAD);
    const top = wrap.getBoundingClientRect().top;
    const below = params.offsetHeight + (hint.offsetHeight || 0) + 40;
    const availH = Math.max(110, innerHeight - top - below - PAD);
    const o = state.octaves ?? autoOctaves(availW);
    state.base = clampBase(state.base, o);
    if (o !== octaves || kb.from !== state.base) { octaves = o; kb.setRange(state.base, state.base + 12 * o); }
    const { white, ratio } = fitBox(7 * o + 1, availW, availH);
    kb.setSize({ whiteWidth: `${white.toFixed(2)}px`, ratio: Number(ratio.toFixed(3)) });
    for (const b of el("kb-octaves").children) { const on = Number(b.dataset.n) === o; b.setAttribute("aria-checked", String(on)); b.setAttribute("aria-pressed", String(on)); }
    rangeEl.textContent = `${noteName(state.base)} – ${noteName(state.base + 12 * o)}`;
    el("kb-down").disabled = clampBase(state.base - 12, o) === state.base;
    el("kb-up").disabled = clampBase(state.base + 12, o) === state.base;
  }
  const shift = (d) => { state.base = clampBase(state.base + 12 * d, octaves); save(); fit(); haptic(8); };
  el("kb-down").addEventListener("click", () => shift(-1));
  el("kb-up").addEventListener("click", () => shift(1));
  for (const b of el("kb-octaves").children) b.addEventListener("click", () => { state.octaves = Number(b.dataset.n); save(); fit(); haptic(8); });

  const pedal = el("kb-sustain");
  pedal.addEventListener("click", () => { state.sustain = !state.sustain; piano.setSustain(state.sustain); pedal.setAttribute("aria-pressed", String(state.sustain)); save(); haptic(state.sustain ? 12 : 6); });

  for (const b of el("kb-labels").children) b.addEventListener("click", () => {
    state.labels = b.dataset.l; kb.setLabels(state.labels); save();
    for (const s of el("kb-labels").children) s.setAttribute("aria-pressed", String(s === b));
  });
  el("kb-a4").addEventListener("input", (e) => { state.a4 = Number(e.target.value); el("kb-a4-out").textContent = state.a4; piano.setA4(state.a4); save(); });
  el("kb-volume").addEventListener("input", (e) => { state.volume = Number(e.target.value); piano.setVolume(state.volume); save(); });

  const ro = new ResizeObserver(() => fit());
  ro.observe(section);
  const onResize = () => fit();
  window.addEventListener("resize", onResize);
  fit();
  requestAnimationFrame(fit); // once fonts and the params row have settled

  return {
    destroy() { ro.disconnect(); window.removeEventListener("resize", onResize); kb.destroy(); piano.destroy(); },
  };
}
