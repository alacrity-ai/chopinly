// The ink layer (docs/SCORES_DESIGN.md §7): a canvas the exact size of the
// page over the page canvas, and the bar of tools under the top bar. The pen
// draws; a finger turns and scrolls unless the finger toggle is on; a tap is
// not a stroke (it needs 4 px of travel) so edge taps still turn pages. The
// live stroke draws on the same frame as the pointer event; the save to the
// logbook is debounced. Undo / redo are per page, per sitting.
import { logbook } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { toast } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";
import { encode, decode, simplify, travel, hit, draw, SCALE, PEN_W, HI_W, MIN_TRAVEL, COLORS } from "../../lib/scores/ink.js";

const SAVE_MS = 400;
const ERASE_R = 12 / 420; // normalised radius the eraser sweeps (≈ 12 px on a 420 px page)
const COLOR_NAMES = ["ink", "brass", "red"];

/**
 * @param {{ sheet: HTMLElement, bar: HTMLElement, scoreId: string, store: object,
 *           onTap(clientX, clientY): void, onModeChange(on: boolean): void }} opts
 */
export function createInkLayer({ sheet, bar, scoreId, store, onTap, onModeChange }) {
  const canvas = document.createElement("canvas");
  canvas.className = "sc-ink";
  canvas.width = 1; canvas.height = 1;
  sheet.append(canvas);
  const cx = canvas.getContext("2d");
  let on = false, tool = store.get("inkTool", "pen"), color = store.get("inkColor", 0), fingerInk = store.get("fingerInk", false);
  let page = 0, strokes = [], w = 1, h = 1, W = 1, H = 1, dpr = 1;
  let undo = [], redo = [], saveTimer = 0, dirty = false, live = null, erasing = false, capToastAt = 0;

  // --- the bar ----------------------------------------------------------------
  bar.className = "sc-inkbar";
  bar.hidden = true;
  const paintBar = () => {
    bar.innerHTML = `
      <button type="button" class="sc-ink-btn ${tool === "pen" ? "on" : ""}" data-tool="pen" aria-label="pen" aria-pressed="${tool === "pen"}">${icon("pencil")}</button>
      <button type="button" class="sc-ink-btn ${tool === "hi" ? "on" : ""}" data-tool="hi" aria-label="highlighter" aria-pressed="${tool === "hi"}">${icon("highlighter")}</button>
      <button type="button" class="sc-ink-btn ${tool === "eraser" ? "on" : ""}" data-tool="eraser" aria-label="eraser" aria-pressed="${tool === "eraser"}">${icon("eraser")}</button>
      <span class="sc-ink-colors" role="radiogroup" aria-label="colour">${COLORS.map((c, i) => `<button type="button" class="sc-ink-color ${color === i ? "on" : ""}" data-color="${i}" role="radio" aria-checked="${color === i}" aria-label="${COLOR_NAMES[i]}" style="--c:${c}"></button>`).join("")}</span>
      <span class="sc-ink-gap"></span>
      <button type="button" class="sc-ink-btn" data-act="undo" aria-label="undo" ${undo.length ? "" : "disabled"}>${icon("undo")}</button>
      <button type="button" class="sc-ink-btn" data-act="redo" aria-label="redo" ${redo.length ? "" : "disabled"}>${icon("redo")}</button>
      <button type="button" class="sc-ink-btn ${fingerInk ? "on" : ""}" data-act="finger" aria-label="draw with a finger" aria-pressed="${fingerInk}" title="draw with a finger (otherwise only the pen draws)">${icon("finger")}</button>
      <button type="button" class="sc-ink-btn" data-act="clear" aria-label="clear this page" ${strokes.length ? "" : "disabled"}>${icon("trash")}</button>`;
    for (const b of bar.querySelectorAll("[data-tool]")) b.addEventListener("click", () => { tool = b.dataset.tool; store.set("inkTool", tool); paintBar(); });
    for (const b of bar.querySelectorAll("[data-color]")) b.addEventListener("click", () => { color = Number(b.dataset.color); store.set("inkColor", color); if (tool === "eraser") { tool = "pen"; store.set("inkTool", tool); } paintBar(); });
    bar.querySelector('[data-act="undo"]').addEventListener("click", () => { if (!undo.length) return; redo.push(strokes); strokes = undo.pop(); commit(); });
    bar.querySelector('[data-act="redo"]').addEventListener("click", () => { if (!redo.length) return; undo.push(strokes); strokes = redo.pop(); commit(); });
    bar.querySelector('[data-act="finger"]').addEventListener("click", () => { fingerInk = !fingerInk; store.set("fingerInk", fingerInk); applyTouchAction(); paintBar(); });
    bar.querySelector('[data-act="clear"]').addEventListener("click", () => { if (!strokes.length || !confirm("Clear the ink on this page?")) return; undo.push(strokes); redo = []; strokes = []; haptic(20); commit(); });
  };
  const applyTouchAction = () => { canvas.style.touchAction = on ? "none" : ""; canvas.style.pointerEvents = on ? "auto" : "none"; };

  // --- geometry + rendering ---------------------------------------------------
  function size(cssW, cssH, ratio) {
    W = cssW; H = cssH; dpr = ratio;
    w = Math.max(1, Math.round(cssW * ratio)); h = Math.max(1, Math.round(cssH * ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    repaint();
  }
  function repaint() {
    cx.clearRect(0, 0, w, h);
    if (strokes.length) draw(cx, strokes, w, h);
    if (live) draw(cx, strokes, w, h, { only: live });
  }
  const norm = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, p: e.pointerType === "pen" ? Math.max(0.05, e.pressure || 0.5) : 0.5 }; };

  // --- pages ------------------------------------------------------------------
  function load(n) {
    flush();
    page = n;
    strokes = decode(logbook.inkFor(scoreId, n));
    undo = []; redo = []; live = null;
    repaint();
    if (on) paintBar();
  }
  function commit() {
    dirty = true; repaint(); paintBar();
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, SAVE_MS);
  }
  /** Write the page's ink to the logbook now (debounce flushed on turn / close). */
  function flush() {
    clearTimeout(saveTimer);
    if (!dirty || !page) return;
    dirty = false;
    try { logbook.setInk(scoreId, page, encode(strokes)); }
    catch (e) {
      // over the cap: drop the last change and say so once a minute
      if (undo.length) { strokes = undo.pop(); repaint(); }
      if (Date.now() - capToastAt > 60_000) { capToastAt = Date.now(); toast(e.message); }
    }
  }

  // --- input ------------------------------------------------------------------
  const draws = (e) => e.pointerType === "pen" || fingerInk;
  let pid = null, downAt = 0, downXY = null, lastErase = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!on || pid !== null || (e.button && e.button !== 0)) return;
    if (!draws(e)) return; // a finger with the toggle off: falls through to the stage (turn / scroll)
    e.stopPropagation(); e.preventDefault();
    pid = e.pointerId; downAt = performance.now(); downXY = { x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(pid); } catch { /* not needed */ }
    const pt = norm(e);
    if (tool === "eraser") { erasing = true; lastErase = pt; eraseAt(pt); return; }
    live = { t: tool === "hi" ? "hi" : "pen", c: color, w: tool === "hi" ? HI_W : PEN_W, pts: [pt] };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pid !== e.pointerId) return;
    e.stopPropagation();
    // coalesced events give 240 Hz curves on an iPad; some browsers (and synthetic events) hand back an empty list
    const coalesced = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
    const events = coalesced?.length ? coalesced : [e];
    if (erasing) {
      // sweep the whole path, not just the sampled points — a quick flick must still catch a stroke it crossed
      for (const ev of events) {
        const pt = norm(ev.pointerType ? ev : e);
        const steps = Math.max(1, Math.ceil(Math.hypot(pt.x - lastErase.x, pt.y - lastErase.y) / (ERASE_R / 2)));
        for (let k = 1; k <= steps; k++) eraseAt({ x: lastErase.x + ((pt.x - lastErase.x) * k) / steps, y: lastErase.y + ((pt.y - lastErase.y) * k) / steps });
        lastErase = pt;
      }
      return;
    }
    if (!live) return;
    const from = live.pts.length;
    for (const ev of events) live.pts.push(norm(ev.pointerType ? ev : e));
    draw(cx, strokes, w, h, { only: live, from: Math.max(1, from - 1) });
  });
  const end = (e) => {
    if (pid !== e.pointerId) return;
    e.stopPropagation();
    try { canvas.releasePointerCapture(pid); } catch { /* fine */ }
    pid = null;
    if (erasing) { erasing = false; if (dirty) commit(); return; }
    if (!live) return;
    const st = live; live = null;
    const moved = travel(st.pts) * SCALE;
    if (moved < MIN_TRAVEL && performance.now() - downAt < 300 && e.type !== "pointercancel") {
      // a tap, not a stroke — hand it to the reader (edge → turn, middle → bar)
      repaint();
      onTap?.(downXY.x, downXY.y);
      return;
    }
    if (e.type === "pointercancel") { repaint(); return; }
    st.pts = simplify(st.pts, 1 / SCALE);
    undo.push(strokes); redo = [];
    strokes = [...strokes, st];
    commit();
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  function eraseAt(pt) {
    const i = hit(strokes, pt.x, pt.y, ERASE_R);
    if (i < 0) return;
    if (!dirty) { undo.push(strokes); redo = []; }
    strokes = strokes.filter((_, k) => k !== i);
    dirty = true;
    repaint();
  }

  applyTouchAction();
  return {
    canvas,
    get on() { return on; },
    /** Ink mode on / off: the overlay takes pen input, the bar shows. */
    toggle(force) {
      on = force === undefined ? !on : !!force;
      bar.hidden = !on;
      if (on) paintBar();
      applyTouchAction();
      onModeChange?.(on);
    },
    size, load, flush, repaint,
    hasInk: () => strokes.length > 0,
    destroy() { flush(); canvas.remove(); bar.hidden = true; bar.innerHTML = ""; },
  };
}
