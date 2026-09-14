// The editor (docs/COMPOSE_DESIGN.md §8): a full-screen layer with the rails
// on top and the score below. Place mode taps place the armed duration; Select
// mode taps only select; Scrub is the one mode in which the score moves. In
// edit modes a touch pointer counts only as a single clean tap — a resting
// palm (wide, long, moving, or a second contact) is discarded — and pen and
// mouse are trusted fully.
import { logbook } from "../../lib/logbook.js";
import { toast } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";
import { layoutComposition } from "../../lib/compose/layout.js";
import { renderComposition } from "../../lib/compose/render.js";
import { slotAt, thingAt, xOfTicks, barAt } from "../../lib/compose/hit.js";
import { place, remove, snap, trimBars, find, setPitch, Nudge } from "../../lib/compose/engine.js";
import { createHistory } from "../../lib/compose/history.js";
import { createSound } from "../../lib/compose/sound.js";
import { clefAt, keyAt } from "../../lib/compose/model.js";
import { buildRails, MAIN_BASES, MORE_BASES, durName } from "./rails.js";

const TAP_MS = 300, TAP_PX = 10, PALM_PX = 40, S_MIN = 8, S_MAX = 22, SAVE_MS = 300, DRAG_MS = 700;
const KEY_BASE = { 1: 64, 2: 32, 3: 16, 4: 8, 5: 4, 6: 2, 7: 1 };

