// The library (docs/SCORES_DESIGN.md §8): import PDFs, find them, open one.
// Search over title / composer / tags, sort by recent / title / composer,
// group by composer, narrow by tag chips, page-1 thumbnails. Tap a row to
// open it, hold it for the details sheet (title, composer, tags, goal, save,
// delete). The details sheet and "practice this" are exported for the reader.
import { logbook, displayName, TYPES } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, toast, longPress, plural, openSheet, finePointer } from "../logbook/util.js";
import { haptic, stamp } from "../logbook/motion.js";
import { openPicker } from "../logbook/picker.js";
import { scoreStore } from "../../lib/scores/store.js";
import { open as openPdf } from "../../lib/scores/pdf.js";
import { groupByComposer, suggestComposers, suggestTags, parseTags, SORT_IDS } from "../../lib/scores/library.js";
import { warmPages, PERSIST_BYTES } from "../../lib/scores/pagecache.js";

/** Import limits (design §12). */
export const MAX_FILE_BYTES = 60 * 1024 * 1024;
const THUMB_W = 120;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(blob) {
  try { return hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())); } catch { return ""; }
}
const stripExt = (name) => String(name ?? "").replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
/** A PDF Author that reads like a person's name — not a program, not an address. */
const looksLikeName = (a) => /^[\p{L}][\p{L}' .,-]{1,60}$/u.test(a) && !/\d|@|\b(inc|ltd|llc|gmbh|software|finale|sibelius|musescore|dorico|lilypond|adobe|microsoft|apple)\b/i.test(a);

// --- thumbnails: page 1 at 120 css px, bucket 0 in the pages store ------------------
const thumbUrls = new Map();     // score id → object URL (lives for the session)
const thumbPending = new Map();  // score id → Promise
export async function thumbUrl(id) {
  if (thumbUrls.has(id)) return thumbUrls.get(id);
  const row = await scoreStore.getPage(scoreStore.pageKey(id, 1, 0)).catch(() => null);
  if (!row?.blob) return null;
  const url = URL.createObjectURL(row.blob);
  thumbUrls.set(id, url);
  return url;
}
async function storeThumb(doc, id) {
  if (typeof OffscreenCanvas === "undefined") return;
  const bmp = await doc.render(1, THUMB_W, 2);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const cx = c.getContext("2d", { alpha: false });
  cx.drawImage(bmp, 0, 0); bmp.close?.();
  const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  await scoreStore.putPage(scoreStore.pageKey(id, 1, 0), blob, { scoreId: id, w: bmp.width, h: bmp.height });
  thumbUrls.delete(id);
}
/** Render a missing thumbnail for a row that predates thumbnails (P0 imports). */
function ensureThumb(id) {
  if (thumbPending.has(id)) return thumbPending.get(id);
  const p = (async () => {
    if (await scoreStore.getPage(scoreStore.pageKey(id, 1, 0)).catch(() => null)) return;
    const blob = await scoreStore.get(id);
    if (!blob) return;
    const doc = await openPdf(blob);
    try { await storeThumb(doc, id); } finally { doc.close(); }
  })().catch(() => {}).finally(() => thumbPending.delete(id));
  thumbPending.set(id, p);
  return p;
}

/**
 * Import one file: parse, hash, store, register. Resolves to
 * { score, existing: bool } — `existing` when the same bytes were already here.
 * The thumbnail and (for big files) the first pages' cache render afterwards
 * in the background.
 */
export async function importFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is over 60 MB — Chopinly keeps scores under that`);
  if (file.type && file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) throw new Error(`${file.name} isn't a PDF`);
  const hash = await sha256(file);
  const dup = hash ? logbook.scoreByHash(hash) : null;
  if (dup) {
    if (!scoreStore.has(dup.id)) { await scoreStore.put(dup.id, file, { sha256: hash }); ensureThumb(dup.id); } // the row was here, the file was not (another device's score)
    return { score: dup, existing: true };
  }
  const doc = await openPdf(file);
  const pages = doc.pages, info = doc.info;
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await scoreStore.put(id, file, { sha256: hash });
  const score = logbook.addScore({ id, title: info.title || stripExt(file.name) || "untitled score", composer: looksLikeName(info.author) ? info.author : "", pages, size: file.size, sha256: hash });
  (async () => {
    try { await storeThumb(doc, id); } catch { /* no thumbnail, no harm */ }
    try { if (file.size >= PERSIST_BYTES) await warmPages(doc, { scoreId: id, width: Math.min(innerWidth, innerHeight), dpr: Math.min(devicePixelRatio || 1, 3) }); } catch { /* the reader renders on demand */ }
    doc.close();
    listenersEmit();
  })();
  return { score, existing: false };
}
const libListeners = new Set();
const listenersEmit = () => { for (const fn of libListeners) fn(); };

