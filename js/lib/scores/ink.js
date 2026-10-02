// The ink model (docs/SCORES_DESIGN.md §7). Pure and DOM-free.
//
// In memory a stroke is { t: "pen"|"hi", c: 0|1|2, w, k?, a?, pts: [{ x, y, p }…] }
// with x, y in 0..1 of the page box, p (pressure) in 0..1, and w the base
// width in page units (1/10 000 of the page width — ink scales with the page).
// `k` is the colour (#rrggbb) and `a` the opacity (0..1) the brush had
// (WSHED-106); a stroke without them is v52 ink and takes the palette colour
// `c` and the tool's flat opacity, so old ink renders exactly as it did.
//
// On the wire (and in the logbook) a page's ink is { v: 1, s: [ { t, c, w,
// k?, a?, p: [x0, y0, p0, dx, dy, dp, …] } ] }: coordinates quantised to
// 1/10 000, pressure to 1/255, opacity to 1/100, points delta-encoded, all
// integers. A page of fingerings is a few hundred bytes; the sync cap for the
// kind is 128 KB. A single point is a dot.
export const SCALE = 10000, PSCALE = 255;
export const TOOLS = { pen: "pen", hi: "hi" };
/** Colours by index: ink, brass, felt red (design §7). */
export const COLORS = ["#1a1410", "#c9a35c", "#b0463c"];
/** Base widths in page units: a 2.4 px pen and an 18 px highlighter on a 420 px page. */
export const PEN_W = Math.round((2.4 / 420) * SCALE), HI_W = Math.round((18 / 420) * SCALE);
/** A stroke needs this much travel (page units) or it is a tap, not ink. */
export const MIN_TRAVEL = Math.round((4 / 420) * SCALE);
/** Flat opacity of the two v52 tools, for strokes that carry none. */
export const TOOL_ALPHA = { pen: 1, hi: 0.35 };

