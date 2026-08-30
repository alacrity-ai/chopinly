// Small DOM helpers shared by the Logbook screens.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Tap vs long-press (≥ 500 ms) on one element, pointer-agnostic. */
export function longPress(el, onTap, onHold, ms = 500) {
  let timer = 0, held = false;
  const down = (e) => {
    if (e.button && e.button !== 0) return;
    held = false;
    timer = setTimeout(() => { held = true; onHold(); }, ms);
  };
  const up = () => { clearTimeout(timer); if (!held) { /* click handles the tap */ } };
  const cancel = () => { clearTimeout(timer); held = true; };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointerleave", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("click", (e) => { if (held) { e.preventDefault(); return; } onTap(e); });
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

export const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`);
export const fmtClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
export const ago = (days) => (days === null ? "—" : days === 0 ? "today" : days === 1 ? "1d" : `${days}d`);
export const fmtDate = (ms, opts = { weekday: "short", month: "short", day: "numeric" }) =>
  new Date(ms).toLocaleDateString(undefined, opts);
export const fmtTime = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
