// Ear training shell: home (exercises | drills) → the pitch-training setup card
// → the run → results; and the drill history.
// Routes: #/eartraining · /pitch · /pitch/run?seed=… · /history.
import { icon } from "../../lib/icons.js";
import { OPTIONS, LEVELS, LEVEL_NAMES, levelOf, cleanSetup, describe, shortDescribe } from "../../lib/eartraining/pitch.js";
import { createRuns } from "../../lib/eartraining/runs.js";
import { createPitchRun } from "./pitchrun.js";
import { esc, fmtDate } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";

const LABELS = { notes: "notes", range: "range", count: "how many at once", mode: "played", reference: "reference", questions: "questions" };
const WORDS = new Set(["notes", "mode", "reference"]);
const phone = () => innerWidth < 700;

export function buildUI(root, ctx) {
  const { store, getAudio } = ctx;
  const runs = createRuns(store);
  let run = null;

  const nav = (sub) => { location.hash = `#/eartraining${sub}`; };
  const sub = () => location.hash.replace(/^#\/eartraining\/?/, "").split("?")[0];
  const query = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
  const setup = () => { const s = cleanSetup(store.get("pitch-setup", null)); if (phone() && s.range > 4) s.range = 4; return s; };

  function render() {
    if (run) { run.destroy(); run = null; }
    const v = sub();
    if (v === "pitch") renderSetup();
    else if (v === "pitch/run") renderRun();
    else if (v === "history") renderHistory();
    else renderHome();
  }

  function renderHome() {
    const last = runs.lastFor("pitch"), all = runs.list();
    root.innerHTML = `
      <section class="eartraining ss-home et-home">
        <button class="ss-mode-card" id="et-go-pitch">
          <span class="ss-mode-glyph" aria-hidden="true">${icon("ear")}</span>
          <span class="ss-mode-name">pitch training</span>
          <span class="ss-mode-line">hear it, play it back</span>
          <span class="ss-mode-sub">${last ? `last: ${last.points}/${last.max} · ${"★".repeat(last.stars) || "☆"}` : "no drills yet"}</span>
        </button>
        <button class="ss-mode-card" id="et-go-history">
          <span class="ss-mode-glyph" aria-hidden="true">${icon("log")}</span>
          <span class="ss-mode-name">drills</span>
          <span class="ss-mode-line">every run, and how it went</span>
          <span class="ss-mode-sub">${all.length ? `${all.length} run${all.length === 1 ? "" : "s"}` : "nothing yet"}</span>
        </button>
      </section>`;
    root.querySelector("#et-go-pitch").addEventListener("click", () => nav("/pitch"));
    root.querySelector("#et-go-history").addEventListener("click", () => nav("/history"));
  }

  // --- the setup card: one level switcher, six rows of chips, one sentence ---
  function renderSetup() {
    const s = setup();
    const save = () => store.set("pitch-setup", s);
    root.innerHTML = `
      <section class="eartraining et-setup">
        <div class="ss-head">
          <button class="icon-btn" id="et-back" aria-label="back">${icon("back")}</button>
          <div class="ss-head-title">pitch training</div>
          <span></span>
        </div>
        <div class="segmented et-levels" id="et-levels" role="radiogroup" aria-label="level">${LEVEL_NAMES.map((l) => `<button data-level="${l}" role="radio">${l}</button>`).join("")}</div>
        <div class="et-rows" id="et-rows">
          ${Object.keys(OPTIONS).map((k) => `<div class="et-row" data-key="${k}"><span class="et-row-label">${LABELS[k]}</span><div class="lb-chips et-chips" role="radiogroup" aria-label="${LABELS[k]}">${OPTIONS[k].filter(([v]) => !(k === "range" && v === 8 && phone())).map(([v, label]) => `<button type="button" class="lb-chip et-chip" data-v="${v}" role="radio">${label}</button>`).join("")}</div></div>`).join("")}
        </div>
        <p class="et-sentence" id="et-sentence"></p>
        <div class="transport"><button class="start" id="et-begin">${icon("play")}<span>begin</span></button></div>
      </section>`;
    const paint = () => {
      const lvl = levelOf(s);
      for (const b of root.querySelectorAll("#et-levels button")) { const on = b.dataset.level === lvl; b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-checked", String(on)); }
      for (const row of root.querySelectorAll(".et-row")) {
        const k = row.dataset.key;
        const off = k === "mode" && s.count === 1;
        row.classList.toggle("off", off);
        for (const c of row.querySelectorAll(".et-chip")) { const on = String(s[k]) === c.dataset.v; c.classList.toggle("on", on); c.setAttribute("aria-checked", String(on)); c.disabled = off; }
      }
      root.querySelector("#et-sentence").textContent = describe(s, s.notes === "key" && lvl === "beginner" ? 60 : null);
    };
    for (const b of root.querySelectorAll("#et-levels button")) b.addEventListener("click", () => { if (b.dataset.level === "custom") return; Object.assign(s, LEVELS[b.dataset.level]); if (phone() && s.range > 4) s.range = 4; save(); paint(); haptic(6); });
    for (const c of root.querySelectorAll(".et-chip")) c.addEventListener("click", () => {
      const k = c.closest(".et-row").dataset.key, raw = c.dataset.v;
      s[k] = WORDS.has(k) ? raw : Number(raw);
      if (s.count === 1) s.mode = "melodic";
      save(); paint(); haptic(6);
    });
    root.querySelector("#et-back").addEventListener("click", () => nav(""));
    root.querySelector("#et-begin").addEventListener("click", () => { getAudio(); nav(`/pitch/run?seed=${Date.now() % 1e9}`); });
    paint();
  }

  function renderRun() {
    const q = query();
    const s = q.get("setup") && LEVELS[q.get("setup")] ? { ...LEVELS[q.get("setup")] } : setup();
    const seed = Number(q.get("seed")) || (Date.now() % 1e9);
    run = createPitchRun(root, {
      setup: s, seed, getAudio, runs,
      onAgain: () => nav(`/pitch/run?seed=${Date.now() % 1e9}`),
      onSetup: () => nav("/pitch"),
      onHome: () => nav(""),
    });
  }

  function renderHistory() {
    const all = runs.list();
    root.innerHTML = `
      <section class="eartraining et-history">
        <div class="ss-head">
          <button class="icon-btn" id="et-back" aria-label="back">${icon("back")}</button>
          <div class="ss-head-title">drills</div>
          <span class="ss-chip">${all.length ? `${all.length}` : ""}</span>
        </div>
        ${all.length ? `<ul class="et-runs">${all.slice(0, 100).map((r) => `<li class="et-runrow"><span class="et-run-when">${esc(fmtDate(r.at, { month: "short", day: "numeric" }))}</span><span class="et-run-what"><b>pitch</b> · ${esc(shortDescribe(r.setup))}</span><span class="et-run-score">${r.points}/${r.max}<small>${"★".repeat(r.stars)}</small></span></li>`).join("")}</ul>`
          : `<p class="lb-empty lb-dim">no drills yet. begin one from pitch training.</p>`}
      </section>`;
    root.querySelector("#et-back").addEventListener("click", () => nav(""));
  }

  const onHash = () => { if (location.hash.startsWith("#/eartraining")) render(); };
  window.addEventListener("hashchange", onHash);
  render();
  return { destroy() { window.removeEventListener("hashchange", onHash); if (run) { run.destroy(); run = null; } } };
}
