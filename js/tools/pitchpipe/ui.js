// Pitch pipe: a ring of 12 notes (like a chromatic pitch pipe), tap to sound a
// sustained reed-ish tone, tap again to stop. Octave + A4 calibration retune a
// sounding note live — no restart, so you can sweep while tuning.

const NOTES = [
  ["C", "C"], ["C♯", "D♭"], ["D", "D"], ["D♯", "E♭"], ["E", "E"], ["F", "F"],
  ["F♯", "G♭"], ["G", "G"], ["G♯", "A♭"], ["A", "A"], ["A♯", "B♭"], ["B", "B"],
];
const isBlack = (i) => [1, 3, 6, 8, 10].includes(i);

export function buildUI(root, { getAudio, store, setRunning }) {
  const state = {
    note: store.get("note", 9),      // A
    octave: store.get("octave", 4),
    a4: store.get("a4", 440),
    volume: store.get("volume", 0.6),
  };

  const freqOf = () =>
    state.a4 * Math.pow(2, ((state.octave + 1) * 12 + state.note - 69) / 12);

  root.innerHTML = `
    <section class="pitchpipe">
      <div class="pipe-ring" id="ring">
        ${NOTES.map(([sharp], i) =>
          `<button class="pipe-note ${isBlack(i) ? "black" : ""}" style="--i:${i}"
                   data-i="${i}" aria-label="${NOTES[i][0]}${isBlack(i) ? " / " + NOTES[i][1] : ""}">${sharp}</button>`
        ).join("")}
        <div class="pipe-center">
          <div class="pipe-note-name" id="pp-name"></div>
          <div class="pipe-freq" id="pp-freq"></div>
          <div class="pipe-state" id="pp-state">tap a note</div>
        </div>
      </div>
      <div class="params">
        <div class="param">octave<div class="segmented" id="pp-octave"></div></div>
        <label class="param">A4
          <input type="range" id="pp-a4" min="430" max="450" step="0.5"
                 value="${state.a4}" aria-label="A4 calibration in hertz">
          <output id="pp-a4-out">${state.a4}</output>
          <button class="nudge" id="pp-a4-reset" aria-label="reset calibration to 440">440</button>
        </label>
        <label class="param">volume
          <input type="range" id="pp-volume" min="0" max="1" step="0.01"
                 value="${state.volume}" aria-label="volume">
        </label>
      </div>
    </section>`;

  const el = (id) => root.querySelector(`#${id}`);
  const ring = el("ring");
  const nameEl = el("pp-name"), freqEl = el("pp-freq"), stateEl = el("pp-state");

  // --- the reed: two slightly detuned saws through a lowpass ---------------
  let voice = null; // { oscs, filter, gain }

  function startTone() {
    const { context, master } = getAudio();
    const f = freqOf();
    const gain = context.createGain();
    const t = context.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(state.volume + 0.0001, t + 0.08);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.max(f * 4, 1200);
    filter.Q.value = 0.6;
    filter.connect(gain).connect(master);
    const oscs = [0, 6].map((cents) => {
      const osc = context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      osc.detune.value = cents; // slight beating = reed breathiness
      osc.connect(filter);
      osc.start(t);
      return osc;
    });
    voice = { context, oscs, filter, gain };
    setRunning(true);
  }

  function stopTone() {
    if (!voice) return;
    const { context, oscs, gain } = voice;
    const t = context.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    for (const osc of oscs) osc.stop(t + 0.25);
    voice = null;
    setRunning(false);
  }

  function retune() {
    if (!voice) return;
    const f = freqOf();
    const t = voice.context.currentTime;
    for (const osc of voice.oscs) osc.frequency.setTargetAtTime(f, t, 0.02);
    voice.filter.frequency.setTargetAtTime(Math.max(f * 4, 1200), t, 0.02);
  }

  const save = () => {
    store.set("note", state.note);
    store.set("octave", state.octave);
    store.set("a4", state.a4);
    store.set("volume", state.volume);
  };

  function render() {
    const [sharp, flat] = NOTES[state.note];
    nameEl.textContent = sharp === flat ? `${sharp}${state.octave}` : `${sharp}${state.octave} · ${flat}${state.octave}`;
    freqEl.textContent = `${freqOf().toFixed(1)} Hz`;
    stateEl.textContent = voice ? "sounding — tap to stop" : "tap a note";
    ring.classList.toggle("sounding", Boolean(voice));
    for (const b of ring.querySelectorAll(".pipe-note")) {
      b.classList.toggle("active", Number(b.dataset.i) === state.note);
    }
  }

  ring.addEventListener("click", (e) => {
    const b = e.target.closest(".pipe-note");
    if (!b) return;
    const i = Number(b.dataset.i);
    if (voice && i === state.note) {
      stopTone();
    } else {
      state.note = i;
      save();
      if (voice) retune();
      else startTone();
    }
    render();
  });

  const octaves = el("pp-octave");
  for (let o = 2; o <= 6; o++) {
    const b = document.createElement("button");
    b.textContent = o;
    b.setAttribute("aria-pressed", String(o === state.octave));
    b.addEventListener("click", () => {
      state.octave = o;
      save();
      retune();
      for (const s of octaves.children) s.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-pressed", "true");
      render();
    });
    octaves.append(b);
  }

  el("pp-a4").addEventListener("input", (e) => {
    state.a4 = Number(e.target.value);
    el("pp-a4-out").textContent = state.a4;
    save();
    retune();
    render();
  });
  el("pp-a4-reset").addEventListener("click", () => {
    state.a4 = 440;
    el("pp-a4").value = 440;
    el("pp-a4-out").textContent = 440;
    save();
    retune();
    render();
  });
  el("pp-volume").addEventListener("input", (e) => {
    state.volume = Number(e.target.value);
    save();
    if (voice) voice.gain.gain.setTargetAtTime(state.volume, voice.context.currentTime, 0.02);
  });

  render();

  return {
    destroy() {
      stopTone();
    },
  };
}
