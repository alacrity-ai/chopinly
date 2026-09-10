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
import { cloud } from "../../lib/scores/cloud.js";
import { open as openPdf } from "../../lib/scores/pdf.js";
import { createPageCache, trimPages, MAX_RENDER_PX, IOS, releaseCanvas } from "../../lib/scores/pagecache.js";
import { openMarks, paintMarkButton } from "./marks.js";
import { openDetails, practiceScore, saveScoreFile, storeThumb, hasThumb } from "./library.js";
import { createInkLayer } from "./inkbar.js";

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
  let blob = await scoreStore.get(id);
  if (!blob && cloud.has(id)) {
    // the file is in the account's cloud space: fetch it into this device's store first (P3)
    toast(`downloading ${s.title}…`);
    let lastPct = -1;
    try { blob = await cloud.download(id, { onProgress: (got, total) => { const pct = total ? Math.round((got / total) * 100) : 0; if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; toast(`downloading ${s.title}… ${pct}%`); } } }); }
    catch (e) { toast(e.message); onClose?.(); return null; }
  }
  if (!blob) { toast(cloud.snapshot().signedIn ? "this score is on another device — upload it there to open it here" : "this score is on another device"); onClose?.(); return null; }
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
      <div class="sc-bar-title"><b>${esc(s.title)}</b><small id="sc-bar-sub">${esc(s.composer ?? "")}</small></div>
      <span class="sc-bar-page" id="sc-pageno" aria-live="polite">… / ${s.pages}</span>
      <button type="button" class="sc-bar-btn sc-mark-btn" id="sc-mark" aria-label="bookmarks">${icon("bookmark")}</button>
      <button type="button" class="sc-bar-btn sc-ink-toggle" id="sc-ink" aria-label="ink" aria-pressed="false">${icon("pencil")}</button>
      <button type="button" class="sc-bar-btn" id="sc-more" aria-label="more">${icon("more")}</button>
    </div>
    <div id="sc-inkbar" hidden></div>
    <div class="sc-spin" id="sc-spin" hidden aria-hidden="true"></div>`;
  document.body.append(el);
  const stage = el.querySelector("#sc-stage"), canvas = el.querySelector("#sc-page"), pageNo = el.querySelector("#sc-pageno"), spin = el.querySelector("#sc-spin");
  const markBtn = el.querySelector("#sc-mark"), barSub = el.querySelector("#sc-bar-sub");
  let doc = null, cache = null, cssW = 0, cssH = 0, current = 0, closed = false, chromeTimer = 0, spinTimer = 0, drawSeq = 0, pageSize = { w: 1, h: 1.414 };
  // "● practicing" on the bar when the clock runs on this score's goal
  const paintLive = () => {
    const cur = logbook.score(id), run = logbook.running();
    const live = !!(cur?.goalId && run?.goal.id === cur.goalId);
    el.classList.toggle("live", live);
    barSub.innerHTML = live ? `<i class="sc-live-dot" aria-hidden="true"></i>practicing` : esc(cur?.composer ?? "");
    const t = el.querySelector(".sc-bar-title b"); if (t && cur) t.textContent = cur.title;
    if (current) paintMarkButton(markBtn, id, current);
  };
  const offLb = logbook.on(() => { if (!closed) paintLive(); });
  paintLive();
  const cx = canvas.getContext("2d", { alpha: false });
  setRunning?.(true);
  logbook.touchScore(id);

  // Ink (P2): the overlay + tool bar. While ink is on the bars stay put (no auto-hide).
  const inkBtn = el.querySelector("#sc-ink");
  let inkPage = 0;
  const ink = createInkLayer({
    sheet: el.querySelector(".sc-sheet"), bar: el.querySelector("#sc-inkbar"), scoreId: id, store,
    onTap: (x, y) => tapAt(x, y),
    onModeChange: (on) => { el.classList.toggle("inking", on); inkBtn.classList.toggle("on", on); inkBtn.setAttribute("aria-pressed", String(on)); if (on) { clearTimeout(chromeTimer); el.classList.add("chrome"); } else showChrome(); },
  });
  const showChrome = () => { el.classList.add("chrome"); clearTimeout(chromeTimer); if (!ink.on) chromeTimer = setTimeout(() => el.classList.remove("chrome"), CHROME_MS); };
  const toggleChrome = () => { if (ink.on) return; if (el.classList.contains("chrome")) { clearTimeout(chromeTimer); el.classList.remove("chrome"); } else showChrome(); };
  showChrome();
  /** A tap at a viewport point: the edges turn, the middle shows the bar. Shared with the ink layer. */
  function tapAt(clientX) {
    const r = stage.getBoundingClientRect(), x = (clientX - r.left) / r.width;
    if (x >= 1 - ZONE) next(); else if (x <= ZONE) prev(); else toggleChrome();
  }

  const fit = () => (fitPref !== "auto" ? fitPref : (innerWidth > innerHeight ? "page" : "width"));
  el.dataset.fit = fit();
  function layout() {
    const r = stage.getBoundingClientRect();
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    const ratio = pageSize.w / pageSize.h;
    cssW = fit() === "page" ? Math.min(W, H * ratio) : W;
    cssH = cssW / ratio;
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    ink.size(cssW, cssH, renderDpr());
    el.dataset.fit = fit();
  }
  /** Device pixels per CSS pixel for page renders: the screen's, capped so a bitmap stays under MAX_RENDER_PX wide (WSHED-109). */
  const renderDpr = () => Math.min(devicePixelRatio || 1, IOS ? 2 : 3, Math.max(1, MAX_RENDER_PX / Math.max(1, cssW)));
  function rebuildCache() {
    cache?.close();
    cache = createPageCache(doc, { width: cssW, dpr: renderDpr(), scoreId: id, persist: "auto", size: s.size });
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
      if (inkPage !== n) { inkPage = n; ink.load(n); } // ink and page on the same frame
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
    paintMarkButton(markBtn, id, current);
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
    tapAt(e.clientX);
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
  inkBtn.addEventListener("click", () => ink.toggle());
  markBtn.addEventListener("click", () => { showChrome(); openMarks({ scoreId: id, page: current, goTo: (n) => goTo(n, { bump: false }) }).then(() => { if (!closed) paintMarkButton(markBtn, id, current); }); });
  el.querySelector("#sc-more").addEventListener("click", () => {
    showChrome();
    const cur = logbook.score(id) ?? s;
    const goal = cur.goalId ? logbook.goal(cur.goalId) : null;
    const sheet = openSheet({
      title: cur.title,
      cls: "lb-acct-wrap sc-more-wrap",
      html: `
        <ul class="lb-acct-list">
          <li><button type="button" class="lb-acct-row" data-practice="1">${icon("play")}<span><b>practice this</b><small>${goal ? `start the clock on ${esc(goal.name)}` : "starts the clock on a new piece with this title"}</small></span></button></li>
          <li><button type="button" class="lb-acct-row" data-details="1">${icon("log")}<span><b>details</b><small>title, composer, tags, goal</small></span></button></li>
        </ul>
        <ul class="lb-acct-list">
          <li><button type="button" class="lb-acct-row" data-fit="${fit() === "width" ? "page" : "width"}">${icon("flip")}<span><b>${fit() === "width" ? "fit the whole page" : "fit the width"}</b><small>${fitPref === "auto" ? "automatic: width in portrait, page in landscape" : `now: fit ${fit()}`}</small></span></button></li>
          <li><button type="button" class="lb-acct-row" data-save="1">${icon("download")}<span><b>save this score to a file</b><small>the PDF exactly as it was imported</small></span></button></li>
        </ul>
        <p class="lb-acct-copy lb-dim">tap the right edge to turn forward, the left to go back; the middle shows the bar. Page-turn pedals and arrow keys work too.</p>`,
    });
    sheet.body.querySelector("[data-practice]").addEventListener("click", () => { try { practiceScore(id); sheet.close(); } catch (e) { toast(e.message); } });
    sheet.body.querySelector("[data-details]").addEventListener("click", async () => { sheet.close(); const r = await openDetails(id); if (r?.deleted) close(); });
    sheet.body.querySelector("[data-fit]").addEventListener("click", (e) => {
      fitPref = e.currentTarget.dataset.fit; store.set("fit", fitPref);
      sheet.close(); layout(); rebuildCache(); draw(current);
    });
    sheet.body.querySelector("[data-save]").addEventListener("click", () => { saveScoreFile(id); sheet.close(); });
  });

  function close({ silent = false } = {}) {
    if (closed) return;
    closed = true;
    clearTimeout(chromeTimer); clearTimeout(spinTimer); clearTimeout(resizeTimer);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    offLb();
    ink.destroy();
    cache?.close(); doc?.close();
    releaseCanvas(canvas); // WSHED-109: WebKit keeps a detached canvas's backing store until GC — give the 24 MB back now
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
    // a file that arrived by download has no thumbnail yet: make it from this document rather than opening the PDF again in the library (WSHED-109)
    hasThumb(id).then((have) => { if (!have && !closed) storeThumb(doc, id).catch(() => {}); });
    layout(); rebuildCache();
    const start = page ?? positions[id] ?? 1;
    goTo(start, { bump: false });
    // keep the rendered-page store under budget: least recently opened scores go first, never this one
    setTimeout(() => { if (closed) return; const order = logbook.scores({ sort: "recent" }).map((x) => x.id).filter((x) => x !== id).reverse(); trimPages(order).catch(() => {}); }, 4000);
  } catch (e) {
    spin.hidden = true;
    toast(e.message);
    close();
    return null;
  }
  return { id, goTo: (n) => goTo(n, { bump: false }), close };
}
