// Logbook shell: Today · Goals · History, plus the log sheet.
// Routes: #/logbook · /goals · /goals/<id> · /history · /log?goal=&bpm=
import { logbook, NEGLECT_DAYS } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { renderSheet, toast } from "./sheet.js";
import { sparkline } from "./sparkline.js";
import { esc, longPress, fmtMin, fmtClock, ago, fmtDate, fmtTime } from "./util.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function buildUI(root) {
  let clockTimer = 0;
  let histMonth = null; // { y, m }
  let selectedDay = null;

  const nav = (sub) => { location.hash = `#/logbook${sub}`; };
  const route = () => {
    const h = location.hash.replace(/^#\/logbook\/?/, "");
    const [path, qs] = h.split("?");
    return { path, q: new URLSearchParams(qs ?? "") };
  };
  const tempoBtn = (bpm) => (bpm == null ? "" : `<a class="lb-tempo" href="#/metronome?bpm=${bpm}" aria-label="open the metronome at ${bpm}">&#9833; ${bpm}</a>`);

  // --- strip (today · goals · history) ---------------------------------------
  const strip = (which) => `
    <nav class="segmented lb-strip" aria-label="logbook sections">
      <button aria-pressed="${which === "today"}" data-go="">today</button>
      <button aria-pressed="${which === "goals"}" data-go="/goals">goals</button>
      <button aria-pressed="${which === "history"}" data-go="/history">history</button>
    </nav>`;
  const wireStrip = () => { for (const b of root.querySelectorAll(".lb-strip button")) b.addEventListener("click", () => nav(b.dataset.go)); };

  // --- render ----------------------------------------------------------------
  function render() {
    clearInterval(clockTimer);
    const { path, q } = route();
    if (path === "goals") renderGoals();
    else if (path.startsWith("goals/")) renderGoal(path.slice(6));
    else if (path === "history") renderHistory();
    else if (path === "log") renderLog(q);
    else renderToday();
  }

  // --- Today -----------------------------------------------------------------
  function renderToday() {
    const t = logbook.today();
    const cards = logbook.goals("active").map((g) => logbook.goalCard(g));
    const entries = logbook.entriesOn(t);
    const clock = logbook.clock();
    const strip7 = logbook.metrics.weekStrip();
    const streak = logbook.metrics.streak();
    const minutes = logbook.minutesOn(t);
    const byId = (id) => logbook.goal(id);

    root.innerHTML = `
      <section class="logbook">
        ${strip("today")}
        <header class="lb-today-head">
          <div class="lb-date">${fmtDate(Date.now(), { weekday: "long", month: "long", day: "numeric" })}</div>
          <div class="lb-clock ${clock ? "running" : ""}">
            <button class="lb-clock-btn" id="lb-clock" aria-label="${clock ? "stop the session" : "start a session"}">
              ${clock ? icon("stop") : icon("play")}
            </button>
            <span class="lb-clock-time" id="lb-elapsed">${clock ? fmtClock(Date.now() - clock.startedAt) : minutes ? fmtMin(minutes) : "start a session"}</span>
            ${!clock && minutes ? `<span class="lb-dim">today</span>` : ""}
          </div>
          <div class="lb-week" aria-label="this week">
            ${strip7.map((d) => `<i class="${d.practiced ? "on" : ""} ${d.gold ? "gold" : ""} ${d.today ? "today" : ""}" title="${d.key}"></i>`).join("")}
            <span class="lb-dim">${streak ? `streak ${streak} day${streak === 1 ? "" : "s"}` : "no streak yet"}</span>
          </div>
        </header>

        <div class="lb-sect">today's goals</div>
        ${cards.length ? cards.map((c) => `
          <article class="lb-goal ${c.neglected ? "neglected" : ""}" data-id="${c.id}">
            <div class="lb-goal-h">
              <button class="lb-goal-title" data-open="${c.id}">${esc(c.title)}</button>
              <span class="lb-goal-meta">${c.lastBpm != null ? `last ${c.lastBpm} · ` : ""}${ago(c.daysSince)}${c.neglected ? ` <span class="lb-warn" title="untouched for ${c.daysSince} days">&#9888;</span>` : ""}</span>
            </div>
            <div class="lb-next">next: ${c.next ? `<em>${esc(c.next)}</em>` : `<span class="lb-dim">—</span>`}</div>
            ${c.openSpots.length ? `<div class="lb-spots">${c.openSpots.map((s) =>
              `<button class="lb-spot" data-goal="${c.id}" data-spot="${s.id}" title="hold to mark fixed">${esc(s.text)}</button>`).join("")}</div>` : ""}
            ${c.kind === "user" ? `<div class="lb-acts">
              <button class="lb-log" data-log="${c.id}">log</button>
              ${tempoBtn(c.lastBpm)}
            </div>` : ""}
          </article>`).join("") : `
          <p class="lb-empty">No goals yet. A goal is a piece or a skill — <em>Chopin Op. 10 No. 1</em>, <em>scales to 140</em>.</p>
          <div class="transport"><button class="start" id="lb-first-goal">+ goal</button></div>`}

        <div class="lb-sect">logged today</div>
        ${entries.length ? `<ul class="lb-entries">${entries.map((e) => entryRow(e, byId(e.goalId))).join("")}</ul>`
          : `<p class="lb-empty lb-dim">nothing yet${cards.length ? " — tap <b>log</b> on a goal" : ""}.</p>`}
        <div class="lb-foot">
          ${cards.length ? `<button class="lb-link" id="lb-add-goal">+ goal</button>` : ""}
          <button class="lb-link" id="lb-add-min">+ minutes</button>
        </div>
      </section>`;

    wireStrip();
    root.querySelector("#lb-clock").addEventListener("click", () => {
      if (logbook.clock()) { const m = logbook.stopClock(); toast(root, m ? `${m} min logged` : "session under a minute — not logged"); }
      else logbook.startClock();
      render();
    });
    if (clock) {
      const el = root.querySelector("#lb-elapsed");
      clockTimer = setInterval(() => { el.textContent = fmtClock(Date.now() - clock.startedAt); }, 1000);
    }
    for (const b of root.querySelectorAll("[data-log]")) b.addEventListener("click", () => nav(`/log?goal=${b.dataset.log}`));
    for (const b of root.querySelectorAll("[data-open]")) b.addEventListener("click", () => nav(`/goals/${b.dataset.open}`));
    for (const s of root.querySelectorAll(".lb-spot")) longPress(s,
      () => nav(`/log?goal=${s.dataset.goal}`),
      () => { logbook.fixSpot(s.dataset.goal, s.dataset.spot); toast(root, `fixed — ${s.textContent}`); render(); });
    root.querySelector("#lb-first-goal")?.addEventListener("click", () => nav("/goals?new=1"));
    root.querySelector("#lb-add-goal")?.addEventListener("click", () => nav("/goals?new=1"));
    root.querySelector("#lb-add-min").addEventListener("click", () => {
      const v = prompt("Minutes practiced today (without the clock)?", "30");
      if (v == null) return;
      logbook.addMinutes(t, v); render();
    });
    wireEntryDeletes();
  }

  function entryRow(e, g) {
    const spots = e.spotIds.map((id) => g?.spots.find((s) => s.id === id)?.text).filter(Boolean);
    return `<li class="lb-entry" data-entry="${e.id}">
      <span class="lb-entry-t">${fmtTime(e.at)}</span>
      <span class="lb-entry-b">
        <b>${esc(g?.title ?? "—")}</b>${e.auto ? ` · ${esc(e.auto.label)} <span class="lb-auto">auto</span>` : ""}${spots.length ? ` · ${esc(spots.join(", "))}` : ""}${e.bpm != null ? ` · ${tempoBtn(e.bpm)}` : ""}${e.note ? `<span class="lb-note">“${esc(e.note)}”</span>` : ""}
      </span>
      <button class="lb-x" data-del="${e.id}" aria-label="delete entry">&times;</button>
    </li>`;
  }
  function wireEntryDeletes() {
    for (const b of root.querySelectorAll("[data-del]")) b.addEventListener("click", () => {
      if (confirm("Delete this entry?")) { logbook.deleteEntry(b.dataset.del); render(); }
    });
  }

  // --- log sheet -------------------------------------------------------------
  function renderLog(q) {
    const goalId = q.get("goal");
    const bpm = q.get("bpm");
    if (!logbook.goals("active").some((g) => g.kind === "user")) { nav("/goals?new=1"); return; }
    renderSheet(root, {
      goalId: goalId && logbook.goal(goalId) ? goalId : null,
      bpm: bpm != null && bpm !== "" ? Number(bpm) : null,
      onDone: () => { history.replaceState(null, "", "#/logbook"); render(); toast(root, "logged"); },
      onCancel: () => history.back(),
    });
  }

  // --- Goals -----------------------------------------------------------------
  function renderGoals() {
    const { q } = route();
    const active = logbook.goals("active"), finished = logbook.goals("finished"), shelved = logbook.goals("shelved");
    const row = (g, extra = "") => `<li class="lb-row" data-id="${g.id}">
        <button class="lb-row-main" data-open="${g.id}">
          <span class="lb-row-title">${esc(g.title)}</span>
          <span class="lb-row-sub">${extra}</span>
        </button>
        ${g.status === "active" && g.kind === "user" ? `<span class="lb-reorder"><button data-up="${g.id}" aria-label="move up">&#9650;</button><button data-down="${g.id}" aria-label="move down">&#9660;</button></span>` : ""}
      </li>`;
    root.innerHTML = `
      <section class="logbook">
        ${strip("goals")}
        <form class="lb-new ${q.get("new") ? "" : "collapsed"}" id="lb-new">
          <input class="lb-input" id="lb-new-title" placeholder="new goal — a piece or a skill" autocomplete="off" required>
          <input class="lb-input lb-input-sm" id="lb-new-target" placeholder="target (optional): 140, from memory" autocomplete="off">
          <div class="transport"><button class="start" type="submit">add goal</button></div>
        </form>
        ${!q.get("new") ? `<div class="transport"><button class="tap" id="lb-show-new">+ goal</button></div>` : ""}
        <div class="lb-sect">active</div>
        ${active.length ? `<ul class="lb-list">${active.map((g) => {
          const c = logbook.goalCard(g);
          return row(g, `${c.target ? `target ${esc(c.target)} · ` : ""}${c.lastBpm != null ? `last ${c.lastBpm} · ` : ""}${c.openSpots.length} open spot${c.openSpots.length === 1 ? "" : "s"}`);
        }).join("")}</ul>` : `<p class="lb-empty lb-dim">no active goals.</p>`}
        ${finished.length ? `<details class="lb-details"><summary>finished · ${finished.length}</summary><ul class="lb-list">${finished.map((g) => {
          const st = logbook.metrics.goalStats(g.id);
          return row(g, `${fmtDate(g.finishedAt, { month: "short", day: "numeric", year: "numeric" })} · ${st.span != null ? `${Math.max(1, Math.round(st.span / 7))} wk · ` : ""}${st.sessions} session${st.sessions === 1 ? "" : "s"}`);
        }).join("")}</ul></details>` : ""}
        ${shelved.length ? `<details class="lb-details"><summary>shelved · ${shelved.length}</summary><ul class="lb-list">${shelved.map((g) => row(g, "paused")).join("")}</ul></details>` : ""}
        <div class="lb-foot">
          <button class="lb-link" id="lb-export">export JSON</button>
          <label class="lb-link">import JSON<input type="file" id="lb-import" accept="application/json,.json" hidden></label>
        </div>
      </section>`;
    wireStrip();
    const form = root.querySelector("#lb-new");
    root.querySelector("#lb-show-new")?.addEventListener("click", () => { form.classList.remove("collapsed"); root.querySelector("#lb-show-new").remove(); form.querySelector("#lb-new-title").focus(); });
    if (q.get("new")) form.querySelector("#lb-new-title").focus();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        logbook.addGoal({ title: form.querySelector("#lb-new-title").value, target: form.querySelector("#lb-new-target").value });
        history.replaceState(null, "", "#/logbook/goals"); render(); toast(root, "goal added");
      } catch (err) { toast(root, err.message); }
    });
    for (const b of root.querySelectorAll("[data-open]")) b.addEventListener("click", () => nav(`/goals/${b.dataset.open}`));
    const move = (id, d) => {
      const ids = active.filter((g) => g.kind === "user").map((g) => g.id);
      const i = ids.indexOf(id), j = i + d;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      logbook.reorderGoals(ids); render();
    };
    for (const b of root.querySelectorAll("[data-up]")) b.addEventListener("click", () => move(b.dataset.up, -1));
    for (const b of root.querySelectorAll("[data-down]")) b.addEventListener("click", () => move(b.dataset.down, 1));
    root.querySelector("#lb-export").addEventListener("click", () => {
      const blob = new Blob([logbook.exportJson()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `woodshed-logbook-${logbook.today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    root.querySelector("#lb-import").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const text = await f.text();
      if (!confirm("Replace everything in the Logbook with this file?")) return;
      try { logbook.importJson(text); render(); toast(root, "imported"); } catch (err) { toast(root, err.message); }
    });
  }

  function renderGoal(id) {
    const g = logbook.goal(id);
    if (!g) { nav("/goals"); return; }
    const c = logbook.goalCard(g);
    const st = logbook.metrics.goalStats(id);
    const builtin = g.kind === "builtin";
    root.innerHTML = `
      <section class="logbook lb-goalpage">
        <div class="ss-head">
          <button class="tap lb-back" id="lb-back" aria-label="back to goals">&larr;</button>
          <div class="ss-head-title">${g.status}</div>
          <span></span>
        </div>
        ${builtin ? `<h2 class="lb-sheet-title">${esc(g.title)}</h2><p class="lb-dim lb-center">written automatically by the sight-singing books.</p>` : `
        <label class="lb-field lb-field-col"><span class="lb-label">title</span><input class="lb-input" id="lb-title" value="${esc(g.title)}"></label>
        <label class="lb-field lb-field-col"><span class="lb-label">target</span><input class="lb-input" id="lb-target" value="${esc(g.target ?? "")}" placeholder="140, from memory…"></label>
        <label class="lb-field lb-field-col"><span class="lb-label">next time</span><input class="lb-input" id="lb-nextf" value="${esc(g.next ?? "")}" placeholder="what to do next session"></label>
        <div class="lb-sect">spots</div>
        <ul class="lb-spotlist" id="lb-spotlist">
          ${g.spots.filter((s) => !s.fixedAt).map((s) => `<li><button class="lb-spot" data-fix="${s.id}" title="tap to mark fixed">${esc(s.text)}</button><button class="lb-x" data-delspot="${s.id}" aria-label="delete spot">&times;</button></li>`).join("")}
          ${g.spots.filter((s) => s.fixedAt).map((s) => `<li class="fixed"><button class="lb-spot done" data-unfix="${s.id}" title="tap to reopen">${esc(s.text)}</button><span class="lb-dim">fixed ${fmtDate(s.fixedAt, { month: "short", day: "numeric" })}</span></li>`).join("")}
        </ul>
        <form class="lb-addspot" id="lb-addspot"><input class="lb-input" id="lb-spot-text" placeholder="+ spot — mm. 5–8 consistency" autocomplete="off"><button class="tap" type="submit">add</button></form>`}
        <div class="lb-stats">
          <span><b>${st.sessions}</b> session${st.sessions === 1 ? "" : "s"}</span>
          <span><b>≈${fmtMin(st.minutes)}</b></span>
          <span>last <b>${ago(st.daysSince)}</b></span>
          ${st.bestBpm ? `<span>best <b>${st.bestBpm}</b></span>` : ""}
        </div>
        ${!builtin ? `<div class="transport lb-goal-acts">
          ${g.status === "active" ? `<button class="start" id="lb-log-here">log</button><button class="tap" id="lb-finish">finish</button><button class="tap" id="lb-shelve">shelve</button>` : `<button class="start" id="lb-reactivate">make active</button>`}
          <button class="tap lb-danger" id="lb-delete">delete</button>
        </div>` : ""}
      </section>`;
    root.querySelector("#lb-back").addEventListener("click", () => nav("/goals"));
    if (!builtin) {
      const bind = (sel, key) => root.querySelector(sel).addEventListener("change", (e) => {
        try { logbook.updateGoal(id, { [key]: e.target.value }); toast(root, "saved"); } catch (err) { toast(root, err.message); e.target.value = g[key] ?? ""; }
      });
      bind("#lb-title", "title"); bind("#lb-target", "target"); bind("#lb-nextf", "next");
      root.querySelector("#lb-addspot").addEventListener("submit", (e) => {
        e.preventDefault();
        try { logbook.addSpot(id, root.querySelector("#lb-spot-text").value); render(); } catch (err) { toast(root, err.message); }
      });
      for (const b of root.querySelectorAll("[data-fix]")) b.addEventListener("click", () => { logbook.fixSpot(id, b.dataset.fix); render(); toast(root, "fixed"); });
      for (const b of root.querySelectorAll("[data-unfix]")) b.addEventListener("click", () => { logbook.unfixSpot(id, b.dataset.unfix); render(); });
      for (const b of root.querySelectorAll("[data-delspot]")) b.addEventListener("click", () => { logbook.deleteSpot(id, b.dataset.delspot); render(); });
      root.querySelector("#lb-log-here")?.addEventListener("click", () => nav(`/log?goal=${id}`));
      root.querySelector("#lb-finish")?.addEventListener("click", () => { logbook.finishGoal(id); render(); toast(root, "finished — nice."); });
      root.querySelector("#lb-shelve")?.addEventListener("click", () => { logbook.shelveGoal(id); render(); });
      root.querySelector("#lb-reactivate")?.addEventListener("click", () => { logbook.reactivateGoal(id); render(); });
      root.querySelector("#lb-delete").addEventListener("click", () => {
        if (confirm(`Delete “${g.title}” and its ${st.entries.length} entr${st.entries.length === 1 ? "y" : "ies"}? This can't be undone.`)) { logbook.deleteGoal(id); nav("/goals"); }
      });
    }
    void c;
  }

  // --- History ---------------------------------------------------------------
  function renderHistory() {
    const now = new Date();
    histMonth ??= { y: now.getFullYear(), m: now.getMonth() };
    const { y, m } = histMonth;
    const month = logbook.metrics.month(y, m);
    const streak = logbook.metrics.streak();
    const goalsAll = logbook.goals("all").filter((g) => logbook.metrics.goalStats(g.id).sessions > 0 || g.status === "active");
    const dayEntries = selectedDay ? logbook.entriesOn(selectedDay) : [];
    const maxMin = Math.max(30, ...month.cells.filter(Boolean).map((c) => c.minutes));

    root.innerHTML = `
      <section class="logbook">
        ${strip("history")}
        <div class="ss-head lb-month-head">
          <button class="tap lb-back" id="lb-prev" aria-label="previous month">&#9664;</button>
          <div class="lb-month-title">${MONTHS[m]} ${y}</div>
          <button class="tap lb-back" id="lb-next-m" aria-label="next month">&#9654;</button>
        </div>
        <div class="lb-cal" role="grid" aria-label="days practiced">
          ${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span class="lb-cal-h">${d}</span>`).join("")}
          ${month.cells.map((c) => c ? `<button class="lb-day ${c.practiced ? "on" : ""} ${c.gold ? "gold" : ""} ${c.key === selectedDay ? "sel" : ""} ${c.key === logbook.today() ? "today" : ""}"
              data-day="${c.key}" style="--sz:${c.practiced ? (0.45 + 0.55 * Math.min(1, c.minutes / maxMin)).toFixed(2) : 0}" aria-label="${c.key}${c.practiced ? `, ${c.minutes} minutes, ${c.entries} entries` : ""}"><i></i></button>` : `<span></span>`).join("")}
        </div>
        <div class="lb-totals"><b>${month.totals.days}</b> day${month.totals.days === 1 ? "" : "s"} · <b>${fmtMin(month.totals.minutes)}</b> · streak <b>${streak}</b></div>
        ${selectedDay ? `<div class="lb-sect">${fmtDate(new Date(selectedDay + "T12:00:00").getTime(), { weekday: "long", month: "long", day: "numeric" })} · ${fmtMin(logbook.minutesOn(selectedDay))}</div>
          ${dayEntries.length ? `<ul class="lb-entries">${dayEntries.map((e) => entryRow(e, logbook.goal(e.goalId))).join("")}</ul>` : `<p class="lb-empty lb-dim">no entries.</p>`}` : ""}
        <div class="lb-sect">goals</div>
        ${goalsAll.length ? goalsAll.map((g) => {
          const st = logbook.metrics.goalStats(g.id);
          const series = logbook.metrics.tempoSeries(g.id);
          return `<details class="lb-hgoal" data-id="${g.id}">
            <summary>
              <span class="lb-row-title">${esc(g.title)}${g.status !== "active" ? ` <span class="lb-dim">· ${g.status}</span>` : ""}</span>
              <span class="lb-row-sub">${st.sessions} session${st.sessions === 1 ? "" : "s"} · ≈${fmtMin(st.minutes)} · last ${ago(st.daysSince)}</span>
            </summary>
            ${series.length ? sparkline(series, { target: g.target }) : `<p class="lb-dim lb-center">no tempo logged yet${g.kind === "user" ? " — add one on the log sheet" : ""}.</p>`}
            ${series.length ? `<div class="lb-spark-cap"><span>${fmtDate(series[0].at, { month: "short", day: "numeric" })}</span><span>${series.length > 1 ? `${series[0].bpm} → <b>${series[series.length - 1].bpm}</b>` : `<b>${series[0].bpm}</b>`}${g.target && /^\d+$/.test(g.target) ? ` · target ${g.target}` : ""}</span></div>` : ""}
            ${g.spots.length ? `<div class="lb-spots">${g.spots.map((s) => `<span class="lb-spot ${s.fixedAt ? "done" : ""}">${esc(s.text)}${s.fixedAt ? ` <small>${fmtDate(s.fixedAt, { month: "short", day: "numeric" })}</small>` : ""}</span>`).join("")}</div>` : ""}
            ${st.entries.length ? `<ul class="lb-entries lb-entries-h">${st.entries.slice(0, 30).map((e) => `<li class="lb-entry"><span class="lb-entry-t">${fmtDate(e.at, { month: "short", day: "numeric" })}</span><span class="lb-entry-b">${e.auto ? esc(e.auto.label) : ""}${e.spotIds.length ? esc(e.spotIds.map((id) => g.spots.find((s) => s.id === id)?.text).filter(Boolean).join(", ")) : ""}${e.bpm != null ? ` ${tempoBtn(e.bpm)}` : ""}${e.note ? `<span class="lb-note">“${esc(e.note)}”</span>` : ""}</span></li>`).join("")}</ul>` : ""}
          </details>`;
        }).join("") : `<p class="lb-empty lb-dim">nothing logged yet.</p>`}
      </section>`;
    wireStrip();
    root.querySelector("#lb-prev").addEventListener("click", () => { histMonth = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }; selectedDay = null; render(); });
    root.querySelector("#lb-next-m").addEventListener("click", () => { histMonth = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }; selectedDay = null; render(); });
    for (const d of root.querySelectorAll(".lb-day")) d.addEventListener("click", () => { selectedDay = selectedDay === d.dataset.day ? null : d.dataset.day; render(); });
    wireEntryDeletes();
  }

  // --- boot ----------------------------------------------------------------
  root.classList.add("top-anchored");
  const onHash = () => { if (location.hash.startsWith("#/logbook")) render(); };
  window.addEventListener("hashchange", onHash);
  const off = logbook.on(() => { /* other tools may write (auto entries) while we're mounted */ if (!route().path.startsWith("log") && !route().path.startsWith("goals/")) render(); });
  render();

  return {
    destroy() {
      root.classList.remove("top-anchored");
      clearInterval(clockTimer);
      window.removeEventListener("hashchange", onHash);
      off();
    },
  };
}

export { NEGLECT_DAYS };
