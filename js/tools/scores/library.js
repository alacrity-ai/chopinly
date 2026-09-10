// The library (docs/SCORES_DESIGN.md §8, P0 cut): import PDFs, list them,
// open one. Rows read title over composer · pages; hold a row to delete.
// P1 adds search, sort, groups, tags, thumbnails and the metadata sheet.
import { logbook } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, toast, longPress, plural } from "../logbook/util.js";
import { haptic, stamp } from "../logbook/motion.js";
import { scoreStore } from "../../lib/scores/store.js";
import { open as openPdf } from "../../lib/scores/pdf.js";

/** Import limits (design §12). */
export const MAX_FILE_BYTES = 60 * 1024 * 1024;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(blob) {
  try { return hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())); } catch { return ""; }
}
const stripExt = (name) => String(name ?? "").replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
/** A PDF Author that reads like a person's name — not a program, not an address. */
const looksLikeName = (a) => /^[\p{L}][\p{L}' .,-]{1,60}$/u.test(a) && !/\d|@|\b(inc|ltd|llc|gmbh|software|finale|sibelius|musescore|dorico|lilypond|adobe|microsoft|apple)\b/i.test(a);

/**
 * Import one file: parse, hash, store, register. Resolves to
 * { score, existing: bool } — `existing` when the same bytes were already here.
 */
export async function importFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is over 60 MB — Chopinly keeps scores under that`);
  if (file.type && file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) throw new Error(`${file.name} isn't a PDF`);
  const hash = await sha256(file);
  const dup = hash ? logbook.scoreByHash(hash) : null;
  if (dup) {
    if (!scoreStore.has(dup.id)) await scoreStore.put(dup.id, file, { sha256: hash }); // the row was here, the file was not (another device's score)
    return { score: dup, existing: true };
  }
  const doc = await openPdf(file);
  const pages = doc.pages, info = doc.info;
  doc.close();
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await scoreStore.put(id, file, { sha256: hash });
  const score = logbook.addScore({ id, title: info.title || stripExt(file.name) || "untitled score", composer: looksLikeName(info.author) ? info.author : "", pages, size: file.size, sha256: hash });
  return { score, existing: false };
}

export function mountLibrary(root, { store }, { open }) {
  let cleanups = [], busy = false, highlightId = null;
  root.classList.add("top-anchored");

  const sub = (s) => {
    const here = scoreStore.has(s.id);
    return `${s.composer ? `${esc(s.composer)} · ` : ""}${plural(s.pages, "page")}${here ? "" : ` · <span class="sc-remote">on another device</span>`}`;
  };
  const row = (s) => `
    <li class="sc-row ${scoreStore.has(s.id) ? "" : "remote"} ${s.id === highlightId ? "sc-hl" : ""}" data-id="${s.id}">
      <button type="button" class="sc-open" aria-label="open ${esc(s.title)}">
        <span class="sc-thumb" aria-hidden="true">${icon("score")}</span>
        <span class="sc-text"><b class="sc-title">${esc(s.title)}</b><small class="sc-sub">${sub(s)}</small></span>
        <span class="sc-chev" aria-hidden="true">${icon("next")}</span>
      </button>
    </li>`;

  function render() {
    for (const c of cleanups) c(); cleanups = [];
    const all = logbook.scores({ sort: "recent" });
    root.innerHTML = `
      <section class="scores" aria-label="scores">
        <div class="sc-head">
          <div class="lb-sect sc-sect">scores${all.length ? `<span class="lb-sect-sub">${all.length}</span>` : ""}</div>
          <button type="button" class="sc-add ${busy ? "busy" : ""}" id="sc-add" ${busy ? "disabled" : ""}>${icon("plus")}<span>${busy ? "adding…" : "score"}</span></button>
          <input type="file" id="sc-file" accept="application/pdf,.pdf" multiple hidden aria-label="choose PDF files">
        </div>
        ${all.length
          ? `<ul class="sc-list" id="sc-list">${all.map(row).join("")}</ul>`
          : `<p class="lb-empty sc-empty">no scores yet. add a PDF and it lives here — <em>tap the right edge to turn the page, the left to go back</em>.</p>`}
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
      busy = false; highlightId = lastId; render();
      if (added) { haptic(12); toast(added === 1 ? "added" : `added ${added} scores`); }
      const el = root.querySelector(`.sc-row[data-id="${lastId}"]`);
      if (el) { el.scrollIntoView({ block: "nearest" }); stamp(el); }
    });
    for (const li of root.querySelectorAll(".sc-row")) {
      const id = li.dataset.id;
      longPress(li.querySelector(".sc-open"), () => open(id), async () => {
        const s = logbook.score(id);
        if (!s || !confirm(`Delete “${s.title}” from this device?`)) return;
        haptic(20);
        await scoreStore.del(id);
        logbook.removeScore(id);
        toast("deleted");
      });
    }
  }
  const offLb = logbook.on(() => { if (!busy) render(); });
  const offStore = scoreStore.on(() => { if (!busy) render(); });
  scoreStore.ready().then(render);
  render();
  return { refresh: render, destroy() { for (const c of cleanups) c(); offLb(); offStore(); root.classList.remove("top-anchored"); } };
}
