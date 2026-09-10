// The reader (docs/SCORES_DESIGN.md §6). Full screen, the page centred on
// black, a top bar that gets out of the way. Tap the right 35 % to turn
// forward, the left 35 % to go back, the middle to show the bar. Swipes and
// the keys page-turn pedals send do the same. A turn never shows a blank
// frame: the last page stays until the next is drawn.
import { logbook } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, toast, openSheet } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";
import { scoreStore } from "../../lib/scores/store.js";
import { open as openPdf } from "../../lib/scores/pdf.js";
import { createPageCache } from "../../lib/scores/pagecache.js";

const TAP_MS = 300, TAP_PX = 10, SWIPE_PX = 60, CHROME_MS = 2000, SPIN_MS = 250;
const ZONE = 0.35; // each edge
const FWD = new Set(["ArrowRight", "ArrowDown", "PageDown", " ", "Spacebar"]);
const BACK = new Set(["ArrowLeft", "ArrowUp", "PageUp"]);

/**
 * Open a score full screen. Resolves to { id, goTo(n), close({ silent }) }
 * once the layer is up (the first page may still be rendering).
 */
export async function openReader({ id, page = null, ctx, onClose }) {
  const s = logbook.score(id);
  if (!s) { toast("that score is gone"); onClose?.(); return null; }
  const blob = await scoreStore.get(id);
  if (!blob) { toast("this score is on another device"); onClose?.(); return null; }
  const { store, setRunning } = ctx;
  const positions = store.get("pos", {});
  let fitPref = store.get("fit", "auto"); // "auto" | "width" | "page"

  const el = document.createElement("div");
  el.className = "sc-reader chrome";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", s.title);
  el.innerHTML = `
    <div class="sc-stage" id="sc-stage"><div class="sc-sheet"><canvas class="sc-page" id="sc-page" width="1" height="1"></canvas></div></div>
    <div class="sc-bar">
      <button type="button" class="sc-bar-btn" id="sc-back" aria-label="back to scores">${icon("back")}</button>
      <div class="sc-bar-title"><b>${esc(s.title)}</b>${s.composer ? `<small>${esc(s.composer)}</small>` : ""}</div>
      <span class="sc-bar-page" id="sc-pageno" aria-live="polite">… / ${s.pages}</span>
      <button type="button" class="sc-bar-btn" id="sc-more" aria-label="more">${icon("more")}</button>
    </div>
    <div class="sc-spin" id="sc-spin" hidden aria-hidden="true"></div>`;
  document.body.append(el);
  const stage = el.querySelector("#sc-stage"), canvas = el.querySelector("#sc-page"), pageNo = el.querySelector("#sc-pageno"), spin = el.querySelector("#sc-spin");
  const cx = canvas.getContext("2d", { alpha: false });
  setRunning?.(true);
  logbook.touchScore(id);

  let doc = null, cache = null, cssW = 0, cssH = 0, current = 0, closed = false, chromeTimer = 0, spinTimer = 0, drawSeq = 0, pageSize = { w: 1, h: 1.414 };

  const showChrome = () => { el.classList.add("chrome"); clearTimeout(chromeTimer); chromeTimer = setTimeout(() => el.classList.remove("chrome"), CHROME_MS); };
  const toggleChrome = () => { if (el.classList.contains("chrome")) { clearTimeout(chromeTimer); el.classList.remove("chrome"); } else showChrome(); };
  showChrome();

  const fit = () => (fitPref !== "auto" ? fitPref : (innerWidth > innerHeight ? "page" : "width"));
  el.dataset.fit = fit();
  function layout() {
    const r = stage.getBoundingClientRect();
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    const ratio = pageSize.w / pageSize.h;
    cssW = fit() === "page" ? Math.min(W, H * ratio) : W;
    cssH = cssW / ratio;
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    el.dataset.fit = fit();
  }
  function rebuildCache() {
    cache?.close();
    cache = createPageCache(doc, { width: cssW, dpr: Math.min(devicePixelRatio || 1, 3) });
  }
  async function draw(n) {
    const seq = ++drawSeq;
    clearTimeout(spinTimer);
    spinTimer = setTimeout(() => { if (seq === drawSeq) spin.hidden = false; }, SPIN_MS);
    try {
      const bmp = await cache.get(n);
      if (closed || seq !== drawSeq) return;
      if (canvas.width !== bmp.width || canvas.height !== bmp.height) { canvas.width = bmp.width; canvas.height = bmp.height; }
      cx.drawImage(bmp, 0, 0);
    } catch (e) {
      if (!closed && seq === drawSeq && e?.message !== "evicted" && e?.message !== "closed") toast(`couldn't draw page ${n}`);
    } finally {
      if (seq === drawSeq) { clearTimeout(spinTimer); spin.hidden = true; }
    }
  }
  function goTo(n, { bump = true } = {}) {
    if (!doc) return;
    const target = Math.max(1, Math.min(doc.pages, Math.round(n) || 1));
    if (target === current) { if (bump && n !== current) { haptic(20); el.classList.remove("sc-bump-l", "sc-bump-r"); void el.offsetWidth; el.classList.add(n > current ? "sc-bump-r" : "sc-bump-l"); } return; }
    current = target;
    pageNo.textContent = `${current} / ${doc.pages}`;
    positions[id] = current; store.set("pos", positions);
    stage.scrollTop = 0;
    draw(current);
  }
  const next = () => goTo(current + 1), prev = () => goTo(current - 1);

  // --- input ------------------------------------------------------------------
  let down = null;
  stage.addEventListener("pointerdown", (e) => { if (e.button && e.button !== 0) return; down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
  stage.addEventListener("pointerup", (e) => {
    if (!down || down.id !== e.pointerId) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y, dt = performance.now() - down.t;
    down = null;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) { dx < 0 ? next() : prev(); return; }
    if (dt > TAP_MS || Math.hypot(dx, dy) > TAP_PX) return;
    const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x >= 1 - ZONE) next(); else if (x <= ZONE) prev(); else toggleChrome();
  });
  stage.addEventListener("pointercancel", () => { down = null; });
  stage.addEventListener("contextmenu", (e) => e.preventDefault());
  const onKey = (e) => {
    if (closed || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (document.querySelector(".lb-sheet-wrap:not(.closing)")) return;
    if (FWD.has(e.key)) { e.preventDefault(); next(); }
    else if (BACK.has(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); goTo(1); }
    else if (e.key === "End") { e.preventDefault(); goTo(doc?.pages ?? 1); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };
  window.addEventListener("keydown", onKey);
  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (closed || !doc) return; layout(); rebuildCache(); draw(current); }, 150); };
  window.addEventListener("resize", onResize);

  el.querySelector("#sc-back").addEventListener("click", () => close());
  el.querySelector("#sc-more").addEventListener("click", () => {
    showChrome();
    const sheet = openSheet({
      title: s.title,
      cls: "lb-acct-wrap sc-more-wrap",
      html: `
        <ul class="lb-acct-list">
          <li><button type="button" class="lb-acct-row" data-fit="${fit() === "width" ? "page" : "width"}">${icon("flip")}<span><b>${fit() === "width" ? "fit the whole page" : "fit the width"}</b><small>${fitPref === "auto" ? "automatic: width in portrait, page in landscape" : `now: fit ${fit()}`}</small></span></button></li>
          <li><button type="button" class="lb-acct-row" data-save="1">${icon("download")}<span><b>save this score to a file</b><small>the PDF exactly as it was imported</small></span></button></li>
        </ul>
        <p class="lb-acct-copy lb-dim">tap the right edge to turn forward, the left to go back; the middle shows the bar. Page-turn pedals and arrow keys work too.</p>`,
    });
    sheet.body.querySelector("[data-fit]").addEventListener("click", (e) => {
      fitPref = e.currentTarget.dataset.fit; store.set("fit", fitPref);
      sheet.close(); layout(); rebuildCache(); draw(current);
    });
    sheet.body.querySelector("[data-save]").addEventListener("click", () => {
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `${s.title}.pdf` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      sheet.close();
    });
  });

  function close({ silent = false } = {}) {
    if (closed) return;
    closed = true;
    clearTimeout(chromeTimer); clearTimeout(spinTimer); clearTimeout(resizeTimer);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    cache?.close(); doc?.close();
    el.remove();
    setRunning?.(false);
    if (!silent) onClose?.();
  }

  // --- open the document ---------------------------------------------------------
  spin.hidden = false;
  try {
    doc = await openPdf(blob);
    if (closed) { doc.close(); return null; }
    pageSize = await doc.size(1);
    layout(); rebuildCache();
    const start = page ?? positions[id] ?? 1;
    goTo(start, { bump: false });
  } catch (e) {
    spin.hidden = true;
    toast(e.message);
    close();
    return null;
  }
  return { id, goTo: (n) => goTo(n, { bump: false }), close };
}
