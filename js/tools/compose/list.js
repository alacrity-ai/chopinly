// The compositions list: the same browsing as the Scores library (search,
// sort, group by composer, tag rail), tap to open, hold for the details modal.
import { logbook } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, longPress, plural, relDay } from "../logbook/util.js";
import { haptic, stamp } from "../logbook/motion.js";
import { groupByComposer, suggestTags, SORT_IDS } from "../../lib/scores/library.js";
import { browseToolsHtml, wireBrowseTools } from "../shared/catalog.js";
import { openCompositionDetails, barsOf } from "./details.js";

export function mountList(root, { store }, { open }) {
  let highlightId = null;
  let q = "", sort = store.get("sort", "recent"), group = store.get("group", false), tagFilter = store.get("tags", []);
  if (!SORT_IDS.includes(sort)) sort = "recent";
  root.classList.add("top-anchored");

  const sub = (c) => `${c.composer && !group ? `${esc(c.composer)} · ` : ""}${plural(barsOf(c), "bar")}${c.tags?.length ? ` · ${c.tags.map(esc).join(", ")}` : ""} · ${relDay(c.openedAt ?? c.updatedAt)}`;
  const row = (c) => `
    <li class="sc-row ${c.id === highlightId ? "sc-hl" : ""}" data-id="${c.id}">
      <button type="button" class="sc-open" aria-label="open ${esc(c.title)} — hold for details">
        <span class="sc-thumb cp-thumb" aria-hidden="true">${icon("pencil")}</span>
        <span class="sc-text"><b class="sc-title">${esc(c.title)}</b><small class="sc-sub">${sub(c)}</small></span>
        <span class="sc-chev" aria-hidden="true">${icon("next")}</span>
      </button>
    </li>`;

  function render() {
    const total = logbook.compositions().length;
    const allTags = suggestTags(logbook.compositions());
    tagFilter = tagFilter.filter((t) => allTags.includes(t));
    const list = logbook.compositions({ q, tags: tagFilter, sort });
    const groups = group ? groupByComposer(list) : [{ composer: null, scores: list }];
    root.innerHTML = `
      <section class="scores compose" aria-label="compose">
        <div class="sc-head">
          <h2 class="lb-sect sc-sect">compositions${total ? `<span class="lb-sect-sub">${total}</span>` : ""}</h2>
          <button type="button" class="sc-add" id="cp-new">${icon("plus")}<span>composition</span></button>
        </div>
        ${total ? browseToolsHtml({ prefix: "cp", q, sort, group, tagFilter, allTags, placeholder: "search title, composer, tag…", total, shown: list.length, noun: "composition" }) : ""}
        ${total === 0
          ? `<p class="lb-empty sc-empty cp-empty">nothing written yet — <em>start a composition</em> and place your first note.</p>`
          : list.length === 0
            ? `<p class="lb-empty sc-empty">nothing matches.</p>`
            : groups.map((gr) => `${gr.composer !== null ? `<div class="lb-sect sc-groupname">${gr.composer ? esc(gr.composer) : "no composer"}<span class="lb-sect-sub">${gr.scores.length}</span></div>` : ""}<ul class="sc-list" id="cp-list">${gr.scores.map(row).join("")}</ul>`).join("")}
      </section>`;
    root.querySelector("#cp-new").addEventListener("click", async () => {
      const r = await openCompositionDetails(null);
      if (r.created) { haptic(8); open(r.created.id); }
    });
    wireBrowseTools(root, { prefix: "cp", items: () => logbook.compositions(), state: { q, sort, group, tagFilter }, onChange: (patch) => {
      if ("q" in patch) q = patch.q;
      if ("sort" in patch) { sort = patch.sort; store.set("sort", sort); }
      if ("group" in patch) { group = patch.group; store.set("group", group); }
      if ("tagFilter" in patch) { tagFilter = patch.tagFilter; store.set("tags", tagFilter); }
      render();
    } });
    for (const li of root.querySelectorAll(".sc-row")) {
      const id = li.dataset.id, btn = li.querySelector(".sc-open");
      longPress(btn, () => open(id), async () => { haptic(12); await openCompositionDetails(id); render(); });
      if (id === highlightId) { stamp(li); highlightId = null; }
    }
  }
  render();
  return { refresh: render, highlight(id) { highlightId = id; render(); }, destroy() { root.classList.remove("top-anchored"); root.replaceChildren(); } };
}