// --- brushes (WSHED-106) -----------------------------------------------------------
// A brush is { id, name, color: "#rrggbb", width: px on a 420 px page,
// opacity: 0.05..1, hi: bool (highlighter: flat width, multiply blend), pos }.
// Widths in px here so the editor reads naturally; strokes carry page units.
export const REF_W = 420, MIN_WIDTH = 0.5, MAX_WIDTH = 40;
/** The starter set. Fixed ids so two devices that seed apart converge after a sync. */
export const DEFAULT_BRUSHES = [
  { id: "b-ink", name: "ink", color: "#1a1410", width: 2.4, opacity: 1, hi: false },
  { id: "b-red", name: "red pen", color: "#b0463c", width: 2.4, opacity: 1, hi: false },
  { id: "b-pencil", name: "pencil", color: "#4a4038", width: 3.2, opacity: 0.55, hi: false },
  { id: "b-brass", name: "brass", color: "#c9a35c", width: 3, opacity: 1, hi: false },
  { id: "b-yellow", name: "highlighter", color: "#f4d03f", width: 18, opacity: 0.35, hi: true },
  { id: "b-blue", name: "blue highlighter", color: "#5aa9f5", width: 18, opacity: 0.35, hi: true },
].map((b, i) => ({ ...b, pos: (i + 1) * 1000 }));
/** Colours the editor offers as one-tap swatches. */
export const SWATCHES = ["#1a1410", "#b0463c", "#c9a35c", "#2f6f9f", "#3f8f5f", "#7a4fa8", "#e07a2f", "#4a4038", "#f4d03f", "#5aa9f5", "#f28ab2", "#7fdc9a"];
const clampN = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
export const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c ?? ""));
/** Normalise a brush's fields (throws on a missing name). Unknown keys are dropped. */
export function cleanBrush(b = {}) {
  const name = String(b.name ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (!name) throw new Error("a brush needs a name");
  return {
    name,
    color: isHex(b.color) ? String(b.color).toLowerCase() : COLORS[0],
    width: Math.round(clampN(b.width, MIN_WIDTH, MAX_WIDTH, 2.4) * 10) / 10,
    opacity: Math.round(clampN(b.opacity, 0.05, 1, 1) * 100) / 100,
    hi: !!b.hi,
  };
}
/** A fresh stroke drawn with a brush (points empty). */
export const strokeFor = (b) => ({ t: b.hi ? "hi" : "pen", c: 0, w: Math.max(1, Math.round((b.width / REF_W) * SCALE)), k: b.color, a: b.opacity, pts: [] });

const q = (v, s) => Math.max(0, Math.min(s, Math.round(v * s)));

/** Strokes → wire body. Points are quantised and delta-encoded. */
export function encode(strokes) {
  const s = [];
  for (const st of strokes) {
    if (!st.pts?.length) continue;
    const p = [];
    let lx = 0, ly = 0, lp = 0;
    for (const pt of st.pts) {
      const x = q(pt.x, SCALE), y = q(pt.y, SCALE), pr = q(pt.p ?? 0.5, PSCALE);
      p.push(x - lx, y - ly, pr - lp);
      lx = x; ly = y; lp = pr;
    }
    const out = { t: st.t === "hi" ? "hi" : "pen", c: Math.max(0, Math.min(COLORS.length - 1, st.c | 0)), w: Math.max(1, Math.round(st.w)), p };
    if (isHex(st.k)) out.k = String(st.k).toLowerCase();
    if (st.a !== undefined && st.a !== null && Number.isFinite(Number(st.a))) out.a = q(Number(st.a), 100);
    s.push(out);
  }
  return { v: 1, s };
}

/** Wire body → strokes (floats). Tolerates a missing / malformed body. */
export function decode(body) {
  const out = [];
  for (const st of body?.s ?? []) {
    if (!Array.isArray(st.p) || st.p.length < 3) continue;
    const pts = [];
    let x = 0, y = 0, p = 0;
    for (let i = 0; i + 2 < st.p.length; i += 3) {
      x += st.p[i]; y += st.p[i + 1]; p += st.p[i + 2];
      pts.push({ x: x / SCALE, y: y / SCALE, p: p / PSCALE });
    }
    const o = { t: st.t === "hi" ? "hi" : "pen", c: st.c | 0, w: st.w || PEN_W, pts };
    if (isHex(st.k)) o.k = String(st.k).toLowerCase();
    if (Number.isFinite(Number(st.a))) o.a = Math.max(0, Math.min(1, Number(st.a) / 100));
    out.push(o);
  }
  return out;
}

/** Bytes a body takes on the wire. */
export const bytes = (body) => JSON.stringify(body).length;

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
};

/** Ramer–Douglas–Peucker on { x, y } points; `tol` in the same units. Pressure rides along. */
export function simplify(pts, tol = 1 / SCALE) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i].x, pts[i].y, pts[a].x, pts[a].y, pts[b].x, pts[b].y);
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol && bi > 0) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Travel of a point list in normalised units (max distance from the first point). */
export function travel(pts) {
  if (!pts.length) return 0;
  let m = 0;
  for (const p of pts) m = Math.max(m, Math.hypot(p.x - pts[0].x, p.y - pts[0].y));
  return m;
}

/** Index of the first stroke within `r` (normalised units) of (x, y), or -1. */
export function hit(strokes, x, y, r) {
  for (let i = 0; i < strokes.length; i++) {
    const pts = strokes[i].pts;
    if (pts.length === 1) { if (Math.hypot(pts[0].x - x, pts[0].y - y) <= r) return i; continue; }
    for (let j = 1; j < pts.length; j++) if (segDist(x, y, pts[j - 1].x, pts[j - 1].y, pts[j].x, pts[j].y) <= r) return i;
  }
  return -1;
}

/** The opacity a stroke is laid down at. */
export const alphaOf = (st) => st.a ?? TOOL_ALPHA[st.t] ?? 1;
/**
 * A stroke that must go down as one layer (WSHED-163): it is painted a segment
 * at a time, the segments overlap by a whole round cap, and under a translucent
 * or multiplying brush every overlap would add — a 35 % highlighter sampled at
 * pen rate turns opaque. Opaque source-over ink can overlap itself freely.
 */
