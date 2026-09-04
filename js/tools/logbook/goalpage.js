// One goal: identity, stats, notes, practice list (docs/LOGBOOK_V2_DESIGN.md §3.3).
import { logbook, TYPES, TYPE_IDS } from "../../lib/logbook.js";
import { esc, fmtMin, ago, fmtDate, relDay, longPress, plural } from "./util.js";
import { renderNotes } from "./notes.js";
import { sparkline } from "./sparkline.js";
import { haptic } from "./motion.js";
import { icon } from "../../lib/icons.js";
import { engage } from "./ceremony.js";

export function renderGoalPage(root, id, ctx) {
  const g = logbook.goal(id);
  if (!g) { ctx.nav("/goals"); return; }
  const st = logbook.metrics.goalStats(id);
  const series = logbook.metrics.tempoSeries(id);
  const t = TYPES[g.type] ?? TYPES.other;
  const builtin = g.kind === "builtin";
  const run = logbook.running();
  const isRunning = run?.goal?.id === id;

  // segments grouped by day, newest first, last 30
  const byDay = new Map();
  for (const s of st.segments.slice(0, 30)) {
    const k = relDay(s.startedAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }

  root.innerHTML = `
    <section class="logbook lb-goalpage">
      <div class="ss-head lb-gp-head">
        <button class="icon-btn lb-back" id="lb-back" aria-label="back to goals">${icon("back")}</button>
        <div class="ss-head-title">${isRunning ? "practicing now" : g.status}</div>
        <button class="lb-gp-type ${t.cls}" id="lb-gp-type" ${builtin ? "disabled" : ""} aria-label="type: ${t.label}${builtin ? "" : " — tap to change"}"><i class="lb-type ${t.cls}" aria-hidden="true">${t.glyph}</i>${t.label}</button>
      </div>
      ${builtin
        ? `<h2 class="lb-gp-name-static">${esc(g.name)}</h2><p class="lb-dim lb-center lb-gp-builtin">${id === "sightsinging" ? "written automatically by the sight-singing books when nothing else is running." : "carried over from the first Logbook: daily minutes before time belonged to a goal."}</p>`
        : `<input class="lb-gp-name" id="lb-gp-name" value="${esc(g.name)}" aria-label="goal name" maxlength="120" autocomplete="off">`}
      <div class="lb-stats">
        <span><b>${fmtMin(st.minutes)}</b> lifetime</span>
        <span><b>${st.days}</b> ${st.days === 1 ? "day" : "days"}</span>
        ${st.days ? `<span>avg <b>${fmtMin(st.avgSessionMin)}</b></span>` : ""}
        <span>last <b>${ago(st.daysSince)}</b></span>
        ${st.bestBpm ? `<span>♩ best <b>${st.bestBpm}</b></span>` : ""}
      </div>
      ${series.length ? `${sparkline(series)}<div class="lb-spark-cap"><span>${fmtDate(series[0].at, { month: "short", day: "numeric" })}</span><span>${series.length > 1 ? `${series[0].bpm} → <b>${series[series.length - 1].bpm}</b>` : `<b>${series[0].bpm}</b>`} · <a class="lb-tempo" href="#/metronome?bpm=${st.lastBpm}">♩ ${st.lastBpm}</a></span></div>` : ""}
      <div class="transport lb-gp-acts">
        ${isRunning ? `<button class="start" id="lb-gp-today" aria-label="back to today">&#9632; running · today</button>`
          : `<button class="start" id="lb-gp-practice">&#9654; practice this</button>`}
        ${builtin ? "" : g.status === "active"
          ? `<button class="tap" id="lb-gp-finish">finish</button><button class="tap" id="lb-gp-shelve">shelve</button>`
          : `<button class="tap" id="lb-gp-reactivate">make active</button>`}
      </div>
      <div class="lb-sect">notes</div>
      <div id="lb-gp-notes"></div>
      <div class="lb-sect">practice</div>
      ${byDay.size ? `<ul class="lb-seglist">${[...byDay].map(([day, segs]) => `
        <li class="lb-segday"><span class="lb-segday-h">${esc(day)}</span>
          <span class="lb-segs">${segs.map((s) => `<button class="lb-seg ${s.endedAt === null ? "live" : ""}" data-seg="${s.id}" title="${fmtDate(s.startedAt, { hour: "numeric", minute: "2-digit" })}${s.auto ? ` · ${esc(s.auto.label)}` : ""}${s.endedAt === null ? "" : " · hold to delete"}">${s.endedAt === null ? "now" : fmtMin(Math.round((s.endedAt - s.startedAt) / 60000))}${s.bpm ? ` <small>♩${s.bpm}</small>` : ""}${s.auto ? ` <span class="lb-auto">auto</span>` : ""}</button>`).join("")}</span>
        </li>`).join("")}</ul>` : `<p class="lb-empty lb-dim">no practice yet.</p>`}
      ${builtin ? "" : `<div class="lb-foot"><button class="lb-link lb-danger" id="lb-gp-delete">delete goal</button></div>`}
    </section>`;

  root.querySelector("#lb-back").addEventListener("click", () => ctx.nav("/goals"));
  root.querySelector("#lb-gp-today")?.addEventListener("click", () => ctx.nav(""));
  root.querySelector("#lb-gp-practice")?.addEventListener("click", () => {
    logbook.start(id); ctx.nav("");
    engage({ goal: g, type: t, landOn: () => document.querySelector("#lb-hero-goal") });
  });
  if (!builtin) {
    const name = root.querySelector("#lb-gp-name");
    name.addEventListener("change", () => {
      try { logbook.renameGoal(id, name.value); ctx.toast("renamed"); } catch (err) { ctx.toast(err.message); name.value = g.name; }
    });
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); name.blur(); } });
    root.querySelector("#lb-gp-type").addEventListener("click", () => {
      const next = TYPE_IDS[(TYPE_IDS.indexOf(g.type) + 1) % TYPE_IDS.length];
      logbook.retypeGoal(id, next); ctx.toast(`${TYPES[next].glyph} ${TYPES[next].label}`); renderGoalPage(root, id, ctx);
    });
    root.querySelector("#lb-gp-finish")?.addEventListener("click", () => { logbook.finishGoal(id); ctx.toast("finished — nice."); renderGoalPage(root, id, ctx); });
    root.querySelector("#lb-gp-shelve")?.addEventListener("click", () => { logbook.shelveGoal(id); renderGoalPage(root, id, ctx); });
    root.querySelector("#lb-gp-reactivate")?.addEventListener("click", () => { logbook.reactivateGoal(id); renderGoalPage(root, id, ctx); });
    root.querySelector("#lb-gp-delete").addEventListener("click", () => {
      const n = logbook.notes(id).length;
      if (confirm(`Delete “${g.name}” with ${plural(st.segments.length, "practice segment")} and ${plural(n, "note")}? This can't be undone.`)) { logbook.deleteGoal(id); ctx.nav("/goals"); }
    });
  }
  for (const b of root.querySelectorAll(".lb-seg:not(.live)")) longPress(b, null, () => {
    if (confirm(`Delete this ${b.textContent.trim()} segment?`)) { logbook.deleteSegment(b.dataset.seg); renderGoalPage(root, id, ctx); ctx.toast("segment deleted"); }
  });
  renderNotes(root.querySelector("#lb-gp-notes"), id);
}
