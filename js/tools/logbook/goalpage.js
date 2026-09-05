// One goal: identity, stats, notes, practice list (docs/LOGBOOK_V2_DESIGN.md §3.3).
import { logbook, TYPES, TYPE_IDS, displayName } from "../../lib/logbook.js";
import { esc, fmtMin, ago, fmtDate, relDay, longPress, plural, openSheet } from "./util.js";
import { renderNotes } from "./notes.js";
import { sparkline } from "./sparkline.js";
import { haptic } from "./motion.js";
import { icon } from "../../lib/icons.js";
import { engage } from "./ceremony.js";
import { takeRow, wireTakeRows, mountCompare } from "./takes.js";
import { dayKey } from "../../lib/logbook.js";

const PAGE = 10;
/** How many day rows each goal page has been expanded to this session (WSHED-61). */
const shownDays = new Map();
const shownTakes = new Map();
let cleanup = null;

export function renderGoalPage(root, id, ctx) {
  const g = logbook.goal(id);
  if (!g) { ctx.nav("/goals"); return; }
  const st = logbook.metrics.goalStats(id);
  const series = logbook.metrics.tempoSeries(id);
  const t = TYPES[g.type] ?? TYPES.other;
  const builtin = g.kind === "builtin";
  const run = logbook.running();
  const isRunning = run?.goal?.id === id;

  // every segment grouped by day, newest first; the page shows PAGE days at a time
  const byDay = new Map();
  for (const s of st.segments) {
    const k = relDay(s.startedAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  const days = [...byDay];
  const shown = Math.min(days.length, shownDays.get(id) ?? PAGE);
  const left = days.length - shown;
  const nextPage = Math.min(PAGE, left);
  // takes (WSHED-75): grouped by day, starred first within a day, PAGE at a time
  const takesAll = logbook.takes({ goalId: id }).sort((a, b) => (dayKey(b.recordedAt) > dayKey(a.recordedAt) ? 1 : dayKey(b.recordedAt) < dayKey(a.recordedAt) ? -1 : (Number(b.starred) - Number(a.starred)) || (b.recordedAt - a.recordedAt)));
  const tShown = Math.min(takesAll.length, shownTakes.get(id) ?? PAGE);
  const takeDays = logbook.takeDays(id);
  const takeGroups = [];
  for (const tk of takesAll.slice(0, tShown)) { const k = relDay(tk.recordedAt); const last = takeGroups[takeGroups.length - 1]; if (last && last.day === k) last.takes.push(tk); else takeGroups.push({ day: k, takes: [tk] }); }
  if (cleanup) { cleanup(); cleanup = null; }

  root.innerHTML = `
    <section class="logbook lb-goalpage">
      <div class="ss-head lb-gp-head">
        <button class="icon-btn lb-back" id="lb-back" aria-label="back to goals">${icon("back")}</button>
        <div class="ss-head-title">${isRunning ? "practicing now" : g.status}</div>
        <button class="lb-gp-type ${t.cls}" id="lb-gp-type" ${builtin ? "disabled" : ""} aria-label="type: ${t.label}${builtin ? "" : " — tap to change"}"><i class="lb-type ${t.cls}" aria-hidden="true">${t.glyph}</i>${t.label}</button>
      </div>
      ${builtin
        ? `<h2 class="lb-gp-name-static">${esc(g.name)}</h2><p class="lb-dim lb-center lb-gp-builtin">${id === "sightsinging" ? "written automatically by the sight-singing books when nothing else is running." : id === "eartraining" ? "written automatically by ear-training drills when nothing else is running." : "carried over from the first Logbook: daily minutes before time belonged to a goal."}</p>`
        : `<input class="lb-gp-name" id="lb-gp-name" value="${esc(g.name)}" aria-label="goal name" maxlength="120" autocomplete="off">
           ${g.type === "piece" ? `<input class="lb-gp-composer" id="lb-gp-composer" value="${esc(g.composer ?? "")}" placeholder="composer" aria-label="composer" maxlength="80" autocomplete="off" autocapitalize="words">` : ""}`}
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
      ${takesAll.length ? `<div class="lb-sect" id="lb-gp-takes-h">takes<span class="lb-sect-sub">${takesAll.length}</span></div>
      <div id="lb-gp-cmp"></div>
      <ul class="lb-takes lb-gp-takes" id="lb-gp-takes">${takeGroups.map((gr) => `<li class="lb-takeday"><div class="lb-takeday-h">${esc(gr.day)}</div><ul class="lb-takes">${gr.takes.map((tk) => takeRow(tk)).join("")}</ul></li>`).join("")}</ul>
      ${takesAll.length > tShown ? `<div class="lb-foot"><button class="lb-link" id="lb-gp-more-takes">show ${Math.min(PAGE, takesAll.length - tShown)} more takes</button></div>` : ""}` : ""}
      <div class="lb-sect">practice${days.length > PAGE ? `<span class="lb-sect-sub">${shown} of ${days.length} days</span>` : ""}</div>
      ${days.length ? `<ul class="lb-seglist">${days.slice(0, shown).map(([day, segs]) => `
        <li class="lb-segday"><span class="lb-segday-h">${esc(day)}${takeDays.has(dayKey(segs[0].startedAt)) ? `<a class="lb-take-chip" href="#lb-gp-takes-h" title="this day has takes"><i></i></a>` : ""}</span>
          <span class="lb-segs">${segs.map((s) => `<button class="lb-seg ${s.endedAt === null ? "live" : ""}" data-seg="${s.id}" title="${fmtDate(s.startedAt, { hour: "numeric", minute: "2-digit" })}${s.auto ? ` · ${esc(s.auto.label)}${(s.auto.runs?.length ?? 0) > 1 ? "&#10;" + s.auto.runs.map((r) => `${fmtDate(r.startedAt, { hour: "numeric", minute: "2-digit" })} · ${esc(r.label)}`).join("&#10;") : ""}` : ""}${s.endedAt === null ? "" : " · hold to delete"}">${s.endedAt === null ? "now" : fmtMin(Math.round((s.endedAt - s.startedAt) / 60000))}${s.bpm ? ` <small>♩${s.bpm}</small>` : ""}${s.auto ? ` <span class="lb-auto">auto${s.auto.n > 1 ? ` ×${s.auto.n}` : ""}</span>` : ""}</button>`).join("")}</span>
        </li>`).join("")}</ul>
        ${left ? `<div class="lb-foot"><button class="lb-link" id="lb-gp-more">show ${nextPage} more${left > nextPage ? ` · ${left - nextPage} left` : ""}</button></div>` : ""}` : `<p class="lb-empty lb-dim">no practice yet.</p>`}
      ${builtin ? "" : `<div class="lb-foot"><button class="lb-link lb-danger" id="lb-gp-delete">delete goal</button></div>`}
    </section>`;

  root.querySelector("#lb-back").addEventListener("click", () => ctx.nav("/goals"));
  root.querySelector("#lb-gp-more")?.addEventListener("click", () => { shownDays.set(id, shown + PAGE); renderGoalPage(root, id, ctx); });
  root.querySelector("#lb-gp-more-takes")?.addEventListener("click", () => { shownTakes.set(id, tShown + PAGE); renderGoalPage(root, id, ctx); });
  const takesEl = root.querySelector("#lb-gp-takes");
  if (takesEl) {
    cleanup = wireTakeRows(takesEl, { onChange: () => renderGoalPage(root, id, ctx) });
    mountCompare({ head: root.querySelector("#lb-gp-takes-h"), barEl: root.querySelector("#lb-gp-cmp"), listEl: takesEl });
    for (const a of root.querySelectorAll(".lb-take-chip")) a.addEventListener("click", (e) => { e.preventDefault(); root.querySelector("#lb-gp-takes-h")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  }
  root.querySelector("#lb-gp-today")?.addEventListener("click", () => ctx.nav(""));
  const startClock = () => {
    logbook.start(id); ctx.nav("");
    engage({ goal: g, type: t, landOn: () => document.querySelector("#lb-hero-goal") });
  };
  // The lesson goals (sight singing, ear training) are usually practiced in
  // the app, where a finished run credits itself — so ask first (WSHED-81).
  const LESSON = { sightsinging: { title: "sight singing", open: "open the sight-singing books", hash: "#/sightsinging" }, eartraining: { title: "ear training", open: "open the ear trainer", hash: "#/eartraining" } };
  root.querySelector("#lb-gp-practice")?.addEventListener("click", () => {
    const lesson = LESSON[id];
    if (!lesson) { startClock(); return; }
    const { body, close } = openSheet({
      title: `practicing ${lesson.title}?`,
      cls: "lb-acct-wrap lb-lesson-wrap",
      html: `
        <ul class="lb-acct-list">
          <li><button type="button" class="lb-acct-row" id="lb-lesson-open">${icon("play")}<span><b>${esc(lesson.open)}</b><small>set up a drill there — a finished run lands here by itself</small></span></button></li>
          <li><button type="button" class="lb-acct-row" id="lb-lesson-clock">${icon("log")}<span><b>just start the clock</b><small>practicing ${esc(lesson.title)} away from the app</small></span></button></li>
        </ul>`,
    });
    body.querySelector("#lb-lesson-open").addEventListener("click", () => { close(); location.hash = lesson.hash; });
    body.querySelector("#lb-lesson-clock").addEventListener("click", () => { close(); startClock(); });
  });
  if (!builtin) {
    const name = root.querySelector("#lb-gp-name");
    name.addEventListener("change", () => {
      try { logbook.renameGoal(id, name.value); ctx.toast("renamed"); } catch (err) { ctx.toast(err.message); name.value = g.name; }
    });
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); name.blur(); } });
    const composer = root.querySelector("#lb-gp-composer");
    composer?.addEventListener("change", () => {
      logbook.setComposer(id, composer.value);
      ctx.toast(composer.value.trim() ? "composer saved" : "composer cleared");
    });
    composer?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); composer.blur(); } });
    root.querySelector("#lb-gp-type").addEventListener("click", () => {
      const next = TYPE_IDS[(TYPE_IDS.indexOf(g.type) + 1) % TYPE_IDS.length];
      logbook.retypeGoal(id, next); ctx.toast(`${TYPES[next].glyph} ${TYPES[next].label}`); renderGoalPage(root, id, ctx);
    });
    root.querySelector("#lb-gp-finish")?.addEventListener("click", () => { logbook.finishGoal(id); ctx.toast("finished — nice."); renderGoalPage(root, id, ctx); });
    root.querySelector("#lb-gp-shelve")?.addEventListener("click", () => { logbook.shelveGoal(id); renderGoalPage(root, id, ctx); });
    root.querySelector("#lb-gp-reactivate")?.addEventListener("click", () => { logbook.reactivateGoal(id); renderGoalPage(root, id, ctx); });
    root.querySelector("#lb-gp-delete").addEventListener("click", () => {
      const n = logbook.notes(id).length, tk = takesAll.length;
      if (confirm(`Delete “${displayName(g)}” with ${plural(st.segments.length, "practice segment")}, ${plural(n, "note")}${tk ? ` and ${plural(tk, "take")}` : ""}? This can't be undone.`)) { logbook.deleteGoal(id); ctx.nav("/goals"); }
    });
  }
  for (const b of root.querySelectorAll(".lb-seg:not(.live)")) longPress(b, null, () => {
    if (confirm(`Delete this ${b.textContent.trim()} segment?`)) { logbook.deleteSegment(b.dataset.seg); renderGoalPage(root, id, ctx); ctx.toast("segment deleted"); }
  });
  renderNotes(root.querySelector("#lb-gp-notes"), id);
}