/**
 * "Practice this": start the clock on the score's goal, creating a piece from
 * its title and composer when it has none. Resolves to the goal.
 */
export function practiceScore(scoreId) {
  const s = logbook.score(scoreId);
  if (!s) throw new Error("that score is gone");
  let g = s.goalId ? logbook.goal(s.goalId) : null;
  if (!g) { g = logbook.addGoal({ name: s.title, type: "piece", composer: s.composer ?? "" }); logbook.updateScore(s.id, { goalId: g.id }); }
  const run = logbook.running();
  if (run?.goal.id === g.id) { toast(`already practicing ${displayName(g)}`); return g; }
  logbook.start(g.id);
  haptic(12);
  toast(`practicing ${displayName(g)}`);
  return g;
}

/** Delete a score everywhere on this device: file, rendered pages, row, marks. */
export async function deleteScore(id) {
  await scoreStore.del(id);
  thumbUrls.delete(id);
  logbook.removeScore(id);
}

/** Save the untouched PDF to a file. */
export async function saveScoreFile(id) {
  const s = logbook.score(id), blob = await scoreStore.get(id);
  if (!s || !blob) { toast("this score is on another device"); return; }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `${s.title}.pdf` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** The details sheet. Resolves when closed; `{ deleted: true }` when the score is gone. */
export function openDetails(id, { onPractice = null } = {}) {
  const s = logbook.score(id);
  if (!s) { toast("that score is gone"); return Promise.resolve({ deleted: true }); }
  const goal = s.goalId ? logbook.goal(s.goalId) : null;
  const composers = suggestComposers(logbook.goals({ status: "all" }), logbook.scores());
  const tags = suggestTags(logbook.scores());
  const here = scoreStore.has(id);
  const sheet = openSheet({
    title: "score",
    cls: "lb-acct-wrap sc-details-wrap",
    html: `
      <form class="lb-acct-form sc-details" id="sc-details" novalidate>
        <label class="lb-acct-label" for="sc-d-title">title</label>
        <input class="lb-input lb-input-lg" id="sc-d-title" value="${esc(s.title)}" maxlength="160" autocomplete="off" autocapitalize="sentences" required>
        <label class="lb-acct-label" for="sc-d-composer">composer</label>
        <input class="lb-input" id="sc-d-composer" value="${esc(s.composer ?? "")}" placeholder="composer" maxlength="80" autocomplete="off" autocapitalize="words" list="sc-d-composers">
        <datalist id="sc-d-composers">${composers.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <label class="lb-acct-label" for="sc-d-tags">tags</label>
        <input class="lb-input" id="sc-d-tags" value="${esc(s.tags.join(", "))}" placeholder="baroque, exam, duet…" autocomplete="off" autocapitalize="off">
        ${tags.length ? `<div class="lb-chips lb-filterchips sc-d-tagchips" id="sc-d-tagchips">${tags.map((t) => `<button type="button" class="lb-chip ${s.tags.includes(t) ? "on" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
        <p class="lb-err" id="sc-d-err" role="alert"></p>
        <div class="lb-modal-acts"><button type="submit" class="lb-modal-save" id="sc-d-save">save</button></div>
      </form>
      <ul class="lb-acct-list">
        <li><button type="button" class="lb-acct-row" id="sc-d-goal">${goal ? `<i class="lb-type ${(TYPES[goal.type] ?? TYPES.other).cls}" aria-hidden="true">${(TYPES[goal.type] ?? TYPES.other).glyph}</i>` : icon("log")}<span><b>${goal ? esc(displayName(goal)) : "link to a goal"}</b><small>${goal ? "the goal this score belongs to — tap to change" : "so practicing it and opening it are one gesture"}</small></span></button></li>
        <li><button type="button" class="lb-acct-row" id="sc-d-practice">${icon("play")}<span><b>practice this</b><small>${goal ? `start the clock on ${esc(displayName(goal))}` : "starts the clock on a new piece with this title"}</small></span></button></li>
        <li><button type="button" class="lb-acct-row" id="sc-d-save-file" ${here ? "" : "disabled"}>${icon("download")}<span><b>save this score to a file</b><small>${here ? "the PDF exactly as it was imported" : "the file is on another device"}</small></span></button></li>
      </ul>
      <ul class="lb-acct-list">
        <li><button type="button" class="lb-acct-row lb-danger" id="sc-d-delete">${icon("trash")}<span><b>delete this score</b><small>its bookmarks and ink go with it</small></span></button></li>
      </ul>
      <p class="lb-acct-fine">${plural(s.pages, "page")}${s.size ? ` · ${(s.size / 1048576).toFixed(1)} MB` : ""} · added ${esc(new Date(s.addedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))}</p>`,
  });
  const { body, close, closed } = sheet;
  let result = {};
  const title = body.querySelector("#sc-d-title"), composer = body.querySelector("#sc-d-composer"), tagsEl = body.querySelector("#sc-d-tags"), err = body.querySelector("#sc-d-err");
  if (finePointer()) title.focus();
  const syncChips = () => { const have = new Set(parseTags(tagsEl.value)); for (const c of body.querySelectorAll("[data-tag]")) c.classList.toggle("on", have.has(c.dataset.tag)); };
  tagsEl.addEventListener("input", syncChips);
  for (const c of body.querySelectorAll("[data-tag]")) c.addEventListener("click", () => {
    const have = parseTags(tagsEl.value), t = c.dataset.tag;
    tagsEl.value = (have.includes(t) ? have.filter((x) => x !== t) : [...have, t]).join(", ");
    syncChips();
  });
  const save = () => {
    try { logbook.updateScore(id, { title: title.value, composer: composer.value, tags: parseTags(tagsEl.value) }); err.textContent = ""; return true; }
    catch (e) { err.textContent = e.message; return false; }
  };
  body.querySelector("#sc-details").addEventListener("submit", (e) => { e.preventDefault(); if (save()) { haptic(); stamp(body.querySelector("#sc-d-save")); toast("saved"); close(); } });
  body.querySelector("#sc-d-goal").addEventListener("click", async () => {
    if (!save()) return;
    close();
    const r = await openPicker({ mode: "score" });
    if (r) { logbook.updateScore(id, { goalId: r.goal.id }); toast(`linked to ${displayName(r.goal)}`); }
    result = await openDetails(id, { onPractice });
  });
  body.querySelector("#sc-d-practice").addEventListener("click", () => {
    if (!save()) return;
    try { const g = practiceScore(id); close(); onPractice?.(g); } catch (e) { err.textContent = e.message; }
  });
  body.querySelector("#sc-d-save-file").addEventListener("click", () => { if (save()) saveScoreFile(id); });
  body.querySelector("#sc-d-delete").addEventListener("click", async () => {
    if (!confirm(`Delete “${s.title}” and its bookmarks?`)) return;
    haptic(20);
    await deleteScore(id);
    result = { deleted: true };
    toast("deleted");
    close();
  });
  return closed.then(() => result);
}

export function mountLibrary(root, { store }, { open }) {
  let cleanups = [], busy = false, highlightId = null;
  let q = "", sort = store.get("sort", "recent"), group = store.get("group", false), tagFilter = store.get("tags", []);
  if (!SORT_IDS.includes(sort)) sort = "recent";
  root.classList.add("top-anchored");

  const sub = (s) => {
    const here = scoreStore.has(s.id);
    const goal = s.goalId ? logbook.goal(s.goalId) : null;
    return `${s.composer && !group ? `${esc(s.composer)} · ` : ""}${plural(s.pages, "page")}${s.tags.length ? ` · ${s.tags.map(esc).join(", ")}` : ""}${goal ? ` · <span class="sc-goal">${esc(goal.name)}</span>` : ""}${here ? "" : ` · <span class="sc-remote">on another device</span>`}`;
  };
  const row = (s) => `
    <li class="sc-row ${scoreStore.has(s.id) ? "" : "remote"} ${s.id === highlightId ? "sc-hl" : ""}" data-id="${s.id}">
      <button type="button" class="sc-open" aria-label="open ${esc(s.title)} — hold for details">
        <span class="sc-thumb" data-thumb="${s.id}" aria-hidden="true">${icon("score")}</span>
        <span class="sc-text"><b class="sc-title">${esc(s.title)}</b><small class="sc-sub">${sub(s)}</small></span>
        <span class="sc-chev" aria-hidden="true">${icon("next")}</span>
      </button>
    </li>`;

  function render() {
    for (const c of cleanups) c(); cleanups = [];
    const total = logbook.scores().length;
    const allTags = suggestTags(logbook.scores());
    tagFilter = tagFilter.filter((t) => allTags.includes(t));
    const list = logbook.scores({ q, tags: tagFilter, sort });
    const groups = group ? groupByComposer(list) : [{ composer: null, scores: list }];
    root.innerHTML = `
      <section class="scores" aria-label="scores">
        <div class="sc-head">
          <div class="lb-sect sc-sect">scores${total ? `<span class="lb-sect-sub">${total}</span>` : ""}</div>
          <button type="button" class="sc-add ${busy ? "busy" : ""}" id="sc-add" ${busy ? "disabled" : ""}>${icon("plus")}<span>${busy ? "adding…" : "score"}</span></button>
          <input type="file" id="sc-file" accept="application/pdf,.pdf" multiple hidden aria-label="choose PDF files">
        </div>
        ${total ? `
        <div class="sc-tools">
          <input class="lb-input lb-search sc-search" id="sc-q" type="search" placeholder="search title, composer, tag…" value="${esc(q)}" autocomplete="off" aria-label="search scores">
          <div class="sc-sorts" role="radiogroup" aria-label="sort">
            ${SORT_IDS.map((k) => `<button type="button" class="lb-chip ${sort === k ? "on" : ""}" role="radio" aria-checked="${sort === k}" data-sort="${k}">${k}</button>`).join("")}
            <button type="button" class="lb-chip sc-group ${group ? "on" : ""}" aria-pressed="${group}" id="sc-group">by composer</button>
          </div>
          ${allTags.length ? `<div class="lb-chips lb-filterchips sc-tagchips" aria-label="tags">${allTags.map((t) => `<button type="button" class="lb-chip ${tagFilter.includes(t) ? "on" : ""}" data-tag="${esc(t)}" aria-pressed="${tagFilter.includes(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
        </div>` : ""}
        ${total === 0
          ? `<p class="lb-empty sc-empty">no scores yet. add a PDF and it lives here — <em>tap the right edge to turn the page, the left to go back</em>.</p>`
          : list.length === 0
            ? `<p class="lb-empty sc-empty">nothing matches.</p>`
            : groups.map((gr) => `${gr.composer !== null ? `<div class="lb-sect sc-groupname">${gr.composer ? esc(gr.composer) : "no composer"}<span class="lb-sect-sub">${gr.scores.length}</span></div>` : ""}<ul class="sc-list">${gr.scores.map(row).join("")}</ul>`).join("")}
      </section>`;
    highlightId = null;
    const input = root.querySelector("#sc-file");
    root.querySelector("#sc-add").addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const files = [...input.files]; input.value = "";
      if (!files.length) return;
      busy = true; render();
      let lastId = null, added = 0;
      for (const f of files) {
        try {
          const { score, existing } = await importFile(f);
          lastId = score.id;
          if (existing) toast(`${score.title} is already in your scores`); else added++;
        } catch (e) { toast(e.message); }
      }
      busy = false; highlightId = lastId; q = ""; tagFilter = []; render();
      if (added) { haptic(12); toast(added === 1 ? "added" : `added ${added} scores`); }
      const el = root.querySelector(`.sc-row[data-id="${lastId}"]`);
      if (el) { el.scrollIntoView({ block: "nearest" }); stamp(el); }
    });
    const qEl = root.querySelector("#sc-q");
    if (qEl) {
      let t = 0;
      qEl.addEventListener("input", () => { q = qEl.value; clearTimeout(t); t = setTimeout(() => { const at = qEl.selectionStart; render(); const n = root.querySelector("#sc-q"); n.focus(); try { n.setSelectionRange(at, at); } catch { /* not a text control state */ } }, 120); });
    }
    for (const b of root.querySelectorAll("[data-sort]")) b.addEventListener("click", () => { sort = b.dataset.sort; store.set("sort", sort); render(); });
    root.querySelector("#sc-group")?.addEventListener("click", () => { group = !group; store.set("group", group); render(); });
    for (const b of root.querySelectorAll(".sc-tagchips [data-tag]")) b.addEventListener("click", () => { const t = b.dataset.tag; tagFilter = tagFilter.includes(t) ? tagFilter.filter((x) => x !== t) : [...tagFilter, t]; store.set("tags", tagFilter); render(); });
    for (const li of root.querySelectorAll(".sc-row")) {
      const id = li.dataset.id;
      longPress(li.querySelector(".sc-open"), () => open(id), async () => { haptic(); await openDetails(id); render(); });
      const th = li.querySelector("[data-thumb]");
      thumbUrl(id).then((url) => {
        if (url) { th.innerHTML = `<img src="${url}" alt="">`; return; }
        if (scoreStore.has(id)) ensureThumb(id).then(() => thumbUrl(id)).then((u) => { if (u && th.isConnected) th.innerHTML = `<img src="${u}" alt="">`; });
      });
    }
  }
  const offLb = logbook.on(() => { if (!busy && !document.querySelector(".lb-sheet-wrap:not(.closing)")) render(); });
  const offStore = scoreStore.on(() => { if (!busy) render(); });
  const onLib = () => { if (!busy) render(); };
  libListeners.add(onLib);
  scoreStore.ready().then(render);
  render();
  return { refresh: render, destroy() { for (const c of cleanups) c(); offLb(); offStore(); libListeners.delete(onLib); root.classList.remove("top-anchored"); } };
}
