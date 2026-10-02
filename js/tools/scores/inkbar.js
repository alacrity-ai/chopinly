// The ink layer (docs/SCORES_DESIGN.md §7): a canvas the exact size of the
// page over the page canvas, and the bar of tools under the top bar. The
// Pencil touching the page starts drawing mode and its first stroke at once
// (WSHED-161). Drawing mode belongs to the pen (WSHED-162): a finger or a palm
// on the page does nothing — no turn, no scroll — unless the finger toggle
// makes the finger the pen, and a tap is a dot, never a page turn. A
// translucent stroke is one even layer (WSHED-163): in flight it is painted
// opaque on its own canvas shown at the brush's opacity, and on the lift it
// lands in one composite. The save to the logbook is debounced. Undo / redo
// are per page, per sitting.
import { logbook } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { toast, esc, longPress } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";
import { encode, decode, simplify, travel, hit, draw, paintStroke, layered, alphaOf, strokeFor, SCALE, MIN_TRAVEL } from "../../lib/scores/ink.js";
import { openBrushes, swatch, brushSub } from "./brushes.js";

const SAVE_MS = 400, TAP_MS = 300;
const ERASE_R = 12 / 420; // normalised radius the eraser sweeps (≈ 12 px on a 420 px page)

/**
 * @param {{ sheet: HTMLElement, bar: HTMLElement, scoreId: string, store: object,
 *           onModeChange(on: boolean): void }} opts
 */
