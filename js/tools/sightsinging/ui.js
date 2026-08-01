// Sight singing shell: landing (campaign | challenge) → campaign map or
// challenge config → the shared exercise runner driving a playlist of
// melodies with interstitials and a set summary.
// Routes: #/sightsinging · /campaign · /challenge · /run (transient state).
// Test seam: window.__WS_FAKE_SET = ["perfect", ...] — one outcome consumed
// per melody (sets window.__WS_FAKE_SING for the runner).
import { createRunner } from "./runner.js";
import { byId, dealSet, BOOKS, LESSONS, starsFor } from "./melodies.js";
import { STRICTNESS } from "./judge.js";

const SCORE_WORDS = [
  [95, "flawless — gold standard"],
  [85, "excellent — nearly there"],
  [70, "solid — keep shedding"],
  [50, "getting there — slow it down"],
  [0, "rough one — try an easier melody"],
];
const TIERS = ["nailed", "good", "rough", "missed"];

export function buildUI(root, ctx) {
  const { store } = ctx;
  let runner = null, pendingRun = null, advanceTimer = 0;

  const nav = (sub) => { location.hash = `#/sightsinging${sub}`; };
  const subPath = () => location.hash.replace(/^#\/sightsinging\/?/, "").split("?")[0];

  // --- campaign progress ----------------------------------------------------
  const progress = () => store.get("campaign", {});
  const currentLessonIdx = () => {
    const p = progress();
    const i = LESSONS.findIndex((l) => (p[l.id]?.stars ?? 0) < 1);
    return i === -1 ? LESSONS.length - 1 : i;
  };
  const totalStars = () => {
    const p = progress();
    return LESSONS.reduce((s, l) => s + (p[l.id]?.stars ?? 0), 0);
  };

  // --- views ----------------------------------------------------------------
  function render() {
    clearTimeout(advanceTimer);
    if (runner) { runner.destroy(); runner = null; }
    const view = subPath();
    if (view === "campaign") renderCampaign();
    else if (view === "challenge") renderChallenge();
    else if (view === "run" && pendingRun) renderRun();
    else if (view === "run") { history.replaceState(null, "", "#/sightsinging"); renderLanding(); }
    else renderLanding();
  }

  function renderLanding() {
    const idx = currentLessonIdx();
    const lesson = LESSONS[idx];
    const book = BOOKS.findIndex((b) => b.id === lesson.bookId) + 1;
    const log = store.get("challenge-log", null);
    root.innerHTML = `
      <section class="sightsinging ss-home">
        <button class="ss-mode-card" id="ss-go-campaign">
          <span class="ss-mode-glyph" aria-hidden="true">&#9733;</span>
          <span class="ss-mode-name">campaign</span>
          <span class="ss-mode-line">Book ${book} · ${lesson.title}</span>
          <span class="ss-mode-sub">&#9733; ${totalStars()}/${LESSONS.length * 3}</span>
        </button>
        <button class="ss-mode-card" id="ss-go-challenge">
          <span class="ss-mode-glyph" aria-hidden="true">&#9834;</span>
          <span class="ss-mode-name">challenge</span>
          <span class="ss-mode-line">random melodies, your rules</span>
          <span class="ss-mode-sub">${log ? `last drill: ${log}` : "no drills yet"}</span>
        </button>
      </section>`;
    root.querySelector("#ss-go-campaign").addEventListener("click", () => nav("/campaign"));
    root.querySelector("#ss-go-challenge").addEventListener("click", () => nav("/challenge"));
  }

  function renderCampaign() {
    const p = progress();
    const curIdx = currentLessonIdx();
    let flat = 0;
    root.innerHTML = `
      <section class="sightsinging ss-map">
        <div class="ss-maphead">
          <button class="nudge" id="ss-back">&larr; modes</button>
          <span class="ss-mapstars">&#9733; ${totalStars()}/${LESSONS.length * 3}</span>
        </div>
        ${BOOKS.map((b, bi) => `
          <div class="ss-book">
            <h3>${b.title}</h3>
            <p class="ss-blurb">${b.blurb}</p>
            <div class="ss-lessons">
              ${b.lessons.map((l, li) => {
                const i = flat++;
                const stars = p[l.id]?.stars ?? 0;
                const cls = i < curIdx || stars >= 1 ? "done" : i === curIdx ? "current" : "locked";
                return `<button class="ss-node ${cls}" data-lesson="${l.id}" data-idx="${i}"
                  ${cls === "locked" ? "disabled" : ""} aria-label="${l.title}">
                  <span class="ss-node-num">${li + 1}</span>
                  <span class="ss-node-stars">${"★".repeat(stars)}${"☆".repeat(Math.max(0, 3 - stars))}</span>
                </button>`;
              }).join("")}
            </div>
            <div class="ss-panel" id="ss-panel-${b.id}" hidden></div>
          </div>`).join("")}
      </section>`;
    root.querySelector("#ss-back").addEventListener("click", () => nav(""));
    for (const node of root.querySelectorAll(".ss-node:not(.locked)")) {
      node.addEventListener("click", () => openLesson(node.dataset.lesson));
    }
    // scroll the current lesson into view on long maps
    root.querySelector(".ss-node.current")?.scrollIntoView({ block: "center" });
  }

  function openLesson(lessonId) {
    const lesson = LESSONS.find((l) => l.id === lessonId);
    const best = progress()[lessonId];
    for (const el of root.querySelectorAll(".ss-panel")) el.hidden = true;
    const panel = root.querySelector(`#ss-panel-${lesson.bookId}`);
    panel.innerHTML = `
      <div class="ss-panel-title">${lesson.title}${best ? ` — best ${best.best}%` : ""}</div>
      <ul class="ss-panel-list">
        ${lesson.melodies.map((id) => {
          const m = byId.get(id);
          return `<li>${m.title} <span class="ss-dim">· ${m.key} ${m.mode} · &#9833;=${m.tempo}</span></li>`;
        }).join("")}
      </ul>
      <button class="start" id="ss-begin">begin lesson</button>`;
    panel.hidden = false;
    panel.querySelector("#ss-begin").addEventListener("click", () => {
      pendingRun = { mode: "campaign", lessonId, melodies: lesson.melodies.map((id) => byId.get(id)) };
      nav("/run");
    });
  }

  function renderChallenge() {
    const cfg = store.get("challenge-cfg", { difficulty: 0, clefs: ["treble"], count: 3, strict: "standard", click: true });
    root.innerHTML = `
      <section class="sightsinging ss-config">
        <div class="ss-maphead"><button class="nudge" id="ss-back">&larr; modes</button></div>
        <div class="ss-controls">
          <div class="param">level<div class="segmented" id="ss-diff"></div></div>
          <div class="param">clefs<div class="segmented" id="ss-clefs"></div></div>
          <div class="param">melodies<div class="segmented" id="ss-count"></div></div>
          <div class="param">strictness<div class="segmented" id="ss-strict"></div></div>
          <button class="nudge" id="ss-click" aria-pressed="${cfg.click}">click ${cfg.click ? "on" : "off"}</button>
        </div>
        <button class="start" id="ss-drill">start drill</button>
        <p class="tuner-status" id="ss-status">pick your rules — the drill deals ${cfg.count} melodies</p>
      </section>`;
    const save = () => store.set("challenge-cfg", cfg);
    segmented(root.querySelector("#ss-diff"), [[0, "any"], [1, "1"], [2, "2"], [3, "3"]], cfg.difficulty,
      (v) => { cfg.difficulty = v; save(); });
    multiToggle(root.querySelector("#ss-clefs"), ["treble", "bass", "alto", "soprano"], cfg.clefs,
      (list) => { cfg.clefs = list; save(); });
    segmented(root.querySelector("#ss-count"), [[3, "3"], [5, "5"], [10, "10"]], cfg.count,
      (v) => { cfg.count = v; save(); });
    segmented(root.querySelector("#ss-strict"), Object.keys(STRICTNESS).map((k) => [k, k]), cfg.strict,
      (v) => { cfg.strict = v; save(); });
    root.querySelector("#ss-click").addEventListener("click", (e) => {
      cfg.click = !cfg.click; save();
      e.target.setAttribute("aria-pressed", String(cfg.click));
      e.target.textContent = `click ${cfg.click ? "on" : "off"}`;
    });
    root.querySelector("#ss-back").addEventListener("click", () => nav(""));
    root.querySelector("#ss-drill").addEventListener("click", () => {
      const melodies = dealSet(cfg.count, { difficulty: cfg.difficulty, clefs: cfg.clefs });
      if (!melodies.length) {
        root.querySelector("#ss-status").textContent = "no melodies match — widen the clefs or level";
        return;
      }
      pendingRun = { mode: "challenge", cfg: { ...cfg }, melodies };
      nav("/run");
    });
  }

  // --- the run driver -------------------------------------------------------
  function renderRun() {
    const runState = { idx: 0, results: [], ...pendingRun };
    const clickOn = () => (runState.mode === "challenge" ? runState.cfg.click : store.get("click", true));
    root.innerHTML = `
      <section class="sightsinging" id="ss-root">
        <div class="ss-runhead ss-controls">
          <button class="nudge" id="ss-quit">&larr; ${runState.mode === "campaign" ? "map" : "settings"}</button>
          <div class="ss-context" id="ss-context"></div>
          <button class="nudge" id="ss-clicktoggle" aria-pressed="${clickOn()}">click ${clickOn() ? "on" : "off"}</button>
        </div>
        <div id="ss-runner"></div>
        <div class="ss-results" id="ss-results" hidden></div>
      </section>`;
    const section = root.querySelector("#ss-root");
    const resultsEl = root.querySelector("#ss-results");
    const contextEl = root.querySelector("#ss-context");

    runner = createRunner(root.querySelector("#ss-runner"), ctx, {
      strictness: () => (runState.mode === "challenge" ? STRICTNESS[runState.cfg.strict] : STRICTNESS.standard),
      click: clickOn,
      onRunState: (r) => {
        section.classList.toggle("ss-running", r);
        if (r) { resultsEl.hidden = true; clearTimeout(advanceTimer); }
      },
      onVerdict: (verdict) => {
        runState.results.push(verdict);
        if (runState.idx < runState.melodies.length - 1) interstitial(verdict);
        else summary();
      },
    });

    root.querySelector("#ss-quit").addEventListener("click", () => {
      nav(runState.mode === "campaign" ? "/campaign" : "/challenge");
    });
    root.querySelector("#ss-clicktoggle").addEventListener("click", (e) => {
      if (runState.mode === "challenge") {
        runState.cfg.click = !runState.cfg.click;
      } else {
        store.set("click", !store.get("click", true));
      }
      e.target.setAttribute("aria-pressed", String(clickOn()));
      e.target.textContent = `click ${clickOn() ? "on" : "off"}`;
    });

    function contextLine() {
      if (runState.mode === "campaign") {
        const lesson = LESSONS.find((l) => l.id === runState.lessonId);
        const book = BOOKS.findIndex((b) => b.id === lesson.bookId) + 1;
        return `Book ${book} · ${lesson.title} — melody ${runState.idx + 1} of ${runState.melodies.length}`;
      }
      return `challenge — ${runState.idx + 1} of ${runState.melodies.length}`;
    }

    function loadCurrent() {
      if (Array.isArray(window.__WS_FAKE_SET) && window.__WS_FAKE_SET.length) {
        window.__WS_FAKE_SING = window.__WS_FAKE_SET.shift();
      }
      section.classList.remove("ss-set-done");
      contextEl.textContent = contextLine();
      resultsEl.hidden = true;
      runner.load(runState.melodies[runState.idx]);
    }

    function showResults() {
      resultsEl.hidden = false;
      resultsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function tierCounts(verdict) {
      return TIERS.filter((t) => verdict.counts[t])
        .map((t) => `<span class="tier tier-${t}">${verdict.counts[t]} ${t}</span>`).join(" · ");
    }

    function interstitial(verdict) {
      resultsEl.innerHTML = `
        <div class="ss-score" id="ss-score">${verdict.score}%</div>
        <div class="ss-tiers">${tierCounts(verdict)}</div>
        <button class="start" id="ss-next">next melody</button>`;
      showResults();
      resultsEl.querySelector("#ss-next").addEventListener("click", advance);
      advanceTimer = setTimeout(advance, 4000);
    }

    function advance() {
      clearTimeout(advanceTimer);
      runState.idx += 1;
      loadCurrent();
    }

    function summary() {
      section.classList.add("ss-set-done"); // retires the runner's transport
      const scores = runState.results.map((v) => v.score);
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const rows = runState.melodies.map((m, i) =>
        `<li>${m.title} <span class="ss-dim">${scores[i]}%</span></li>`).join("");
      if (runState.mode === "campaign") {
        const stars = starsFor(avg);
        const p = { ...progress() };
        const prev = p[runState.lessonId];
        p[runState.lessonId] = {
          stars: Math.max(stars, prev?.stars ?? 0),
          best: Math.max(avg, prev?.best ?? 0),
          at: Date.now(),
        };
        store.set("campaign", p);
        resultsEl.innerHTML = `
          <div class="ss-score" id="ss-score">${avg}%</div>
          <div class="ss-stars" id="ss-stars">
            ${[0, 1, 2].map((i) =>
              `<span class="star ${i < stars ? "earned" : ""}" style="animation-delay:${0.25 + i * 0.45}s">&#9733;</span>`).join("")}
          </div>
          <ul class="ss-summary-list">${rows}</ul>
          <div class="transport">
            <button class="tap" id="ss-replay">sing it again</button>
            <button class="start" id="ss-tomap">back to the map</button>
          </div>
          <p class="tuner-status">${stars === 3 ? "gold sticker — flawless lesson" : SCORE_WORDS.find(([min]) => avg >= min)[1]}</p>`;
        showResults();
        resultsEl.querySelector("#ss-tomap").addEventListener("click", () => nav("/campaign"));
        resultsEl.querySelector("#ss-replay").addEventListener("click", () => {
          runState.idx = 0; runState.results = []; loadCurrent();
        });
      } else {
        store.set("challenge-log", `${avg}% over ${runState.melodies.length}`);
        resultsEl.innerHTML = `
          <div class="ss-score" id="ss-score">${avg}%</div>
          <ul class="ss-summary-list">${rows}</ul>
          <div class="transport">
            <button class="tap" id="ss-config">change settings</button>
            <button class="start" id="ss-again">again</button>
          </div>
          <p class="tuner-status">${SCORE_WORDS.find(([min]) => avg >= min)[1]}</p>`;
        showResults();
        resultsEl.querySelector("#ss-config").addEventListener("click", () => nav("/challenge"));
        resultsEl.querySelector("#ss-again").addEventListener("click", () => {
          runState.melodies = dealSet(runState.melodies.length, {
            difficulty: runState.cfg.difficulty, clefs: runState.cfg.clefs,
          });
          runState.idx = 0; runState.results = []; loadCurrent();
        });
      }
    }

    loadCurrent();
  }

  // --- small control helpers ------------------------------------------------
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

  function multiToggle(container, items, current, onChange) {
    const active = new Set(current);
    for (const value of items) {
      const b = document.createElement("button");
      b.textContent = value;
      b.setAttribute("aria-pressed", String(active.has(value)));
      b.addEventListener("click", () => {
        if (active.has(value)) {
          if (active.size === 1) return; // at least one clef stays on
          active.delete(value);
        } else {
          active.add(value);
        }
        b.setAttribute("aria-pressed", String(active.has(value)));
        onChange([...active]);
      });
      container.append(b);
    }
  }

  window.addEventListener("hashchange", render);
  render();

  return {
    destroy() {
      clearTimeout(advanceTimer);
      window.removeEventListener("hashchange", render);
      if (runner) { runner.destroy(); runner = null; }
    },
  };
}