export function openEditor({ id, ctx, onClose }) {
  const c = logbook.composition(id);
  if (!c) { toast("that composition is gone"); onClose?.(); return null; }
  const { store, setRunning, getAudio } = ctx;
  const history = createHistory(c);
  let doc = c;
  let S = Math.max(S_MIN, Math.min(S_MAX, store.get("zoom", 12)));
  const savedArm = store.get("armed", null);
  let armed = { base: MAIN_BASES.includes(savedArm?.base) || MORE_BASES.includes(savedArm?.base) ? savedArm.base : 4, dots: 0, rest: !!savedArm?.rest };
  let mode = "place";                 // "place" | "select" | "scrub"
  const selection = new Set();        // "ev" | "ev:pi"
  let L = null, R = null, closed = false, saveTimer = 0, dirty = false;
  const sound = createSound(getAudio);

  const el = document.createElement("div");
  el.className = "cp-editor";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", c.title);
  el.innerHTML = `<div class="cp-rails" id="cp-rails"></div><div class="cp-view" id="cp-view" data-mode="place"><div class="cp-sheet" id="cp-sheet"></div></div>`;
  document.body.append(el);
  const view = el.querySelector("#cp-view"), sheet = el.querySelector("#cp-sheet");
  const rails = buildRails(el.querySelector("#cp-rails"), { title: c.title, onAction: act });
  setRunning?.(true);
  logbook.updateComposition(id, { openedAt: Date.now() });

  // --- layout / render -------------------------------------------------------
  const width = () => Math.max(300, view.clientWidth);
  function layout() {
    L = layoutComposition(doc, { unit: S, width: width() });
    R = renderComposition(sheet, L);
    R.setSelection(selection);
    sync();
  }
  function sync() {
    rails.update({ armed, mode, canUndo: history.canUndo, canRedo: history.canRedo, hasSelection: selection.size > 0 });
    view.dataset.mode = mode;
  }
  function commit(next) {
    if (next === doc) return;
    doc = history.push(next); dirty = true;
    layout(); scheduleSave();
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, SAVE_MS); }
  function flush() { clearTimeout(saveTimer); if (!dirty || closed && !doc) return; logbook.updateComposition(id, { measures: doc.measures }); dirty = false; }

  // --- coordinates -----------------------------------------------------------
  const toS = (clientX, clientY) => { const r = R.svg.getBoundingClientRect(); return { x: (clientX - r.left) / S, y: (clientY - r.top) / S }; };
  const stepY = (sys, staff, step) => sys.staves[staff].topY + (8 - step) / 2;

  // --- ghost -----------------------------------------------------------------
  function ghostAt(clientX, clientY) {
    if (mode !== "place" || !L) return R?.showGhost(null);
    const { x, y } = toS(clientX, clientY);
    const slot = slotAt(L, x, y);
    if (!slot) return R.showGhost(null);
    try {
      const s = snap(doc, slot, armed);
      const { sys, bar } = barAt(L, slot.bar);
      const gx = xOfTicks(bar, s.onset);
      const gy = armed.rest ? stepY(sys, slot.staff, armed.base <= 1 ? 6 : 4) : stepY(sys, slot.staff, slot.step);
      const ledgers = [];
      if (!armed.rest) { for (let st = -2; st >= slot.step; st -= 2) ledgers.push(stepY(sys, slot.staff, st)); for (let st = 10; st <= slot.step; st += 2) ledgers.push(stepY(sys, slot.staff, st)); }
      R.showGhost({ x: gx, y: gy, base: armed.base, rest: armed.rest, stemUp: slot.step < 4, ledgers });
    } catch (e) { if (!(e instanceof Nudge)) throw e; R.showGhost(null); }
  }

  // --- a tap -----------------------------------------------------------------
  function tapAt(clientX, clientY) {
    if (!L) return;
    const { x, y } = toS(clientX, clientY);
    const thing = thingAt(L, x, y);
    // In Place mode a rest (and a chord's stem) is where the next note goes; only a notehead selects.
    if (thing && (mode === "select" || thing.type === "head")) { select(thing); return; }
    if (mode === "select") { if (selection.size) { selection.clear(); R.setSelection(selection); sync(); } return; }
    const slot = slotAt(L, x, y);
    if (!slot) return;
    try {
      const r = place(doc, slot, armed);
      if (r.action === "same") { select({ type: "head", ev: r.ev.id, pi: r.ev.pitches.findIndex((p) => p.step === r.ev.pitches[0].step) }); return; }
      commit(r.doc);
      if (r.ev.kind === "note") sound.play(r.action === "chord" ? r.ev.pitches : r.ev.pitches, 260);
      haptic(6);
    } catch (e) {
      if (!(e instanceof Nudge)) throw e;
      nudge(e.message, slot.bar);
    }
  }
  function nudge(msg, bar) {
    toast(msg); haptic(20);
    const b = bar !== undefined && barAt(L, bar);
    if (b) R.flashBar(b.bar, b.sys);
  }
  const keyOf = (thing) => (thing.type === "head" ? `${thing.ev}:${thing.pi}` : thing.ev);
  function select(thing, { toggle = true } = {}) {
    const key = keyOf(thing);
    if (selection.has(key)) { if (toggle) selection.delete(key); }
    else { selection.clear(); selection.add(key); }
    R.setSelection(selection); sync(); haptic(4);
  }

  // --- grab + drag: pen / mouse / one finger down on a notehead takes it at once; vertical
  // movement re-pitches by staff step (sounding each), release commits. The mode is untouched:
  // in Place mode the armed duration stays armed and the next tap elsewhere still places.
  let drag = null; // { id, type, thing, wasSelected, y0, delta, base, preview, pi }
  function grabStart(e, thing) {
    const wasSelected = selection.has(keyOf(thing));
    select(thing, { toggle: false });
    drag = { id: e.pointerId, type: e.pointerType, thing, wasSelected, y0: e.clientY, delta: 0, base: doc, preview: doc, pi: thing.pi, t: performance.now() };
    R.showGhost(null);
    try { view.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  }
  function grabMove(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const delta = Math.round((drag.y0 - e.clientY) / (S / 2));
    if (delta === drag.delta) return;
    try {
      const r = setPitch(drag.base, [{ ev: drag.thing.ev, pi: drag.thing.pi }], delta);
      drag.delta = delta; drag.preview = r.doc; drag.pi = r.pi ?? drag.thing.pi;
      doc = r.doc;
      selection.clear(); selection.add(`${drag.thing.ev}:${drag.pi}`);
      layout();
      const f = find(doc, drag.thing.ev);
      if (f) sound.play([f.ev.pitches[drag.pi]], 180);
      haptic(3);
    } catch (err) { if (!(err instanceof Nudge)) throw err; /* stay on the last good step */ }
  }
  function grabEnd(e, { cancel = false } = {}) {
    if (!drag || drag.id !== e.pointerId) return;
    const g = drag; drag = null;
    if (cancel || g.delta === 0) {
      doc = g.base;
      if (g.delta !== 0) layout();
      // a clean tap on an already-selected note deselects it (the toggle a tap always had)
      if (!cancel && g.wasSelected && performance.now() - g.t <= TAP_MS) { selection.clear(); R.setSelection(selection); sync(); }
      return;
    }
    doc = g.base;                         // commit records base → preview as one step
    commit(g.preview);
    selection.clear(); selection.add(`${g.thing.ev}:${g.pi}`); R.setSelection(selection); sync();
    haptic(8);
  }
  function deleteSelection() {
    if (!selection.size) return;
    const items = [...selection].map((k) => { const [ev, pi] = k.split(":"); return pi === undefined ? { ev } : { ev, pi: Number(pi) }; });
    const next = remove(doc, items);
    selection.clear();
    commit(next); haptic(8);
  }

  // --- pointer policy --------------------------------------------------------
  const touches = new Set();
  let gesture = null;   // the pointer that may become a tap: { id, type, x, y, t, valid }
  let scrub = null;     // Scrub state: { pointers: Map(id → {x, y}), scrollTop, dist0, S0, last, vy, inertia }
  const wide = (e) => (e.width > PALM_PX || e.height > PALM_PX);

  const headUnder = (e) => { if (!L) return null; const { x, y } = toS(e.clientX, e.clientY); const t = thingAt(L, x, y); return t?.type === "head" ? t : null; };
  view.addEventListener("pointerdown", (e) => {
    if (mode === "scrub") { onScrubDown(e); return; }
    if (e.pointerType === "touch") {
      const valid = touches.size === 0 && !wide(e);
      touches.add(e.pointerId);
      if (drag?.type === "touch") { grabEnd({ pointerId: drag.id }, { cancel: true }); return; } // a second finger lets go
      if (gesture?.type === "touch") gesture.valid = false; // a second finger spoils the first
      if (!valid) { if (gesture?.type !== "touch") return; gesture = { id: e.pointerId, type: "touch", valid: false }; return; }
      const head = headUnder(e);
      if (head) { gesture = null; grabStart(e, head); return; }
      gesture = { id: e.pointerId, type: "touch", x: e.clientX, y: e.clientY, t: performance.now(), valid: true };
      ghostAt(e.clientX, e.clientY);
      return;
    }
    if (e.button && e.button !== 0) return;
    const head = headUnder(e);
    if (head) { gesture = null; grabStart(e, head); return; }
    gesture = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, t: performance.now(), valid: true };
  });
  view.addEventListener("pointermove", (e) => {
    if (mode === "scrub") { onScrubMove(e); return; }
    if (drag) { grabMove(e); return; }
    if (e.pointerType === "touch") { if (gesture?.id === e.pointerId && gesture.valid && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > TAP_PX) { gesture.valid = false; R?.showGhost(null); } return; }
    if (!gesture || gesture.id !== e.pointerId) ghostAt(e.clientX, e.clientY); // hover
    else if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > TAP_PX) { gesture.valid = false; R?.showGhost(null); }
  });
  const up = (e) => {
    if (mode === "scrub") { onScrubUp(e); return; }
    if (drag?.id === e.pointerId) { if (e.pointerType === "touch") touches.delete(e.pointerId); grabEnd(e, { cancel: e.type === "pointercancel" }); return; }
    if (e.pointerType === "touch") {
      touches.delete(e.pointerId);
      if (gesture?.id === e.pointerId) {
        const ok = gesture.valid && e.type === "pointerup" && performance.now() - gesture.t <= TAP_MS && touches.size === 0 && !wide(e);
        const g = gesture; gesture = null; R?.showGhost(null);
        if (ok) tapAt(g.x, g.y);
      }
      return;
    }
    if (gesture?.id === e.pointerId) {
      const ok = gesture.valid && e.type === "pointerup" && performance.now() - gesture.t <= TAP_MS && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) <= TAP_PX;
      const g = gesture; gesture = null;
      if (ok) tapAt(g.x, g.y);
      ghostAt(e.clientX, e.clientY);
    }
  };
  view.addEventListener("pointerup", up);
  view.addEventListener("pointercancel", up);
  view.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") R?.showGhost(null); });
  view.addEventListener("contextmenu", (e) => e.preventDefault());

  // --- Scrub: pan with one pointer (inertia), pinch to zoom with two ---------
  function onScrubDown(e) {
    try { view.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer (tests) cannot be captured */ }
    if (!scrub) scrub = { pointers: new Map(), last: performance.now(), vy: 0 };
    cancelAnimationFrame(scrub.inertia);
    scrub.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (scrub.pointers.size === 2) { const [a, b] = [...scrub.pointers.values()]; scrub.dist0 = Math.hypot(a.x - b.x, a.y - b.y); scrub.S0 = S; }
  }
  function onScrubMove(e) {
    if (!scrub?.pointers.has(e.pointerId)) return;
    const prev = scrub.pointers.get(e.pointerId);
    scrub.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (scrub.pointers.size === 1) {
      const dy = e.clientY - prev.y, now = performance.now();
      view.scrollTop -= dy;
      scrub.vy = dy / Math.max(1, now - scrub.last); scrub.last = now;
    } else if (scrub.pointers.size === 2 && scrub.dist0) {
      const [a, b] = [...scrub.pointers.values()];
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / scrub.dist0;
      const next = Math.max(S_MIN, Math.min(S_MAX, Math.round(scrub.S0 * ratio)));
      if (next !== S) setZoom(next, false);
    }
  }
  function onScrubUp(e) {
    if (!scrub) return;
    scrub.pointers.delete(e.pointerId);
    if (scrub.pointers.size === 0) {
      let v = scrub.vy * 16; // px per frame
      const glide = () => { if (Math.abs(v) < 0.5) return; view.scrollTop -= v; v *= 0.93; scrub.inertia = requestAnimationFrame(glide); };
      if (Math.abs(v) > 1) scrub.inertia = requestAnimationFrame(glide);
      store.set("zoom", S);
    } else scrub.dist0 = null;
  }
  function setZoom(next, persist = true) {
    next = Math.max(S_MIN, Math.min(S_MAX, next));
    if (next === S) return;
    const frac = view.scrollHeight ? view.scrollTop / view.scrollHeight : 0;
    S = next; layout();
    view.scrollTop = frac * view.scrollHeight;
    if (persist) store.set("zoom", S);
  }

  // --- actions from the rails + keys -----------------------------------------
  function act(name, arg) {
    switch (name) {
      case "back": close(); return;
      case "undo": if (history.canUndo) { doc = history.undo(); dirty = true; selection.clear(); layout(); flush(); } return;
      case "redo": if (history.canRedo) { doc = history.redo(); dirty = true; selection.clear(); layout(); flush(); } return;
      case "select": setMode(mode === "select" ? "place" : "select"); return;
      case "scrub": setMode(mode === "scrub" ? "place" : "scrub"); return;
      case "delete": deleteSelection(); return;
      case "zoom-in": setZoom(S + 2); return;
      case "zoom-out": setZoom(S - 2); return;
      case "dur":
        if (mode === "place" && armed.base === arg) { setMode("select"); return; } // tap the armed one again → nothing armed
        armed = { ...armed, base: arg }; store.set("armed", { base: armed.base, rest: armed.rest });
        if (mode !== "place") setMode("place"); else sync();
        return;
      case "rest": armed = { ...armed, rest: !armed.rest }; store.set("armed", { base: armed.base, rest: armed.rest }); if (mode !== "place") setMode("place"); else sync(); return;
      default: return;
    }
  }
  function setMode(next) {
    if (mode === next) return;
    if (drag) grabEnd({ pointerId: drag.id }, { cancel: true });
    mode = next; R?.showGhost(null);
    if (mode === "scrub") { gesture = null; } else { cancelAnimationFrame(scrub?.inertia); scrub = null; }
    sync();
  }
  const onKey = (e) => {
    if (closed || e.target.matches("input, textarea, [contenteditable]") || document.querySelector(".lb-sheet-wrap")) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); act(e.shiftKey ? "redo" : "undo"); return; }
    if (mod) return;
    if (e.key === "Escape") { if (mode === "place" && selection.size) { selection.clear(); R.setSelection(selection); sync(); } else setMode("select"); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); return; }
    if (KEY_BASE[e.key]) { act("dur", KEY_BASE[e.key]); return; }
    const k = e.key.toLowerCase();
    if (k === "r") act("rest"); else if (k === "s") setMode(mode === "scrub" ? "place" : "scrub"); else if (k === "v") setMode(mode === "select" ? "place" : "select");
    else if (k === "=" || k === "+") act("zoom-in"); else if (k === "-") act("zoom-out");
  };
  document.addEventListener("keydown", onKey);
  const onResize = () => { if (!closed) layout(); };
  window.addEventListener("resize", onResize);
  const onHide = () => flush();
  window.addEventListener("pagehide", onHide);

  layout();
  toast(`${durName(armed.base)} armed — tap the staff`);

  function close({ silent = false } = {}) {
    if (closed) return;
    closed = true;
    flush();
    const trimmed = trimBars(doc);
    if (trimmed.measures.length !== doc.measures.length) logbook.updateComposition(id, { measures: trimmed.measures });
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pagehide", onHide);
    cancelAnimationFrame(scrub?.inertia);
    sound.destroy();
    setRunning?.(false);
    el.remove();
    if (!silent) onClose?.();
  }

  const api = {
    id, close,
    /** For tests: the live state. */
    get state() { return { mode, armed, S, selection: [...selection], bars: doc.measures.length, dragging: !!drag, doc }; },
    /** For tests: the client point of a musical place. */
    pointFor({ bar, staff, ticks, step }) {
      const { sys, bar: hb } = barAt(L, bar);
      const r = R.svg.getBoundingClientRect();
      return { x: r.left + xOfTicks(hb, ticks) * S, y: r.top + stepY(sys, staff, step) * S };
    },
  };
  el.__editor = api;
  return api;
}
