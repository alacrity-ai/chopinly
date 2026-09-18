// The Layout step (docs/COMPOSE_LAYOUT_DESIGN.md §4, WSHED-156): the export plan's own pages, full screen, with
// the piece's layout pins edited on the paper — tap a barline to break or keep a row, drag it to give the bar
// more or less of its row, tap a row's tab to lock it. One pointer path: a finger, a Pencil and a mouse do the
// same thing. A barline is a hair wide; its handle is a fingertip wide (HANDLE_PX) and the height of the system.
// Marks and handles live beside the page's SVG, never in paint.js, so they cannot print.
import { icon } from "../../lib/icons.js";
import { toast, plural } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";
import { renderPage } from "../../lib/compose/render.js";
import { planPages } from "../../lib/compose/export/pdf.js";
import { PIN_FLOOR } from "../../lib/compose/layout.js";
import { setBreak, setWeight, lockRow, releaseBars, clearPins, pinCount, pinSummary, rowLocked, weightFor, scalesWith, roundWeight } from "../../lib/compose/pins.js";

const SVG = "http://www.w3.org/2000/svg";
const TITLE_PT = 20, COMPOSER_PT = 12, RUN_PT = 9; // as export/pdf.js draws them
export const HANDLE_PX = 44; // a barline's target: a fingertip, narrowed only so two never overlap
const HANDLE_SHARE = 0.45;   // of the narrower neighbouring bar
const TAP_PX = 6;            // travel past this is a drag
const ZOOMS = [1, 1.5, 2, 3], FIT_MAX = 1100, KEY_STEP = 0.05;
const svgEl = (name, attrs = {}) => { const n = document.createElementNS(SVG, name); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

/** Page k of a plan as the paper will carry it (the export sheet's preview and this view share it): the plan's systems through the screen painter, the header as text, nothing clipped short of the page's edge. */
export function planPageSvg(plan, k, { title = "", composer = "" } = {}) {
  const { page: pg, margin: m, S, L } = plan, pk = plan.pages[k], n = plan.pages.length;
  const score = renderPage(L, (y) => plan.pageAt(y) === k);
  for (const a of ["width", "height"]) score.removeAttribute(a);
  score.setAttribute("x", m); score.setAttribute("y", m + pk.dy * S); score.setAttribute("width", L.width); score.setAttribute("height", L.height); score.setAttribute("overflow", "visible");
  const page = svgEl("svg", { class: "cp-page", viewBox: `0 0 ${pg.w} ${pg.h}`, role: "img", "aria-label": `page ${k + 1} of ${n}` });
  page.innerHTML = `<rect class="cp-page-bg" x="0" y="0" width="${pg.w}" height="${pg.h}"/>`;
  const words = (x, y, str, cls, size, anchor) => { const t = svgEl("text", { class: cls, x, y, "text-anchor": anchor, "font-size": size }); t.textContent = str; page.append(t); };
  if (plan.opts.header) {
    const t = title || "Untitled";
    if (k === 0) { words(pg.w / 2, m + TITLE_PT, t, "cp-page-text", TITLE_PT, "middle"); if (composer) words(pg.w - m, m + TITLE_PT + COMPOSER_PT + 8, composer, "cp-page-text it", COMPOSER_PT, "end"); }
    else { words(m, m + RUN_PT, t, "cp-page-text it", RUN_PT, "start"); words(pg.w - m, m + RUN_PT, String(k + 1), "cp-page-text", RUN_PT, "end"); }
  }
  page.append(score);
  return page;
}

/**
 * Open the view over whatever is on screen. Resolves when it closes: the document with its pins when
 * anything changed, else null.
 */
export function openLayoutView({ doc: initial, opts, title = "", composer = "" }) {
  let doc = initial, plan = null, zoom = 0, closed = false, menu = null, drag = null, raf = 0;
  const past = [], future = [];
  const root = document.createElement("div");
  root.className = "cp-lay"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "layout");
  root.innerHTML = `
    <header class="cp-lay-bar">
      <button type="button" class="cp-btn cp-lay-done" data-lay="done">${icon("check")}<span>Done</span></button>
      <span class="cp-lay-seg"><button type="button" class="cp-btn cp-sq" data-lay="undo" aria-label="undo">${icon("undo")}</button><button type="button" class="cp-btn cp-sq" data-lay="redo" aria-label="redo">${icon("redo")}</button></span>
      <output class="cp-lay-status" aria-live="polite"></output>
      <span class="cp-lay-seg"><button type="button" class="cp-btn cp-sq" data-lay="out" aria-label="zoom out">−</button><button type="button" class="cp-btn cp-sq" data-lay="in" aria-label="zoom in">+</button></span>
      <button type="button" class="cp-btn" data-lay="reset">Reset</button>
    </header>
    <p class="cp-lay-hint">Tap a barline to break or keep a row · drag it to resize the bar · tap a row’s tab to lock it</p>
    <div class="cp-lay-scroll"><div class="cp-lay-pages"></div></div>`;
  const $ = (sel) => root.querySelector(sel);
  const scroll = $(".cp-lay-scroll"), pagesEl = $(".cp-lay-pages");
  const wraps = [];          // per page: { wrap, hits } — they persist, so a handle being dragged is never torn out from under the pointer
  const handles = new Map(); // bar index → its barline's handle button, reused across renders for the same reason
  let resolve;
  const result = new Promise((r) => { resolve = r; });

  // --- geometry: layout S → page points → the page's own percentages ---
  const rowsOf = () => plan.L.hit.systems;
  const rowOfBar = (b) => { const i = rowsOf().findIndex((r) => r.bars.some((hb) => hb.index === b)); return i < 0 ? null : { i, row: rowsOf()[i], k: rowsOf()[i].bars.findIndex((hb) => hb.index === b) }; };
  const tightKeys = (p) => new Set(p.tight.map((i) => p.L.hit.systems[i].bars[0].index)); // a tight row is known by its first bar: row numbers shift as breaks move
  const pagePx = () => Math.min(FIT_MAX, Math.max(240, scroll.clientWidth - 24)) * ZOOMS[zoom];
  const xPt = (xs) => plan.margin + xs * plan.S;
  const yPt = (sys, ys) => plan.margin + (plan.pages[plan.pageOf(sys)].dy + ys) * plan.S;
  const place = (node, x0, y0, x1, y1) => { const { w, h } = plan.page; node.style.left = `${(x0 / w) * 100}%`; node.style.top = `${(y0 / h) * 100}%`; node.style.width = `${((x1 - x0) / w) * 100}%`; node.style.height = `${((y1 - y0) / h) * 100}%`; };

  // --- edits: tried on a copy; a row that would not fit refuses, and nothing changes ---
  function attempt(next, { row = null, sayNo = "those bars do not fit on one row" } = {}) {
    if (next === doc) return false;
    const p = planPages(next, opts), was = tightKeys(plan), fresh = [...tightKeys(p)].filter((b) => !was.has(b));
    if (fresh.length) { flash(row); toast(sayNo); haptic(12); return false; }
    past.push(doc); future.length = 0; doc = next; plan = p; haptic(4); render();
    return true;
  }
  function flash(rowIndex) {
    const i = rowIndex ?? 0, r = rowsOf()[i]; if (!r) return;
    const f = document.createElement("div"); f.className = "cp-lay-flash";
    place(f, 0, yPt(i, r.top), plan.page.w, yPt(i, r.bottom));
    wraps[plan.pageOf(i)].hits.append(f); setTimeout(() => f.remove(), 520);
  }

  // --- the menu: real buttons at the pointer, a fingertip tall ---
  function closeMenu() { menu?.remove(); menu = null; }
  function openMenu(x, y, heading, items) {
    closeMenu();
    if (!items.length) return;
    menu = document.createElement("div"); menu.className = "cp-more cp-menu cp-lay-menu"; menu.setAttribute("role", "menu");
    const h = document.createElement("p"); h.className = "cp-lay-menu-head"; h.textContent = heading; menu.append(h);
    for (const it of items) {
      const b = document.createElement("button"); b.type = "button"; b.className = "cp-btn cp-menu-row"; b.setAttribute("role", "menuitem"); b.dataset.item = it.id; b.textContent = it.label;
      b.addEventListener("click", () => { closeMenu(); it.run(); });
      menu.append(b);
    }
    root.append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(innerWidth - r.width - 8, x - r.width / 2))}px`;
    menu.style.top = `${Math.max(8, Math.min(innerHeight - r.height - 8, y + 14))}px`;
  }
  function barlineMenu(b, x, y) {
    const at = rowOfBar(b); if (!at) return;
    const hb = at.row.bars[at.k], last = b === plan.doc.measures.length - 1, items = [];
    if (hb.brk === "break") items.push({ id: "unbreak", label: "Remove the break", run: () => attempt(setBreak(doc, b, null), { row: at.i }) });
    else if (hb.brk === "keep") items.push({ id: "unkeep", label: "Remove the keep", run: () => attempt(setBreak(doc, b, null), { row: at.i }) });
    else if (!last) {
      items.push({ id: "break", label: "Break the row here", run: () => attempt(setBreak(doc, b, "break"), { row: at.i }) });
      items.push({ id: "keep", label: `Keep bars ${b + 1} and ${b + 2} together`, run: () => attempt(setBreak(doc, b, "keep"), { row: at.i, sayNo: `bar ${b + 2} does not fit on this row` }) });
    }
    if (hb.weight !== 1) items.push({ id: "unweight", label: `Reset bar ${b + 1}’s width (${Math.round(hb.weight * 100)} %)`, run: () => attempt(setWeight(doc, b, null), { row: at.i }) });
    if (!items.length) { toast(`drag to resize bar ${b + 1}`); return; }
    openMenu(x, y, last ? `bar ${b + 1}` : `barline after bar ${b + 1}`, items);
  }
  function rowMenu(i, x, y) {
    const r = rowsOf()[i], first = r.bars[0].index, last = r.bars[r.bars.length - 1].index, items = [];
    const opened = first > 0 && doc.measures[first - 1].lay?.brk === "break";
    if (!rowLocked(doc, first, last)) items.push({ id: "lock", label: `Lock this row (bars ${first + 1}–${last + 1})`, run: () => attempt(lockRow(doc, first, last), { row: i }) });
    if (r.pinned || opened) items.push({ id: "release", label: "Release this row", run: () => attempt(releaseBars(doc, first, last), { row: i }) });
    openMenu(x, y, `row ${i + 1} · bars ${first + 1}–${last + 1}`, items);
  }

  // --- width drag: bar b takes the width under the pointer, the row stays justified; one undo step a drag ---
  function weightAt(clientX) {
    const at = rowOfBar(drag.bar); if (!at) return null;
    const pxPerS = (pagePx() / plan.page.w) * plan.S;
    const w = roundWeight(weightFor(drag.row, drag.k, drag.width + (clientX - drag.x) / pxPerS)) ?? 1;
    return scalesWith(drag.row, drag.k, w).some((s) => s < PIN_FLOOR) ? null : w; // past the floor the drag simply stops
  }
  function dragTo(clientX) {
    const w = weightAt(clientX);
    if (w === null || w === drag.weight) return;
    drag.weight = w;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { if (!drag) return; doc = setWeight(drag.base, drag.bar, w === 1 ? null : w); plan = planPages(doc, opts); render(); });
  }
  function endDrag(commit) {
    cancelAnimationFrame(raf);
    const d = drag; drag = null; root.classList.remove("dragging"); handles.get(d.bar)?.classList.remove("on");
    const next = commit && d.weight !== d.start ? setWeight(d.base, d.bar, d.weight === 1 ? null : d.weight) : d.base;
    doc = d.base; plan = planPages(doc, opts);
    if (next !== d.base) attempt(next, { row: rowOfBar(d.bar)?.i }); else render();
  }
  function handleFor(b) {
    let h = handles.get(b);
    if (h) return h;
    h = document.createElement("button"); h.type = "button"; h.className = "cp-lay-handle"; h.dataset.bar = String(b);
    let down = null, swallow = false;
    h.addEventListener("pointerdown", (e) => {
      if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
      closeMenu(); down = { id: e.pointerId, x: e.clientX, y: e.clientY }; swallow = false;
      try { h.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer cannot be captured */ }
    });
    h.addEventListener("pointermove", (e) => {
      if (!down || e.pointerId !== down.id) return;
      // the handle owns its gesture (touch-action: none), so the browser can never start a scroll in the middle of a sizing (v119): the first
      // TAP_PX of travel decide — sideways (or diagonal) sizes the bar and stays a sizing however the hand wanders; clearly up or down scrolls the pages by hand
      if (down.pan) { scroll.scrollTop -= e.clientY - down.lastY; down.lastY = e.clientY; e.preventDefault(); return; }
      if (!drag) {
        const dx = Math.abs(e.clientX - down.x), dy = Math.abs(e.clientY - down.y);
        if (dx < TAP_PX && dy < TAP_PX) return;
        if (dy > 2 * dx) { down.pan = true; down.lastY = e.clientY; swallow = true; return; } // only a clearly vertical start pans; a diagonal one is a sizing
        const at = rowOfBar(b); if (!at) return;
        const hb = at.row.bars[at.k];
        drag = { bar: b, base: doc, row: at.row, k: at.k, x: down.x, width: hb.stretch * hb.scale, start: hb.weight, weight: hb.weight };
        root.classList.add("dragging"); h.classList.add("on"); swallow = true;
      }
      e.preventDefault(); dragTo(e.clientX);
    });
    const up = (e, ok) => { if (!down || e.pointerId !== down.id) return; down = null; if (drag) endDrag(ok); };
    h.addEventListener("pointerup", (e) => up(e, true));
    h.addEventListener("pointercancel", (e) => up(e, false)); // the system took the pointer away: nothing changes
    h.addEventListener("click", (e) => { // the last event of a tap, so nothing synthesised lands on the menu it opens; the click that ends a drag is swallowed
      if (swallow) { swallow = false; return; }
      const r = h.getBoundingClientRect();
      barlineMenu(b, e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2);
    });
    h.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault(); e.stopPropagation();
      const at = rowOfBar(b); if (!at) return;
      const w = roundWeight(at.row.bars[at.k].weight + (e.key === "ArrowRight" ? KEY_STEP : -KEY_STEP)) ?? 1;
      if (scalesWith(at.row, at.k, w).some((s) => s < PIN_FLOOR)) { flash(at.i); return; }
      attempt(setWeight(doc, b, w === 1 ? null : w), { row: at.i });
    });
    handles.set(b, h);
    return h;
  }

  // --- paint: the pages, the marks (SVG, no events), the handles and tabs (HTML, kept) ---
  function marksFor(k) {
    const g = svgEl("g", { class: "cp-lay-marks" }), S = plan.S;
    rowsOf().forEach((r, i) => {
      if (plan.pageOf(i) !== k) return;
      const top = yPt(i, r.top + 1.2), bottom = yPt(i, r.bottom - 1.2);
      if (r.tight) g.append(svgEl("rect", { class: "cp-lay-tight", x: 0, y: yPt(i, r.top), width: plan.page.w, height: (r.bottom - r.top) * S }));
      r.bars.forEach((hb) => {
        const x = xPt(hb.x1);
        if (hb.brk === "break") g.append(svgEl("path", { class: "cp-lay-mark", d: `M${x + 1.2 * S},${top - 1.5 * S} v${0.9 * S} h${-1.6 * S} m${0.55 * S},${-0.5 * S} l${-0.55 * S},${0.5 * S} l${0.55 * S},${0.5 * S}` })); // ⏎
        if (hb.brk === "keep") g.append(svgEl("path", { class: "cp-lay-mark", d: `M${x - 1.1 * S},${top - 0.5 * S} q${1.1 * S},${-1.3 * S} ${2.2 * S},0` })); // a link over the barline
        if (hb.weight !== 1) {
          g.append(svgEl("path", { class: "cp-lay-mark", d: `M${xPt(hb.bodyX0) + 0.4 * S},${bottom} v${0.5 * S} H${x - 0.4 * S} v${-0.5 * S}` }));
          const t = svgEl("text", { class: "cp-lay-pct", x: (xPt(hb.bodyX0) + x) / 2, y: bottom + 1.55 * S, "text-anchor": "middle", "font-size": 1.25 * S }); t.textContent = `${Math.round(hb.weight * 100)} %`; g.append(t);
        }
      });
    });
    return g;
  }
  function render() {
    const n = plan.pages.length, px = pagePx(), ptPx = px / plan.page.w;
    while (wraps.length < n) { const wrap = document.createElement("div"); wrap.className = "cp-lay-page cp-paper"; const hits = document.createElement("div"); hits.className = "cp-lay-hits"; wrap.append(hits); pagesEl.append(wrap); wraps.push({ wrap, hits }); }
    while (wraps.length > n) wraps.pop().wrap.remove();
    const live = new Set();
    wraps.forEach(({ wrap, hits }, k) => {
      wrap.style.width = `${px}px`;
      const page = planPageSvg(plan, k, { title, composer }); page.append(marksFor(k));
      wrap.querySelector(".cp-page")?.remove(); wrap.prepend(page);
      for (const old of hits.querySelectorAll(".cp-lay-tab, .cp-lay-release")) old.remove();
      rowsOf().forEach((r, i) => {
        if (plan.pageOf(i) !== k) return;
        const y0 = yPt(i, r.top + 1.5), y1 = yPt(i, r.bottom - 1.5), first = r.bars[0].index, last = r.bars[r.bars.length - 1].index;
        r.bars.forEach((hb, j) => {
          const near = Math.min(hb.x1 - hb.bodyX0, j + 1 < r.bars.length ? r.bars[j + 1].x1 - r.bars[j + 1].bodyX0 : Infinity) * plan.S; // pt
          const half = Math.min(HANDLE_PX / 2 / ptPx, near * HANDLE_SHARE), x = xPt(hb.x1);
          const h = handleFor(hb.index); live.add(hb.index);
          h.setAttribute("aria-label", `barline after bar ${hb.index + 1}${hb.brk ? `, ${hb.brk}` : ""}${hb.weight !== 1 ? `, width ${Math.round(hb.weight * 100)} %` : ""}`);
          h.classList.toggle("pinned", !!hb.brk || hb.weight !== 1);
          place(h, x - half, y0, x + half, y1);
          if (h.parentNode !== hits) hits.append(h);
        });
        const locked = rowLocked(doc, first, last), opened = first > 0 && doc.measures[first - 1].lay?.brk === "break";
        const tab = document.createElement("button"); tab.type = "button"; tab.className = `cp-lay-tab${locked ? " locked" : r.pinned || opened ? " pinned" : ""}${r.tight ? " tight" : ""}`; tab.dataset.row = String(i);
        tab.setAttribute("aria-label", `row ${i + 1}, bars ${first + 1} to ${last + 1}${locked ? ", locked" : ""}`);
        const side = HANDLE_PX / ptPx, cx = Math.max(side / 2, plan.margin / 2), cy = (y0 + y1) / 2;
        place(tab, cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2);
        tab.addEventListener("click", (e) => { const b = tab.getBoundingClientRect(); rowMenu(i, e.clientX || b.right, e.clientY || b.top + b.height / 2); });
        hits.append(tab);
        if (r.tight) {
          const rel = document.createElement("button"); rel.type = "button"; rel.className = "cp-lay-release"; rel.dataset.row = String(i); rel.textContent = "Release this row";
          rel.style.right = `${(plan.margin / plan.page.w) * 100}%`; rel.style.top = `${(yPt(i, r.top) / plan.page.h) * 100}%`;
          rel.addEventListener("click", () => attempt(releaseBars(doc, first, last), { row: i }));
          hits.append(rel);
        }
      });
    });
    for (const [b, h] of handles) if (!live.has(b)) { h.remove(); handles.delete(b); }
    const c = pinCount(doc), t = plan.tight.length;
    $(".cp-lay-status").textContent = `${pinSummary(doc)} · ${plural(n, "page")}${t ? ` · ${plural(t, "row")} ${t === 1 ? "does" : "do"} not fit` : ""}`;
    $(".cp-lay-status").classList.toggle("bad", t > 0);
    $("[data-lay=undo]").disabled = !past.length; $("[data-lay=redo]").disabled = !future.length;
    $("[data-lay=reset]").disabled = !c.total;
    $("[data-lay=out]").disabled = zoom === 0; $("[data-lay=in]").disabled = zoom === ZOOMS.length - 1;
    root.__layout = { plan, doc, zoom: ZOOMS[zoom] }; // the E2E reads what the view was drawn from
  }

  // --- the bar ---
  function close() {
    if (closed) return;
    closed = true; closeMenu(); if (drag) endDrag(false);
    document.removeEventListener("keydown", onKey, true); removeEventListener("resize", onResize);
    root.remove();
    resolve(doc === initial ? null : doc);
  }
  const step = (from, to) => { if (!from.length) return; to.push(doc); doc = from.pop(); plan = planPages(doc, opts); haptic(3); render(); };
  function act(name) {
    closeMenu();
    if (name === "done") close();
    else if (name === "undo") step(past, future);
    else if (name === "redo") step(future, past);
    else if (name === "in" || name === "out") { zoom = Math.max(0, Math.min(ZOOMS.length - 1, zoom + (name === "in" ? 1 : -1))); render(); }
    else if (name === "reset") {
      if (!$("[data-lay=reset]").classList.contains("sure")) { const b = $("[data-lay=reset]"); b.classList.add("sure"); b.textContent = "Reset every pin?"; setTimeout(() => { b.classList.remove("sure"); b.textContent = "Reset"; }, 3000); return; }
      const b = $("[data-lay=reset]"); b.classList.remove("sure"); b.textContent = "Reset";
      attempt(clearPins(doc));
    }
  }
  root.querySelector(".cp-lay-bar").addEventListener("click", (e) => { const b = e.target.closest("[data-lay]"); if (b && !b.disabled) act(b.dataset.lay); });
  root.addEventListener("pointerdown", (e) => { if (menu && !menu.contains(e.target) && !e.target.closest(".cp-lay-handle, .cp-lay-tab")) closeMenu(); });
  scroll.addEventListener("scroll", closeMenu, { passive: true });
  function onKey(e) { // the view owns the keyboard while it is up: nothing reaches the sheet or the editor beneath
    if (!root.contains(e.target) && e.target !== document.body) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (menu) closeMenu(); else close(); return; }
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.stopPropagation(); act(e.shiftKey ? "redo" : "undo"); return; }
    if (e.key !== "Tab" && e.key !== "Enter" && e.key !== " " && !e.key.startsWith("Arrow")) e.stopPropagation();
  }
  let resizeRaf = 0;
  const onResize = () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => { if (!closed) render(); }); };
  document.addEventListener("keydown", onKey, true); addEventListener("resize", onResize);

  document.body.append(root);
  plan = planPages(doc, opts);
  render();
  root.querySelector(".cp-lay-release")?.scrollIntoView({ block: "center" }); // a row that stopped fitting is what the visit is about
  $(".cp-lay-done").focus({ preventScroll: true });
  return result;
}
