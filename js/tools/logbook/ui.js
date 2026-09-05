// Logbook shell: routes, the today · goals · history strip, the Today screen
// (hero + practiced-today list), the 1 s ticker, and the ctx handed to the
// other screens. Routes: #/logbook · /goals · /goals/<id> · /history · /history/analytics.
// The picker, creation and quick-note sheets are overlays, not routes.
import { logbook, TYPES, displayName } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, longPress, fmtMin, fmtClock, fmtDate, relDay, toast, sheetOpen } from "./util.js";
import { openPicker } from "./picker.js";
import { openCreate } from "./create.js";
import { openQuickNote } from "./notes.js";
import { renderLibrary } from "./library.js";
import { renderGoalPage } from "./goalpage.js";
import { renderHistory } from "./history.js";
import { renderAnalytics } from "./analytics.js";
import { whoosh, tickRow, stamp, glow, haptic } from "./motion.js";
import { engage, bow } from "./ceremony.js";
import { recording, recordingStrip, wireRecording, takeRow, wireTakeRows } from "./takes.js";
import { takeStore } from "../../lib/takes/store.js";

export function buildUI(root) {
  let ticker = 0;
  const tickFns = new Set();
  const libState = {}, histState = {}, anxState = {};
  let practicedToday = logbook.practicedOn(logbook.today());
  let cleanups = [];

  const nav = (sub) => { location.hash = `#/logbook${sub}`; };
  const route = () => {
    const h = location.hash.replace(/^#\/logbook\/?/, "");
    const [path] = h.split("?");
    return path;
  };

  // --- shared chrome ----------------------------------------------------------
  // The today · goals · history strip lives in the shell's nav slot so it is
  // pinned with the header on every screen (WSHED-42).
  const slot = document.getElementById("nav-slot");
  const stripEl = document.createElement("nav");
  stripEl.className = "segmented lb-strip";
  stripEl.setAttribute("aria-label", "logbook sections");
  stripEl.innerHTML = `
      <button data-go="">today</button>
      <button data-go="/goals">goals</button>
      <button data-go="/history">history</button>`;
  stripEl.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) nav(b.dataset.go); });
  slot?.replaceChildren(stripEl);
  const setStrip = (which) => {
    const on = { "": "today", "/goals": "goals", "/history": "history" };
    for (const b of stripEl.querySelectorAll("button")) b.setAttribute("aria-pressed", String(on[b.dataset.go] === which));
  };
  const strip = () => ""; // screens no longer render their own strip

  /** One "practiced" row: glyph · name · minutes. Used by Today and History. */
  const goalRow = (r) => {
    const t = TYPES[r.goal.type] ?? TYPES.other;
    const auto = r.segments.every((s) => s.auto);
    return `<li class="lb-trow ${r.live ? "live" : ""}" data-id="${r.goal.id}">
      <button class="lb-trow-main" data-open="${r.goal.id}" title="tap to open · hold for a note">
        <i class="lb-type ${t.cls}" aria-hidden="true">${t.glyph}</i>
        <span class="lb-trow-name">${esc(displayName(r.goal))}</span>
        ${auto ? `<span class="lb-auto">auto</span>` : ""}
        <span class="lb-trow-min" data-live-min="${r.live ? r.goal.id : ""}">${fmtMin(r.minutes)}</span>
      </button>
    </li>`;
  };
  const wireGoalRows = (el) => {
    for (const b of el.querySelectorAll(".lb-trow-main")) longPress(b,
      () => nav(`/goals/${b.dataset.open}`),
      async () => { haptic(); const n = await openQuickNote(b.dataset.open); render(); if (n) stamp(root.querySelector(`.lb-trow[data-id="${b.dataset.open}"]`)); });
  };

  const ctx = { root, nav, render, toast, strip, goalRow, wireGoalRows, openPicker, openCreate, openQuickNote, onTick: (fn) => tickFns.add(fn) };

  // --- render -----------------------------------------------------------------
  function render() {
    tickFns.clear();
    for (const c of cleanups) c(); cleanups = [];
    const path = route();
    if (path === "goals") { setStrip("goals"); renderLibrary(root, ctx, libState); }
    else if (path.startsWith("goals/")) { setStrip("goals"); renderGoalPage(root, path.slice(6), ctx); }
    else if (path === "history/analytics") { setStrip("history"); renderAnalytics(root, ctx, anxState); }
    else if (path === "history") { setStrip("history"); renderHistory(root, ctx, histState); }
    else if (path === "log") { history.replaceState(null, "", "#/logbook"); setStrip("today"); renderToday(); }
    else { setStrip("today"); renderToday(); }
    syncTicker();
  }

  // --- Today ------------------------------------------------------------------
  function renderToday() {
    const t = logbook.today();
    const run = logbook.running();
    const rep = logbook.dayReport(t);
    const strip7 = logbook.metrics.weekStrip();
    const streak = logbook.metrics.streak();
    const lastNote = run ? logbook.notes(run.goal.id)[0] : null;
    const goalToday = run ? rep.goals.find((r) => r.goal.id === run.goal.id)?.minutes ?? 0 : 0;
    const rt = run ? (TYPES[run.goal.type] ?? TYPES.other) : null;
    const rec = recording.current();
    const takesToday = logbook.takes({ day: t });
    const canRec = recording.supported();

    root.innerHTML = `
      <section class="logbook lb-today">
        <div class="lb-date">${fmtDate(Date.now(), { weekday: "long", month: "long", day: "numeric" })}</div>
        ${run ? `
        <div class="lb-hero running">
          <div class="lb-hero-type ${rt.cls}"><i class="lb-type ${rt.cls}" aria-hidden="true">${rt.glyph}</i>${rt.label}</div>
          <button class="lb-hero-goal" id="lb-hero-goal" data-open="${run.goal.id}">${esc(displayName(run.goal))}</button>
          <div class="lb-hero-elapsed" id="lb-elapsed" aria-live="off">${fmtClock(run.elapsedMs)}</div>
          <div class="lb-hero-sub">today on this goal <b id="lb-goal-today">${fmtMin(goalToday)}</b></div>
          <div class="lb-hero-note">
            <div class="lb-hero-note-head"><span class="lb-dim">${lastNote ? `last note · ${esc(relDay(lastNote.createdAt))}` : "no notes yet"}</span><span class="lb-hero-note-acts">${canRec && !rec ? `<button class="lb-link lb-rec-link" id="lb-hero-rec" aria-label="record a take of this goal"><i class="lb-rec-glyph" aria-hidden="true"></i>take</button>` : ""}<button class="lb-link" id="lb-hero-addnote">+ note</button></span></div>
            ${lastNote ? `<button class="lb-hero-note-body" data-open="${run.goal.id}">${esc(lastNote.body)}</button>` : ""}
          </div>
          ${recordingStrip()}
          <div class="lb-hero-acts">
            <button class="lb-stop" id="lb-stop" aria-label="stop">${icon("stop")}<span>stop</span></button>
            <button class="lb-switch" id="lb-switch" aria-label="switch goal"><span aria-hidden="true">&#8644;</span><span>switch</span></button>
          </div>
        </div>` : `
        <div class="lb-hero idle">
          <button class="lb-hero-play" id="lb-play" aria-label="play — choose what you're working on" title="hold to add time without the clock">${icon("play")}</button>
          <div class="lb-hero-total">${rep.minutes ? `<b>${fmtMin(rep.minutes)}</b> today` : `<span class="lb-dim">press play and say what you're working on</span>`}${canRec && !rec ? `<button class="lb-link lb-rec-link lb-rec-idle" id="lb-rec-idle" aria-label="record a take"><i class="lb-rec-glyph" aria-hidden="true"></i>record a take</button>` : ""}</div>
        </div>
        ${rec ? `<div class="lb-hero lb-hero-rec">${recordingStrip()}</div>` : ""}`}
        <div class="lb-week" aria-label="this week">
          ${strip7.map((d) => `<i class="${d.practiced ? `on b-${d.band}` : ""} ${d.best ? "best" : ""} ${d.today ? "today" : ""}" title="${d.key}"></i>`).join("")}
          <span class="lb-dim">${streak ? `streak ${streak} day${streak === 1 ? "" : "s"}` : "no streak yet"}</span>
          ${run ? `<span class="lb-week-total lb-dim"><b id="lb-total">${fmtMin(rep.minutes)}</b> today</span>` : ""}
        </div>
        <div class="lb-sect">practiced today</div>
        ${rep.goals.length ? `<ul class="lb-today-list" id="lb-today-list">${rep.goals.map(goalRow).join("")}</ul>`
          : `<p class="lb-empty lb-dim">nothing yet.</p>`}
        ${takesToday.length ? `<div class="lb-sect">takes today<span class="lb-sect-sub">${takesToday.length}</span></div>
        <ul class="lb-takes" id="lb-today-takes">${takesToday.map((tk) => takeRow(tk, { goal: true })).join("")}</ul>` : ""}
      </section>`;

    root.querySelector("#lb-play") && longPress(root.querySelector("#lb-play"), play, addTime);
    root.querySelector("#lb-stop")?.addEventListener("click", stop);
    root.querySelector("#lb-switch")?.addEventListener("click", switchGoal);
    root.querySelector("#lb-hero-goal")?.addEventListener("click", () => nav(`/goals/${run.goal.id}`));
    root.querySelector(".lb-hero-note-body")?.addEventListener("click", () => nav(`/goals/${run.goal.id}`));
    root.querySelector("#lb-hero-addnote")?.addEventListener("click", async () => {
      const n = await openQuickNote(run.goal.id);
      render();
      if (n) stamp(root.querySelector(".lb-hero-note"));
    });
    wireGoalRows(root);
    const startTake = async (goalId) => {
      if (!goalId) { const r = await openPicker({ mode: "take" }); if (!r) return; goalId = r.goal.id; }
      try { await recording.start(goalId); render(); } catch (e) { toast(e.message); }
    };
    root.querySelector("#lb-hero-rec")?.addEventListener("click", () => startTake(run.goal.id));
    root.querySelector("#lb-rec-idle")?.addEventListener("click", () => startTake(null));
    cleanups.push(wireRecording(root, (tk) => { render(); if (tk) stamp(root.querySelector(`.lb-take[data-id="${tk.id}"]`)); }));
    const takesEl = root.querySelector("#lb-today-takes");
    if (takesEl) cleanups.push(wireTakeRows(takesEl));

    if (run) {
      const el = root.querySelector("#lb-elapsed"), gt = root.querySelector("#lb-goal-today"), tot = root.querySelector("#lb-total");
      tickFns.add(() => {
        const r = logbook.running();
        if (!r) { render(); return; }
        el.textContent = fmtClock(r.elapsedMs);
        if (new Date().getSeconds() % 15 === 0 || !el.dataset.primed) {
          el.dataset.primed = "1";
          const rp = logbook.dayReport(logbook.today());
          gt.textContent = fmtMin(rp.goals.find((x) => x.goal.id === r.goal.id)?.minutes ?? 0);
          if (tot) tot.textContent = fmtMin(rp.minutes);
          const live = root.querySelector(`[data-live-min="${r.goal.id}"]`);
          if (live) live.textContent = fmtMin(rp.goals.find((x) => x.goal.id === r.goal.id)?.minutes ?? 0);
          else if (rp.goals.some((x) => x.goal.id === r.goal.id)) render(); // the row appeared
          if (!practicedToday && logbook.practicedOn(logbook.today())) { practicedToday = true; const dot = root.querySelector(".lb-week i.today"); dot?.classList.add("on"); glow(dot); }
        }
      });
    }
  }

  async function play() {
    const r = await openPicker({ mode: "start" });
    if (!r) return;
    logbook.start(r.goal.id);
    render();
    await engage({ goal: r.goal, type: TYPES[r.goal.type] ?? TYPES.other, landOn: () => root.querySelector("#lb-hero-goal") });
    if (r.created) stamp(root.querySelector(`.lb-trow[data-id="${r.goal.id}"]`));
  }
  async function switchGoal() {
    const cur = logbook.running();
    const r = await openPicker({ mode: "switch", excludeId: cur?.goal.id ?? null });
    if (!r) return;
    const before = root.querySelector(`.lb-trow[data-id="${cur?.goal.id}"]`);
    if (before) tickRow(before);
    logbook.switchTo(r.goal.id);
    render();
    await whoosh(r.rowEl, root.querySelector("#lb-hero-goal"));
    stamp(root.querySelector(`.lb-trow[data-id="${r.goal.id}"]`));
  }
  async function stop() {
    const run = logbook.running();
    if (!run) { render(); return; }
    const seg = logbook.stop();
    render();
    if (!seg) { haptic(); toast("under 10 seconds — not kept"); return; }
    const rep = logbook.dayReport(logbook.today());
    const rowFor = () => root.querySelector(`.lb-trow[data-id="${run.goal.id}"]`);
    await bow({ goal: run.goal, ms: seg.endedAt - seg.startedAt, todayMinutes: rep.goals.find((r) => r.goal.id === run.goal.id)?.minutes ?? 0, streak: logbook.metrics.streak(), landOn: rowFor });
    tickRow(rowFor());
  }
  async function addTime() {
    const r = await openPicker({ mode: "addtime" });
    if (!r) return;
    logbook.addTime({ goalId: r.goal.id, minutes: r.minutes });
    render();
    stamp(root.querySelector(`.lb-trow[data-id="${r.goal.id}"]`));
    toast(`${fmtMin(r.minutes)} added to ${displayName(r.goal)}`);
  }

  // --- ticker -------------------------------------------------------------------
  function syncTicker() {
    clearInterval(ticker);
    if (!logbook.running() || !tickFns.size) return;
    ticker = setInterval(() => { for (const fn of tickFns) fn(); }, 1000);
  }

  // --- boot -------------------------------------------------------------------
  root.classList.add("top-anchored");
  const onHash = () => { if (location.hash.startsWith("#/logbook")) render(); };
  window.addEventListener("hashchange", onHash);
  const typing = () => { const a = document.activeElement; return a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
  const off = logbook.on(() => { if (sheetOpen() || typing()) return; render(); });
  const offStore = takeStore.on(() => { if (typing()) return; render(); });
  const onKey = (e) => {
    if (e.key === "/" && route() === "goals" && !typing() && !sheetOpen()) { e.preventDefault(); root.querySelector("#lb-lib-q")?.focus(); }
  };
  document.addEventListener("keydown", onKey);
  render();

  return {
    destroy() {
      root.classList.remove("top-anchored");
      clearInterval(ticker);
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("keydown", onKey);
      for (const c of cleanups) c();
      slot?.replaceChildren();
      off(); offStore();
    },
  };
}
