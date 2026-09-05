// Goals tab — the practice library (docs/LOGBOOK_V2_DESIGN.md §3.2).
import { logbook, TYPES, TYPE_IDS, SORTS, displayName } from "../../lib/logbook.js";
import { makeStore } from "../../lib/store.js";
import { esc, fmtMin, ago, plural } from "./util.js";
import { stamp } from "./motion.js";

const prefs = makeStore("logbook");
const SORT_LABELS = { recent: "recent", name: "name", created: "newest", time: "most practiced", week: "this week", month: "this month" };

export function renderLibrary(root, ctx, state) {
  const saved = prefs.get("library", { type: null, sort: "recent" });
  state.type ??= saved.type;
  state.sort ??= SORTS.includes(saved.sort) ? saved.sort : "recent";
  state.q ??= "";
  const q = state.q;
  const opts = { type: state.type, q, sort: state.sort };
  const active = logbook.goals({ status: "active", ...opts });
  const finished = logbook.goals({ status: "finished", ...opts });
  const shelved = logbook.goals({ status: "shelved", ...opts });
  const total = logbook.goals({ status: "all" }).length;

  const row = (g) => {
    const st = logbook.metrics.goalStats(g.id);
    const t = TYPES[g.type] ?? TYPES.other;
    const sub = g.status === "finished"
      ? `finished ${ago(g.finishedAt ? Math.round((Date.now() - g.finishedAt) / 86400000) : null)} · ${fmtMin(st.minutes)}`
      : g.status === "shelved" ? `shelved · ${fmtMin(st.minutes)}`
      : st.minutes ? `${fmtMin(st.minutes)} · ${ago(st.daysSince)}` : "not practiced yet";
    return `<li class="lb-row" data-id="${g.id}">
      <button class="lb-row-main" data-open="${g.id}">
        <i class="lb-type ${t.cls}" aria-hidden="true">${t.glyph}</i>
        <span class="lb-row-text"><span class="lb-row-title">${esc(displayName(g))}</span><span class="lb-row-sub">${sub}</span></span>
      </button>
    </li>`;
  };

  root.innerHTML = `
    <section class="logbook lb-library">
      <div class="lb-libhead">
        <input class="lb-input lb-search" id="lb-lib-q" type="search" placeholder="search goals…" value="${esc(q)}" autocomplete="off" aria-label="search goals">
        <button class="lb-addgoal" id="lb-lib-add" aria-label="new goal">+ goal</button>
      </div>
      <div class="lb-filters">
        <div class="lb-filterchips" role="radiogroup" aria-label="type">
          <button class="lb-chip ${!state.type ? "on" : ""}" data-type="" role="radio" aria-checked="${!state.type}">all</button>
          ${TYPE_IDS.map((t) => `<button class="lb-chip ${state.type === t ? "on" : ""}" data-type="${t}" role="radio" aria-checked="${state.type === t}"><i class="lb-type ${TYPES[t].cls}" aria-hidden="true">${TYPES[t].glyph}</i>${TYPES[t].label}</button>`).join("")}
        </div>
        <label class="lb-sort"><span class="lb-dim">sort</span>
          <select id="lb-lib-sort" aria-label="sort goals">${SORTS.map((s) => `<option value="${s}" ${s === state.sort ? "selected" : ""}>${SORT_LABELS[s]}</option>`).join("")}</select>
        </label>
      </div>
      ${total === 0 ? `
        <p class="lb-empty">No goals yet. A goal is what you practice — a piece, a technique, or anything else: <em>Pathétique Sonata</em>, <em>Scales</em>, <em>Sight reading</em>.</p>
        <div class="transport"><button class="start" id="lb-lib-first">+ goal</button></div>` : `
        <div class="lb-sect">active · ${active.length}</div>
        ${active.length ? `<ul class="lb-list" id="lb-active">${active.map(row).join("")}</ul>` : `<p class="lb-empty lb-dim">${q || state.type ? "nothing matches." : "no active goals."}</p>`}
        ${finished.length ? `<details class="lb-details" ${state.openFinished ? "open" : ""}><summary>finished · ${finished.length}</summary><ul class="lb-list">${finished.map(row).join("")}</ul></details>` : ""}
        ${shelved.length ? `<details class="lb-details" ${state.openShelved ? "open" : ""}><summary>shelved · ${shelved.length}</summary><ul class="lb-list">${shelved.map(row).join("")}</ul></details>` : ""}
        <p class="lb-foot lb-dim">${plural(total, "goal")} in the library</p>`}
    </section>`;

  const search = root.querySelector("#lb-lib-q");
  search.addEventListener("input", () => { state.q = search.value; rerender(); });
  const rerender = () => { const pos = search.selectionStart; renderLibrary(root, ctx, state); const s2 = root.querySelector("#lb-lib-q"); s2.focus(); s2.setSelectionRange(pos, pos); };
  for (const c of root.querySelectorAll(".lb-filterchips .lb-chip")) c.addEventListener("click", () => {
    state.type = c.dataset.type || null; prefs.set("library", { type: state.type, sort: state.sort }); renderLibrary(root, ctx, state);
  });
  root.querySelector("#lb-lib-sort").addEventListener("change", (e) => {
    state.sort = e.target.value; prefs.set("library", { type: state.type, sort: state.sort }); renderLibrary(root, ctx, state);
  });
  for (const d of root.querySelectorAll(".lb-details")) d.addEventListener("toggle", () => {
    if (d.querySelector("summary").textContent.startsWith("finished")) state.openFinished = d.open; else state.openShelved = d.open;
  });
  for (const b of root.querySelectorAll("[data-open]")) b.addEventListener("click", () => ctx.nav(`/goals/${b.dataset.open}`));
  const add = async () => {
    const g = await ctx.openCreate();
    if (!g) return;
    state.q = ""; state.type = null;
    renderLibrary(root, ctx, state);
    stamp(root.querySelector(`.lb-row[data-id="${g.id}"]`));
    ctx.toast(`${displayName(g)} — in the library`);
  };
  root.querySelector("#lb-lib-add").addEventListener("click", add);
  root.querySelector("#lb-lib-first")?.addEventListener("click", add);
}
