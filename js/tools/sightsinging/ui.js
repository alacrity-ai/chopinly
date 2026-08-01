// Sight singing: deal a melody → count-in (clicks + tonic chord) → sing with
// live per-note grading (rhythm-game style) and a pitch lane showing cents
// deviation in real time → final graded staff + score.
// All run audio flows through a per-run gain bus so stop is instant.
// Test seam: window.__WS_FAKE_SING = "perfect" | "octave-down" | "flat" |
// "silent" synthesizes the sample stream from the melody itself (no mic).
import { renderMelody } from "../../lib/staff/render.js";
import { playMelody, playChord, scheduleClick } from "../../lib/melody-player.js";
import { createMicPitch } from "../../lib/pitch/mic.js";
import { tonicTriad } from "../../lib/music.js";
import { MELODIES, toTimeline, deal } from "./melodies.js";
import { judge, centsOff, provisionalTier, STRICTNESS } from "./judge.js";

const SCORE_WORDS = [
  [95, "flawless — gold standard"],
  [85, "excellent — nearly there"],
  [70, "solid — keep shedding"],
  [50, "getting there — slow it down"],
  [0, "rough one — try an easier melody"],
];

const LANE_Y = 36, LANE_SCALE = 0.32; // ±100¢ → ±32px around the centerline
const LANE_HEAD_X = 240, LANE_SPEED = 140; // trail scrolls left at px/sec
const TRAIL_MAX = 26;

