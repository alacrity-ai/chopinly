// The compositions list: start one, open one, hold for rename / delete.
import { logbook } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, toast, longPress, plural, openSheet, relDay } from "../logbook/util.js";
import { haptic, stamp } from "../logbook/motion.js";
import { newComposition } from "../../lib/compose/model.js";

const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const barsOf = (c) => { let last = c.measures.length - 1; while (last > 0 && c.measures[last].staves.every((s) => s.voices[0].every((e) => e.kind === "rest"))) last--; return last + 1; };

export function mountList(root, { store }, { open }) {
  let cleanups = [], highlightId = null;
  root.classList.add("top-anchored");

  const row = (c) => `
    <li class="sc-row ${c.id === highlightId ? "sc-hl" : ""}" data-id="${c.id}">
      <button type="button" class="sc-open" aria-label="open ${esc(c.title)} — hold for details">
        <span class="sc-thumb cp-thumb" aria-hidden="true">${icon("pencil")}</span>
        <span class="sc-text"><b class="sc-title">${esc(c.title)}</b><small class="sc-sub">${c.composer ? `${esc(c.composer)} · ` : ""}${plural(barsOf(c), "bar")} · ${relDay(c.openedAt ?? c.updatedAt)}</small></span>
        <span class="sc-chev" aria-hidden="true">${icon("next")}</span>
      </button>
    </li>`;

  function render() {
    for (const c of cleanups) c(); cleanups = [];
    const list = logbook.compositions();
    root.innerHTML = `
      <section class="scores compose" aria-label="compose">
        <div class="sc-head">
          <h2 class="lb-sect sc-sect">compositions</h2>
          <button type="button" class="sc-add" id="cp-new">${icon("plus")}<span>composition</span></button>
        </div>
        ${list.length ? `<ul class="sc-list" id="cp-list">${list.map(row).join("")}</ul>` : `<p class="lb-empty sc-empty cp-empty">nothing written yet — <em>start a composition</em> and place your first note.</p>`}
      </section>`;
    root.querySelector("#cp-new").addEventListener("click", () => {
      const title = (prompt("title", "Untitled") ?? "").trim();
      if (!title) return;
      const c = newComposition({ id: uuid(), title });
      logbook.addComposition(c);
      haptic(8);
      open(c.id);
    });
    for (const li of root.querySelectorAll(".sc-row")) {
      const id = li.dataset.id, btn = li.querySelector(".sc-open");
      longPress(btn, () => open(id), () => { haptic(12); openDetails(id); });
      if (id === highlightId) { stamp(li); highlightId = null; }
    }
  }
  function openDetails(id) {
    const c = logbook.composition(id);
    if (!c) return;
    const sheet = openSheet({ title: c.title, cls: "lb-acct-wrap", html: `
      <ul class="lb-acct-list">
        <li><button type="button" class="lb-acct-row" id="cp-rename">${icon("pencil")}<span><b>rename</b><small>${esc(c.title)}</small></span></button></li>
        <li><button type="button" class="lb-acct-row" id="cp-composer">${icon("user")}<span><b>composer</b><small>${esc(c.composer || "none yet")}</small></span></button></li>
        <li><button type="button" class="lb-acct-row lb-danger" id="cp-delete">${icon("trash")}<span><b>delete</b><small>${plural(barsOf(c), "bar")} — gone from this device</small></span></button></li>
      </ul>` });
    sheet.body.querySelector("#cp-rename").addEventListener("click", () => { const t = (prompt("title", c.title) ?? "").trim(); if (t) { logbook.updateComposition(id, { title: t }); toast("renamed"); } sheet.close(); render(); });
    sheet.body.querySelector("#cp-composer").addEventListener("click", () => { const t = prompt("composer", c.composer ?? ""); if (t !== null) logbook.updateComposition(id, { composer: t }); sheet.close(); render(); });
    sheet.body.querySelector("#cp-delete").addEventListener("click", () => { if (!confirm(`delete “${c.title}”?`)) return; logbook.removeComposition(id); toast("deleted"); sheet.close(); render(); });
  }
  render();
  return { refresh: render, highlight(id) { highlightId = id; render(); }, destroy() { for (const c of cleanups) c(); root.classList.remove("top-anchored"); root.replaceChildren(); } };
}
