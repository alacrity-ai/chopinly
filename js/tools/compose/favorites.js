// Favorites (docs/COMPOSE_DESIGN.md §8.5o, WSHED-148): the floating palette over the score. A
// grabber bar (drag it anywhere), an × to hide it, six slots that are the live rail buttons
// they name (a tap clicks the rail button; the slot mirrors its state), and ◀ n / 8 ▶. An empty
// slot listens for the next rail button tapped; a held slot empties. The editor summons the
// panel to a point with a 2 s hold; the controls rail's Favorites button shows or hides it.
import { icon } from "../../lib/icons.js";
import { toast } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";
import { PAGES, SLOTS, keyOf, sameKey, allowed, normalize, assign, clear, turn } from "../../lib/compose/favorites.js";

export const FAV_CLEAR_MS = 1500; // hold a filled slot this long to empty it
const PAD = 8;                     // the panel keeps this much of the editor's edge

/**
 * createFavorites({ host, rails, store, onChange }) — host is the editor element the panel lives in,
 * rails the element holding the rail buttons, store the per-device store; onChange fires when the
 * shown state flips (the editor re-syncs the rails' toggle). Returns { el, on, state, capture,
 * toggle, summon, cancel, sync, relayout, destroy }.
 */
export function createFavorites({ host, rails, store, onChange }) {
  let st = normalize(store.get("favorites", null));
  let listening = -1;   // the slot on the current page waiting for a rail button, or -1
  let swallow = false;  // the click that follows a hold-to-clear
  const save = () => store.set("favorites", { pages: st.pages, page: st.page, pos: st.pos, on: st.on });

  const el = document.createElement("div");
  el.className = "cp-fav";
  el.hidden = !st.on;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "favorites");
  el.innerHTML = `
    <div class="cp-fav-bar" id="cp-fav-bar"><span class="cp-fav-grip" aria-hidden="true">${icon("grip")}</span><span class="cp-fav-name">Favorites</span><button type="button" class="cp-btn cp-sq cp-fav-x" data-fav="close" aria-label="hide favorites">${icon("close")}</button></div>
    <div class="cp-fav-hint" id="cp-fav-hint" hidden>Tap any rail button to put it here.<br>Tap the slot again to cancel.</div>
    <div class="cp-fav-grid">${Array.from({ length: SLOTS }, (_, i) => `<button type="button" class="cp-btn cp-sq cp-fav-slot" data-slot="${i}"></button>`).join("")}</div>
    <div class="cp-fav-foot"><button type="button" class="cp-btn cp-sq" data-fav="prev" aria-label="previous page">${icon("back")}</button><span class="cp-fav-page" aria-live="polite"></span><button type="button" class="cp-btn cp-sq" data-fav="next" aria-label="next page">${icon("next")}</button></div>`;
  const slots = [...el.querySelectorAll(".cp-fav-slot")], hint = el.querySelector("#cp-fav-hint"), pageEl = el.querySelector(".cp-fav-page");
  const prevBtn = el.querySelector("[data-fav=prev]"), nextBtn = el.querySelector("[data-fav=next]"), bar = el.querySelector("#cp-fav-bar");

  /** The live rail button a key names (menu rows included), or null when no such button exists any more. */
  const source = (key) => { for (const b of rails.querySelectorAll("[data-act]")) { if (!b.dataset.pop && sameKey(keyOf(b.dataset), key)) return b; } return null; };
  const EMPTY = `<span class="cp-fav-plus" aria-hidden="true">+</span>`;
  /** Draw the page: each slot is its button's content (ids stripped) and state, or the empty +. */
  function render() {
    const page = st.pages[st.page];
    slots.forEach((b, i) => {
      const key = page[i], src = key && source(key);
      b.classList.toggle("cp-fav-listen", listening === i);
      if (src) {
        const html = src.innerHTML.replace(/\s(id|aria-hidden)="[^"]*"/g, (m, a) => (a === "id" ? "" : m));
        if (b.innerHTML !== html) b.innerHTML = html;
        b.dataset.filled = "1";
        b.setAttribute("aria-label", src.getAttribute("aria-label") ?? src.textContent.trim());
        if (src.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", src.getAttribute("aria-pressed")); else b.removeAttribute("aria-pressed");
        b.classList.toggle("on", src.classList.contains("on"));
        b.disabled = src.disabled;
      } else {
        if (b.innerHTML !== EMPTY) b.innerHTML = EMPTY;
        delete b.dataset.filled;
        b.setAttribute("aria-label", key ? "this button is gone — tap to choose another" : listening === i ? "listening — tap a rail button" : "empty — tap to choose a rail button");
        b.removeAttribute("aria-pressed"); b.classList.remove("on"); b.disabled = false;
      }
    });
    hint.hidden = listening < 0;
    pageEl.textContent = `${st.page + 1} / ${PAGES}`;
    prevBtn.disabled = st.page === 0; nextBtn.disabled = st.page === PAGES - 1;
  }
  const listen = (i) => { listening = i; render(); };

  // --- placing: the grabber's middle at a point, kept inside the editor ---------------------
  const bounds = () => host.getBoundingClientRect();
  function clampTo(x, y) {
    const r = bounds(), w = el.offsetWidth, h = el.offsetHeight;
    return { x: Math.max(r.left + PAD, Math.min(x, r.right - w - PAD)), y: Math.max(r.top + PAD, Math.min(y, r.bottom - h - PAD)) };
  }
  const put = (x, y) => { const p = clampTo(x, y); st.pos = p; el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; };
  /** Where a first show goes: under the rails at the right. */
  function firstPlace() {
    const r = bounds(), rr = rails.getBoundingClientRect();
    put(r.right - el.offsetWidth - 12, rr.bottom + 12);
  }
  function show(x, y) {
    const was = st.on;
    st.on = true; el.hidden = false; render();
    if (x !== undefined) put(x - el.offsetWidth / 2, y - bar.offsetHeight / 2);
    else if (st.pos) put(st.pos.x, st.pos.y);
    else firstPlace();
    save();
    if (!was) onChange?.();
  }
  function hide() {
    if (!st.on) return;
    st.on = false; el.hidden = true; listening = -1; save(); onChange?.();
  }
  if (st.on) requestAnimationFrame(() => { if (el.isConnected) { if (st.pos) put(st.pos.x, st.pos.y); else firstPlace(); } });

  // --- the grabber: pointer capture, the panel follows, clamped on the lift -----------------
  let drag = null;
  bar.addEventListener("pointerdown", (e) => {
    if (e.target.closest("[data-fav]") || (e.button && e.button !== 0)) return;
    e.preventDefault();
    drag = { id: e.pointerId, dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
    try { bar.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  });
  bar.addEventListener("pointermove", (e) => { if (drag?.id !== e.pointerId) return; el.style.left = `${e.clientX - drag.dx}px`; el.style.top = `${e.clientY - drag.dy}px`; });
  const dragEnd = (e) => { if (drag?.id !== e.pointerId) return; drag = null; put(el.offsetLeft, el.offsetTop); save(); };
  bar.addEventListener("pointerup", dragEnd); bar.addEventListener("pointercancel", dragEnd);
  el.addEventListener("pointerdown", (e) => e.stopPropagation()); // the editor's document-level listeners are not for the panel

  // --- taps: a slot fires its button or starts listening; the footer pages; × hides ---------
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-fav], .cp-fav-slot");
    if (!b || b.disabled) return;
    if (swallow) { swallow = false; return; }
    if (b.dataset.fav === "close") { hide(); return; }
    if (b.dataset.fav === "prev" || b.dataset.fav === "next") { st = turn(st, b.dataset.fav === "prev" ? -1 : 1); listening = -1; save(); render(); return; }
    const i = Number(b.dataset.slot);
    if (listening === i) { listen(-1); return; }
    const key = st.pages[st.page][i];
    if (!key) { listen(i); return; }
    const src = source(key);
    if (!src) { toast("that button is gone — hold to clear the slot"); return; }
    listening = -1;
    src.click();
    render();
  });
  // hold a filled slot to empty it (the click after the hold is swallowed)
  for (const b of slots) {
    let timer = 0;
    b.addEventListener("pointerdown", (e) => {
      if ((e.button && e.button !== 0) || !b.dataset.filled) return;
      clearTimeout(timer);
      timer = setTimeout(() => { swallow = true; st = clear(st, st.page, Number(b.dataset.slot)); listening = -1; save(); render(); haptic(8); toast("removed"); }, FAV_CLEAR_MS);
    });
    for (const t of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(t, () => clearTimeout(timer));
  }

  const api = {
    el,
    get on() { return st.on; },
    /** For tests: the page, the shown state, the listening slot and the current page's keys. */
    get state() { return { on: st.on, page: st.page, listening, pos: st.pos ? { ...st.pos } : null, slots: st.pages[st.page].map((k) => (k ? { ...k } : null)) }; },
    /** The rails ask before acting: while a slot listens, the tapped button is captured (or refused) and not fired. */
    capture(b) {
      if (listening < 0 || !st.on) return false;
      const rail = b.closest(".cp-rail"), name = rail?.dataset.rail ?? (rail?.classList.contains("cp-header") ? "header" : "");
      if (!allowed({ act: b.dataset.act, rail: name, pop: !!b.dataset.pop })) { toast("that one can't be a favorite"); return true; }
      st = assign(st, st.page, listening, keyOf(b.dataset)); listening = -1; save(); render(); haptic(6);
      return true;
    },
    toggle() { if (st.on) hide(); else show(); },
    /** The 2 s hold: shown at the point (the grabber under the pointer), or moved there. */
    summon(x, y) { show(x, y); },
    cancel() { if (listening >= 0) listen(-1); },
    sync: render,
    relayout() { if (st.on && st.pos) put(st.pos.x, st.pos.y); },
    destroy() { el.remove(); },
  };
  render();
  return api;
}
