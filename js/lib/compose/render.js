// Layout → SVG (docs/COMPOSE_DESIGN.md §9). The ink itself is described once in paint.js
// (shared with the PDF export); this file is the SVG painter — Bravura glyphs as <text>,
// geometry as primitives — plus a separate overlay for the ghost and the bar flash so
// pointer moves never touch the score's DOM.
import { G, restGlyph, headGlyph, dynGlyph } from "../staff/glyphs.js";
import { paintScore } from "./paint.js";

const NS = "http://www.w3.org/2000/svg";
// A Bravura glyph's origin is its left side bearing, not its middle: a mark placed at a head's
// centre would sit half its width to the right. Each mark glyph's ink is measured once (canvas,
// 1000 px) and the text is slid so the ink's centre lands on the point — the same rule the rail
// buttons use vertically. Before the font has loaded the measurement would be of the fallback
// font, so nothing is cached until Bravura is in and the caller centres the advance box instead.
const INK = new Map();
let meter = null;
/** Ink centre of a glyph string, in em from its origin (positive = right); null when it cannot be measured yet. */
export function inkCentre(ch) {
  if (INK.has(ch)) return INK.get(ch);
  if (typeof document === "undefined" || !document.fonts?.check?.('1em "Bravura"')) return null;
  meter ??= document.createElement("canvas").getContext("2d");
  if (!meter) return null;
  meter.font = '1000px "Bravura"';
  const m = meter.measureText(ch);
  if (!("actualBoundingBoxLeft" in m)) return null;
  const c = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2000;
  INK.set(ch, c);
  return c;
}
function el(name, attrs, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The screen painter: paint.js calls → SVG nodes, appended as they come; groups nest. */
class SvgPainter {
  constructor(L) {
    this.S = L.S; this.fs = 4 * L.S;
    this.svg = el("svg", { class: "cp-svg staff-svg", viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, style: `font-size:${this.fs}px` });
    this.stack = []; this.groups = new Map();
  }
  px(v) { return (v * this.S).toFixed(2); }
  get parent() { return this.stack[this.stack.length - 1] ?? this.svg; }
  add(node) { this.parent.append(node); return node; }
  group(cls, data = {}) {
    const attrs = { class: cls };
    for (const [k, v] of Object.entries(data)) attrs[`data-${k}`] = v;
    const g = this.add(el("g", attrs));
    if (data.ev !== undefined) { if (!this.groups.has(data.ev)) this.groups.set(data.ev, []); this.groups.get(data.ev).push(g); } // one id may own several groups (a hairpin split over a break)
    this.stack.push(g);
  }
  end() { this.stack.pop(); }
  line(x1, y1, x2, y2, cls) { this.add(el("line", { x1: this.px(x1), y1: this.px(y1), x2: this.px(x2), y2: this.px(y2), class: cls })); }
  rect(x, y, w, h, cls) { this.add(el("rect", { x: this.px(x), y: this.px(y), width: this.px(w), height: this.px(h), class: cls })); }
  polygon(points, cls) { this.add(el("polygon", { points: points.map(([x, y]) => `${this.px(x)},${this.px(y)}`).join(" "), class: cls })); }
  polyline(points, cls) { this.add(el("polyline", { class: cls, points: points.map(([x, y]) => `${this.px(x)},${this.px(y)}`).join(" ") })); }
  path(segs, cls) { this.add(el("path", { class: cls, d: segs.map(([c, ...n]) => c + n.map((v, i) => (i % 2 ? "," : i ? " " : "") + this.px(v)).join("")).join(" ") })); }
  circle(cx, cy, r, cls) { this.add(el("circle", { cx: this.px(cx), cy: this.px(cy), r: this.px(r), class: cls })); }
  glyph(x, y, ch, cls, { scale, anchor, rotate, centre, data } = {}) {
    let ax = x, anch = anchor;
    if (centre) { const c = inkCentre(ch); if (c === null) anch = "middle"; else ax = x - c * 4; } // font-size is 4 S, so an em is 4 units (advance-centred until Bravura is in)
    const attrs = { x: this.px(ax), y: this.px(y), class: cls };
    if (scale !== undefined) attrs.style = `font-size:${(scale * this.fs).toFixed(1)}px`;
    if (anch) attrs["text-anchor"] = anch;
    if (rotate) attrs.transform = `rotate(${rotate[0]} ${this.px(rotate[1])} ${this.px(rotate[2])})`;
    for (const [k, v] of Object.entries(data ?? {})) attrs[`data-${k}`] = v;
    this.add(el("text", attrs, ch));
  }
  text(x, y, str, cls, { size, anchor, rotate } = {}) {
    const attrs = { x: this.px(x), y: this.px(y), class: cls };
    if (anchor) attrs["text-anchor"] = anchor;
    if (rotate) attrs.transform = `rotate(${rotate[0]} ${this.px(rotate[1])} ${this.px(rotate[2])})`;
    attrs.style = `font-size:${(this.S * size).toFixed(1)}px`;
    this.add(el("text", attrs, str));
  }
}

/** The SVG painter that keeps only the primitives `keep(y)` allows: one page of a plan (docs §10.1). Groups stay, so selection classes and data still nest. */
class PageSvgPainter extends SvgPainter {
  constructor(L, keep) { super(L); this.keep = keep; }
  line(x1, y1, x2, y2, cls) { if (this.keep(y1)) super.line(x1, y1, x2, y2, cls); }
  rect(x, y, w, h, cls) { if (this.keep(y)) super.rect(x, y, w, h, cls); }
  polygon(points, cls) { if (this.keep(points[0][1])) super.polygon(points, cls); }
  polyline(points, cls) { if (this.keep(points[0][1])) super.polyline(points, cls); }
  path(segs, cls) { if (this.keep(segs[0][2])) super.path(segs, cls); }
  circle(cx, cy, r, cls) { if (this.keep(cy)) super.circle(cx, cy, r, cls); }
  glyph(x, y, ch, cls, opts) { if (this.keep(y)) super.glyph(x, y, ch, cls, opts); }
  text(x, y, str, cls, opts) { if (this.keep(y)) super.text(x, y, str, cls, opts); }
}
/**
 * One page's ink as an SVG in the layout's own coordinates: exactly the primitives `keep(y)`
 * admits — the export sheet passes the plan's `pageAt(y) === k`, the same routing the PDF painter
 * uses, so the preview of a page is the page (WSHED-133).
 */
export function renderPage(L, keep) {
  const painter = new PageSvgPainter(L, keep);
  paintScore(L, painter);
  return painter.svg;
}

export function renderComposition(container, L) {
  const S = L.S, px = (v) => (v * S).toFixed(2), fs = 4 * S;
  const glyphOf = (x, y, ch, cls = "glyph") => el("text", { x: px(x), y: px(y), class: cls }, ch);
  /** The nodes of one ghost note / rest. */
  const ghostNodes = (spec) => {
    if (spec.dyn) { const c = inkCentre(dynGlyph(spec.dyn)); const t = glyphOf(c === null ? spec.x : spec.x - c * 4, spec.y, dynGlyph(spec.dyn), "glyph cp-dyn"); if (c === null) t.setAttribute("text-anchor", "middle"); return [t]; }
    if (spec.text && !spec.line) return [el("text", { x: px(spec.x), y: px(spec.y), class: "cp-expr-text", style: `font-size:${(S * 1.15).toFixed(1)}px` }, spec.text)]; // a text line's ghost carries `text` too (below)
    if (spec.hairpin) { // the rubber band from a placed start to the pointer: open at the far end while it is still being drawn
      const o = 0.55, cresc = spec.hairpin === "cresc", a1 = cresc ? 0 : o, a2 = cresc ? o : 0, x1 = spec.x1, x2 = Math.max(spec.x1 + 0.5, spec.x2), y = spec.y;
      return [el("path", { class: "cp-hairpin", d: `M${px(x1)},${px(y - a1)} L${px(x2)},${px(y - a2)} M${px(x1)},${px(y + a1)} L${px(x2)},${px(y + a2)}` })];
    }
    if (spec.line === "textline") { // a text line being drawn: the words, dashes to the pointer
      const t = el("text", { x: px(spec.x1), y: px(spec.y), class: "cp-expr-text", style: `font-size:${(S * 1.15).toFixed(1)}px` }, spec.text);
      return [t, el("line", { class: "cp-textline", x1: px(spec.x1 + spec.text.length * 0.63 + 0.4), y1: px(spec.y - 0.35), x2: px(Math.max(spec.x1 + spec.text.length * 0.63 + 1.4, spec.x2)), y2: px(spec.y - 0.35) })];
    }
    if (spec.line) { // a pedal / octave line being drawn: the sign at the start, a band to the pointer
      const up = spec.line === "ottava" && spec.dir > 0, sign = spec.line === "pedal" ? (spec.style === "sost" ? G.pedalSost : G.pedal) : up ? (spec.size === 15 ? G.quindicesimaAlta : G.ottavaAlta) : spec.size === 15 ? G.quindicesimaBassa : G.ottavaBassa;
      const g = glyphOf(spec.x1, spec.y, sign, "glyph cp-ghost-sign"); g.setAttribute("style", `font-size:${(fs * (spec.line === "pedal" ? 0.85 : 0.8)).toFixed(1)}px`);
      const ly = spec.line === "pedal" ? spec.y : up ? spec.y - 0.55 : spec.y - 0.4;
      return [g, el("line", { class: spec.line === "pedal" ? "cp-pedal-line" : "cp-ottava-line", x1: px(spec.x1 + 2.3), y1: px(ly), x2: px(Math.max(spec.x1 + 2.8, spec.x2)), y2: px(ly) })];
    }
    if (spec.glyph) { const gg = glyphOf(spec.x, spec.y, G[spec.glyph], "glyph"); if (spec.small) gg.setAttribute("style", `font-size:${(fs * 0.8).toFixed(1)}px`); return [gg]; }
    if (spec.rest) { const out = [glyphOf(spec.x, spec.y, restGlyph(spec.base), "glyph rest")]; for (let i = 0; i < (spec.dots ?? 0); i++) out.push(glyphOf(spec.x + 1.5 + i * 0.7, spec.y - 0.5, G.dot, "glyph head-part")); return out; }
    const k = spec.small ? 0.6 : 1, out = [], headW = (spec.base <= 1 ? 1.7 : 1.18) * k; // a grace ghost is the small note
    if (spec.base >= 2 && spec.stem !== false) { const up = spec.stemUp, sx = up ? spec.x + headW - 0.07 : spec.x + 0.07; out.push(el("rect", { x: px(sx - 0.065), y: px(up ? spec.y - 3.5 * k : spec.y), width: px(0.13), height: px(3.5 * k), class: "stem" })); }
    for (const ly of spec.ledgers ?? []) out.push(el("line", { x1: px(spec.x - 0.35), y1: px(ly), x2: px(spec.x + headW + 0.35), y2: px(ly), class: "sline" }));
    const head = glyphOf(spec.x, spec.y, headGlyph(spec.base), "glyph head"); if (spec.small) head.setAttribute("style", `font-size:${(fs * k).toFixed(1)}px`);
    out.push(head);
    for (let i = 0; i < (spec.dots ?? 0); i++) out.push(glyphOf(spec.x + headW + 0.4 + i * 0.7, spec.onLine ? spec.y - 0.5 : spec.y, G.dot, "glyph head-part"));
    return out;
  };
  const vcls = (vi) => (vi ? ` cp-v${vi + 1}` : "");
  const painter = new SvgPainter(L);
  paintScore(L, painter);
  const { svg, groups } = painter;

  // overlay: ghost + bar flash
  const overlay = el("svg", { class: "cp-overlay", viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, style: `font-size:${fs}px` });
  const flash = el("rect", { class: "cp-flash", x: 0, y: 0, width: 0, height: 0, hidden: "" });
  const ghost = el("g", { class: "cp-ghost", hidden: "" });
  const lassoEl = el("polyline", { class: "cp-lasso", points: "", hidden: "" });
  const playhead = el("line", { class: "cp-playhead", x1: 0, y1: 0, x2: 0, y2: 0, hidden: "" });
  const target = el("rect", { class: "cp-target", x: 0, y: 0, width: 0, height: 0, rx: px(0.6), hidden: "" });
  const handles = el("g", { class: "cp-handles", hidden: "" });
  overlay.append(flash, target, ghost, lassoEl, playhead, handles);
  container.replaceChildren(svg, overlay);

  return {
    svg, overlay,
    /** ids: Set of "ev" or "ev:pi" strings. */
    setSelection(ids) {
      for (const [id, gs] of groups) for (const g of gs) {
        const whole = ids.has(id);
        g.classList.toggle("sel", whole);
        for (const hg of g.querySelectorAll(".cp-head-g")) hg.classList.toggle("sel", whole || ids.has(`${id}:${hg.dataset.pi}`));
      }
    },
    /** The end handles of a selected hairpin: [{ x, y }, …] in S, or null to hide. */
    showHandles(points) {
      if (!points?.length) { handles.setAttribute("hidden", ""); return; }
      handles.replaceChildren(...points.map((p) => el("circle", { class: "cp-handle", cx: px(p.x), cy: px(p.y), r: px(0.55) })));
      handles.removeAttribute("hidden");
    },
    /** { x, y, base, rest, stemUp, voice } in S, an array of them (a phrase), or null to hide. The ghost wears the active voice's colour. */
    showGhost(spec, voice = 0) {
      if (!spec) { ghost.setAttribute("hidden", ""); return; }
      ghost.replaceChildren();
      ghost.setAttribute("class", `cp-ghost${vcls(voice)}`);
      if (Array.isArray(spec)) { for (const g of spec) ghost.append(...ghostNodes(g)); ghost.removeAttribute("hidden"); return; }
      ghost.append(...ghostNodes(spec));
      ghost.removeAttribute("hidden");
    },
    /** Highlight a bar as the target of an armed change ({ hbar, sys }), or null to hide. */
    showTarget(t) {
      if (!t) { target.setAttribute("hidden", ""); return; }
      target.setAttribute("x", px(t.hbar.x0)); target.setAttribute("y", px(t.sys.top + 1)); target.setAttribute("width", px(t.hbar.x1 - t.hbar.x0)); target.setAttribute("height", px(t.sys.bottom - t.sys.top - 2));
      target.removeAttribute("hidden");
    },
    /** The lasso path while it is drawn (points in S), or null to hide. */
    showLasso(points) {
      if (!points) { lassoEl.setAttribute("hidden", ""); return; }
      lassoEl.setAttribute("points", points.map((p) => `${px(p.x)},${px(p.y)}`).join(" "));
      lassoEl.removeAttribute("hidden");
    },
    /** The playhead at x (in S) across a system, or null to hide. */
    showPlayhead(x, sys) {
      if (x === null || x === undefined) { playhead.setAttribute("hidden", ""); return; }
      playhead.setAttribute("x1", px(x)); playhead.setAttribute("x2", px(x)); playhead.setAttribute("y1", px(sys.top + 2)); playhead.setAttribute("y2", px(sys.bottom - 2));
      playhead.removeAttribute("hidden");
    },
    /** Flash a bar (system-local rect) for a refused edit. */
    flashBar(hbar, sys) {
      flash.setAttribute("x", px(hbar.x0)); flash.setAttribute("y", px(sys.top + 1)); flash.setAttribute("width", px(hbar.x1 - hbar.x0)); flash.setAttribute("height", px(sys.bottom - sys.top - 2));
      flash.removeAttribute("hidden"); flash.classList.remove("on"); void flash.getBBox?.(); requestAnimationFrame(() => flash.classList.add("on"));
      setTimeout(() => { flash.classList.remove("on"); flash.setAttribute("hidden", ""); }, 420);
    },
  };
}