export function buildUI(root, { getAudio, store, setRunning }) {
  const state = {
    difficulty: store.get("difficulty", 0),
    strict: store.get("strict", "standard"),
    click: store.get("click", true),
    melody: null,
  };

  root.innerHTML = `
    <section class="sightsinging" id="ss-root">
      <div class="ss-controls">
        <div class="param">level<div class="segmented" id="ss-diff"></div></div>
        <div class="param">strictness<div class="segmented" id="ss-strict"></div></div>
        <button class="nudge" id="ss-click" aria-pressed="${state.click}">click ${state.click ? "on" : "off"}</button>
        <button class="nudge" id="ss-new">new melody</button>
      </div>
      <div class="ss-meta" id="ss-meta"></div>
      <div class="pitch-lane" id="ss-lane" hidden>
        <span class="lane-mark lane-sharp" aria-hidden="true">&#9839;</span>
        <span class="lane-mark lane-flat" aria-hidden="true">&#9837;</span>
        <svg viewBox="0 0 300 72" preserveAspectRatio="none" aria-hidden="true">
          <line class="lane-guide" x1="18" y1="20" x2="294" y2="20"/>
          <line class="lane-guide" x1="18" y1="52" x2="294" y2="52"/>
          <line class="lane-center" x1="18" y1="36" x2="294" y2="36"/>
          <g id="ss-lane-trail"></g>
          <circle class="lane-dot" id="ss-lane-dot" cx="${LANE_HEAD_X}" cy="36" r="5" opacity="0"/>
        </svg>
      </div>
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
  const section = el("ss-root");
  const statusEl = el("ss-status"), startBtn = el("ss-start");
  const lane = el("ss-lane"), laneDot = el("ss-lane-dot"), laneTrail = el("ss-lane-trail");
  const mic = createMicPitch(getAudio);
  let staff = null, timeline = null, grades = null;
  let raf = 0, run = null, player = null, highlighted = [];
  const trailDots = [];

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
    for (const i of highlighted) {
      staff.setHere(i, false);
      staff.setState(i, grades ? grades[i] : "idle");
    }
    highlighted = [];
    if (unitIdx !== null && stateName) {
      for (const i of timeline.units[unitIdx].drawn) {
        staff.setHere(i, true);
        // fill shows the live grade once one exists; ivory "current" until then
        staff.setState(i, (grades && grades[i]) || stateName);
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
    const bus = context.createGain();
    bus.connect(getAudio().master);
    const t0 = context.currentTime + 0.25;
    const singStart = t0 + beats * spb;
    for (let b = 0; b < beats; b++) scheduleClick(getAudio, t0 + b * spb, b === 0, bus);
    playChord(getAudio, tonicTriad(m.key, m.mode, timeline.units[0].midi), t0, beats * spb * 0.9, { out: bus });
    if (state.click) {
      const total = Math.round(timeline.total / spb);
      for (let b = 0; b < total; b++) scheduleClick(getAudio, singStart + b * spb, b % beats === 0, bus);
    }
    run = {
      t0, singStart, spb, beats, samples, fake, bus,
      fakeSamples: fake ? synthFake(fake, timeline) : null,
      fakeIdx: 0, fakeLatest: null, gradedUpTo: 0, prov: [], trail: [],
    };
    grades = new Array(staff.count).fill(null);
    staff.clearStates();
    el("ss-results").hidden = true;
    section.classList.add("ss-running");
    lane.hidden = false;
    startBtn.textContent = "stop";
    startBtn.classList.add("running");
    setRunning(true);
    raf = requestAnimationFrame(runFrame);
  }

  function relSamples() {
    return run.fake
      ? run.fakeSamples
      : run.samples.map((s) => ({ t: s.t - run.singStart, midi: s.midi }));
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
      liveGrade(now);
      updateLane(now, idx);
    } else if (now >= run.singStart + timeline.total + 0.3) {
      finishRun();
      return;
    }
    raf = requestAnimationFrame(runFrame);
  }

  function setUnitTier(i, tier, pop) {
    for (const d of timeline.units[i].drawn) {
      grades[d] = tier;
      staff.setState(d, tier);
      if (pop) staff.pulse(d);
    }
  }

  // Rhythm-game grading: an optimistic tier pops the moment the note is hit
  // (precision-only — coverage can't be known mid-note); the window-close pass
  // is the authoritative finalizer and silently corrects the color if needed.
  function liveGrade(now) {
    const latency = run.fake ? 0 : 0.13;
    const t = now - run.singStart;
    const opts = { strictness: STRICTNESS[state.strict], latency };
    while (run.gradedUpTo < timeline.units.length
        && t > timeline.units[run.gradedUpTo].t1 + latency + 0.12) {
      const i = run.gradedUpTo++;
      const tier = judge([timeline.units[i]], relSamples(), opts).notes[0].tier;
      setUnitTier(i, tier, run.prov[i] == null); // pop only if never shown live
    }
    const i = run.gradedUpTo;
    const u = timeline.units[i];
    if (u && t >= u.t0 && t < u.t1) {
      const heard = relSamples().filter((s) => s.t <= t);
      const tier = provisionalTier(u, heard, opts);
      if (tier && tier !== run.prov[i]) {
        const first = run.prov[i] == null;
        run.prov[i] = tier;
        setUnitTier(i, tier, first);
      }
    }
  }

  // --- the pitch lane -------------------------------------------------------
  function latestSample(now) {
    const t = now - run.singStart;
    if (run.fake) {
      while (run.fakeIdx < run.fakeSamples.length && run.fakeSamples[run.fakeIdx].t <= t) {
        run.fakeLatest = run.fakeSamples[run.fakeIdx++];
      }
      return run.fakeLatest && t - run.fakeLatest.t < 0.3 ? run.fakeLatest : null;
    }
    const s = run.samples[run.samples.length - 1];
    return s && now - s.t < 0.3 ? { t: s.t - run.singStart, midi: s.midi } : null;
  }

  function updateLane(now, unitIdx) {
    const ZONES = ["zone-nailed", "zone-good", "zone-rough", "zone-missed"];
    const sample = unitIdx >= 0 ? latestSample(now) : null;
    let zone = null;
    if (sample) {
      const err = Math.max(-100, Math.min(100, centsOff(sample.midi, timeline.units[unitIdx].midi)));
      const abs = Math.abs(err);
      zone = abs <= 15 ? "zone-nailed" : abs <= 45 ? "zone-good" : abs <= 90 ? "zone-rough" : "zone-missed";
      const last = run.trail[run.trail.length - 1];
      if (!last || now - last.at > 0.03) run.trail.push({ at: now, y: LANE_Y - err * LANE_SCALE });
    }
    run.trail = run.trail.filter((p) => now - p.at < 1.6);
    lane.classList.remove(...ZONES);
    if (zone) lane.classList.add(zone);
    while (trailDots.length < TRAIL_MAX) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("class", "lane-tail");
      laneTrail.append(c);
      trailDots.push(c);
    }
    for (let i = 0; i < TRAIL_MAX; i++) {
      const p = run.trail[run.trail.length - 1 - i];
      const c = trailDots[i];
      if (!p) { c.setAttribute("opacity", "0"); continue; }
      const age = now - p.at;
      c.setAttribute("cx", (LANE_HEAD_X - age * LANE_SPEED).toFixed(1));
      c.setAttribute("cy", p.y.toFixed(1));
      c.setAttribute("r", Math.max(0.8, 3 - age * 1.6).toFixed(2));
      c.setAttribute("opacity", Math.max(0, 0.55 - age * 0.4).toFixed(2));
    }
    const head = run.trail[run.trail.length - 1];
    if (head && now - head.at < 0.25) {
      laneDot.setAttribute("cy", head.y.toFixed(1));
      laneDot.setAttribute("opacity", "1");
    } else {
      laneDot.setAttribute("opacity", "0");
    }
  }

  function resetLane() {
    lane.hidden = true;
    lane.classList.remove("zone-nailed", "zone-good", "zone-rough", "zone-missed");
    laneDot.setAttribute("opacity", "0");
    for (const c of trailDots) c.setAttribute("opacity", "0");
  }

  // --- finish / stop --------------------------------------------------------
  function finishRun() {
    const { fake, bus } = run;
    const rel = relSamples();
    bus.disconnect();
    run = null;
    mic.stop();
    paintUnit(null);
    section.classList.remove("ss-running");
    resetLane();
    startBtn.textContent = "start";
    startBtn.classList.remove("running");
    setRunning(false);
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
    const wasRunning = Boolean(run);
    if (run) {
      run.bus.gain.value = 0;   // instant silence for everything scheduled
      run.bus.disconnect();
      run = null;
      mic.stop();
      grades = null;
      if (staff) staff.clearStates();
      highlighted = [];
      el("ss-results").hidden = true;
      setRunning(false);
    }
    section.classList.remove("ss-running");
    resetLane();
    stopPlayback();
    startBtn.textContent = "start";
    startBtn.classList.remove("running");
    if (staff) paintUnit(null);
    if (wasRunning) statusEl.textContent = "stopped — press start to try again";
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
