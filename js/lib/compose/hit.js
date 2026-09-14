// Point → musical place (docs/COMPOSE_DESIGN.md §6.8). Coordinates in S.
// `slotAt` answers "where would a tap land" (system, bar, staff, ticks, step);
// `thingAt` answers "what drawn thing is under this point" (a head, a rest, a stem) — with the
// voice it belongs to, so the editor's active voice can follow the pen. A crossed note is found
// where it is drawn.
export function slotAt(L, x, y) {
  const sys = L.hit.systems.find((s) => y >= s.top && y <= s.bottom) ?? nearestSystem(L, y);
  if (!sys) return null;
  // the staff whose lines are nearest (ledger zones split at the midpoint of the gap)
  let staff = 0, best = Infinity;
  sys.staves.forEach((st, i) => { const c = st.topY + 2, d = Math.abs(y - c); if (d < best) { best = d; staff = i; } });
  const bar = sys.bars.find((b) => x >= b.x0 && x < b.x1) ?? (x < sys.bars[0].x0 ? sys.bars[0] : sys.bars[sys.bars.length - 1]);
  const topY = sys.staves[staff].topY;
  const step = Math.max(-10, Math.min(18, Math.round((topY + 4 - y) * 2)));
  return { bar: bar.index, staff, ticks: ticksAt(bar, x), step };
}
function nearestSystem(L, y) {
  let best = null, bd = Infinity;
  for (const s of L.hit.systems) { const d = y < s.top ? s.top - y : y - s.bottom; if (d < bd) { bd = d; best = s; } }
  return bd < 8 ? best : null;
}
/** Piecewise-linear ticks between the bar's columns (the last column runs to the barline). */
export function ticksAt(bar, x) {
  const cols = [...bar.cols, { ticks: bar.cap, x: bar.x1 - 0.6 }];
  if (x <= cols[0].x) return 0;
  for (let i = 0; i < cols.length - 1; i++) {
    const a = cols[i], b = cols[i + 1];
    if (x < b.x) return a.ticks + ((x - a.x) / Math.max(1e-6, b.x - a.x)) * (b.ticks - a.ticks);
  }
  return bar.cap - 1;
}
/** The x of a tick inside a bar (inverse of ticksAt) — where the ghost goes. */
export function xOfTicks(bar, t) {
  const cols = [...bar.cols, { ticks: bar.cap, x: bar.x1 - 0.6 }];
  for (let i = 0; i < cols.length - 1; i++) {
    const a = cols[i], b = cols[i + 1];
    if (t >= a.ticks && t < b.ticks) return a.x + ((t - a.ticks) / (b.ticks - a.ticks)) * (b.x - a.x);
  }
  return cols[cols.length - 1].x;
}
export function barAt(L, bar, system = null) {
  for (const s of L.hit.systems) { if (system !== null && L.hit.systems.indexOf(s) !== system) continue; const b = s.bars.find((x) => x.index === bar); if (b) return { sys: s, bar: b }; }
  return null;
}
/** The head / rest / stem under a point, or null. */
export function thingAt(L, x, y) {
  let best = null, bd = Infinity;
  for (const d of L.drawn) {
    if (d.rest) {
      const cx = d.x + 0.7, dx = Math.abs(x - cx), dy = Math.abs(y - d.y);
      if (dx <= 1.1 && dy <= 2.2 && dx + dy < bd) { bd = dx + dy; best = { type: "rest", ev: d.id, bar: d.bar, staff: d.staff, voice: d.voice }; }
      continue;
    }
    for (const h of d.heads) {
      const dx = Math.abs(x - (h.x + d.headW / 2)), dy = Math.abs(y - h.y);
      if (dx <= 0.75 && dy <= 0.35 && dx + dy < bd) { bd = dx + dy; best = { type: "head", ev: d.id, pi: h.pi, bar: d.bar, staff: d.staff, voice: d.voice }; }
    }
    if (d.stem && d.heads.length > 1 && Math.abs(x - d.stemX) <= 0.45 && y >= Math.min(d.stemFromY, d.stemTipY) && y <= Math.max(d.stemFromY, d.stemTipY) && 0.5 < bd) { bd = 0.5; best = { type: "stem", ev: d.id, bar: d.bar, staff: d.staff, voice: d.voice }; }
  }
  return best;
}

/** Every selectable drawn thing with its anchor point (in S): heads, rests (later: marks). */
export function things(L) {
  const out = [];
  for (const d of L.drawn) {
    if (d.rest) { out.push({ type: "rest", ev: d.id, bar: d.bar, staff: d.staff, voice: d.voice, x: d.x + 0.7, y: d.y }); continue; }
    for (const h of d.heads) out.push({ type: "head", ev: d.id, pi: h.pi, bar: d.bar, staff: d.staff, voice: d.voice, x: h.x + d.headW / 2, y: h.y });
  }
  return out;
}
/** Ray-casting point-in-polygon; poly is [{ x, y }, …]. */
export function inside(poly, x, y) {
  let on = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) on = !on;
  }
  return on;
}
/** The things a closed lasso (points in S) encloses. */
export const lasso = (L, poly) => (poly.length < 3 ? [] : things(L).filter((t) => inside(poly, t.x, t.y)));
