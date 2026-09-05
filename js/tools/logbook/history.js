// History — calendar, a day's report, this month by goal (docs/LOGBOOK_V2_DESIGN.md §3.4).
import { logbook, TYPES, BANDS, displayName } from "../../lib/logbook.js";
import { esc, fmtMin, fmtDate, openSheet } from "./util.js";
import { icon } from "../../lib/icons.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function renderHistory(root, ctx, state) {
  const now = new Date();
  state.month ??= { y: now.getFullYear(), m: now.getMonth() };
  const { y, m } = state.month;
  const month = logbook.metrics.month(y, m);
  const streak = logbook.metrics.streak();
  const byGoal = logbook.metrics.monthByGoal(y, m);
  const top = byGoal[0]?.ms || 1;
  const bandLabel = Object.fromEntries(BANDS.map((b) => [b.key, b.label]));
  const sel = state.selectedDay ? logbook.dayReport(state.selectedDay) : null;

  root.innerHTML = `
    <section class="logbook lb-history">
      <div class="ss-head lb-month-head">
        <button class="icon-btn lb-back" id="lb-prev" aria-label="previous month">${icon("back")}</button>
        <div class="lb-month-title">${MONTHS[m]} ${y}</div>
        <button class="icon-btn lb-back" id="lb-next-m" aria-label="next month">${icon("next")}</button>
      </div>
      <div class="lb-cal-wrap">
        <div class="lb-cal" role="grid" aria-label="days practiced">
          ${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span class="lb-cal-h">${d}</span>`).join("")}
          ${month.cells.map((c) => c ? `<button class="lb-day ${c.practiced ? `on b-${c.band}` : ""} ${c.best ? "best" : ""} ${c.key === state.selectedDay ? "sel" : ""} ${c.today ? "today" : ""}"
              data-day="${c.key}"
              aria-label="${c.key}${c.practiced ? `, ${c.minutes} minutes — ${bandLabel[c.band]}, ${c.goals} goal${c.goals === 1 ? "" : "s"}` : ""}${c.best ? ", new best tempo" : ""}"><i></i></button>` : `<span></span>`).join("")}
        </div>
        <div class="lb-totals"><b>${month.totals.days}</b> day${month.totals.days === 1 ? "" : "s"} · <b>${fmtMin(month.totals.minutes)}</b> · streak <b>${streak}</b></div>
        <button class="lb-cal-info" id="lb-cal-info" aria-label="how days are colored" title="how days are colored">${icon("info")}</button>
      </div>
      ${sel ? `
        <div class="lb-sect">${fmtDate(new Date(sel.key + "T12:00:00").getTime(), { weekday: "long", month: "long", day: "numeric" })} · ${fmtMin(sel.minutes)}</div>
        ${sel.goals.length ? `<ul class="lb-today-list">${sel.goals.map((r) => ctx.goalRow(r)).join("")}</ul>` : `<p class="lb-empty lb-dim">nothing practiced.</p>`}` : ""}
      <div class="lb-sect">this month by goal</div>
      ${byGoal.length ? `<ul class="lb-bars">${byGoal.map((r) => {
        const t = TYPES[r.goal.type] ?? TYPES.other;
        return `<li class="lb-bar"><button class="lb-bar-name" data-open="${r.goal.id}"><i class="lb-type ${t.cls}" aria-hidden="true">${t.glyph}</i>${esc(displayName(r.goal))}</button>
          <span class="lb-bar-track"><span class="lb-bar-fill ${t.cls}" style="width:${Math.max(2, Math.round(100 * r.ms / top))}%"></span></span>
          <span class="lb-bar-min">${fmtMin(r.minutes)}</span></li>`;
      }).join("")}</ul>` : `<p class="lb-empty lb-dim">nothing practiced this month.</p>`}
      <div class="lb-foot lb-anx-cta"><button type="button" class="tap" id="lb-anx-open">${icon("chart")}detailed analytics</button></div>
    </section>`;

  root.querySelector("#lb-prev").addEventListener("click", () => { state.month = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }; state.selectedDay = null; renderHistory(root, ctx, state); });
  root.querySelector("#lb-next-m").addEventListener("click", () => { state.month = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }; state.selectedDay = null; renderHistory(root, ctx, state); });
  root.querySelector("#lb-cal-info").addEventListener("click", openLegend);
  root.querySelector("#lb-anx-open").addEventListener("click", () => ctx.nav("/history/analytics"));
  for (const d of root.querySelectorAll(".lb-day")) d.addEventListener("click", () => { state.selectedDay = state.selectedDay === d.dataset.day ? null : d.dataset.day; renderHistory(root, ctx, state); });
  for (const b of root.querySelectorAll("[data-open]")) b.addEventListener("click", () => ctx.nav(`/goals/${b.dataset.open}`));
  ctx.wireGoalRows(root);
}

/** The colour key, on demand (WSHED-59) — nothing to cram under the grid. */
function openLegend() {
  return openSheet({
    title: "how days are colored",
    cls: "lb-legend-wrap",
    html: `
      <p class="lb-acct-copy">Each day is colored by how long you practiced — never by whether it beat the day before.</p>
      <ul class="lb-legend">
        ${BANDS.map((b) => `<li><span class="lb-band-cell"><i class="lb-band b-${b.key}"></i></span><span><b>${b.label}</b><br>${b.note}</span></li>`).join("")}
        <li><span class="lb-band-cell best"><i class="lb-band b-good"></i></span><span><b>brass corner</b><br>a new best tempo on a piece that day.</span></li>
      </ul>
      <p class="lb-acct-fine">The bands follow the practice and injury research: focused practice tops out around four hours a day, and the risk of overuse rises past that. Dot size follows the band, not the clock.</p>`,
  }).closed;
}
