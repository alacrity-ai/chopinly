// "What are you working on?" — the goal picker (docs/LOGBOOK_V2_DESIGN.md §4).
// One sheet used by play, switch, the shell chip, the metronome, and add-time.
// It only *chooses*; the caller starts / switches / adds time, so it can whoosh
// the chosen row into its own hero.
import { logbook, TYPES, TYPE_IDS, norm, displayName } from "../../lib/logbook.js";
import { esc, openSheet, finePointer, fmtMin, ago } from "./util.js";
import { openCreate } from "./create.js";
import { haptic } from "./motion.js";

const TITLES = { start: "What are you working on?", switch: "Switch to…", addtime: "Add time to…" };
const QUICK_MINUTES = [15, 30, 45, 60];

/**
 * @param {{ mode?: "start"|"switch"|"addtime", excludeId?: string|null }} opts
 * @returns {Promise<{ goal, rowEl, created: boolean, minutes?: number }|null>}
 */
export function openPicker({ mode = "start", excludeId = null } = {}) {
  let q = "", showFinished = false, highlight = 0, result = null, resolveOuter;
  const outer = new Promise((r) => { resolveOuter = r; });
  const sheet = openSheet({
    title: TITLES[mode] ?? TITLES.start,
    cls: "lb-picker-wrap",
    html: `
      <input class="lb-input lb-search" id="lb-pick-q" type="search" placeholder="search or type a new goal…" autocomplete="off" autocapitalize="sentences" aria-label="search goals" role="combobox" aria-expanded="true" aria-controls="lb-pick-list">
      <div class="lb-pick-list" id="lb-pick-list" role="listbox"></div>
      <div class="lb-pick-foot">
        <button type="button" class="lb-link" id="lb-pick-finished" aria-pressed="false">show finished</button>
      </div>`,
  });
  const { body, close, closed } = sheet;
  const input = body.querySelector("#lb-pick-q");
  const list = body.querySelector("#lb-pick-list");
  const finBtn = body.querySelector("#lb-pick-finished");

  const stats = (g) => {
    const st = logbook.metrics.goalStats(g.id);
    return st.minutes ? `${fmtMin(st.minutes)} · ${ago(st.daysSince)}` : "never";
  };
  const row = (g, extra = "") => `
    <button type="button" class="lb-pick-row ${extra}" role="option" data-id="${g.id}" aria-selected="false">
      <i class="lb-type ${TYPES[g.type]?.cls ?? ""}" aria-hidden="true">${TYPES[g.type]?.glyph ?? "●"}</i>
      <span class="lb-pick-name">${esc(displayName(g))}</span>
      <span class="lb-pick-sub">${g.id === excludeId ? "now" : g.status !== "active" ? g.status : stats(g)}</span>
    </button>`;

  function build() {
    const needle = norm(q);
    let html = "";
    if (needle) {
      const pool = logbook.goals({ status: "all", q, sort: "recent" })
        .filter((g) => showFinished || g.status === "active" || norm(displayName(g)).includes(needle));
      const active = pool.filter((g) => g.status === "active"), rest = pool.filter((g) => g.status !== "active");
      html += active.map((g) => row(g)).join("") + rest.map((g) => row(g, "lb-pick-dim")).join("");
      html += `<button type="button" class="lb-pick-row lb-pick-new" role="option" data-new="1" aria-selected="false"><i class="lb-type" aria-hidden="true">+</i><span class="lb-pick-name">new goal “${esc(q.trim())}”</span></button>`;
    } else {
      const all = logbook.goals({ status: "active", sort: "recent" });
      const recent = all.filter((g) => g.id !== excludeId && logbook.metrics.goalStats(g.id).minutes > 0).slice(0, 5);
      const recentIds = new Set(recent.map((g) => g.id));
      if (recent.length) html += `<div class="lb-pick-sect">recent</div>${recent.map((g) => row(g)).join("")}`;
      for (const t of TYPE_IDS) {
        const rows = all.filter((g) => g.type === t && !recentIds.has(g.id)).sort((a, b) => displayName(a).localeCompare(displayName(b)));
        if (rows.length) html += `<div class="lb-pick-sect">${TYPES[t].label}${t === "piece" ? "s" : ""}</div>${rows.map((g) => row(g, g.id === excludeId ? "lb-pick-now" : "")).join("")}`;
      }
      if (showFinished) {
        const rest = logbook.goals({ status: "all", sort: "name" }).filter((g) => g.status !== "active");
        if (rest.length) html += `<div class="lb-pick-sect">finished · shelved</div>${rest.map((g) => row(g, "lb-pick-dim")).join("")}`;
      }
      if (!all.length) html += `<p class="lb-empty lb-pick-empty">No goals yet. Type what you're practicing above — <em>Scales</em>, <em>Clair de lune</em>, <em>Sight reading</em>.</p>`;
      html += `<button type="button" class="lb-pick-row lb-pick-new" role="option" data-new="1" aria-selected="false"><i class="lb-type" aria-hidden="true">+</i><span class="lb-pick-name">new goal</span></button>`;
    }
    list.innerHTML = html;
    // with no matches the "new goal" row is the only one; otherwise highlight the first real row
    highlight = 0;
    paintHighlight();
    for (const b of list.querySelectorAll(".lb-pick-row")) b.addEventListener("click", () => choose(b));
  }
  const rows = () => [...list.querySelectorAll(".lb-pick-row")];
  function paintHighlight() {
    const rs = rows();
    rs.forEach((r, i) => r.setAttribute("aria-selected", String(i === highlight)));
    input.setAttribute("aria-activedescendant", rs[highlight]?.id ?? "");
    rs[highlight]?.scrollIntoView?.({ block: "nearest" });
  }

  async function choose(btn) {
    if (btn.dataset.new) {
      const goal = await openCreate({ name: q.trim() });
      if (!goal) { input.focus(); return; }
      return finish(goal, btn, true);
    }
    const goal = logbook.goal(btn.dataset.id);
    if (!goal) return;
    if (goal.id === excludeId && mode === "switch") return; // already running
    return finish(goal, btn, false);
  }
  function finish(goal, rowEl, created) {
    if (mode === "addtime") return askMinutes(goal, created);
    haptic();
    result = { goal, rowEl, created };
    resolveOuter(result);
    close();
  }
  function askMinutes(goal, created) {
    let minutes = 30;
    body.innerHTML = `
      <h3 class="lb-pick-goal"><i class="lb-type ${TYPES[goal.type]?.cls ?? ""}" aria-hidden="true">${TYPES[goal.type]?.glyph ?? "●"}</i> ${esc(displayName(goal))}</h3>
      <div class="lb-chips lb-minute-chips" role="radiogroup" aria-label="minutes">
        ${QUICK_MINUTES.map((m) => `<button type="button" class="lb-chip ${m === minutes ? "on" : ""}" data-m="${m}" role="radio" aria-checked="${m === minutes}">${m}m</button>`).join("")}
      </div>
      <div class="lb-stepper">
        <button type="button" class="nudge" data-d="-5" aria-label="five minutes less">&minus;</button>
        <output class="lb-minutes" id="lb-minutes">${minutes}m</output>
        <button type="button" class="nudge" data-d="5" aria-label="five minutes more">+</button>
      </div>
      <div class="transport"><button type="button" class="start" id="lb-addtime-go">add</button></div>`;
    const out = body.querySelector("#lb-minutes");
    const chipsEl = [...body.querySelectorAll(".lb-minute-chips .lb-chip")];
    const set = (m) => {
      minutes = Math.min(1440, Math.max(1, m));
      out.textContent = `${minutes}m`;
      for (const c of chipsEl) { const on = Number(c.dataset.m) === minutes; c.classList.toggle("on", on); c.setAttribute("aria-checked", String(on)); }
    };
    for (const c of chipsEl) c.addEventListener("click", () => set(Number(c.dataset.m)));
    for (const n of body.querySelectorAll(".nudge")) n.addEventListener("click", () => set(minutes + Number(n.dataset.d)));
    body.querySelector("#lb-addtime-go").addEventListener("click", () => {
      haptic();
      result = { goal, rowEl: null, created, minutes };
      resolveOuter(result);
      close();
    });
  }

  input.addEventListener("input", () => { q = input.value; build(); });
  input.addEventListener("keydown", (e) => {
    const rs = rows();
    if (e.key === "ArrowDown") { e.preventDefault(); highlight = Math.min(rs.length - 1, highlight + 1); paintHighlight(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight = Math.max(0, highlight - 1); paintHighlight(); }
    else if (e.key === "Enter") { e.preventDefault(); const r = rs[highlight] ?? rs[0]; if (r) choose(r); }
  });
  finBtn.addEventListener("click", () => { showFinished = !showFinished; finBtn.setAttribute("aria-pressed", String(showFinished)); build(); });
  build();
  if (finePointer()) input.focus();
  closed.then(() => resolveOuter(result));
  return outer;
}
