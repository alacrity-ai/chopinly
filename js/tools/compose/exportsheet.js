// The export sheet (docs/COMPOSE_DESIGN.md §10.1, WSHED-121): staff size − / + like the editor's
// zoom, page (Letter / A4), margins, header, a live preview of page 1 — the same SVG the screen
// draws, scaled onto a page — and two ways out: Save PDF (the share sheet with a file where there is
// one, a download elsewhere) and Add to Scores (the bytes go through the Scores importer; a later
// send replaces the linked score's file in place). Choices are remembered per device.
import { logbook } from "../../lib/logbook.js";
import { makeStore } from "../../lib/store.js";
import { icon } from "../../lib/icons.js";
import { esc, toast, openSheet, plural } from "../logbook/util.js";
import { haptic, stamp } from "../logbook/motion.js";
import { renderComposition } from "../../lib/compose/render.js";
import { planPages, renderPdf, exportOptions, PAGES, STAFF_MM, MARGINS } from "../../lib/compose/export/pdf.js";
import { loadPdfLib } from "../../lib/compose/export/pdflib.js";
import { importFile } from "../scores/library.js";

const store = makeStore("compose");
const SVG = "http://www.w3.org/2000/svg";
const TITLE_PT = 20, COMPOSER_PT = 12; // as export/pdf.js draws them
/** "Composer – Title.pdf" with nothing a file system minds. */
export const pdfFileName = (c) => {
  const raw = [c.composer, c.title].filter(Boolean).join(" – ");
  const clean = raw.replace(/[\\/:*?"<>|]+/g, "-").replace(/[^\P{Cc}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return `${clean || "composition"}.pdf`;
};

export function openExportSheet({ id, doc, primary = "export-pdf" }) {
  const c = logbook.composition(id);
  if (!c) { toast("that composition is gone"); return Promise.resolve(); }
  let opts = exportOptions(store.get("export", {}));
  const linked = () => (c.scoreId && logbook.score(c.scoreId)) || null;
  const sheet = openSheet({
    title: "export",
    cls: "lb-acct-wrap cp-export-wrap",
    html: `<div class="cp-export-grid">
      <div class="cp-export-preview"><div class="cp-paper" id="cp-x-paper" aria-label="page 1 preview"></div></div>
      <div class="cp-export-controls">
      <div class="cp-export-row"><span class="cp-export-label">size</span>
        <span class="cp-export-seg cp-export-size"><button type="button" class="cp-btn cp-sq" id="cp-x-smaller" aria-label="smaller staff">−</button><output id="cp-x-size" aria-live="polite"></output><button type="button" class="cp-btn cp-sq" id="cp-x-larger" aria-label="larger staff">+</button></span></div>
      <div class="cp-export-row"><span class="cp-export-label">page</span>
        <span class="cp-export-seg" role="group" aria-label="page size">${Object.entries(PAGES).map(([k, p]) => `<button type="button" class="cp-btn cp-seg" data-page="${k}">${p.label}</button>`).join("")}</span></div>
      <div class="cp-export-row"><span class="cp-export-label">margins</span>
        <span class="cp-export-seg" role="group" aria-label="margins">${Object.keys(MARGINS).map((k) => `<button type="button" class="cp-btn cp-seg" data-margins="${k}">${k}</button>`).join("")}</span></div>
      <div class="cp-export-row"><span class="cp-export-label">header</span>
        <label class="cp-export-toggle"><input type="checkbox" id="cp-x-header"><span>title, composer, page numbers</span></label></div>
      <ul class="lb-acct-list cp-export-actions">
        <li><button type="button" class="lb-acct-row${primary === "export-pdf" ? " cp-export-primary" : ""}" id="cp-x-save">${icon("download")}<span><b>Save PDF</b><small id="cp-x-save-hint">${navigator.canShare ? "save to this device, or share it" : "downloads the file"}</small></span></button></li>
        <li><button type="button" class="lb-acct-row${primary === "save-pdf" ? " cp-export-primary" : ""}" id="cp-x-scores">${icon("score")}<span><b id="cp-x-scores-label">${linked() ? "Update in Scores" : "Add to Scores"}</b><small id="cp-x-scores-hint">${linked() ? `replaces the file of “${esc(linked().title)}”; bookmarks and brushes stay` : "the piece appears in your library, ready to read and practise"}</small></span></button></li>
      </ul>
      <p class="lb-acct-fine" id="cp-x-fine"></p>
      </div></div>`,
  });
  const { body, close, closed } = sheet;
  const $ = (sel) => body.querySelector(sel);
  const paper = $("#cp-x-paper");
  let plan = null, busy = false;

  /** Page 1 as the screen's own SVG on a page: the engraver at the print S, the header as text. */
  function preview() {
    plan = planPages(doc, opts);
    const { page: pg, margin: m, S, L } = plan, p0 = plan.pages[0];
    const tmp = document.createElement("div");
    const R = renderComposition(tmp, L);
    const score = R.svg;
    for (const a of ["width", "height"]) score.removeAttribute(a);
    score.setAttribute("x", m); score.setAttribute("y", m + p0.dy * S); score.setAttribute("width", L.width); score.setAttribute("height", L.height);
    const page = document.createElementNS(SVG, "svg");
    page.setAttribute("class", "cp-page"); page.setAttribute("viewBox", `0 0 ${pg.w} ${pg.h}`); page.setAttribute("role", "img");
    const clipId = `cp-x-clip-${id.replace(/[^a-z0-9]/gi, "")}`;
    page.innerHTML = `<defs><clipPath id="${clipId}"><rect x="${m}" y="${m}" width="${plan.width}" height="${plan.height}"/></clipPath></defs><rect class="cp-page-bg" x="0" y="0" width="${pg.w}" height="${pg.h}"/>`;
    if (opts.header) {
      const t = document.createElementNS(SVG, "text");
      t.setAttribute("class", "cp-page-text"); t.setAttribute("x", pg.w / 2); t.setAttribute("y", m + TITLE_PT); t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", TITLE_PT); t.textContent = c.title || "Untitled";
      page.append(t);
      if (c.composer) { const k = document.createElementNS(SVG, "text"); k.setAttribute("class", "cp-page-text it"); k.setAttribute("x", pg.w - m); k.setAttribute("y", m + TITLE_PT + COMPOSER_PT + 8); k.setAttribute("text-anchor", "end"); k.setAttribute("font-size", COMPOSER_PT); k.textContent = c.composer; page.append(k); }
    }
    const g = document.createElementNS(SVG, "g"); g.setAttribute("clip-path", `url(#${clipId})`); g.append(score); page.append(g);
    paper.replaceChildren(page);
    const n = plan.pages.length;
    $("#cp-x-size").textContent = `staff ${(opts.staffMm * 4).toFixed(1)} mm · ${plural(n, "page")}`;
    $("#cp-x-smaller").disabled = STAFF_MM.indexOf(opts.staffMm) === 0;
    $("#cp-x-larger").disabled = STAFF_MM.indexOf(opts.staffMm) === STAFF_MM.length - 1;
    for (const b of body.querySelectorAll("[data-page]")) b.setAttribute("aria-pressed", String(b.dataset.page === opts.page));
    for (const b of body.querySelectorAll("[data-margins]")) b.setAttribute("aria-pressed", String(b.dataset.margins === opts.margins));
    $("#cp-x-header").checked = opts.header;
    $("#cp-x-fine").textContent = `${PAGES[opts.page].label} · ${opts.margins} margins (${MARGINS[opts.margins]} mm) · ${plural(plan.doc.measures.length, "bar")} on ${plural(plan.L.systems.length, "system")}`;
  }
  const set = (patch) => { opts = exportOptions({ ...opts, ...patch }); store.set("export", opts); haptic(3); preview(); };
  $("#cp-x-smaller").addEventListener("click", () => set({ staffMm: STAFF_MM[Math.max(0, STAFF_MM.indexOf(opts.staffMm) - 1)] }));
  $("#cp-x-larger").addEventListener("click", () => set({ staffMm: STAFF_MM[Math.min(STAFF_MM.length - 1, STAFF_MM.indexOf(opts.staffMm) + 1)] }));
  for (const b of body.querySelectorAll("[data-page]")) b.addEventListener("click", () => set({ page: b.dataset.page }));
  for (const b of body.querySelectorAll("[data-margins]")) b.addEventListener("click", () => set({ margins: b.dataset.margins }));
  $("#cp-x-header").addEventListener("change", (e) => set({ header: e.target.checked }));

  /** The PDF of the current plan as a File. */
  async function pdfFile() {
    const libs = await loadPdfLib();
    const bytes = await renderPdf(plan, libs, { title: c.title, composer: c.composer ?? "" });
    return new File([bytes], pdfFileName(c), { type: "application/pdf" });
  }
  async function run(hintSel, work) {
    if (busy) return;
    busy = true;
    const hint = $(hintSel), was = hint.textContent;
    for (const b of body.querySelectorAll(".cp-export-actions button")) b.disabled = true;
    hint.textContent = "preparing the PDF…";
    try { await work(); }
    catch (e) { console.error(e); toast(e.message || "the export failed"); hint.textContent = was; }
    finally { busy = false; for (const b of body.querySelectorAll(".cp-export-actions button")) b.disabled = false; }
  }
  /** A plain download: the browser's Downloads (Files on an iPad). */
  const download = (file) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a"); a.href = url; a.download = file.name; a.rel = "noopener"; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  /** Where a share sheet exists, ask: save to the device or share. Resolves "device" | "share" | null (dismissed). */
  const chooseWay = (file) => new Promise((resolve) => {
    let picked = null;
    const s = openSheet({ title: "save PDF", cls: "lb-acct-wrap cp-saveway-wrap", html: `
      <ul class="lb-acct-list">
        <li><button type="button" class="lb-acct-row" id="cp-x-way-device">${icon("download")}<span><b>Save to device</b><small>${esc(file.name)} → Downloads / Files</small></span></button></li>
        <li><button type="button" class="lb-acct-row" id="cp-x-way-share">${icon("share")}<span><b>Share…</b><small>AirDrop, Mail, Files, another app</small></span></button></li>
      </ul>` });
    s.body.querySelector("#cp-x-way-device").addEventListener("click", () => { picked = "device"; s.close(); });
    s.body.querySelector("#cp-x-way-share").addEventListener("click", () => { picked = "share"; s.close(); });
    s.closed.then(() => resolve(picked));
  });
  $("#cp-x-save").addEventListener("click", () => run("#cp-x-save-hint", async () => {
    const file = await pdfFile();
    const canShare = !!navigator.canShare?.({ files: [file] });
    const idle = canShare ? "save to this device, or share it" : "downloads the file";
    $("#cp-x-save-hint").textContent = idle;
    const way = canShare ? await chooseWay(file) : "device";
    if (way === "share") {
      try { await navigator.share({ files: [file], title: c.title }); haptic(8); $("#cp-x-save-hint").textContent = "shared"; }
      catch (e) { if (e.name !== "AbortError") throw e; }
      return;
    }
    if (way !== "device") return; // dismissed
    download(file);
    haptic(8); stamp($("#cp-x-save")); $("#cp-x-save-hint").textContent = `saved as ${file.name}`;
  }));
  $("#cp-x-scores").addEventListener("click", (e) => {
    const b = e.currentTarget;
    if (b.dataset.open) { close(); location.hash = `#/scores/${encodeURIComponent(b.dataset.open)}`; return; } // the row became the way there
    run("#cp-x-scores-hint", async () => {
      const file = await pdfFile();
      const target = linked();
      const { score, existing, replaced } = await importFile(file, { title: c.title, composer: c.composer ?? "", tags: [...new Set([...(c.tags ?? []), "compose"])], replace: target?.id ?? null });
      logbook.updateComposition(id, { scoreId: score.id });
      haptic(8); stamp(b);
      toast(existing ? "already in your scores" : replaced ? "updated in Scores" : "added to Scores");
      $("#cp-x-scores-label").textContent = "Open in Scores";
      $("#cp-x-scores-hint").textContent = `“${score.title}” · ${plural(score.pages, "page")}`;
      b.dataset.open = score.id;
    });
  });
  preview();
  return closed;
}
