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
/** The head / rest / stem / expression under a point, or null; `handles` = ids of selected spans whose ends answer as handles;
 * `tol` (in S) widens every box to a fingertip in Touch mode (docs/COMPOSE_DESIGN.md §8.5i) — the nearest thing still wins. */
export function thingAt(L, x, y, handles = new Set(), tol = 0) {
  let best = null, bd = Infinity;
  for (const d of L.drawn) {
    if (d.rest) {
      const cx = d.x + 0.7, dx = Math.abs(x - cx), dy = Math.abs(y - d.y);
      if (dx <= Math.max(1.1, tol) && dy <= Math.max(2.2, tol) && dx + dy < bd) { bd = dx + dy; best = { type: "rest", ev: d.id, bar: d.bar, staff: d.staff, voice: d.voice }; }
      continue;
    }
    for (const h of d.heads) {
      const dx = Math.abs(x - (h.x + d.headW / 2)), dy = Math.abs(y - h.y);
      if (dx <= Math.max(0.75, tol) && dy <= Math.max(0.35, tol) && dx + dy < bd) { bd = dx + dy; best = { type: "head", ev: d.id, pi: h.pi, bar: d.bar, staff: d.staff, voice: d.voice }; }
    }
    if (d.stem && d.heads.length > 1 && Math.abs(x - d.stemX) <= 0.45 && y >= Math.min(d.stemFromY, d.stemTipY) && y <= Math.max(d.stemFromY, d.stemTipY) && 0.5 < bd) { bd = 0.5; best = { type: "stem", ev: d.id, bar: d.bar, staff: d.staff, voice: d.voice }; }
  }
  if (best) return best;
  // expressions (docs/COMPOSE_EXPRESSIONS_DESIGN.md §4): after the notes, which are small and sit on the staff
  for (const dy of L.dynamics) if (Math.abs(x - dy.x) <= Math.max(1.2, tol) && Math.abs(y - dy.y + 0.3) <= Math.max(0.9, tol)) return { type: "dyn", ev: dy.id, bar: dy.bar, staff: dy.staff, x: dy.x, y: dy.y };
  for (const tx of L.texts) if (x >= tx.x - 0.3 - tol && x <= tx.x + 0.6 * tx.text.length + tol && y >= tx.y - 1.1 - tol && y <= tx.y + 0.3 + tol) return { type: "text", ev: tx.id, bar: tx.bar, staff: tx.staff, x: tx.x, y: tx.y };
  for (const hp of spans(L)) { // hairpins, pedal lines, octave lines (docs/COMPOSE_PIANO_DESIGN.md §6) answer alike
    if (Math.abs(y - hp.y) > Math.max(0.9, tol) || x < hp.x1 - 0.6 - tol || x > hp.x2 + 0.6 + tol) continue;
    const t = { type: hp.type, ev: hp.id, bar: hp.bar, staff: hp.staff, x: (hp.x1 + hp.x2) / 2, y: hp.y };
    if (handles.has(hp.id)) { // a selected span: its real ends are handles (an open half has no handle at the break)
      if (hp.half !== "in" && hp.half !== "both" && Math.abs(x - hp.x1) <= Math.max(1.0, tol)) return { ...t, type: `${hp.type}-start` };
      if (hp.half !== "out" && hp.half !== "both" && Math.abs(x - hp.x2) <= Math.max(1.0, tol)) return { ...t, type: `${hp.type}-end` };
    }
    return t;
  }
  return null;
}
/** Every span the layout drew (hairpins, pedals, octave lines), each piece carrying its `type`. */
export const spans = (L) => [...L.hairpins, ...(L.pedals ?? []), ...(L.ottavas ?? []), ...(L.textLines ?? [])];
/** Whether a thing type is a selected span's end handle. */
export const isHandle = (type) => /-(start|end)$/.test(type ?? "");

/** Every selectable drawn thing with its anchor point (in S): heads, rests, dynamics, texts, hairpins. */
export function things(L) {
  const out = [];
  for (const d of L.drawn) {
    if (d.rest) { out.push({ type: "rest", ev: d.id, bar: d.bar, staff: d.staff, voice: d.voice, x: d.x + 0.7, y: d.y }); continue; }
    for (const h of d.heads) out.push({ type: "head", ev: d.id, pi: h.pi, bar: d.bar, staff: d.staff, voice: d.voice, x: h.x + d.headW / 2, y: h.y });
  }
  for (const dy of L.dynamics) out.push({ type: "dyn", ev: dy.id, bar: dy.bar, staff: dy.staff, x: dy.x, y: dy.y - 0.3 });
  for (const tx of L.texts) out.push({ type: "text", ev: tx.id, bar: tx.bar, staff: tx.staff, x: tx.x + 0.3 * tx.text.length, y: tx.y - 0.4 });
  const seen = new Set();
  for (const hp of spans(L)) { if (seen.has(hp.id)) continue; seen.add(hp.id); out.push({ type: hp.type, ev: hp.id, bar: hp.bar, staff: hp.staff, x: (hp.x1 + hp.x2) / 2, y: hp.y }); } // a split span is one thing, anchored on its first half
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
/**
 * A stroke that does not come back round is a line, not a loop (v102): its end sits more than 45 % of its
 * drawn length from its start (a closed loop ≈ 0, three quarters of a circle ≈ 0.3, a line ≈ 1), or it
 * encloses next to nothing (area under 1 % of its perimeter² — a circle is ≈ 8 %, a square 6 %).
 */
export function isLine(poly) {
  if (poly.length < 3) return true;
  let area = 0, perim = 0, drawn = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a.x * b.y - b.x * a.y; const d = Math.hypot(b.x - a.x, b.y - a.y); perim += d; if (i < poly.length - 1) drawn += d; }
  const gap = Math.hypot(poly[poly.length - 1].x - poly[0].x, poly[poly.length - 1].y - poly[0].y);
  return drawn === 0 || gap > 0.45 * drawn || Math.abs(area) / 2 / (perim * perim) < 0.01;
}
export const lasso = (L, poly) => (isLine(poly) ? [] : things(L).filter((t) => inside(poly, t.x, t.y)));

/**
 * Gesture mode's strike (docs/COMPOSE_DESIGN.md §8.5j): which `targets` (`{ key, x, y, rx, ry }`, boxes in S)
 * a stroke `pts` (`[{ x, y }]`, in S) passes through — every segment against every box by slab clipping.
 * A one-point stroke is a point test. Returns the keys crossed.
 */
export function struck(pts, targets) {
  const hit = new Set();
  if (!pts?.length) return hit;
  const segs = pts.length === 1 ? [[pts[0], pts[0]]] : pts.slice(1).map((p, i) => [pts[i], p]);
  for (const t of targets) {
    const x0 = t.x - t.rx, x1 = t.x + t.rx, y0 = t.y - t.ry, y1 = t.y + t.ry;
    for (const [a, b] of segs) {
      const dx = b.x - a.x, dy = b.y - a.y;
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]]) {
        if (p === 0) { if (q < 0) { ok = false; break; } continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
        else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
      }
      if (ok) { hit.add(t.key); break; }
    }
  }
  return hit;
}

