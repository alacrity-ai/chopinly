// Catalogue widgets shared by Scores and Compose (WSHED-107/113/117): the
// one-line tag rail, the all-tags sheet, the details form (title · composer ·
// tags) and the browse tools (search · sort · group by composer · tag rail).
// Anything with a title, a composer and tags can use them — a score today, a
// composition too, so a composition saved to Scores carries its identity 1:1.
import { icon } from "../../lib/icons.js";
import { esc, openSheet, finePointer, plural } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";
import { suggestTags, parseTags, SORT_IDS } from "../../lib/scores/library.js";

const RAIL_MAX = 8; // tags shown on the rail before "+N"
const SORT_LABELS = { recent: "recent", title: "title", composer: "composer" };

/** Tag → how many items carry it, most used first. */
export function tagCounts(items) {
  const count = new Map();
  for (const s of items) for (const t of s.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
  return count;
}
/** One-line tag rail: picked tags first (with an ×), then the most-used others, then "+N more". */
export function tagRail(all, picked) {
  const others = all.filter((t) => !picked.includes(t));
  const rest = others.slice(0, Math.max(0, RAIL_MAX - picked.length));
  const hidden = others.length - rest.length;
  return [
    ...picked.map((t) => `<button type="button" class="sc-tag on" data-tag="${esc(t)}" aria-pressed="true">${esc(t)}<span class="sc-tag-x" aria-hidden="true">×</span></button>`),
    ...rest.map((t) => `<button type="button" class="sc-tag" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`),
    hidden > 0 ? `<button type="button" class="sc-tag sc-tag-more" data-more>+${hidden} more</button>` : "",
  ].join("");
}
/** The badge at the head of a rail: how many are picked out of how many exist. */
export const tagBadge = (all, picked) => picked.length ? `${picked.length} of ${all.length}` : String(all.length);

/**
 * The all-tags sheet: every tag of `items()` with its count, tap to toggle.
 * `picked()` reads the current set, `toggle(t)` / `clear()` change it (the
 * sheet rebuilds after each); `hint(n)` is the line under the chips.
 */
export function openTagSheet({ items, picked, toggle, clear, hint }) {
  const list = items();
  const counts = tagCounts(list);
  const all = suggestTags(list);
  const sheet = openSheet({ title: "tags", cls: "lb-acct-wrap sc-tagsheet", html: "" });
  const { body } = sheet;
  let tq = "";
  const build = () => {
    const have = picked();
    const shown = all.filter((t) => !tq || t.toLowerCase().includes(tq.toLowerCase()));
    body.innerHTML = `
      ${all.length > 12 ? `<input class="lb-input lb-search sc-tagsheet-q" id="sc-tq" type="search" placeholder="find a tag…" value="${esc(tq)}" autocomplete="off" aria-label="find a tag">` : ""}
      <div class="lb-chips">${shown.map((t) => `<button type="button" class="sc-tag ${have.includes(t) ? "on" : ""}" data-tag="${esc(t)}" aria-pressed="${have.includes(t)}">${esc(t)}<small>${counts.get(t) ?? 0}</small></button>`).join("") || `<p class="lb-empty">no tag matches.</p>`}</div>
      <div class="sc-tagsheet-acts">
        <span class="lb-acct-fine" style="margin:0">${hint(have.length)}</span>
        <button type="button" class="lb-chip" id="sc-tq-clear" ${have.length ? "" : "disabled"} style="margin-left:auto">clear</button>
        <button type="button" class="lb-modal-save" id="sc-tq-done">done</button>
      </div>`;
    const qi = body.querySelector("#sc-tq");
    qi?.addEventListener("input", () => { tq = qi.value; const at = qi.selectionStart; build(); const n = body.querySelector("#sc-tq"); n.focus(); try { n.setSelectionRange(at, at); } catch { /* fine */ } });
    for (const b of body.querySelectorAll("[data-tag]")) b.addEventListener("click", () => { toggle(b.dataset.tag); haptic(4); build(); });
    body.querySelector("#sc-tq-clear").addEventListener("click", () => { clear(); build(); });
    body.querySelector("#sc-tq-done").addEventListener("click", sheet.close);
  };
  build();
  if (all.length > 12 && finePointer()) body.querySelector("#sc-tq")?.focus();
  return sheet;
}

/**
 * The details form — title · composer (with suggestions) · tags (with the rail).
 * Ids are `<prefix>-title` …; `save` is the submit button's label.
 */
export function detailsFormHtml({ prefix, item = {}, composers = [], allTags = [], save = "save", autofocusTitle = false }) {
  return `
    <form class="lb-acct-form sc-details" id="${prefix}-form" novalidate>
      <label class="lb-acct-label" for="${prefix}-title">title</label>
      <input class="lb-input lb-input-lg" id="${prefix}-title" value="${esc(item.title ?? "")}" placeholder="title" maxlength="160" autocomplete="off" autocapitalize="sentences" required ${autofocusTitle ? "autofocus" : ""}>
      <label class="lb-acct-label" for="${prefix}-composer">composer</label>
      <input class="lb-input" id="${prefix}-composer" value="${esc(item.composer ?? "")}" placeholder="composer" maxlength="80" autocomplete="off" autocapitalize="words" list="${prefix}-composers">
      <datalist id="${prefix}-composers">${composers.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
      <label class="lb-acct-label" for="${prefix}-tags">tags</label>
      <input class="lb-input" id="${prefix}-tags" value="${esc((item.tags ?? []).join(", "))}" placeholder="baroque, exam, duet…" autocomplete="off" autocapitalize="off">
      <div class="sc-tagrow sc-d-tagrow" id="${prefix}-tagrow" hidden></div>
      <p class="lb-err" id="${prefix}-err" role="alert"></p>
      <div class="lb-modal-acts"><button type="submit" class="lb-modal-save" id="${prefix}-save">${esc(save)}</button></div>
    </form>`;
}
/**
 * Wire a details form in `body`: the tag rail under the field (this item's tags
 * first, the most-used others, "+N more"; the badge or "+N" opens the all-tags
 * sheet on top, so unsaved title / composer edits survive). `items()` is the
 * catalogue the tags are drawn from. Returns { values(), fail(message), focus() }
 * and calls `onSubmit(values)` on submit.
 */
export function wireDetailsForm(body, { prefix, items, onSubmit }) {
  const title = body.querySelector(`#${prefix}-title`), composer = body.querySelector(`#${prefix}-composer`), tagsEl = body.querySelector(`#${prefix}-tags`), err = body.querySelector(`#${prefix}-err`);
  const tagrow = body.querySelector(`#${prefix}-tagrow`);
  const all = () => suggestTags(items());
  const picked = () => parseTags(tagsEl.value);
  const setTags = (list) => { tagsEl.value = list.join(", "); paintRail(); };
  const toggleTag = (t) => { const have = picked(); setTags(have.includes(t) ? have.filter((x) => x !== t) : [...have, t]); };
  const pickTags = () => openTagSheet({ items, picked, toggle: toggleTag, clear: () => setTags([]), hint: (n) => n ? `${n} on this one` : "tap the tags it carries" });
  function paintRail() {
    if (!tagrow) return;
    const have = picked(), tags = all();
    tagrow.hidden = !tags.length && !have.length; // nothing to pick from and nothing picked: no rail
    tagrow.innerHTML = `
      <button type="button" class="sc-tagbtn ${have.length ? "on" : ""}" id="${prefix}-tags-all" aria-label="all tags">${icon("tag")}<span>${tagBadge(tags, have)}</span></button>
      <div class="sc-tagrail" aria-label="tags">${tagRail(tags, have)}</div>`;
    tagrow.querySelector(`#${prefix}-tags-all`).addEventListener("click", pickTags);
    tagrow.querySelector("[data-more]")?.addEventListener("click", pickTags);
    for (const c of tagrow.querySelectorAll("[data-tag]")) c.addEventListener("click", () => { toggleTag(c.dataset.tag); haptic(4); });
  }
  tagsEl.addEventListener("input", paintRail);
  paintRail();
  const values = () => ({ title: title.value, composer: composer.value, tags: picked() });
  body.querySelector(`#${prefix}-form`).addEventListener("submit", (e) => { e.preventDefault(); onSubmit(values()); });
  return { values, fail(message) { err.textContent = message; }, clearError() { err.textContent = ""; }, focus() { if (finePointer()) title.focus(); } };
}

/**
 * The browse tools above a catalogue list: search, sort (recent / title /
 * composer), group by composer, the tag rail, and the "N of M · clear" line.
 * `total` is the whole catalogue, `shown` what the filters leave.
 */
export function browseToolsHtml({ prefix, q, sort, group, tagFilter, allTags, placeholder, total, shown, noun = "item" }) {
  return `
    <div class="sc-tools">
      <input class="lb-input lb-search sc-search" id="${prefix}-q" type="search" placeholder="${esc(placeholder)}" value="${esc(q)}" autocomplete="off" aria-label="${esc(placeholder)}">
      <div class="sc-sortrow">
        <div class="sc-seg" role="radiogroup" aria-label="sort by">
          ${SORT_IDS.map((k) => `<button type="button" class="sc-seg-btn ${sort === k ? "on" : ""}" role="radio" aria-checked="${sort === k}" data-sort="${k}">${SORT_LABELS[k] ?? k}</button>`).join("")}
        </div>
        <button type="button" class="sc-group ${group ? "on" : ""}" aria-pressed="${group}" id="${prefix}-group" title="group by composer">${icon("group")}<span>by composer</span></button>
      </div>
      ${allTags.length ? `<div class="sc-tagrow">
        <button type="button" class="sc-tagbtn ${tagFilter.length ? "on" : ""}" id="${prefix}-tags-all" aria-label="all tags">${icon("tag")}<span>${tagBadge(allTags, tagFilter)}</span></button>
        <div class="sc-tagrail" aria-label="tags">${tagRail(allTags, tagFilter)}</div>
      </div>` : ""}
      ${q || tagFilter.length ? `<p class="sc-count"><span>${shown === total ? plural(total, noun) : `${shown} of ${total}`}</span><button type="button" id="${prefix}-clear">clear</button></p>` : ""}
    </div>`;
}
/**
 * Wire the browse tools: `state` is { q, sort, group, tagFilter }; `onChange(patch)`
 * receives the changed keys and re-renders. `items()` feeds the all-tags sheet.
 */
export function wireBrowseTools(root, { prefix, items, state, onChange }) {
  const qEl = root.querySelector(`#${prefix}-q`);
  if (qEl) {
    let t = 0;
    qEl.addEventListener("input", () => { const q = qEl.value; clearTimeout(t); t = setTimeout(() => { const at = qEl.selectionStart; onChange({ q }); const n = root.querySelector(`#${prefix}-q`); if (n) { n.focus(); try { n.setSelectionRange(at, at); } catch { /* not a text control state */ } } }, 120); });
  }
  const toggleTag = (tag) => onChange({ tagFilter: state.tagFilter.includes(tag) ? state.tagFilter.filter((x) => x !== tag) : [...state.tagFilter, tag] });
  const openFilterSheet = () => openTagSheet({
    items, picked: () => state.tagFilter, toggle: toggleTag, clear: () => onChange({ tagFilter: [] }),
    hint: (n) => n ? `${n} picked · every one must match` : "pick tags to narrow the list",
  });
  for (const b of root.querySelectorAll("[data-sort]")) b.addEventListener("click", () => onChange({ sort: b.dataset.sort }));
  root.querySelector(`#${prefix}-group`)?.addEventListener("click", () => onChange({ group: !state.group }));
  for (const b of root.querySelectorAll(".sc-tools .sc-tagrail [data-tag]")) b.addEventListener("click", () => toggleTag(b.dataset.tag));
  root.querySelector(".sc-tools .sc-tagrail [data-more]")?.addEventListener("click", openFilterSheet);
  root.querySelector(`#${prefix}-tags-all`)?.addEventListener("click", openFilterSheet);
  root.querySelector(`#${prefix}-clear`)?.addEventListener("click", () => onChange({ q: "", tagFilter: [] }));
}
