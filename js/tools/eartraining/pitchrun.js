// The pitch-training run (WSHED-81): reference → listen → play it back →
// verdict per press → reveal → next; then the results card. The keyboard
// module is the answer surface and the piano voice plays both question and
// answer, so what you hear is what you play. The mic button (WSHED-86) lets
// the real piano answer too: the mic's pitch stream becomes presses through
// the note tracker, only during the answer phase and never while the app
// itself is making a sound (the question, the reference, a screen key) —
// each of those hushes the mic until it has faded. Presses count by pitch
// class, from the mic as from the keys.
import { logbook, BUILTIN_EARTRAINING } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { makeStore } from "../../lib/store.js";
import { createKeyboard } from "../../lib/keyboard/keyboard.js";
import { createPiano } from "../../lib/keyboard/piano.js";
import { createMicPitch } from "../../lib/pitch/mic.js";
import { createNoteTracker } from "../../lib/eartraining/listen.js";
import { generate, judgePress, scoreRun, starsFor, missLine, describe, shortDescribe, noteName, answerOctave, onAnswerKeyboard } from "../../lib/eartraining/pitch.js";
import { esc } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";

const T = { ref: 700, note: 520, gap: 560, chord: 1100, afterListen: 250, afterRight: 650, beforeReveal: 450, afterReveal: 700 };
const MIC_HOLDOFF_S = 0.35; // after any sound the app makes, the mic waits this long before it may answer
const SCORE_WORDS = [[95, "flawless"], [85, "excellent — nearly there"], [70, "solid — keep going"], [50, "getting there — narrow the range"], [0, "rough one — try fewer notes"]];

