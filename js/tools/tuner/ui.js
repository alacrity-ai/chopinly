// Tuner: mic → analyser → autocorrelation, rendered as a cents dial. The
// needle eases toward the latest reading each frame; readings are smoothed
// over a short window and gated so silence shows "listening", not noise.
import { autoCorrelate, noteFromFreq } from "./detect.js";

const NOTES = [
  ["C", "C"], ["C♯", "D♭"], ["D", "D"], ["D♯", "E♭"], ["E", "E"], ["F", "F"],
  ["F♯", "G♭"], ["G", "G"], ["G♯", "A♭"], ["A", "A"], ["A♯", "B♭"], ["B", "B"],
];

const DETECT_MS = 90;      // detection cadence
const HOLD_MS = 600;       // keep the last reading briefly through gaps
const WINDOW = 6;          // smoothing window (readings)

export function buildUI(root, { getAudio, store, setRunning }) {
  const state = { a4: store.get("a4", 440) };

  root.innerHTML = `
    <section class="tuner">
      <svg class="dial" viewBox="0 0 240 150" aria-hidden="true">
        <path class="arc" d="M 49.3 59.3 A 100 100 0 0 1 190.7 59.3"/>
        <g id="tn-ticks"></g>
        <text class="dial-label" x="44" y="82">&#9837;</text>
        <text class="dial-label" x="196" y="82">&#9839;</text>
        <g id="tn-needle"><line x1="120" y1="130" x2="120" y2="38"/></g>
        <circle class="pivot" cx="120" cy="130" r="5"/>
      </svg>
      <div class="tuner-note" id="tn-name">&mdash;</div>
      <div class="tuner-read">
        <span id="tn-cents">&nbsp;</span><span id="tn-hz">&nbsp;</span>
      </div>
      <div class="params">
        <label class="param">A4
          <input type="range" id="tn-a4" min="430" max="450" step="0.5"
                 value="${state.a4}" aria-label="A4 calibration in hertz">
          <output id="tn-a4-out">${state.a4}</output>
          <button class="nudge" id="tn-a4-reset" aria-label="reset calibration to 440">440</button>
        </label>
      </div>
      <div class="transport">
        <button class="start" id="tn-start">start listening</button>
      </div>
      <p class="tuner-status" id="tn-status">the tuner listens on your microphone</p>
    </section>`;

  const el = (id) => root.querySelector(`#${id}`);
  const needle = el("tn-needle");
  const nameEl = el("tn-name"), centsEl = el("tn-cents"), hzEl = el("tn-hz");
  const statusEl = el("tn-status"), startBtn = el("tn-start");

  // dial ticks: every 10 cents, center tick emphasized
  const ticks = el("tn-ticks");
  for (let c = -50; c <= 50; c += 10) {
    const a = (c / 50) * 45 * (Math.PI / 180);
    const [sin, cos] = [Math.sin(a), Math.cos(a)];
    const r1 = c === 0 ? 86 : 92, r2 = c === 0 ? 104 : 100;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", (120 + r1 * sin).toFixed(1));
    line.setAttribute("y1", (130 - r1 * cos).toFixed(1));
    line.setAttribute("x2", (120 + r2 * sin).toFixed(1));
    line.setAttribute("y2", (130 - r2 * cos).toFixed(1));
    if (c === 0) line.setAttribute("class", "center");
    ticks.append(line);
  }

  let stream = null, source = null, analyser = null, buf = null;
  let raf = 0, lastDetect = 0, lastVoiced = 0;
  let readings = [];            // recent { midi, cents, freq }
  let shownAngle = 0, targetAngle = 0;
  let listening = false;

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      statusEl.textContent = err && err.name === "NotAllowedError"
        ? "microphone access was denied — allow it in your browser's site settings, then try again"
        : "couldn't open the microphone";
      return;
    }
    const { context } = getAudio();
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser); // analysis only — never routed to output
    buf = new Float32Array(analyser.fftSize);
    listening = true;
    readings = [];
    startBtn.textContent = "stop listening";
    startBtn.classList.add("running");
    statusEl.textContent = "listening…";
    setRunning(true);
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    listening = false;
    cancelAnimationFrame(raf);
    if (stream) for (const t of stream.getTracks()) t.stop();
    if (source) source.disconnect();
    stream = source = analyser = null;
    startBtn.textContent = "start listening";
    startBtn.classList.remove("running");
    statusEl.textContent = "the tuner listens on your microphone";
    showIdle();
    setRunning(false);
  }

  function showIdle() {
    nameEl.textContent = "—";
    nameEl.classList.remove("intune");
    centsEl.textContent = " ";
    hzEl.textContent = " ";
    needle.classList.remove("intune", "far");
    targetAngle = 0;
  }

  function frame(now) {
    if (!listening) return;
    if (now - lastDetect >= DETECT_MS) {
      lastDetect = now;
      analyser.getFloatTimeDomainData(buf);
      const { context } = getAudio();
      const freq = autoCorrelate(buf, context.sampleRate);
      if (freq > 0 && freq < 5000) {
        lastVoiced = now;
        readings.push({ ...noteFromFreq(freq, state.a4), freq });
        readings = readings.slice(-WINDOW);
        render();
      } else if (now - lastVoiced > HOLD_MS && readings.length) {
        readings = [];
        showIdle();
        statusEl.textContent = "listening…";
      }
    }
    shownAngle += (targetAngle - shownAngle) * 0.25;
    needle.setAttribute("transform", `rotate(${shownAngle.toFixed(2)} 120 130)`);
    raf = requestAnimationFrame(frame);
  }

  function render() {
    // dominant note in the window, mean cents for that note
    const counts = new Map();
    for (const r of readings) counts.set(r.midi, (counts.get(r.midi) ?? 0) + 1);
    const midi = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const mine = readings.filter((r) => r.midi === midi);
    const cents = mine.reduce((s, r) => s + r.cents, 0) / mine.length;
    const freq = mine[mine.length - 1].freq;

    const [sharp, flat] = NOTES[((midi % 12) + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    nameEl.textContent = sharp === flat ? `${sharp}${octave}` : `${sharp}${octave} · ${flat}${octave}`;
    centsEl.textContent = `${cents >= 0 ? "+" : "−"}${Math.abs(cents).toFixed(0)}¢`;
    hzEl.textContent = ` · ${freq.toFixed(1)} Hz`;
    statusEl.textContent = " ";
    targetAngle = (Math.max(-50, Math.min(50, cents)) / 50) * 45;
    const inTune = Math.abs(cents) <= 5;
    nameEl.classList.toggle("intune", inTune);
    needle.classList.toggle("intune", inTune);
    needle.classList.toggle("far", Math.abs(cents) > 25);
  }

  startBtn.addEventListener("click", () => (listening ? stop() : start()));

  el("tn-a4").addEventListener("input", (e) => {
    state.a4 = Number(e.target.value);
    el("tn-a4-out").textContent = state.a4;
    store.set("a4", state.a4);
    readings = [];
  });
  el("tn-a4-reset").addEventListener("click", () => {
    state.a4 = 440;
    el("tn-a4").value = 440;
    el("tn-a4-out").textContent = 440;
    store.set("a4", 440);
    readings = [];
  });

  return {
    destroy() {
      if (listening) stop();
    },
  };
}
