// The library (docs/SCORES_DESIGN.md §8): import PDFs, find them, open one.
// Search over title / composer / tags, sort by recent / title / composer,
// group by composer, narrow by tag chips, page-1 thumbnails. Tap a row to
// open it, hold it for the details sheet (title, composer, tags, goal, cloud,
// save, delete). The details sheet and "practice this" are exported for the
// reader. "upload scores" (P3) turns the list into a checklist: pick the ones
// to back up, select all, upload — one at a time, with progress.
import { logbook, displayName, TYPES } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, toast, longPress, plural, openSheet, finePointer } from "../logbook/util.js";
import { haptic, stamp } from "../logbook/motion.js";
import { openPicker } from "../logbook/picker.js";
import { scoreStore } from "../../lib/scores/store.js";
import { open as openPdf } from "../../lib/scores/pdf.js";
import { groupByComposer, suggestComposers, suggestTags, parseTags, SORT_IDS } from "../../lib/scores/library.js";
import { cloud } from "../../lib/scores/cloud.js";
import { MAX_FILE_BYTES, fmtQuota } from "../../lib/scores/plans.js";
import { fmtBytes } from "../../lib/takes/peaks.js";

export { MAX_FILE_BYTES };
const THUMB_W = 120;
const RAIL_MAX = 8; // tags shown on the rail before "+N" (WSHED-107)
const SORT_LABELS = { recent: "recent", title: "title", composer: "composer" };

