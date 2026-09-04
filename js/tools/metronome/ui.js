// Metronome DOM + renderer. The pendulum is not a CSS loop: its angle is
// computed every frame from the engine's audio-clock pointer, so what you see
// can never drift from what you hear.
import { MetronomeEngine } from "./engine.js";
import { VOICES } from "./voices.js";
import { icon } from "../../lib/icons.js";
import { logbook } from "../../lib/logbook.js";
import { openPicker } from "../logbook/picker.js";
import { toast } from "../logbook/util.js";

const MARKINGS = [
  [39, "Grave"], [49, "Largo"], [54, "Larghetto"], [64, "Adagio"],
  [75, "Andante"], [97, "Moderato"], [107, "Allegretto"], [131, "Allegro"],
  [167, "Vivace"], [199, "Presto"], [Infinity, "Prestissimo"],
];
const markingFor = (bpm) => MARKINGS.find(([max]) => bpm <= max)[1];

const SUBDIVISIONS = [
  [1, "♩", "quarter notes"],
  [2, "♪", "eighth notes"],
  [3, "♪³", "triplets"],
  [4, "♬", "sixteenth notes"],
];

const SWING_DEG = 30;

export function buildUI(root, { getAudio, store, setRunning }) {
  const settings = {
    bpm: store.get("bpm", 96),
    beats: store.get("beats", 4),
    beatStates: store.get("beatStates", [2, 1, 1, 1]),
    subdivision: store.get("subdivision", 1),
    voice: store.get("voice", "wood"),
  };
  const engine = new MetronomeEngine(getAudio, settings);
  engine.setVolume(store.get("volume", 0.8));

  root.innerHTML = `
    <section class="metronome">
      <svg viewBox="0 0 240 150" class="pendulum" aria-hidden="true">
        <path class="arc" d="M 71 47.1 A 98 98 0 0 1 169 47.1"/>
        <g class="arm" id="arm">
          <line x1="120" y1="132" x2="120" y2="36"/>
          <circle class="bob" id="bob" cx="120" cy="62" r="11"/>
        </g>
        <circle class="pivot" cx="120" cy="132" r="5"/>
      </svg>
      <div class="beat-dots" id="dots" role="group"
           aria-label="beats in the bar — select a beat to cycle accent, normal, muted"></div>
      <div class="tempo">
        <div class="bpm" id="bpm">${settings.bpm}</div>
        <div class="marking">&#9833; = <em id="marking">${markingFor(settings.bpm)}</em></div>
        <div class="tempo-adjust">
          <button class="nudge" data-d="-5" aria-label="slower by five">&minus;5</button>
          <button class="nudge" data-d="-1" aria-label="slower by one">&minus;1</button>
          <input type="range" id="bpm-slider" min="20" max="300" step="1"
                 value="${settings.bpm}" aria-label="tempo in beats per minute">
          <button class="nudge" data-d="1" aria-label="faster by one">+1</button>
          <button class="nudge" data-d="5" aria-label="faster by five">+5</button>
        </div>
      </div>
      <div class="params">
        <label class="param">meter
          <select id="meter" aria-label="beats per bar"></select>
        </label>
        <div class="param">subdivision<div class="segmented" id="subdiv" role="group"></div></div>
        <div class="param">voice<div class="segmented" id="voice" role="group"></div></div>
        <label class="param">volume
          <input type="range" id="volume" min="0" max="1" step="0.01"
                 value="${store.get("volume", 0.8)}" aria-label="volume">
        </label>
      </div>
      <div class="transport">
        <button class="btn-round" id="start" aria-label="start">${icon("play")}</button>
        <button class="tap" id="tap">tap tempo</button>
        <button class="tap" id="log-tempo" aria-label="practice">${icon("log")} <span id="log-tempo-label">practice</span></button>
      </div>
    </section>`;

  const el = (id) => root.querySelector(`#${id}`);
  const arm = el("arm"), bob = el("bob"), dots = el("dots");
  const bpmEl = el("bpm"), markingEl = el("marking"), slider = el("bpm-slider");
  const startBtn = el("start");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const save = () => {
    store.set("bpm", settings.bpm);
    store.set("beats", settings.beats);
    store.set("beatStates", settings.beatStates);
    store.set("subdivision", settings.subdivision);
    store.set("voice", settings.voice);
  };

  function setBpm(v) {
    settings.bpm = Math.min(300, Math.max(20, Math.round(v)));
    bpmEl.textContent = settings.bpm;
    slider.value = settings.bpm;
    markingEl.textContent = markingFor(settings.bpm);
    save();
  }

  // --- beat dots ---------------------------------------------------------
  const DOT_STATES = ["muted", "normal", "accent"];
  function renderDots() {
    dots.replaceChildren();
    for (let i = 0; i < settings.beats; i++) {
      const b = document.createElement("button");
      b.className = `dot ${DOT_STATES[settings.beatStates[i] ?? 1]}`;
      b.setAttribute("aria-label", `beat ${i + 1}: ${DOT_STATES[settings.beatStates[i] ?? 1]}`);
      b.addEventListener("click", () => {
        settings.beatStates[i] = ((settings.beatStates[i] ?? 1) + 2) % 3; // 2→1→0→2
        save();
        renderDots();
      });
      dots.append(b);
    }
  }
  renderDots();

  // --- logbook round trip --------------------------------------------------
  // Arriving as #/metronome?bpm=N (from a Logbook tempo button) sets the tempo
  // and strips the query so a reload doesn't re-apply it.
  const q = new URLSearchParams(location.hash.split("?")[1] ?? "");
  if (q.has("bpm")) {
    const v = Number(q.get("bpm"));
    if (Number.isFinite(v)) setBpm(v);
    history.replaceState(null, "", "#/metronome");
  }
  // While a goal is running the button stamps this tempo on it; idle, it
  // opens the picker so you can start practicing without leaving the metronome.
  const logBtn = el("log-tempo"), logLabel = el("log-tempo-label");
  const syncLogBtn = () => {
    const r = logbook.running();
    logLabel.textContent = r ? "♩ stamp" : "practice";
    logBtn.setAttribute("aria-label", r ? `stamp ${settings.bpm} on ${r.goal?.name ?? "the running goal"}` : "practice — choose what you're working on");
    logBtn.title = r ? `stamp ♩ ${settings.bpm} on ${r.goal?.name ?? ""}` : "start practicing";
  };
  syncLogBtn();
  const offLog = logbook.on(syncLogBtn);
  logBtn.addEventListener("click", async () => {
    const r = logbook.running();
    if (r) { logbook.stampTempo(settings.bpm); toast(`♩ ${settings.bpm} → ${r.goal?.name ?? ""}`); return; }
    const pick = await openPicker({ mode: "start" });
    if (!pick) return;
    logbook.start(pick.goal.id);
    toast(`${pick.goal.name} — go`);
  });

  // --- tempo controls ----------------------------------------------------
  slider.addEventListener("input", () => setBpm(Number(slider.value)));
  for (const b of root.querySelectorAll(".nudge")) {
    b.addEventListener("click", () => setBpm(settings.bpm + Number(b.dataset.d)));
  }

  let drag = null;
  bpmEl.addEventListener("pointerdown", (e) => {
    drag = { y: e.clientY, bpm: settings.bpm };
    bpmEl.setPointerCapture(e.pointerId);
  });
  bpmEl.addEventListener("pointermove", (e) => {
    if (drag) setBpm(drag.bpm + (drag.y - e.clientY) / 3);
  });
  bpmEl.addEventListener("pointerup", () => { drag = null; });

  // --- meter / subdivision / voice / volume ------------------------------
  const meter = el("meter");
  for (let n = 1; n <= 12; n++) {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    if (n === settings.beats) o.selected = true;
    meter.append(o);
  }
  meter.addEventListener("change", () => {
    const n = Number(meter.value);
    settings.beatStates = Array.from({ length: n }, (_, i) =>
      settings.beatStates[i] ?? (i === 0 ? 2 : 1));
    settings.beats = n;
    save();
    renderDots();
  });

  function segmented(container, items, current, onPick) {
    for (const [value, label, aria] of items) {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute("aria-label", aria);
      b.setAttribute("aria-pressed", String(value === current));
      b.addEventListener("click", () => {
        onPick(value);
        for (const s of container.children) s.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-pressed", "true");
      });
      container.append(b);
    }
  }
  segmented(el("subdiv"), SUBDIVISIONS, settings.subdivision, (v) => {
    settings.subdivision = v;
    save();
  });
  segmented(el("voice"), VOICES.map((v) => [v.id, v.name, `${v.name} click`]),
    settings.voice, (v) => {
      settings.voice = v;
      save();
      if (!engine.running) engine.preview("beat"); // let the choice be heard
    });
  el("volume").addEventListener("input", (e) => {
    engine.setVolume(Number(e.target.value));
    store.set("volume", Number(e.target.value));
  });

  // --- transport ----------------------------------------------------------
  function toggle() {
    if (engine.running) {
      engine.stop();
      startBtn.innerHTML = icon("play");
      startBtn.setAttribute("aria-label", "start");
      startBtn.classList.remove("running");
      setRunning(false);
    } else {
      engine.start();
      startBtn.innerHTML = icon("stop");
      startBtn.setAttribute("aria-label", "stop");
      startBtn.classList.add("running");
      setRunning(true);
    }
  }
  startBtn.addEventListener("click", toggle);

  let taps = [];
  el("tap").addEventListener("click", () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    taps = taps.slice(-6);
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]).sort((a, b) => a - b);
      const median = gaps[Math.floor(gaps.length / 2)];
      setBpm(60000 / median);
    }
  });

  // --- keyboard -----------------------------------------------------------
  function onKey(e) {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT") return;
    if (e.code === "Space" && tag !== "BUTTON") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setBpm(settings.bpm + 1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setBpm(settings.bpm - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setBpm(settings.bpm + 5); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setBpm(settings.bpm - 5); }
    else if (e.key === "t" || e.key === "T") el("tap").click();
  }
  window.addEventListener("keydown", onKey);

  // --- renderer: pendulum + current-beat highlight, off the audio clock ---
  let raf = 0;
  let shownBeat = -1;
  function frame() {
    const p = engine.pointer();
    const angle = p.running && !reducedMotion.matches
      ? SWING_DEG * Math.cos(Math.PI * p.beatsElapsed)
      : 0;
    arm.setAttribute("transform", `rotate(${angle.toFixed(2)} 120 132)`);
    bob.classList.toggle("down", p.running && p.beat === 0 && p.phase < 0.22);
    const current = p.running ? p.beat : -1;
    if (current !== shownBeat) {
      shownBeat = current;
      Array.from(dots.children).forEach((d, i) => d.classList.toggle("now", i === current));
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      engine.stop();
      setRunning(false);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
      offLog();
    },
  };
}