export function createInkLayer({ sheet, bar, scoreId, store, onModeChange }) {
  const canvas = document.createElement("canvas");
  canvas.className = "sc-ink";
  canvas.width = 1; canvas.height = 1;
  // One more canvas over the ink for layered strokes (WSHED-163): the stroke in flight, and the scratch surface committed ones are laid on through. It takes the page's size only once a page needs it.
  const over = document.createElement("canvas");
  over.className = "sc-ink-live";
  over.width = 1; over.height = 1;
  sheet.append(canvas, over);
  const cx = canvas.getContext("2d"), ox = over.getContext("2d");
  // tool: "brush" | "eraser" (v52 stored "pen" / "hi" — both are brushes now). The brush in hand is by id (WSHED-106).
  let on = false, tool = store.get("inkTool", "brush") === "eraser" ? "eraser" : "brush", brushId = store.get("inkBrush", null), fingerInk = store.get("fingerInk", false);
  const curBrush = () => logbook.brush(brushId) ?? logbook.brushes()[0] ?? null;
  let page = 0, strokes = [], w = 1, h = 1, W = 1, H = 1, dpr = 1;
  let undo = [], redo = [], saveTimer = 0, dirty = false, live = null, erasing = false, capToastAt = 0;

  // --- the bar ----------------------------------------------------------------
  bar.className = "sc-inkbar";
  bar.hidden = true;
  const paintBar = () => {
    const bs = logbook.brushes(), cur = curBrush();
    bar.innerHTML = `
      <span class="sc-ink-brushes" role="radiogroup" aria-label="brush">${bs.map((b) => `<button type="button" class="sc-ink-brush ${tool === "brush" && cur?.id === b.id ? "on" : ""}" data-brush="${esc(b.id)}" role="radio" aria-checked="${tool === "brush" && cur?.id === b.id}" aria-label="${esc(b.name)} — ${brushSub(b)}; hold to edit">${swatch(b)}</button>`).join("")}</span>
      <button type="button" class="sc-ink-btn ${tool === "eraser" ? "on" : ""}" data-tool="eraser" aria-label="eraser" aria-pressed="${tool === "eraser"}">${icon("eraser")}</button>
      <button type="button" class="sc-ink-btn" data-act="brushes" aria-label="brushes: edit, add, reorder">${icon("palette")}</button>
      <span class="sc-ink-gap"></span>
      <button type="button" class="sc-ink-btn" data-act="undo" aria-label="undo" ${undo.length ? "" : "disabled"}>${icon("undo")}</button>
      <button type="button" class="sc-ink-btn" data-act="redo" aria-label="redo" ${redo.length ? "" : "disabled"}>${icon("redo")}</button>
      <button type="button" class="sc-ink-btn ${fingerInk ? "on" : ""}" data-act="finger" aria-label="draw with a finger" aria-pressed="${fingerInk}" title="draw with a finger (otherwise only the pen draws)">${icon("finger")}</button>
      <button type="button" class="sc-ink-btn" data-act="clear" aria-label="clear this page" ${strokes.length ? "" : "disabled"}>${icon("trash")}</button>`;
    bar.querySelector('[data-tool="eraser"]').addEventListener("click", () => { tool = tool === "eraser" ? "brush" : "eraser"; store.set("inkTool", tool); paintBar(); });
    for (const b of bar.querySelectorAll("[data-brush]")) longPress(b, () => pickBrush(b.dataset.brush), () => { haptic(); openSheet(b.dataset.brush); });
    bar.querySelector('[data-act="brushes"]').addEventListener("click", () => openSheet(cur?.id ?? null));
    const strip = bar.querySelector(".sc-ink-brushes"), onEl = strip.querySelector(".on");
    if (onEl) onEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    bar.querySelector('[data-act="undo"]').addEventListener("click", () => { if (!undo.length) return; redo.push(strokes); strokes = undo.pop(); commit(); });
    bar.querySelector('[data-act="redo"]').addEventListener("click", () => { if (!redo.length) return; undo.push(strokes); strokes = redo.pop(); commit(); });
    bar.querySelector('[data-act="finger"]').addEventListener("click", () => { fingerInk = !fingerInk; store.set("fingerInk", fingerInk); applyTouchAction(); paintBar(); });
    bar.querySelector('[data-act="clear"]').addEventListener("click", () => { if (!strokes.length || !confirm("Clear the ink on this page?")) return; undo.push(strokes); redo = []; strokes = []; haptic(20); commit(); });
  };
  /** The brushes sheet; whatever it hands back is the brush in hand. */
  async function openSheet(id) {
    const next = await openBrushes({ current: id });
    if (next && logbook.brush(next)) pickBrush(next); else if (on) paintBar();
  }
  const pickBrush = (id) => { brushId = id; store.set("inkBrush", id); tool = "brush"; store.set("inkTool", tool); if (on) paintBar(); };
  const offLb = logbook.on(() => { if (on && !document.querySelector(".lb-sheet-wrap:not(.closing)")) paintBar(); });
  const applyTouchAction = () => { canvas.style.touchAction = on ? "none" : ""; canvas.style.pointerEvents = on ? "auto" : "none"; };

  // --- geometry + rendering ---------------------------------------------------
  function size(cssW, cssH, ratio) {
    W = cssW; H = cssH; dpr = ratio;
    w = Math.max(1, Math.round(cssW * ratio)); h = Math.max(1, Math.round(cssH * ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.width = over.style.width = `${cssW}px`; canvas.style.height = over.style.height = `${cssH}px`;
    repaint();
  }
  /** The layer canvas at the page's size (a resize clears it; `repaint` puts a stroke in flight back). */
  const layer = () => { if (over.width !== w || over.height !== h) { over.width = w; over.height = h; } return ox; };
  function repaint() {
    cx.clearRect(0, 0, w, h);
    if (strokes.length) draw(cx, strokes, w, h, { scratch: strokes.some(layered) ? layer() : null });
    if (live) paintLive(0);
  }
  /** The stroke in flight from point `from` on: a layered one at full strength on the layer canvas (its CSS opacity is the brush's), an opaque one straight onto the ink. */
  const paintLive = (from) => { if (layered(live)) paintStroke(layer(), live, w, h, from); else draw(cx, strokes, w, h, { only: live, from }); };
  const dropLive = () => { if (live && layered(live)) ox.clearRect(0, 0, over.width, over.height); live = null; };
  const norm = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, p: e.pointerType === "pen" ? Math.max(0.05, e.pressure || 0.5) : 0.5 }; };

  // --- pages ------------------------------------------------------------------
  function load(n) {
    flush();
    page = n;
    strokes = decode(logbook.inkFor(scoreId, n));
    undo = []; redo = []; dropLive();
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
  // Drawing mode belongs to the pen (WSHED-162): the Pencil and the mouse draw; a finger draws only when the toggle makes it the pen, and otherwise does nothing here or on the stage.
  const draws = (e) => e.pointerType !== "touch" || fingerInk;
  let pid = null, downAt = 0, waking = false, lastErase = null;
  function start(e, wake = false) {
    if (!on || pid !== null || (e.button && e.button !== 0) || !draws(e)) return;
    e.stopPropagation(); e.preventDefault();
    pid = e.pointerId; downAt = performance.now(); waking = wake;
    try { canvas.setPointerCapture(pid); } catch { /* not needed */ }
    // the stroke may have begun on the stage (the margins, or the contact that woke drawing mode), so it is followed from the window, not from whichever element took the pointerdown
    window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", end, true); window.addEventListener("pointercancel", end, true);
    const pt = norm(e);
    if (tool === "eraser") { erasing = true; lastErase = pt; eraseAt(pt); return; }
    const b = curBrush();
    if (!b) return;
    live = strokeFor(b); live.pts = [pt];
    if (layered(live)) { over.style.opacity = String(alphaOf(live)); layer(); }
  }
  const release = () => {
    try { canvas.releasePointerCapture(pid); } catch { /* fine */ }
    pid = null;
    window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", end, true); window.removeEventListener("pointercancel", end, true);
  };
  canvas.addEventListener("pointerdown", (e) => start(e));
  function move(e) {
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
    paintLive(Math.max(1, from - 1));
  }
  function end(e) {
    if (pid !== e.pointerId) return;
    e.stopPropagation();
    release();
    if (erasing) { erasing = false; if (dirty) commit(); return; }
    if (!live) return;
    const st = live; dropLive();
    const moved = travel(st.pts) * SCALE;
    // a cancelled stroke leaves nothing, and neither does the tap that only woke drawing mode (WSHED-161)
    if (e.type === "pointercancel" || (waking && moved < MIN_TRAVEL && performance.now() - downAt < TAP_MS)) { repaint(); return; }
    st.pts = moved < 1 ? [st.pts[0]] : simplify(st.pts, 1 / SCALE); // a tap is a dot — in drawing mode nothing turns the page (WSHED-162)
    undo.push(strokes); redo = [];
    strokes = [...strokes, st];
    commit();
  }
  /** Drop a stroke in flight without keeping it (drawing mode went off under it). */
  function abandon() {
    if (pid === null) return;
    release();
    if (erasing) { erasing = false; if (dirty) commit(); return; }
    if (live) { dropLive(); repaint(); }
  }
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  function eraseAt(pt) {
    const i = hit(strokes, pt.x, pt.y, ERASE_R);
    if (i < 0) return;
    if (!dirty) { undo.push(strokes); redo = []; }
    strokes = strokes.filter((_, k) => k !== i);
    dirty = true;
    repaint();
  }

  function toggle(force) {
    on = force === undefined ? !on : !!force;
    if (!on) abandon();
    bar.hidden = !on;
    if (on) paintBar();
    applyTouchAction();
    onModeChange?.(on);
  }
  applyTouchAction();
  return {
    canvas,
    get on() { return on; },
    /** Ink mode on / off: the overlay takes pen input, the bar shows. */
    toggle,
    /**
     * A pointer went down on the stage (the reader hands every one over while
     * drawing mode is on, and the Pencil's always). The Pencil wakes drawing
     * mode and this contact is its first stroke (WSHED-161); in drawing mode
     * whatever draws may start in the margins, and a finger starts nothing.
     */
    begin(e) {
      const wake = !on;
      if (wake) { if (e.pointerType !== "pen") return; toggle(true); }
      start(e, wake);
    },
    size, load, flush, repaint,
    hasInk: () => strokes.length > 0,
    destroy() { abandon(); flush(); offLb(); for (const c of [canvas, over]) { c.width = 0; c.height = 0; c.remove(); } bar.hidden = true; bar.innerHTML = ""; },
  };
}