export function createPitchRun(root, { setup, seed, getAudio, runs, onAgain, onSetup, onHome }) {
  const gen = generate(setup, seed);
  const prefs = makeStore("eartraining");
  // The answer keyboard is always one octave (fat keys on a phone); a press
  // counts by pitch class. The range setting is where the *questions* come from.
  const { from, to } = answerOctave(gen.tonic);
  const kbKey = (m) => onAnswerKeyboard(m, from);
  const piano = createPiano(getAudio, { volume: 0.7 });
  const state = { i: 0, phase: "idle", hits: [], results: [], misses: [], startedAt: Date.now(), logged: false, timers: new Set(), muteUntil: 0, micUsed: false };
  const later = (fn, ms) => { const t = setTimeout(() => { state.timers.delete(t); fn(); }, ms); state.timers.add(t); return t; };
  const clearTimers = () => { for (const t of state.timers) clearTimeout(t); state.timers.clear(); };

  root.innerHTML = `
    <section class="eartraining et-run" id="et-run" data-phase="idle">
      <div class="ss-head">
        <button class="icon-btn" id="et-quit" aria-label="leave the drill">${icon("back")}</button>
        <div class="ss-head-title" id="et-title">question 1 of ${gen.questions.length}</div>
        <span class="ss-chip" id="et-points" aria-label="points">0</span>
      </div>
      <div class="et-stage">
        <div class="et-state" id="et-state">listen</div>
        <div class="et-ref" id="et-ref">${setup.reference === "never" ? "no reference — absolute pitch" : `reference · <b>${esc(noteName(gen.tonic))}</b>${gen.key ? ` · ${esc(gen.key)}` : ""}`}<span class="et-ref-hint"> · any octave counts</span></div>
        <div class="et-dots" id="et-dots" aria-hidden="true"></div>
        <div class="et-heard" id="et-heard" hidden aria-live="polite"><i class="et-ear" aria-hidden="true">${icon("mic")}</i><span id="et-heard-text"></span></div>
      </div>
      <div class="et-kb"><div id="et-kb"></div></div>
      <div class="transport et-acts">
        <button type="button" class="tap" id="et-hear" disabled>${icon("hear")}<span>hear it again</span></button>
        ${setup.reference === "never" ? "" : `<button type="button" class="tap" id="et-refbtn">${icon("redo")}<span>reference</span></button>`}
        <button type="button" class="tap et-micbtn" id="et-mic" aria-pressed="false" title="answer on your own piano through the microphone">${icon("mic")}<span>mic</span></button>
      </div>
      <div class="et-results" id="et-results" hidden></div>
    </section>`;
  const el = (id) => root.querySelector(`#${id}`);
  const section = el("et-run"), stateEl = el("et-state"), dots = el("et-dots"), title = el("et-title"), points = el("et-points"), heard = el("et-heard"), heardText = el("et-heard-text"), micBtn = el("et-mic");
  const kb = createKeyboard(el("et-kb"), { from, to, labels: "none", keymap: true });
  const audioNow = () => getAudio().context.currentTime;
  /** The app is about to make a sound for `ms`: the mic must not answer until it has faded. */
  const hush = (ms) => { state.muteUntil = Math.max(state.muteUntil, audioNow() + ms / 1000 + MIC_HOLDOFF_S); tracker?.reset(); };
  const setPhase = (p) => {
    state.phase = p; section.dataset.phase = p;
    stateEl.textContent = p === "reference" ? "the reference" : p === "listen" ? "listen" : p === "answer" ? "play it back" : p === "reveal" ? "the answer" : p === "done" ? "done" : "";
    if (p === "answer") { hush(0); if (micOn) heardText.textContent = "listening…"; }
  };

  const play = (midi, ms) => { piano.noteOn(midi, 0.8); later(() => piano.noteOff(midi), ms); hush(ms); };
  const playQuestion = (q) => {
    if (setup.mode === "harmonic") { for (const n of q.notes) piano.noteOn(n, 0.75); later(() => { for (const n of q.notes) piano.noteOff(n); }, T.chord); hush(T.chord); return T.chord; }
    q.notes.forEach((n, i) => later(() => play(n, T.note), i * T.gap));
    const dur = (q.notes.length - 1) * T.gap + T.note;
    hush(dur);
    return dur;
  };
  const drawDots = (q) => { dots.innerHTML = q.notes.map((_, i) => `<i class="${i < state.hits.length ? "hit" : ""}"></i>`).join(""); };

  function begin(i) {
    state.i = i; state.hits = [];
    const q = gen.questions[i];
    title.textContent = `question ${i + 1} of ${gen.questions.length}`;
    kb.clearLights(); drawDots(q);
    const needRef = setup.reference === "each" || (setup.reference === "start" && i === 0);
    if (needRef) {
      setPhase("reference");
      kb.light(kbKey(gen.tonic), "target");
      play(gen.tonic, T.ref);
      later(() => listen(q, true), T.ref + 250);
    } else listen(q, false);
  }
  function listen(q, clearRef) {
    if (clearRef) kb.clearLights();
    setPhase("listen");
    el("et-hear").disabled = true;
    const dur = playQuestion(q);
    later(() => { setPhase("answer"); el("et-hear").disabled = false; }, dur + T.afterListen);
  }
  /** One answer, from a screen key or the mic; both count by pitch class. */
  function onPress(midi, fromMic = false) {
    if (state.phase !== "answer") return;
    const q = gen.questions[state.i];
    const { correct, expected } = judgePress(q, state.hits, midi, setup.mode);
    const key = fromMic ? kbKey(midi) : midi;
    if (fromMic) state.micUsed = true;
    if (correct) {
      state.hits.push(expected); kb.light(key, "correct"); drawDots(q); haptic(6);
      if (state.hits.length === q.notes.length) finishQuestion(q, true);
    } else {
      state.misses.push({ expected, heard: midi });
      kb.light(key, "wrong"); haptic([20, 30, 20]);
      finishQuestion(q, false);
    }
  }
  function finishQuestion(q, right) {
    state.results.push({ notes: q.notes, hits: state.hits.length });
    points.textContent = scoreRun(state.results).points;
    setPhase("reveal");
    el("et-hear").disabled = true;
    if (right) { later(next, T.afterRight); return; }
    later(() => {
      for (const n of q.notes) if (!state.hits.includes(n)) kb.light(kbKey(n), "target");
      const dur = playQuestion(q);
      later(next, dur + T.afterReveal);
    }, T.beforeReveal);
  }
  function next() {
    kb.clearLights();
    if (state.i + 1 < gen.questions.length) begin(state.i + 1); else results();
  }

  function results() {
    setPhase("done");
    micOff();
    const s = scoreRun(state.results), stars = starsFor(s.pct), line = missLine(state.misses, gen.tonic);
    if (!state.logged) {
      state.logged = true;
      runs.add({ exercise: "pitch", setup, seed, pct: s.pct, points: s.points, max: s.max, right: s.right, stars });
      logbook.addAuto({ source: "eartraining", label: `Ear training · pitch · ${s.points}/${s.max} · ${"★".repeat(stars) || "☆"} · ${shortDescribe(setup)}${state.micUsed ? " · on the piano" : ""}`, startedAt: state.startedAt, endedAt: Date.now(), builtin: { id: BUILTIN_EARTRAINING, name: "Ear training" } });
    }
    el("et-results").hidden = false;
    el("et-results").innerHTML = `
      <div class="ss-score" id="et-score">${s.pct}%</div>
      <div class="ss-stars" id="et-stars">${[0, 1, 2].map((i) => `<span class="star ${i < stars ? "earned" : ""}" style="animation-delay:${0.25 + i * 0.45}s">&#9733;</span>`).join("")}</div>
      <p class="et-result-line"><b>${s.right}</b> of ${gen.questions.length} questions · <b>${s.points}</b> of ${s.max} notes</p>
      ${line ? `<p class="et-miss">${esc(line)}</p>` : `<p class="et-miss lb-dim">${SCORE_WORDS.find(([min]) => s.pct >= min)[1]}</p>`}
      <p class="et-sentence">${esc(describe(setup, gen.key ? gen.tonic : null))}</p>
      <div class="transport">
        <button type="button" class="tap" id="et-setup">change the setup</button>
        <button type="button" class="start" id="et-again">${icon("redo")}<span>again</span></button>
      </div>
      <div class="lb-foot"><button type="button" class="lb-link" id="et-home">ear training home</button></div>`;
    section.classList.add("et-finished");
    el("et-again").addEventListener("click", onAgain);
    el("et-setup").addEventListener("click", onSetup);
    el("et-home").addEventListener("click", onHome);
  }

  // A screen key sounds through the speaker: the mic stays hushed while it is held and until the note fades.
  kb.on("noteon", ({ midi }) => { if (state.phase === "answer") piano.noteOn(midi, 0.8); state.muteUntil = Infinity; tracker?.reset(); onPress(midi); });
  kb.on("noteoff", ({ midi }) => { piano.noteOff(midi); if (!kb.held().length) { state.muteUntil = 0; hush(0); } });
  el("et-hear").addEventListener("click", () => { if (state.phase !== "answer") return; const q = gen.questions[state.i]; setPhase("listen"); const dur = playQuestion(q); later(() => setPhase("answer"), dur + T.afterListen); });
  el("et-refbtn")?.addEventListener("click", () => { if (state.phase === "answer") play(gen.tonic, T.ref); });
  el("et-quit").addEventListener("click", onHome);

  // --- the real piano, through the mic (WSHED-86): a toggle, remembered ------------
  let mic = null, tracker = null, micOn = false;
  const paintMic = () => { micBtn.classList.toggle("on", micOn); micBtn.setAttribute("aria-pressed", String(micOn)); micBtn.querySelector("span").textContent = micOn ? "mic on" : "mic"; heard.hidden = !micOn && !heard.classList.contains("off"); };
  const onSample = (s) => {
    if (!micOn || state.phase !== "answer" || s.t < state.muteUntil) return; // the speaker is talking, or it just was
    const r = tracker.feed(s);
    if (r.midi !== null) heardText.innerHTML = `heard <b>${esc(noteName(r.midi))}</b>`;
    if (r.press !== null) onPress(r.press, true);
  };
  async function micStart() {
    if (micOn) return;
    tracker = createNoteTracker({ a4: makeStore("tuner").get("a4", 440) });
    mic = mic ?? createMicPitch(getAudio, { all: true, intervalMs: 50 });
    heard.classList.remove("off");
    try { await mic.start(onSample); }
    catch (err) { heard.classList.add("off"); heard.hidden = false; heardText.textContent = err?.name === "NotAllowedError" ? "microphone denied — answer on the keys" : "no microphone — answer on the keys"; micOn = false; prefs.set("mic", false); paintMic(); return; }
    micOn = true; prefs.set("mic", true);
    hush(0);
    heardText.textContent = state.phase === "answer" ? "listening…" : "the microphone is on";
    paintMic();
  }
  function micOff() {
    if (!micOn) return;
    micOn = false; mic?.stop();
    heardText.textContent = "";
    paintMic();
  }
  micBtn.addEventListener("click", () => { if (micOn) { micOff(); prefs.set("mic", false); } else micStart(); haptic(6); });
  // E2E seam: Playwright can't play a piano; it feeds pitch samples here.
  window.__etMic = { feed: (s) => onSample({ ...s, t: audioNow() }), get on() { return micOn; }, get muteFor() { return state.muteUntil - audioNow(); } };
  if (prefs.get("mic", false)) micStart(); // the begin tap is the gesture

  getAudio();
  later(() => begin(0), 400);

  return {
    get state() { return state; }, gen,
    destroy() { clearTimers(); kb.destroy(); piano.destroy(); mic?.stop(); if (window.__etMic) delete window.__etMic; },
  };
}
