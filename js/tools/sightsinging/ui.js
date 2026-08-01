// Sight singing: deal a melody → count-in (clicks + tonic chord) → sing with
// the current note highlighted → judge → graded staff + score.
// Test seam: window.__WS_FAKE_SING = "perfect" | "octave-down" | "flat" |
// "silent" synthesizes the sample stream from the melody itself (no mic).
import { renderMelody } from "../../lib/staff/render.js";
import { playMelody, playChord, scheduleClick } from "../../lib/melody-player.js";
import { createMicPitch } from "../../lib/pitch/mic.js";
import { tonicTriad } from "../../lib/music.js";
import { MELODIES, toTimeline, deal } from "./melodies.js";
import { judge, STRICTNESS } from "./judge.js";

const SCORE_WORDS = [
  [95, "flawless — gold standard"],
  [85, "excellent — nearly there"],
  [70, "solid — keep shedding"],
  [50, "getting there — slow it down"],
  [0, "rough one — try an easier melody"],
];

export function buildUI(root, { getAudio, store, setRunning }) {
  const state = {
    difficulty: store.get("difficulty", 0),
    strict: store.get("strict", "standard"),
    click: store.get("click", true),
    melody: null,
  };

  root.innerHTML = `
    <section class="sightsinging">
      <div class="ss-controls">
        <div class="param">level<div class="segmented" id="ss-diff"></div></div>
        <div class="param">strictness<div class="segmented" id="ss-strict"></div></div>
        <button class="nudge" id="ss-click" aria-pressed="${state.click}">click ${state.click ? "on" : "off"}</button>
        <button class="nudge" id="ss-new">new melody</button>
      </div>
      <div class="ss-meta" id="ss-meta"></div>
      <div class="ss-staffcard"><div id="ss-staff"></div></div>
      <div class="ss-results" id="ss-results" hidden>
        <div class="ss-score" id="ss-score"></div>
        <div class="ss-tiers" id="ss-tiers"></div>
      </div>
      <div class="transport">
        <button class="start" id="ss-start">start</button>
        <button class="tap" id="ss-hear">hear it</button>
      </div>
      <p class="tuner-status" id="ss-status">count-in, then sing — the mic listens while you do</p>
    </section>`;

  const el = (id) => root.querySelector(`#${id}`);
  const statusEl = el("ss-status"), startBtn = el("ss-start");
  const mic = createMicPitch(getAudio);
  let staff = null, timeline = null, grades = null;
  let raf = 0, run = null, player = null, highlighted = [];

  // --- controls -------------------------------------------------------------
  function segmented(container, items, current, onPick) {
    for (const [value, label] of items) {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute("aria-pressed", String(value === current));
      b.addEventListener("click", () => {
        onPick(value);
        for (const s of container.children) s.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-pressed", "true");
      });
      container.append(b);
    }
  }
  segmented(el("ss-diff"), [[0, "any"], [1, "1"], [2, "2"], [3, "3"]], state.difficulty, (v) => {
    state.difficulty = v;
    store.set("difficulty", v);
    newMelody();
  });
  segmented(el("ss-strict"), Object.keys(STRICTNESS).map((k) => [k, k]), state.strict, (v) => {
    state.strict = v;
    store.set("strict", v);
  });
  el("ss-click").addEventListener("click", (e) => {
    state.click = !state.click;
    store.set("click", state.click);
    e.target.setAttribute("aria-pressed", String(state.click));
    e.target.textContent = `click ${state.click ? "on" : "off"}`;
  });
  el("ss-new").addEventListener("click", newMelody);

  // --- melody + staff -------------------------------------------------------
  function newMelody() {
    stopAll();
    state.melody = deal(state.difficulty, store.get("lastId", null));
    store.set("lastId", state.melody.id);
    timeline = toTimeline(state.melody);
    grades = null;
    el("ss-results").hidden = true;
    el("ss-meta").textContent =
      `${state.melody.title} — ${state.melody.key} ${state.melody.mode} · ${state.melody.time.join("/")} · ♩=${state.melody.tempo} · ${state.melody.clef} clef · level ${state.melody.difficulty}`;
    staff = renderMelody(el("ss-staff"), state.melody, { unit: 9 });
    statusEl.textContent = "count-in, then sing — the mic listens while you do";
  }

  function paintUnit(unitIdx, stateName) {
    for (const i of highlighted) staff.setState(i, grades ? grades[i] : "idle");
    highlighted = [];
    if (unitIdx !== null && stateName) {
      for (const i of timeline.units[unitIdx].drawn) {
        staff.setState(i, stateName);
        highlighted.push(i);
      }
    }
  }

  function applyGrades(verdict) {
    grades = new Array(staff.count).fill(null);
    verdict.notes.forEach((n, ui) => {
      for (const i of timeline.units[ui].drawn) grades[i] = n.tier;
    });
    for (let i = 0; i < staff.count; i++) if (grades[i]) staff.setState(i, grades[i]);
  }

  // --- the exercise ---------------------------------------------------------
  async function startRun() {
    stopAll();
    const fake = window.__WS_FAKE_SING;
    const samples = [];
    if (!fake) {
      try {
        await mic.start((s) => samples.push(s));
      } catch (err) {
        statusEl.textContent = err && err.name === "NotAllowedError"
          ? "microphone access was denied — allow it in your browser's site settings, then try again"
          : "couldn't open the microphone";
        return;
      }
    }
    const { context } = getAudio();
    const m = state.melody;
    const spb = 60 / m.tempo;
    const beats = m.time[0];
    const t0 = context.currentTime + 0.25;
    const singStart = t0 + beats * spb;
    for (let b = 0; b < beats; b++) scheduleClick(getAudio, t0 + b * spb, b === 0);
    playChord(getAudio, tonicTriad(m.key, m.mode, timeline.units[0].midi), t0, beats * spb * 0.9);
    if (state.click) {
      const total = Math.round(timeline.total / spb);
      for (let b = 0; b < total; b++) scheduleClick(getAudio, singStart + b * spb, b % beats === 0);
    }
    run = { t0, singStart, spb, beats, samples, fake };
    grades = null;
    staff.clearStates();
    el("ss-results").hidden = true;
    startBtn.textContent = "stop";
    startBtn.classList.add("running");
    setRunning(true);
    raf = requestAnimationFrame(runFrame);
  }

  function runFrame() {
    if (!run) return;
    const { context } = getAudio();
    const now = context.currentTime;
    if (now < run.singStart) {
      const beat = Math.max(1, Math.min(run.beats, Math.floor((now - run.t0) / run.spb) + 1));
      statusEl.textContent = `count-in… ${Array.from({ length: beat }, (_, i) => i + 1).join(" ")}`;
    } else if (now < run.singStart + timeline.total) {
      statusEl.textContent = "sing";
      const t = now - run.singStart;
      const idx = timeline.units.findIndex((u) => t >= u.t0 && t < u.t1);
      if (idx >= 0 && (!highlighted.length || timeline.units[idx].drawn[0] !== highlighted[0])) {
        paintUnit(idx, "current");
      }
    } else if (now >= run.singStart + timeline.total + 0.3) {
      finishRun();
      return;
    }
    raf = requestAnimationFrame(runFrame);
  }

  function finishRun() {
    const { singStart, samples, fake } = run;
    run = null;
    mic.stop();
    paintUnit(null);
    startBtn.textContent = "start";
    startBtn.classList.remove("running");
    setRunning(false);
    const rel = fake
      ? synthFake(fake, timeline)
      : samples.map((s) => ({ t: s.t - singStart, midi: s.midi }));
    const verdict = judge(timeline.units, rel, {
      strictness: STRICTNESS[state.strict],
      latency: fake ? 0 : 0.13,
    });
    applyGrades(verdict);
    el("ss-results").hidden = false;
    el("ss-score").textContent = `${verdict.score}%`;
    el("ss-tiers").innerHTML = ["nailed", "good", "rough", "missed"]
      .map((t) => `<span class="tier tier-${t}">${verdict.counts[t]} ${t}</span>`).join(" · ");
    statusEl.textContent = SCORE_WORDS.find(([min]) => verdict.score >= min)[1];
  }

  function synthFake(mode, tl) {
    if (mode === "silent") return [];
    const off = mode === "octave-down" ? -12 : mode === "flat" ? -0.8 : 0;
    const out = [];
    for (const u of tl.units) {
      for (let t = u.t0 + 0.02; t < u.t1; t += 0.085) out.push({ t, midi: u.midi + off });
    }
    return out;
  }

  // --- hear it --------------------------------------------------------------
  function hear() {
    stopAll();
    player = playMelody(getAudio, timeline);
    statusEl.textContent = "listen…";
    const frame = () => {
      if (!player) return;
      const { context } = getAudio();
      const t = context.currentTime - player.t0;
      if (t > timeline.total + 0.2) {
        stopPlayback();
        return;
      }
      const idx = timeline.units.findIndex((u) => t >= u.t0 && t < u.t1);
      if (idx >= 0 && (!highlighted.length || timeline.units[idx].drawn[0] !== highlighted[0])) {
        paintUnit(idx, "current");
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  function stopPlayback() {
    if (player) { player.stop(); player = null; }
    paintUnit(null);
    statusEl.textContent = grades ? statusEl.textContent : "count-in, then sing — the mic listens while you do";
  }

  function stopAll() {
    cancelAnimationFrame(raf);
    if (run) { run = null; mic.stop(); setRunning(false); }
    stopPlayback();
    startBtn.textContent = "start";
    startBtn.classList.remove("running");
    if (staff) paintUnit(null);
  }

  startBtn.addEventListener("click", () => (run ? stopAll() : startRun()));
  el("ss-hear").addEventListener("click", () => (player ? stopPlayback() : hear()));

  newMelody();

  return {
    destroy() {
      stopAll();
    },
  };
}
