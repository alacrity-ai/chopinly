// The Logbook's flourishes (docs/LOGBOOK_V2_DESIGN.md §6). Every move is a
// no-op — or opacity only — under prefers-reduced-motion. No sound: the
// metronome owns audio.

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const haptic = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

/** Teacher's sticker: the existing `stamp` keyframe, then clean up. */
export function stamp(el) {
  if (!el) return;
  el.classList.remove("lb-stamp");
  void el.offsetWidth; // restart the animation if it's already applied
  el.classList.add("lb-stamp");
  el.addEventListener("animationend", () => el.classList.remove("lb-stamp"), { once: true });
}

/**
 * The whoosh: a clone of `fromEl`'s text lifts off its position and lands on
 * `toEl` (FLIP), then `toEl` is revealed. Resolves when it lands.
 */
export function whoosh(fromEl, toEl) {
  if (!fromEl || !toEl) return Promise.resolve();
  if (reduced()) { toEl.classList.add("lb-arrived"); return Promise.resolve(); }
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  if (!a.width || !b.width) { toEl.classList.add("lb-arrived"); return Promise.resolve(); }
  const ghost = document.createElement("div");
  ghost.className = "lb-ghost";
  ghost.textContent = fromEl.textContent.trim();
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.append(ghost);
  toEl.classList.add("lb-arriving");
  const dx = b.left - a.left, dy = b.top - a.top, sx = b.width / a.width, sy = b.height / a.height;
  const anim = ghost.animate(
    [{ transform: "translate(0,0) scale(1,1)", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.9 }],
    { duration: 380, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.1)", fill: "forwards" },
  );
  return new Promise((r) => {
    const done = () => { ghost.remove(); toEl.classList.remove("lb-arriving"); toEl.classList.add("lb-arrived"); r(); };
    anim.addEventListener("finish", done, { once: true });
    setTimeout(done, 450);
  });
}

/** A row ticks felt-red (stop, or the goal you switched away from). */
export function tickRow(rowEl) {
  if (!rowEl) return;
  rowEl.classList.remove("lb-tick");
  void rowEl.offsetWidth;
  rowEl.classList.add("lb-tick");
  rowEl.addEventListener("animationend", () => rowEl.classList.remove("lb-tick"), { once: true });
}

/** Stop: the hero numeral settles down into its row (ghost only — the row is re-rendered by the caller). */
export function settle(numeralEl, rowEl) {
  if (!numeralEl || reduced() || !rowEl) return Promise.resolve();
  const a = numeralEl.getBoundingClientRect(), b = rowEl.getBoundingClientRect();
  if (!a.width || !b.width) return Promise.resolve();
  const ghost = document.createElement("div");
  ghost.className = "lb-ghost lb-ghost-num";
  ghost.textContent = numeralEl.textContent.trim();
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.append(ghost);
  const anim = ghost.animate(
    [{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${b.right - a.right}px, ${b.top - a.top}px) scale(0.35)`, opacity: 0 }],
    { duration: 300, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" },
  );
  return new Promise((r) => { const done = () => { ghost.remove(); r(); }; anim.addEventListener("finish", done, { once: true }); setTimeout(done, 380); });
}

/** A new note / row slides in at the top. */
export function slideIn(el) {
  if (!el) return;
  el.classList.add("lb-slide-in");
  el.addEventListener("animationend", () => el.classList.remove("lb-slide-in"), { once: true });
}

/** The week-strip dot for today fills with a brass glow the first minute of the day. */
export function glow(el) {
  if (!el) return;
  el.classList.add("lb-glow");
  el.addEventListener("animationend", () => el.classList.remove("lb-glow"), { once: true });
}
