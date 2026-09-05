// Analytics — how you spend your practice time over any range
// (WSHED-63, docs/LOGBOOK_V2_DESIGN.md §3.5). Route: #/logbook/history/analytics.
import { logbook, dayKey, addDays } from "../../lib/logbook.js";
import { RANGES, resolveRange, analyze, focusLabel } from "../../lib/analytics.js";
import { makeStore } from "../../lib/store.js";
import { esc, fmtMin, fmtDate } from "./util.js";
import { icon } from "../../lib/icons.js";
import { columns, donut, legend, hbars, stack, pct, PALETTE } from "./charts.js";

const prefs = makeStore("logbook");
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => (h % 6 === 0 ? (h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`) : null));

export function renderAnalytics(root, ctx, state) {
  const saved = prefs.get("analytics", { range: { key: "30d" } });
  state.range ??= RANGES.some((r) => r.key === saved.range?.key) ? saved.range : { key: "30d" };
  state.focus ??= null;
  const doc = logbook.doc;
  const now = Date.now();
  const range = resolveRange(state.range, doc, now);
  const a = analyze(doc, { ...range, now, focus: state.focus });
  const empty = a.totalMs === 0;
  const focusGoal = state.focus?.kind === "goal" ? logbook.goal(state.focus.value) : null;
  const custom = state.range.key === "custom";
  const todayKey = dayKey(now);
  const spanLabel = `${fmtDate(range.from, { month: "short", day: "numeric", year: range.fromKey.slice(0, 4) !== range.toKey.slice(0, 4) ? "numeric" : undefined })} – ${fmtDate(range.to - 1, { month: "short", day: "numeric" })}`;
  const before = `the ${a.range.days} days before`;
  const deltaHtml = a.delta === null ? `<small>nothing logged in ${before}</small>`
    : Math.abs(a.delta) > 3 ? `<small class="lb-anx-delta ${a.delta >= 0 ? "up" : "down"}">${a.delta >= 0 ? "▲ up from" : "▼ down from"} ${fmtMin(a.prevMinutes)} in ${before}</small>`
    : `<small class="lb-anx-delta ${a.delta >= 0 ? "up" : "down"}">${a.delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(a.delta * 100))}% vs ${before}</small>`;
  const works = state.showAllWorks ? a.byGoal : a.byGoal.slice(0, 10);
  const composers = a.byComposer.map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] }));
  const bestHour = a.hours.reduce((m, h) => (h.ms > m.ms ? h : m), a.hours[0]);
  // chart widths in css px so SVG text stays legible from a phone to a desktop
  const full = Math.max(280, Math.min(root.clientWidth || 360, 52 * 16));
  const half = full >= 52 * 16 ? Math.floor((full - 16) / 2) : full;
  const bestDay = a.weekdays.reduce((m, d) => (d.ms > m.ms ? d : m), a.weekdays[0]);

  root.innerHTML = `
    <section class="logbook lb-analytics">
      <div class="ss-head lb-anx-head">
        <button class="icon-btn lb-back" id="lb-back" aria-label="back to history">${icon("back")}</button>
        <div class="lb-month-title">analytics</div>
        <span></span>
      </div>
      <div class="lb-chips lb-anx-range" role="radiogroup" aria-label="range">
        ${RANGES.map((r) => `<button type="button" class="lb-chip ${state.range.key === r.key ? "on" : ""}" role="radio" aria-checked="${state.range.key === r.key}" data-range="${r.key}">${r.label}</button>`).join("")}
      </div>
      ${custom ? `<div class="lb-anx-custom"><input type="date" id="lb-anx-from" value="${esc(state.range.from ?? addDays(todayKey, -29))}" max="${todayKey}" aria-label="from"><span>to</span><input type="date" id="lb-anx-to" value="${esc(state.range.to ?? todayKey)}" max="${todayKey}" aria-label="to"></div>` : ""}
      <p class="lb-anx-span lb-dim">${esc(spanLabel)} · ${a.range.days} day${a.range.days === 1 ? "" : "s"}</p>
      ${state.focus ? `<div class="lb-anx-focus"><span class="lb-chip on">${esc(focusLabel(state.focus, doc))}<button type="button" class="lb-anx-x" id="lb-anx-unfocus" aria-label="clear focus">×</button></span>${focusGoal ? `<button type="button" class="lb-link" id="lb-anx-open-goal">open goal ›</button>` : ""}</div>` : ""}

      ${empty ? `<p class="lb-anx-empty lb-dim">nothing practiced in this range${state.focus ? " on this focus" : ""}.${a.prevMs ? ` the ${a.range.days} days before held ${fmtMin(a.prevMinutes)}.` : ""}</p>` : `
      <div class="lb-anx-stats">
        <div class="lb-anx-stat wide"><b>${fmtMin(a.totalMinutes)}</b><span>total</span>${deltaHtml}</div>
        <div class="lb-anx-stat"><b>${a.daysPracticed}<small>/${a.range.daysElapsed}</small></b><span>days practiced</span><small>${pct(a.daysPracticed / a.range.daysElapsed)} of days</small></div>
        <div class="lb-anx-stat"><b>${fmtMin(a.avgPerPracticedDayMin)}</b><span>per practiced day</span></div>
        <div class="lb-anx-stat"><b>${a.sessions}</b><span>sessions</span><small>avg ${fmtMin(a.avgSessionMin)} · median ${fmtMin(a.medianSessionMin)}</small></div>
        <div class="lb-anx-stat"><b>${a.longestStreak}</b><span>longest streak</span><small>day${a.longestStreak === 1 ? "" : "s"} in a row</small></div>
      </div>

      <div class="lb-anx-grid">
        <div class="lb-anx-card wide lb-anx-time">
          <div class="lb-sect">time per ${a.series.unit}</div>
          ${columns(a.series.points, { width: full, titleOf: (p) => `${p.label} — ${fmtMin(p.minutes)}` })}
          <p class="lb-anx-cap" id="lb-anx-cap">${a.series.unit === "day" ? "bars carry the day's band color — tap one to read it" : `tap a ${a.series.unit} to read it`}</p>
        </div>

        <div class="lb-anx-card lb-anx-types">
          <div class="lb-sect">by type</div>
          <div class="lb-anx-donut-wrap">${donut(a.byType, a.totalMs)}${legend(a.byType, "type")}</div>
        </div>

        <div class="lb-anx-card lb-anx-composers">
          <div class="lb-sect">by composer</div>
          ${composers.length ? hbars(composers, "composer") : `<p class="lb-empty lb-dim">no pieces in this range.</p>`}
          ${composers.length ? `<p class="lb-anx-cap">share of time on pieces</p>` : ""}
        </div>

        <div class="lb-anx-card wide lb-anx-works">
          <div class="lb-sect">by work${a.byGoal.length > 10 ? `<span class="lb-sect-sub">${works.length} of ${a.byGoal.length}</span>` : ""}</div>
          ${hbars(works, "goal")}
          ${a.byGoal.length > 10 ? `<div class="lb-foot"><button type="button" class="lb-link" id="lb-anx-all-works">${state.showAllWorks ? "show top 10" : `show all ${a.byGoal.length}`}</button></div>` : ""}
        </div>

        <div class="lb-anx-card lb-anx-hours">
          <div class="lb-sect">time of day</div>
          ${columns(a.hours.map((h) => ({ label: hourLabel(h.hour), minutes: h.minutes, ms: h.ms })), { width: half, labels: HOUR_LABELS, titleOf: (p) => `${p.label} — ${fmtMin(p.minutes)}` })}
          <p class="lb-anx-cap">${bestHour.ms ? `most often around ${hourLabel(bestHour.hour)}` : ""}</p>
        </div>

        <div class="lb-anx-card lb-anx-weekdays">
          <div class="lb-sect">day of the week</div>
          ${columns(a.weekdays.map((d) => ({ label: d.day, minutes: d.minutes, ms: d.ms })), { width: half, labelEvery: 1, titleOf: (p) => `${p.label} — ${fmtMin(p.minutes)}` })}
          <p class="lb-anx-cap">${bestDay.ms ? `${DAY_NAMES[bestDay.day]} carry the most` : ""}</p>
        </div>

        <div class="lb-anx-card lb-anx-sessions">
          <div class="lb-sect">session length</div>
          ${columns(a.sessionBuckets.map((b) => ({ label: b.label, minutes: b.count, ms: b.ms })), { width: half, labelEvery: 1, maxLabel: (v) => `${v} session${v === 1 ? "" : "s"}`, titleOf: (p) => `${p.label} — ${p.minutes} session${p.minutes === 1 ? "" : "s"}` })}
          <p class="lb-anx-cap">${a.sessions} session${a.sessions === 1 ? "" : "s"} · a session is one stretch on one goal</p>
        </div>

        <div class="lb-anx-card lb-anx-bands">
          <div class="lb-sect">days by band</div>
          ${stack(a.bands, a.daysPracticed)}
        </div>
      </div>`}
    </section>`;

  // --- wiring -----------------------------------------------------------------
  live = { root, ctx, state, t: 0 };
  const rerender = () => renderAnalytics(root, ctx, state);
  const saveRange = () => prefs.set("analytics", { range: state.range });
  root.querySelector("#lb-back").addEventListener("click", () => ctx.nav("/history"));
  for (const b of root.querySelectorAll(".lb-anx-range .lb-chip")) b.addEventListener("click", () => {
    const key = b.dataset.range;
    state.range = key === "custom" ? { key, from: state.range.from ?? range.fromKey, to: state.range.to ?? range.toKey } : { key };
    saveRange(); rerender();
  });
  for (const id of ["from", "to"]) root.querySelector(`#lb-anx-${id}`)?.addEventListener("change", (e) => {
    if (!e.target.value) return;
    state.range = { ...state.range, [id]: e.target.value }; saveRange(); rerender();
  });
  root.querySelector("#lb-anx-unfocus")?.addEventListener("click", () => { state.focus = null; rerender(); });
  root.querySelector("#lb-anx-open-goal")?.addEventListener("click", () => ctx.nav(`/goals/${focusGoal.id}`));
  root.querySelector("#lb-anx-all-works")?.addEventListener("click", () => { state.showAllWorks = !state.showAllWorks; rerender(); });
  for (const b of root.querySelectorAll("[data-focus-kind]")) b.addEventListener("click", () => {
    const next = { kind: b.dataset.focusKind, value: b.dataset.focus };
    state.focus = state.focus && state.focus.kind === next.kind && state.focus.value === next.value ? null : next;
    state.showAllWorks = false;
    rerender();
  });
  // tap a time bar → caption reads it
  const cap = root.querySelector("#lb-anx-cap");
  const timeCols = root.querySelectorAll(".lb-anx-time .lb-anx-col");
  for (const g of timeCols) g.addEventListener("click", () => {
    for (const x of timeCols) x.classList.toggle("on", x === g);
    const p = a.series.points[Number(g.dataset.i)];
    cap.textContent = `${p.label} — ${fmtMin(p.minutes)}${p.band ? ` · ${bandWord(p.band)}` : ""}${p.days > 1 ? ` over ${p.days} days` : ""}`;
  });
}

const DAY_NAMES = { Mon: "Mondays", Tue: "Tuesdays", Wed: "Wednesdays", Thu: "Thursdays", Fri: "Fridays", Sat: "Saturdays", Sun: "Sundays" };
// one listener for the life of the app: a resize (rotation, window drag) redraws the charts at the new width
let live = null;
window.addEventListener("resize", () => { if (live && live.root.isConnected && live.root.querySelector(".lb-analytics")) { clearTimeout(live.t); live.t = setTimeout(() => renderAnalytics(live.root, live.ctx, live.state), 150); } });
const hourLabel = (h) => (h === 0 ? "12 am" : h === 12 ? "12 pm" : h < 12 ? `${h} am` : `${h - 12} pm`);
const bandWord = (k) => ({ touched: "touched", okay: "okay", good: "good", sweet: "sweet spot", much: "diminishing", over: "too much" }[k] ?? k);
