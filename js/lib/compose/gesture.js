// Gesture mode's shapes (docs/COMPOSE_DESIGN.md §8.5k, WSHED-131). A stroke is a list of
// points in S. The recogniser is geometry only; what a shape does belongs to the editor.

/**
 * A chevron: two nearly straight legs of comparable length meeting at a sharp-ish vertex, tips
 * roughly level, the vertex between them. Returns "up" (∧ — the vertex above the tips),
 * "down" (∨ — below), or null. `minHeight` (in S) keeps a wobble from counting.
 */
export function chevron(pts, minHeight = 2) {
  if (!pts || pts.length < 3) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  let vi = -1, vd = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = chord < 1e-6 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / chord;
    if (d > vd) { vd = d; vi = i; }
  }
  if (vi < 0) return null;
  const v = pts[vi];
  const l1 = Math.hypot(v.x - a.x, v.y - a.y), l2 = Math.hypot(b.x - v.x, b.y - v.y);
  if (l1 < 1e-6 || l2 < 1e-6 || Math.min(l1, l2) / Math.max(l1, l2) < 0.4) return null;
  const off = (p, p0, p1, len) => Math.abs((p1.x - p0.x) * (p0.y - p.y) - (p0.x - p.x) * (p1.y - p0.y)) / len;
  for (let i = 1; i < vi; i++) if (off(pts[i], a, v, l1) > 0.15 * l1) return null;
  for (let i = vi + 1; i < pts.length - 1; i++) if (off(pts[i], v, b, l2) > 0.15 * l2) return null;
  const cos = ((a.x - v.x) * (b.x - v.x) + (a.y - v.y) * (b.y - v.y)) / (l1 * l2);
  const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  if (angle < 20 || angle > 130) return null;
  const tipY = (a.y + b.y) / 2, h = Math.abs(v.y - tipY);
  if (h < minHeight || Math.abs(a.y - b.y) > 0.5 * h) return null;
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), slack = 0.2 * (x1 - x0);
  if (v.x < x0 - slack || v.x > x1 + slack) return null;
  if (v.y > Math.max(a.y, b.y)) return "down";
  if (v.y < Math.min(a.y, b.y)) return "up";
  return null;
}