export const layered = (st) => st.t === "hi" || alphaOf(st) < 1;
/** Width of a stroke at a point, in the canvas's pixels: pressure moves a pen between 0.55× and 1.45× of its base, a highlighter is flat. */
const widthAt = (st, base, pt) => (st.t === "hi" ? base : base * (0.55 + 0.9 * (pt.p ?? 0.5)));

/**
 * Paint one stroke's shape in its colour with whatever alpha and blend the
 * context has — the caller decides how it lands. Points from index `from` on
 * (a stroke in flight grows by its tail); a single point is a dot.
 */
export function paintStroke(ctx, st, w, h, from = 0) {
  const pts = st.pts;
  if (!pts.length) return;
  const base = (st.w / SCALE) * w;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = ctx.fillStyle = st.k ?? COLORS[st.c] ?? COLORS[0];
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x * w, pts[0].y * h, widthAt(st, base, pts[0]) / 2, 0, Math.PI * 2); ctx.fill(); return; }
  for (let i = Math.max(1, from); i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    ctx.lineWidth = widthAt(st, base, b);
    ctx.beginPath();
    if (i >= 2) { const m = pts[i - 2]; const cx = a.x * w, cy = a.y * h; ctx.moveTo((m.x * w + cx) / 2, (m.y * h + cy) / 2); ctx.quadraticCurveTo(cx, cy, (cx + b.x * w) / 2, (cy + b.y * h) / 2); }
    else { ctx.moveTo(a.x * w, a.y * h); ctx.lineTo((a.x * w + b.x * w) / 2, (a.y * h + b.y * h) / 2); }
    ctx.stroke();
  }
  const l = pts[pts.length - 1], k = pts[pts.length - 2];
  ctx.lineWidth = widthAt(st, base, l);
  ctx.beginPath(); ctx.moveTo((k.x * w + l.x * w) / 2, (k.y * h + l.y * h) / 2); ctx.lineTo(l.x * w, l.y * h); ctx.stroke();
}

/** The pixel box a stroke can touch, padded for its widest point and clipped to both surfaces: [x, y, w, h]. */
function boxOf(st, w, h, ctx, scratch) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of st.pts) { x0 = Math.min(x0, p.x * w); x1 = Math.max(x1, p.x * w); y0 = Math.min(y0, p.y * h); y1 = Math.max(y1, p.y * h); }
  const pad = ((st.w / SCALE) * w * 1.45) / 2 + 2;
  const W = Math.min(ctx.canvas.width, scratch.canvas.width), H = Math.min(ctx.canvas.height, scratch.canvas.height);
  const bx = Math.max(0, Math.floor(x0 - pad)), by = Math.max(0, Math.floor(y0 - pad));
  return [bx, by, Math.min(W, Math.ceil(x1 + pad)) - bx, Math.min(H, Math.ceil(y1 + pad)) - by];
}

/**
 * Draw strokes on a 2D context sized to the page: `w`, `h` are the canvas's
 * device pixels for the whole page box. An opaque stroke is painted straight
 * on (`from` paints only its tail, for a stroke in flight). A layered stroke
 * (see `layered`) is painted at full strength on `scratch` — a 2D context at
 * least as large, left clean afterwards — and laid on once at its opacity, so
 * a stroke is one even layer however densely it was sampled and wherever it
 * crosses itself; two strokes still darken where they cross.
 */
export function draw(ctx, strokes, w, h, { from = 0, only = null, scratch = null } = {}) {
  const list = only ? [only] : strokes;
  for (const st of list) {
    if (!st.pts.length) continue;
    ctx.globalCompositeOperation = st.t === "hi" ? "multiply" : "source-over";
    if (!layered(st)) { ctx.globalAlpha = 1; paintStroke(ctx, st, w, h, from); continue; }
    if (!scratch) throw new Error("ink: a layered stroke needs a scratch surface");
    const [bx, by, bw, bh] = boxOf(st, w, h, ctx, scratch);
    if (bw <= 0 || bh <= 0) continue;
    scratch.clearRect(bx, by, bw, bh);
    paintStroke(scratch, st, w, h);
    ctx.globalAlpha = alphaOf(st);
    ctx.drawImage(scratch.canvas, bx, by, bw, bh, bx, by, bw, bh);
    scratch.clearRect(bx, by, bw, bh);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}
