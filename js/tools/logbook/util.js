// Small DOM helpers shared by the Logbook screens (and by other tools that
// write into the Logbook — the metronome imports toast + openSheet).

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Tap vs long-press (≥ 500 ms) on one element, pointer-agnostic.
 * Only the timer firing marks a hold. Leaving/cancelling merely stops the
 * timer — touch browsers fire pointerleave right after pointerup and before
 * click, so treating it as a cancelled tap swallowed every real tap (WSHED-42).
 */
export function longPress(el, onTap, onHold, ms = 500) {
  let timer = 0, held = false;
  const down = (e) => {
    if (e.button && e.button !== 0) return;
    held = false;
    clearTimeout(timer);
    timer = setTimeout(() => { held = true; onHold?.(); }, ms);
  };
  const stop = () => { clearTimeout(timer); };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointerleave", stop);
  el.addEventListener("pointercancel", stop);
  el.addEventListener("click", (e) => { if (held) { e.preventDefault(); held = false; return; } onTap?.(e); });
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.style.touchAction = "manipulation";
}

/** 95 → "1h 35m", 45 → "45m", 0 → "0m". */
export const fmtMin = (m) => {
  const n = Math.max(0, Math.round(Number(m) || 0));
  return n >= 60 ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m` : `${n}m`;
};
export const fmtClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
/** Days since → "today" · "yesterday" · "3d ago" · "never". */
export const ago = (days) => (days === null || days === undefined ? "never" : days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`);
export const fmtDate = (ms, opts = { weekday: "short", month: "short", day: "numeric" }) =>
  new Date(ms).toLocaleDateString(undefined, opts);
/** A day heading relative to now: "today" · "yesterday" · "Sep 4" · "Sep 4, 2025". */
export function relDay(ms, now = Date.now()) {
  const d = new Date(ms), n = new Date(now);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, n)) return "today";
  const y = new Date(n); y.setDate(y.getDate() - 1);
  if (same(d, y)) return "yesterday";
  return fmtDate(ms, d.getFullYear() === n.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
/** "0 goals" / "1 goal" / "3 goals". */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// --- toast --------------------------------------------------------------------
let toastEl = null, toastTimer = 0;
export function toast(text) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "lb-toast";
    toastEl.setAttribute("role", "status");
    document.body.append(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

// --- sheet ----------------------------------------------------------------------
/**
 * A bottom sheet (phones) / centred card (desktop) over a dimmed backdrop.
 * Mounted on document.body so any tool can open one. Esc, ✕ and the backdrop
 * close it. Returns { panel, close, closed } — `closed` resolves when it's gone.
 */
export function openSheet({ title = "", html = "", cls = "" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = `lb-sheet-wrap ${cls}`;
  wrap.innerHTML = `
    <div class="lb-backdrop"></div>
    <div class="lb-sheet" role="dialog" aria-modal="true" ${title ? `aria-label="${esc(title)}"` : ""}>
      <div class="lb-sheet-head">
        <h2 class="lb-sheet-title">${esc(title)}</h2>
        <button class="lb-close" aria-label="close">&times;</button>
      </div>
      <div class="lb-sheet-body">${html}</div>
    </div>`;
  const panel = wrap.querySelector(".lb-sheet");
  let resolveClosed;
  const closed = new Promise((r) => { resolveClosed = r; });
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    wrap.classList.add("closing");
    const done = () => { wrap.remove(); resolveClosed(); };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) done();
    else { panel.addEventListener("animationend", done, { once: true }); setTimeout(done, 320); }
  };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  document.addEventListener("keydown", onKey);
  wrap.querySelector(".lb-backdrop").addEventListener("click", close);
  wrap.querySelector(".lb-close").addEventListener("click", close);
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add("open"));
  return { wrap, panel, body: wrap.querySelector(".lb-sheet-body"), close, closed };
}
/** True while any sheet is open — the screens skip re-rendering then. */
export const sheetOpen = () => !!document.querySelector(".lb-sheet-wrap:not(.closing)");
/** Fine pointer = a mouse/trackpad; autofocus text fields only then. */
export const finePointer = () => matchMedia("(pointer: fine)").matches;
