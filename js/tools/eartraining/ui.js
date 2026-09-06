// Ear training shell: home (exercises | drills) → the pitch-training setup card
// → the run → results; and the drill history.
// Routes: #/eartraining · /pitch · /pitch/run?seed=… · /history.
import { icon } from "../../lib/icons.js";
import { OPTIONS, LEVELS, levelOf, cleanSetup, describe, shortDescribe, blurb } from "../../lib/eartraining/pitch.js";
import { createRuns } from "../../lib/eartraining/runs.js";
import { createPitchRun } from "./pitchrun.js";
import { esc, fmtDate } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";

// The fine-tune rows (WSHED-87): a label + a short hint on the left, equal cells on the right.
const ROWS = {
  notes: { label: "notes", hint: "which pitches", cells: { key: "in the key", all: "all twelve" } },
  range: { label: "range", hint: "octaves, around middle C", cells: { 1: "one", 2: "two", 4: "four", 8: "all 88" } },
  count: { label: "at once", hint: "notes per question", cells: { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" } },
  mode: { label: "played", hint: "two notes or more", cells: { melodic: "in a row", harmonic: "together" } },
  reference: { label: "reference", hint: "the key note first", cells: { each: "every time", start: "at the start", never: "never" } },
  questions: { label: "questions", hint: "per drill", cells: { 10: "10", 20: "20", 35: "35" } },
};
const PRESETS = [["beginner", "Beginner", "start here"], ["intermediate", "Intermediate", "two at a time"], ["advanced", "Advanced", "every pitch"]];
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

  // --- the setup card (WSHED-87): presets as a list; Custom is the one row with a drawer ---
  // Three presets are self-contained. Custom is an explicit choice (`pitch-level`) whose
  // settings live in a drawer under its row: it opens on select, seeds from the preset you
  // were on the first time, and keeps your last mix (`pitch-custom`) when you switch away.
  function renderSetup() {
    let s = setup();
    let level = store.get("pitch-level", null);
    if (!LEVELS[level] && level !== "custom") level = levelOf(s);
    const rawCustom = store.get("pitch-custom", null) ?? (level === "custom" ? s : null);
    let custom = rawCustom ? cleanSetup(rawCustom) : null; // null until Custom is first chosen
    if (level === "custom") s = custom;
    const save = () => { store.set("pitch-level", level); store.set("pitch-custom", custom); store.set("pitch-setup", s); };
    const row = (k) => `<div class="et-row" data-key="${k}"><div class="et-row-head"><span class="et-row-label">${ROWS[k].label}</span><span class="et-row-hint">${ROWS[k].hint}</span></div><div class="et-seg" role="radiogroup" aria-label="${ROWS[k].label}" style="--n:${OPTIONS[k].filter(([v]) => !(k === "range" && v === 8 && phone())).length}">${OPTIONS[k].filter(([v]) => !(k === "range" && v === 8 && phone())).map(([v]) => `<button type="button" class="et-opt" data-v="${v}" role="radio">${ROWS[k].cells[v]}</button>`).join("")}</div></div>`;
    root.innerHTML = `
      <section class="eartraining et-setup">
        <div class="ss-head">
          <button class="icon-btn" id="et-back" aria-label="back">${icon("back")}</button>
          <div class="ss-head-title">pitch training</div>
          <span></span>
        </div>
        <div class="et-presets" id="et-levels" role="radiogroup" aria-label="level">
          ${PRESETS.map(([id, name, tag]) => `<button type="button" class="et-preset" data-level="${id}" role="radio"><i class="et-radio" aria-hidden="true"></i><span class="et-preset-body"><span class="et-preset-name">${name}<small>${tag}</small></span><span class="et-preset-line">${blurb(LEVELS[id], id === "beginner" ? 60 : null)}</span></span></button>`).join("")}
          <button type="button" class="et-preset" data-level="custom" role="radio" aria-controls="et-rows"><i class="et-radio" aria-hidden="true"></i><span class="et-preset-body"><span class="et-preset-name">Custom<small>your own mix</small></span><span class="et-preset-line" id="et-custom-line"></span></span></button>
          <div class="et-drawer" id="et-rows" hidden>
            ${Object.keys(ROWS).map(row).join("")}
          </div>
        </div>
        <p class="et-sentence" id="et-sentence"></p>
        <div class="transport"><button class="start" id="et-begin">${icon("play")}<span>begin</span></button></div>
      </section>`;
    const paint = () => {
      for (const b of root.querySelectorAll(".et-preset")) { const on = b.dataset.level === level; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-checked", String(on)); }
      root.querySelector("#et-custom-line").textContent = custom ? blurb(custom) : "start from the level you're on and change anything";
      root.querySelector("#et-rows").hidden = level !== "custom";
      root.querySelector('[data-level="custom"]').setAttribute("aria-expanded", String(level === "custom"));
      for (const r of root.querySelectorAll(".et-row")) {
        const k = r.dataset.key;
        const off = k === "mode" && s.count === 1;
        r.classList.toggle("off", off);
        for (const c of r.querySelectorAll(".et-opt")) { const on = String(s[k]) === c.dataset.v; c.classList.toggle("on", on); c.setAttribute("aria-checked", String(on)); c.disabled = off; }
      }
      root.querySelector("#et-sentence").textContent = describe(s, s.notes === "key" && level === "beginner" ? 60 : null);
    };
    for (const b of root.querySelectorAll(".et-preset")) b.addEventListener("click", () => {
      const id = b.dataset.level;
      if (id === "custom") { if (level === "custom") return; custom = custom ?? cleanSetup({ ...s }); level = "custom"; s = custom; }
      else { level = id; s = { ...LEVELS[id] }; if (phone() && s.range > 4) s.range = 4; }
      save(); paint(); haptic(6);
    });
    for (const c of root.querySelectorAll(".et-opt")) c.addEventListener("click", () => {
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