/** Tag → how many scores carry it, most used first. */
function tagCounts(scores) {
  const count = new Map();
  for (const s of scores) for (const t of s.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
  return count;
}

/** One-line tag rail (WSHED-107/113): picked tags first (with an ×), then the most-used others, then "+N more". */
function tagRail(all, picked) {
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
const tagBadge = (all, picked) => picked.length ? `${picked.length} of ${all.length}` : String(all.length);
/**
 * The all-tags sheet: every tag with its count, tap to toggle. `picked()` reads the
 * current set, `toggle(t)` / `clear()` change it (the sheet rebuilds after each);
 * `hint(n)` is the line under the chips. Used for the library filter and for a
 * score's own tags in the details sheet.
 */
function openTagSheet({ picked, toggle, clear, hint }) {
  const counts = tagCounts(logbook.scores());
  const all = suggestTags(logbook.scores());
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
export async function storeThumb(doc, id) {
  if (typeof OffscreenCanvas === "undefined") return;
  const bmp = await doc.render(1, THUMB_W, 2);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const cx = c.getContext("2d", { alpha: false });
  cx.drawImage(bmp, 0, 0); bmp.close?.();
  const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  c.width = 0; c.height = 0;
  await scoreStore.putPage(scoreStore.pageKey(id, 1, 0), blob, { scoreId: id, w: bmp.width, h: bmp.height });
  thumbUrls.delete(id);
}
/** Has page 1 been rendered for the row? */
export const hasThumb = (id) => scoreStore.getPage(scoreStore.pageKey(id, 1, 0)).then((r) => !!r, () => false);
/**
 * Render a missing thumbnail (rows that predate thumbnails, or files that
 * arrived by cloud download). One at a time (WSHED-109): each one opens the
 * whole PDF, and a library of 30 MB scans doing that all at once was more
 * memory than an iPad allows a page. Waits while a reader is open — it has
 * the memory.
 */
const thumbQueue = [];
let thumbRunning = false;
async function runThumbs() {
  if (thumbRunning) return;
  thumbRunning = true;
  try {
    while (thumbQueue.length) {
      if (document.querySelector(".sc-reader")) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      const { id, resolve } = thumbQueue.shift();
      try {
        if (!(await hasThumb(id))) {
          const blob = await scoreStore.get(id);
          if (blob) { const doc = await openPdf(blob); try { await storeThumb(doc, id); } finally { doc.close(); } }
        }
      } catch { /* no thumbnail, no harm */ }
      thumbPending.delete(id);
      resolve();
      await new Promise((r) => setTimeout(r, 50)); // let the worker's memory go before the next file
    }
  } finally { thumbRunning = false; }
}
function ensureThumb(id) {
  if (thumbPending.has(id)) return thumbPending.get(id);
  const p = new Promise((resolve) => { thumbQueue.push({ id, resolve }); });
  thumbPending.set(id, p);
  runThumbs();
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
    if (!scoreStore.has(dup.id)) { await scoreStore.put(dup.id, file, { sha256: hash }); ensureThumb(dup.id); } // the row was here, the file was not (another device's score, or one in the cloud)
    return { score: dup, existing: true };
  }
  const doc = await openPdf(file);
  const pages = doc.pages, info = doc.info;
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await scoreStore.put(id, file, { sha256: hash });
  const score = logbook.addScore({ id, title: info.title || stripExt(file.name) || "untitled score", composer: looksLikeName(info.author) ? info.author : "", pages, size: file.size, sha256: hash });
  (async () => {
    try { await storeThumb(doc, id); } catch { /* no thumbnail, no harm */ }
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
  logbook.removeScore(id); // the tombstone takes the cloud file with it (functions/lib/sync.js)
  cloud.forget(id);
}

/** One sentence on where a score's file is: here, in the cloud, both, or another device. */
export function whereIs(id) {
  const here = scoreStore.has(id), up = cloud.has(id);
  if (here && up) return cloud.uploaded(id) ? "on this device and in the cloud" : "on this device; the cloud copy is older";
  if (here) return "on this device only";
  if (up) return "in the cloud — opens after a download";
  return "on another device";
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
  const cl = cloud.snapshot();
  const cloudRow = !cl.signedIn ? "" : cloud.uploaded(id)
    ? `<li><button type="button" class="lb-acct-row" id="sc-d-cloud" data-cloud="remove">${icon("cloud")}<span><b>remove from the cloud</b><small>frees ${fmtBytes(cl.files.get(id)?.size ?? s.size ?? 0)} of your cloud space; this device keeps its copy</small></span></button></li>`
    : here
      ? `<li><button type="button" class="lb-acct-row" id="sc-d-cloud" data-cloud="upload">${icon("cloud")}<span><b>upload to the cloud</b><small>${cloud.has(id) ? "replace the older cloud copy" : `so your other devices can open it · ${fmtBytes(s.size ?? 0)}`}</small></span></button></li>`
      : cloud.has(id)
        ? `<li><button type="button" class="lb-acct-row" id="sc-d-cloud" data-cloud="download">${icon("download")}<span><b>download to this device</b><small>${fmtBytes(cl.files.get(id)?.size ?? s.size ?? 0)} from your cloud space</small></span></button></li>`
        : "";
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
        ${tags.length ? `<div class="sc-tagrow sc-d-tagrow" id="sc-d-tagrow"></div>` : ""}
        <p class="lb-err" id="sc-d-err" role="alert"></p>
        <div class="lb-modal-acts"><button type="submit" class="lb-modal-save" id="sc-d-save">save</button></div>
      </form>
      <ul class="lb-acct-list">
        <li><button type="button" class="lb-acct-row" id="sc-d-goal">${goal ? `<i class="lb-type ${(TYPES[goal.type] ?? TYPES.other).cls}" aria-hidden="true">${(TYPES[goal.type] ?? TYPES.other).glyph}</i>` : icon("log")}<span><b>${goal ? esc(displayName(goal)) : "link to a goal"}</b><small>${goal ? "the goal this score belongs to — tap to change" : "so practicing it and opening it are one gesture"}</small></span></button></li>
        <li><button type="button" class="lb-acct-row" id="sc-d-practice">${icon("play")}<span><b>practice this</b><small>${goal ? `start the clock on ${esc(displayName(goal))}` : "starts the clock on a new piece with this title"}</small></span></button></li>
        ${cloudRow}
        <li><button type="button" class="lb-acct-row" id="sc-d-save-file" ${here ? "" : "disabled"}>${icon("download")}<span><b>save this score to a file</b><small>${here ? "the PDF exactly as it was imported" : "the file isn't on this device"}</small></span></button></li>
      </ul>
      <ul class="lb-acct-list">
        <li><button type="button" class="lb-acct-row lb-danger" id="sc-d-delete">${icon("trash")}<span><b>delete this score</b><small>its bookmarks and ink go with it</small></span></button></li>
      </ul>
      <p class="lb-acct-fine">${plural(s.pages, "page")}${s.size ? ` · ${(s.size / 1048576).toFixed(1)} MB` : ""} · added ${esc(new Date(s.addedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))} · ${whereIs(id)}</p>`,
  });
  const { body, close, closed } = sheet;
  let result = {};
  const title = body.querySelector("#sc-d-title"), composer = body.querySelector("#sc-d-composer"), tagsEl = body.querySelector("#sc-d-tags"), err = body.querySelector("#sc-d-err");
  if (finePointer()) title.focus();
  // The tag rail under the field (WSHED-113): the same one-line rail as the library —
  // this score's tags first, the most-used others, "+N more"; the badge or "+N" opens
  // the all-tags sheet on top of this one, so unsaved title/composer edits survive.
  const tagrow = body.querySelector("#sc-d-tagrow");
  const picked = () => parseTags(tagsEl.value);
  const setTags = (list) => { tagsEl.value = list.join(", "); paintRail(); };
  const toggleTag = (t) => { const have = picked(); setTags(have.includes(t) ? have.filter((x) => x !== t) : [...have, t]); };
  const pickTags = () => openTagSheet({ picked, toggle: toggleTag, clear: () => setTags([]), hint: (n) => n ? `${n} on this score` : "tap the tags this score carries" });
  function paintRail() {
    if (!tagrow) return;
    const have = picked();
    tagrow.innerHTML = `
      <button type="button" class="sc-tagbtn ${have.length ? "on" : ""}" id="sc-d-tags-all" aria-label="all tags">${icon("tag")}<span>${tagBadge(tags, have)}</span></button>
      <div class="sc-tagrail" aria-label="tags">${tagRail(tags, have)}</div>`;
    tagrow.querySelector("#sc-d-tags-all").addEventListener("click", pickTags);
    tagrow.querySelector("[data-more]")?.addEventListener("click", pickTags);
    for (const c of tagrow.querySelectorAll("[data-tag]")) c.addEventListener("click", () => { toggleTag(c.dataset.tag); haptic(4); });
  }
  tagsEl.addEventListener("input", paintRail);
  paintRail();
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
  body.querySelector("#sc-d-cloud")?.addEventListener("click", async (e) => {
    if (!save()) return;
    const btn = e.currentTarget, act = btn.dataset.cloud;
    btn.disabled = true;
    try {
      if (act === "remove") { await cloud.remove(id); toast("removed from the cloud"); }
      else if (act === "upload") { const r = await cloud.upload([id]); if (r.done.length) toast("backed up"); else if (r.failed[0]) toast(r.failed[0].message); }
      else if (act === "download") { await cloud.download(id); toast("downloaded"); }
      haptic(10); close();
      result = await openDetails(id, { onPractice });
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });
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

export function mountLibrary(root, { store, setRunning = null }, { open }) {
  let cleanups = [], busy = false, highlightId = null;
  let selecting = false, selected = new Set(), uploading = null; // "upload scores" mode (P3)
  let q = "", sort = store.get("sort", "recent"), group = store.get("group", false), tagFilter = store.get("tags", []);
  if (!SORT_IDS.includes(sort)) sort = "recent";
  root.classList.add("top-anchored");

  const where = (s) => {
    const here = scoreStore.has(s.id), up = cloud.has(s.id), dl = cloud.snapshot().downloads.get(s.id);
    if (dl) return ` · <span class="sc-cloud">downloading ${dl.total ? Math.round((dl.got / dl.total) * 100) : 0}%</span>`;
    if (here && up && cloud.uploaded(s.id)) return ` · <span class="sc-cloud" title="in the cloud">${icon("cloud")}</span>`;
    if (here) return "";
    if (up) return ` · <span class="sc-remote sc-remote-cloud">${icon("download")} in the cloud</span>`;
    return ` · <span class="sc-remote">on another device</span>`;
  };
  const sub = (s) => {
    const goal = s.goalId ? logbook.goal(s.goalId) : null;
    if (selecting) return `${s.composer && !group ? `${esc(s.composer)} · ` : ""}${fmtBytes(s.size ?? 0)}${!scoreStore.has(s.id) ? ` · <span class="sc-remote">not on this device</span>` : cloud.uploaded(s.id) ? ` · <span class="sc-cloud">already in the cloud</span>` : (s.size ?? 0) > MAX_FILE_BYTES ? ` · <span class="sc-remote">over ${fmtQuota(MAX_FILE_BYTES)}</span>` : ""}`;
    if (!scoreStore.has(s.id) && cloud.has(s.id)) return `${s.composer && !group ? `${esc(s.composer)}` : plural(s.pages, "page")}${where(s)}`; // the state is the point of the row; keep it in view on a phone
    return `${s.composer && !group ? `${esc(s.composer)} · ` : ""}${plural(s.pages, "page")}${s.tags.length ? ` · ${s.tags.map(esc).join(", ")}` : ""}${goal ? ` · <span class="sc-goal">${esc(goal.name)}</span>` : ""}${where(s)}`;
  };
  const pickable = (s) => scoreStore.has(s.id) && !cloud.uploaded(s.id) && (s.size ?? 0) <= MAX_FILE_BYTES;
  const row = (s) => selecting ? `
    <li class="sc-row sc-pick ${pickable(s) ? "" : "sc-nopick"} ${selected.has(s.id) ? "sc-on" : ""}" data-id="${s.id}">
      <button type="button" class="sc-open" role="checkbox" aria-checked="${selected.has(s.id)}" ${pickable(s) ? "" : "disabled"} aria-label="${esc(s.title)}">
        <span class="sc-check" aria-hidden="true">${icon("check")}</span>
        <span class="sc-text"><b class="sc-title">${esc(s.title)}</b><small class="sc-sub">${sub(s)}</small></span>
        <span class="sc-thumb sc-thumb-sm" data-thumb="${s.id}" aria-hidden="true">${icon("score")}</span>
      </button>
    </li>` : `
    <li class="sc-row ${scoreStore.has(s.id) ? "" : "remote"} ${s.id === highlightId ? "sc-hl" : ""}" data-id="${s.id}">
      <button type="button" class="sc-open" aria-label="open ${esc(s.title)} — hold for details">
        <span class="sc-thumb" data-thumb="${s.id}" aria-hidden="true">${icon("score")}</span>
        <span class="sc-text"><b class="sc-title">${esc(s.title)}</b><small class="sc-sub">${sub(s)}</small></span>
        <span class="sc-chev" aria-hidden="true">${icon("next")}</span>
      </button>
    </li>`;
  const selBytes = () => [...selected].reduce((n, id) => n + (logbook.score(id)?.size ?? 0), 0);
  const selbar = () => {
    if (uploading) {
      const u = uploading, pct = u.total ? Math.round((u.sent / u.total) * 100) : 0;
      return `<div class="sc-selbar sc-uploading" id="sc-selbar" aria-live="polite">
        <span class="sc-sel-text"><b>uploading ${u.index + 1} of ${u.count}</b><small>${esc(logbook.score(u.id)?.title ?? "")} · ${pct}%</small></span>
        <span class="sc-sel-meter" aria-hidden="true"><i style="width:${pct}%"></i></span>
        <button type="button" class="lb-chip" id="sc-sel-cancel">stop</button>
      </div>`;
    }
    const all = logbook.scores().filter(pickable), allOn = all.length > 0 && all.every((s) => selected.has(s.id));
    const cl = cloud.snapshot();
    return `<div class="sc-selbar" id="sc-selbar">
      <button type="button" class="lb-chip ${allOn ? "on" : ""}" id="sc-sel-all" ${all.length ? "" : "disabled"}>${allOn ? "none" : "select all"}</button>
      <span class="sc-sel-text"><b>${selected.size ? `${selected.size} of ${all.length} picked · ${fmtBytes(selBytes())}` : all.length ? `${plural(all.length, "score")} to back up` : "everything here is in the cloud"}</b><small>tap a score to pick it${all.length && !selected.size ? ", or select all" : ""}</small></span>
      <span class="sc-sel-quota">${fmtQuota(cl.used)} of ${fmtQuota(cl.quota)} used${cl.label ? ` (${cl.label})` : ""}${selected.size && cl.used + selBytes() > cl.quota ? " — <em>that won't fit</em>" : ""}</span>
      <button type="button" class="sc-add" id="sc-sel-go" ${selected.size ? "" : "disabled"}>${icon("cloud")}<span>upload${selected.size ? ` ${selected.size}` : ""}</span></button>
      <button type="button" class="lb-chip" id="sc-sel-cancel">cancel</button>
    </div>`;
  };

  /** The library's all-tags sheet: toggling filters the list behind it. */
  const openFilterSheet = () => openTagSheet({
    picked: () => tagFilter, toggle: toggleTag, clear: () => { tagFilter = []; store.set("tags", tagFilter); render(); },
    hint: (n) => n ? `${n} picked · a score must carry every one` : "pick tags to narrow the list",
  });
  const toggleTag = (t) => { tagFilter = tagFilter.includes(t) ? tagFilter.filter((x) => x !== t) : [...tagFilter, t]; store.set("tags", tagFilter); render(); };

  function render() {
    for (const c of cleanups) c(); cleanups = [];
    const total = logbook.scores().length;
    const allTags = suggestTags(logbook.scores());
    tagFilter = tagFilter.filter((t) => allTags.includes(t));
    const list = logbook.scores({ q, tags: tagFilter, sort });
    const groups = group ? groupByComposer(list) : [{ composer: null, scores: list }];
    const canUpload = cloud.snapshot().signedIn && logbook.scores().some((s) => scoreStore.has(s.id));
    root.innerHTML = `
      <section class="scores ${selecting ? "selecting" : ""}" aria-label="scores">
        <div class="sc-head">
          <div class="lb-sect sc-sect">${selecting ? "upload scores" : "scores"}${total && !selecting ? `<span class="lb-sect-sub">${total}</span>` : ""}</div>
          ${selecting ? "" : `${canUpload ? `<button type="button" class="sc-add sc-add-quiet" id="sc-upload" aria-label="upload scores to your account">${icon("cloud")}<span>upload</span></button>` : ""}
          <button type="button" class="sc-add ${busy ? "busy" : ""}" id="sc-add" ${busy ? "disabled" : ""}>${icon("plus")}<span>${busy ? "adding…" : "score"}</span></button>`}
          <input type="file" id="sc-file" accept="application/pdf,.pdf" multiple hidden aria-label="choose PDF files">
        </div>
        ${selecting ? selbar() : ""}
        ${total && !selecting ? `
        <div class="sc-tools">
          <input class="lb-input lb-search sc-search" id="sc-q" type="search" placeholder="search title, composer, tag…" value="${esc(q)}" autocomplete="off" aria-label="search scores">
          <div class="sc-sortrow">
            <div class="sc-seg" role="radiogroup" aria-label="sort by">
              ${SORT_IDS.map((k) => `<button type="button" class="sc-seg-btn ${sort === k ? "on" : ""}" role="radio" aria-checked="${sort === k}" data-sort="${k}">${SORT_LABELS[k] ?? k}</button>`).join("")}
            </div>
            <button type="button" class="sc-group ${group ? "on" : ""}" aria-pressed="${group}" id="sc-group" title="group by composer">${icon("group")}<span>by composer</span></button>
          </div>
          ${allTags.length ? `<div class="sc-tagrow">
            <button type="button" class="sc-tagbtn ${tagFilter.length ? "on" : ""}" id="sc-tags-all" aria-label="all tags">${icon("tag")}<span>${tagBadge(allTags, tagFilter)}</span></button>
            <div class="sc-tagrail" aria-label="tags">${tagRail(allTags, tagFilter)}</div>
          </div>` : ""}
          ${q || tagFilter.length ? `<p class="sc-count"><span>${list.length === total ? plural(total, "score") : `${list.length} of ${total}`}</span><button type="button" id="sc-clear">clear</button></p>` : ""}
        </div>` : ""}
        ${total === 0
          ? `<p class="lb-empty sc-empty">no scores yet. add a PDF and it lives here — <em>tap the right edge to turn the page, the left to go back</em>.</p>`
          : list.length === 0
            ? `<p class="lb-empty sc-empty">nothing matches.</p>`
            : groups.map((gr) => `${gr.composer !== null ? `<div class="lb-sect sc-groupname">${gr.composer ? esc(gr.composer) : "no composer"}<span class="lb-sect-sub">${gr.scores.length}</span></div>` : ""}<ul class="sc-list">${gr.scores.map(row).join("")}</ul>`).join("")}
      </section>`;
    highlightId = null;
    const input = root.querySelector("#sc-file");
    root.querySelector("#sc-add")?.addEventListener("click", () => input.click());
    root.querySelector("#sc-upload")?.addEventListener("click", () => { selecting = true; selected = new Set(); cloud.refresh().then(() => { if (selecting && !uploading) render(); }); render(); });
    if (selecting) {
      root.querySelector("#sc-sel-cancel")?.addEventListener("click", () => { if (uploading) { cloud.cancelUpload(); return; } selecting = false; selected = new Set(); render(); });
      root.querySelector("#sc-sel-all")?.addEventListener("click", () => {
        const all = logbook.scores().filter(pickable).map((s) => s.id);
        selected = all.every((id) => selected.has(id)) ? new Set() : new Set(all);
        render();
      });
      root.querySelector("#sc-sel-go")?.addEventListener("click", () => runUpload([...selected]));
      for (const li of root.querySelectorAll(".sc-pick")) {
        const id = li.dataset.id, btn = li.querySelector(".sc-open");
        if (btn.disabled) continue;
        btn.addEventListener("click", () => { if (selected.has(id)) selected.delete(id); else selected.add(id); haptic(6); render(); });
        const th = li.querySelector("[data-thumb]");
        thumbUrl(id).then((url) => { if (url && th.isConnected) th.innerHTML = `<img src="${url}" alt="">`; });
      }
      return;
    }
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
    for (const b of root.querySelectorAll(".sc-tagrail [data-tag]")) b.addEventListener("click", () => toggleTag(b.dataset.tag));
    root.querySelector(".sc-tagrail [data-more]")?.addEventListener("click", openFilterSheet);
    root.querySelector("#sc-tags-all")?.addEventListener("click", openFilterSheet);
    root.querySelector("#sc-clear")?.addEventListener("click", () => { q = ""; tagFilter = []; store.set("tags", tagFilter); render(); });
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
  /** Upload the picked scores in library order, keeping the screen awake; the bar shows progress. */
  async function runUpload(ids) {
    if (!ids.length || uploading) return;
    const order = logbook.scores({ sort }).map((s) => s.id).filter((id) => ids.includes(id));
    setRunning?.(true);
    busy = true;
    let r;
    try {
      r = await cloud.upload(order, { onProgress: (u) => { uploading = u; const bar = root.querySelector("#sc-selbar"); if (bar) bar.outerHTML = selbar(); root.querySelector("#sc-sel-cancel")?.addEventListener("click", () => cloud.cancelUpload()); } });
    } catch (e) { r = { done: [], skipped: [], failed: [{ id: ids[0], message: e.message }], stopped: true }; }
    finally { setRunning?.(false); busy = false; uploading = null; }
    const err = cloud.snapshot().error ?? r.failed[0]?.message ?? null;
    if (r.done.length) haptic(12);
    if (r.done.length && !err) { selecting = false; selected = new Set(); toast(r.done.length === 1 ? "1 score backed up" : `${r.done.length} scores backed up`); }
    else if (err) { selected = new Set(r.failed.map((f) => f.id)); toast(err); }
    else { selecting = false; toast("nothing to upload"); }
    render();
  }
  const quiet = () => busy || uploading || document.querySelector(".lb-sheet-wrap:not(.closing)");
  const offLb = logbook.on(() => { if (!quiet()) render(); });
  const offStore = scoreStore.on(() => { if (!busy && !uploading) render(); });
  const offCloud = cloud.on(() => { if (!busy && !uploading && !selecting) render(); });
  const onLib = () => { if (!busy && !uploading) render(); };
  libListeners.add(onLib);
  scoreStore.ready().then(render);
  render();
  return { refresh: render, destroy() { for (const c of cleanups) c(); offLb(); offStore(); offCloud(); libListeners.delete(onLib); root.classList.remove("top-anchored"); } };
}
