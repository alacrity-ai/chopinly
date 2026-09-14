// Layout → SVG (docs/COMPOSE_DESIGN.md §9). Bravura glyphs as <text>, geometry
// as primitives, one <svg> for the score plus a separate overlay for the ghost
// and the bar flash so pointer moves never touch the score's DOM.
import { G, timeDigit, tupletDigit, restGlyph, headGlyph, flagGlyph, artGlyph, dynGlyph } from "../staff/glyphs.js";

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

export function renderComposition(container, L) {
  const S = L.S, px = (v) => (v * S).toFixed(2), fs = 4 * S;
  const glyphOf = (x, y, ch, cls = "glyph") => el("text", { x: px(x), y: px(y), class: cls }, ch);
  /** The nodes of one ghost note / rest. */
  const ghostNodes = (spec) => {
    if (spec.glyph) { const gg = glyphOf(spec.x, spec.y, G[spec.glyph], "glyph"); if (spec.small) gg.setAttribute("style", `font-size:${(fs * 0.8).toFixed(1)}px`); return [gg]; }
    if (spec.rest) { const out = [glyphOf(spec.x, spec.y, restGlyph(spec.base), "glyph rest")]; for (let i = 0; i < (spec.dots ?? 0); i++) out.push(glyphOf(spec.x + 1.5 + i * 0.7, spec.y - 0.5, G.dot, "glyph head-part")); return out; }
    const out = [], headW = spec.base <= 1 ? 1.7 : 1.18;
    if (spec.base >= 2 && spec.stem !== false) { const up = spec.stemUp, sx = up ? spec.x + headW - 0.07 : spec.x + 0.07; out.push(el("rect", { x: px(sx - 0.065), y: px(up ? spec.y - 3.5 : spec.y), width: px(0.13), height: px(3.5), class: "stem" })); }
    for (const ly of spec.ledgers ?? []) out.push(el("line", { x1: px(spec.x - 0.35), y1: px(ly), x2: px(spec.x + headW + 0.35), y2: px(ly), class: "sline" }));
    out.push(glyphOf(spec.x, spec.y, headGlyph(spec.base), "glyph head"));
    for (let i = 0; i < (spec.dots ?? 0); i++) out.push(glyphOf(spec.x + headW + 0.4 + i * 0.7, spec.onLine ? spec.y - 0.5 : spec.y, G.dot, "glyph head-part"));
    return out;
  };
  const svg = el("svg", { class: "cp-svg staff-svg", viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, style: `font-size:${fs}px` });
  const glyph = (x, y, ch, cls = "glyph") => el("text", { x: px(x), y: px(y), class: cls }, ch);

  for (const sys of L.systems) {
    const lastBar = sys.endX ?? sys.barlines[sys.barlines.length - 1].x;
    const g = el("g", { class: "cp-sys" });
    // staff lines
    for (const topY of sys.staffTop) for (let i = 0; i < 5; i++) g.append(el("line", { x1: px(1.0), y1: px(topY + i), x2: px(lastBar), y2: px(topY + i), class: "sline" }));
    // brace + the system's left barline joining the staves
    const t0 = sys.staffTop[0], t1 = sys.staffTop[sys.staffTop.length - 1] + 4;
    g.append(el("rect", { x: px(1.0 - 0.065), y: px(t0), width: px(0.13), height: px(t1 - t0), class: "sline-bar" }));
    if (sys.staffTop.length > 1) g.append(el("text", { x: px(0.85), y: px(t1), class: "glyph cp-brace", style: `font-size:${((t1 - t0) / 4 * fs).toFixed(1)}px`, "text-anchor": "end" }, G.brace));
    // leading symbols per bar
    for (const lead of sys.leading) {
      lead.staves.forEach((st, si) => {
        const topY = st.topY;
        if (lead.clef) { const clefStep = (st.clef.line - 1) * 2; const c = glyph(lead.x + 0.2, topY + (8 - clefStep) / 2, G[st.clef.glyph]); if (lead.small) c.setAttribute("style", `font-size:${(fs * 0.8).toFixed(1)}px`); g.append(c); }
        if (lead.key) st.keysig.forEach((k, i) => g.append(glyph(lead.keyX + i * 1.15, topY + (8 - k.step) / 2, G[k.acc])));
        if (lead.time) { const b = sys.bars[sys.leading.indexOf(lead)]; g.append(glyph(lead.timeX, topY + 1, timeDigit(b.time.beats))); g.append(glyph(lead.timeX, topY + 3, timeDigit(b.time.unit))); }
      });
    }
    // courtesy key / time at the system's end when the next system opens with a change
    if (sys.courtesyLead) {
      const c = sys.courtesyLead;
      c.staves.forEach((st) => {
        if (st.clef) { const cg = glyph(c.x + 0.15, st.clef.y, G[st.clef.glyph], "glyph cp-courtesy"); cg.setAttribute("style", `font-size:${(fs * 0.8).toFixed(1)}px`); g.append(cg); }
        st.keysig.forEach((k, i) => g.append(glyph(c.keyX + i * 1.15, st.topY + (8 - k.step) / 2, G[k.acc], "glyph cp-courtesy")));
        if (c.time) { g.append(glyph(c.timeX, st.topY + 1, timeDigit(c.beats), "glyph cp-courtesy")); g.append(glyph(c.timeX, st.topY + 3, timeDigit(c.unit), "glyph cp-courtesy")); }
      });
    }
    // barlines spanning both staves
    for (const bl of sys.barlines) {
      g.append(el("rect", { x: px(bl.x - (bl.final ? 0.9 : 0.065)), y: px(t0), width: px(0.13), height: px(t1 - t0), class: "sline-bar" }));
      if (bl.final) g.append(el("rect", { x: px(bl.x - 0.45), y: px(t0), width: px(0.5), height: px(t1 - t0), class: "sline-bar" }));
    }
    svg.append(g);
  }
  // clef changes inside a bar (small, before the beat they take effect on)
  for (const c of L.clefs) { const cg = glyph(c.x, c.y, G[c.glyph], "glyph cp-clef-change"); cg.setAttribute("style", `font-size:${(fs * 0.8).toFixed(1)}px`); cg.dataset.bar = c.bar; cg.dataset.staff = c.staff; svg.append(cg); }
  // beams (under the notes)
  for (const b of L.beams) {
    const t = b.dir === "up" ? b.t : -b.t;
    svg.append(el("polygon", { points: `${px(b.x1)},${px(b.y1)} ${px(b.x2)},${px(b.y2)} ${px(b.x2)},${px(b.y2 + t)} ${px(b.x1)},${px(b.y1 + t)}`, class: "beam" }));
  }
  // notes + rests
  const groups = new Map();
  for (const d of L.drawn) {
    const g = el("g", { class: "cp-ev note", "data-ev": d.id, "data-bar": d.bar, "data-staff": d.staff });
    if (d.rest) {
      g.append(glyph(d.x, d.y, restGlyph(d.base), "glyph rest"));
      for (let i = 0; i < (d.dots ?? 0); i++) g.append(glyph(d.x + 1.5 + i * 0.7, d.y - 0.5, G.dot, "glyph head-part"));
    } else {
      for (const l of d.ledgers) svg.append(el("line", { x1: px(l.x - 0.35), y1: px(l.y), x2: px(l.x + d.headW + 0.35), y2: px(l.y), class: "sline" }));
      if (d.stem) {
        g.append(el("rect", { x: px(d.stemX - 0.065), y: px(Math.min(d.stemFromY, d.stemTipY)), width: px(0.13), height: px(Math.abs(d.stemFromY - d.stemTipY)), class: "stem" }));
        if (d.beams >= 1 && !d.beamed) g.append(glyph(d.stemX - 0.065, d.stemTipY, flagGlyph(d.base, d.stem === "up"), "glyph head-part"));
      }
      for (const h of d.heads) {
        const hg = el("g", { class: "cp-head-g", "data-pi": h.pi });
        hg.append(el("circle", { cx: px(h.x + d.headW / 2), cy: px(h.y), r: px(1.4), class: "halo" }));
        if (h.acc !== null && h.acc !== undefined) hg.append(glyph(Math.min(h.x, d.x) - 1.35 - h.accCol * 1.15, h.y, G[h.acc], "glyph head-part"));
        hg.append(glyph(h.x, h.y, headGlyph(d.base), "glyph head cp-head"));
        for (let i = 0; i < (d.dots ?? 0); i++) hg.append(glyph(Math.max(h.x, d.x) + d.headW + 0.4 + i * 0.7, h.step % 2 === 0 ? h.y - 0.5 : h.y, G.dot, "glyph head-part"));
        g.append(hg);
      }
    }
    svg.append(g);
    groups.set(d.id, g);
  }

  // ties (a tapered filled curve) and tuplet brackets + digits
  for (const t of L.ties) {
    const sgn = t.dir === "up" ? -1 : 1, len = Math.max(0.6, t.x2 - t.x1);
    const x1 = t.x1 + 0.12, x2 = t.x2 - 0.12, y1 = t.y1 + 0.62 * sgn, y2 = t.y2 + 0.62 * sgn;
    const b = Math.max(0.55, Math.min(1.35, len / 4)) * sgn, b2 = b - 0.26 * sgn, cx = Math.min(len * 0.3, 2.5);
    svg.append(el("path", { class: "cp-tie", d: `M${px(x1)},${px(y1)} C${px(x1 + cx)},${px(y1 + b)} ${px(x2 - cx)},${px(y2 + b)} ${px(x2)},${px(y2)} C${px(x2 - cx)},${px(y2 + b2)} ${px(x1 + cx)},${px(y1 + b2)} ${px(x1)},${px(y1)} Z` }));
  }
  for (const t of L.slurs) { // a tie's shape, arched by the layout's h and a touch thicker through the middle
    const sgn = t.dir === "up" ? -1 : 1, len = Math.max(1, t.x2 - t.x1);
    const x1 = t.x1, x2 = t.x2, y1 = t.y1, y2 = t.y2;
    const b = t.h * sgn, b2 = b - 0.3 * sgn, cx = Math.min(len * 0.32, 4);
    svg.append(el("path", { class: "cp-slur", d: `M${px(x1)},${px(y1)} C${px(x1 + cx)},${px(y1 + b)} ${px(x2 - cx)},${px(y2 + b)} ${px(x2)},${px(y2)} C${px(x2 - cx)},${px(y2 + b2)} ${px(x1 + cx)},${px(y1 + b2)} ${px(x1)},${px(y1)} Z` }));
  }
  for (const m of L.marks) { // m.x is the head's centre; the glyph's ink is centred on it (advance-centred until Bravura is in)
    const ch = artGlyph(m.mark, m.above), c = inkCentre(ch);
    const t = glyph(c === null ? m.x : m.x - c * 4, m.y, ch, "glyph cp-art"); // font-size is 4 S, so an em is 4 units
    if (c === null) t.setAttribute("text-anchor", "middle");
    svg.append(t);
  }
  // a roll: wiggle segments (each 1.02 S long, ink 0.48 S wide beside the baseline) rotated to run along the chord, an arrowhead segment (2.06 S) for up / down.
  // rotate(−90) runs the text upward from the bottom point with its ink to the left of the anchor; rotate(+90) runs it downward with the ink to the right.
  for (const a of L.arps) {
    const arrow = a.kind !== "plain", span = a.y1 - a.y2;
    const n = Math.max(2, Math.ceil((span - (arrow ? 2.06 : 0)) / 1.02));
    const down = a.kind === "down";
    const text = (down ? G.wiggleArpDown : G.wiggleArpUp).repeat(n) + (a.kind === "up" ? G.wiggleArpUpArrow : down ? G.wiggleArpDownArrow : "");
    const ax = a.x + (down ? -0.24 : 0.24), ay = down ? a.y2 : a.y1;
    svg.append(el("text", { x: px(ax), y: px(ay), class: "glyph cp-arp", transform: `rotate(${down ? 90 : -90} ${px(ax)} ${px(ay)})` }, text));
  }
  for (const dy of L.dynamics) { // ink-centred under the note like a mark
    const ch = dynGlyph(dy.dyn), c = inkCentre(ch);
    const t = glyph(c === null ? dy.x : dy.x - c * 4, dy.y, ch, "glyph cp-dyn");
    if (c === null) t.setAttribute("text-anchor", "middle");
    svg.append(t);
  }
  for (const hp of L.hairpins) { // two lines meeting at the closed end; a split hairpin stays open at the break
    const o = 0.55, cresc = hp.kind === "cresc";
    let a1 = cresc ? 0 : o, a2 = cresc ? o : 0; // half-opening at x1 / x2
    if (hp.half === "out") { if (cresc) a2 = o * 0.55; else a2 = o * 0.45; }
    if (hp.half === "in") { if (cresc) a1 = o * 0.55; else a1 = o * 0.45; }
    svg.append(el("path", { class: "cp-hairpin", d: `M${px(hp.x1)},${px(hp.y - a1)} L${px(hp.x2)},${px(hp.y - a2)} M${px(hp.x1)},${px(hp.y + a1)} L${px(hp.x2)},${px(hp.y + a2)}` }));
  }
  for (const tx of L.texts) svg.append(el("text", { x: px(tx.x), y: px(tx.y), class: "cp-expr-text", style: `font-size:${(S * 1.15).toFixed(1)}px` }, tx.text));
  for (const gl of L.glisses) {
    const g = el("g", { class: "cp-gliss" });
    g.append(el("line", { x1: px(gl.x1), y1: px(gl.y1), x2: px(gl.x2), y2: px(gl.y2), class: "cp-gliss-line" }));
    const ang = (Math.atan2(gl.y2 - gl.y1, gl.x2 - gl.x1) * 180) / Math.PI, mx = (gl.x1 + gl.x2) / 2, my = (gl.y1 + gl.y2) / 2;
    g.append(el("text", { x: px(mx), y: px(my - 0.35), class: "cp-gliss-text", "text-anchor": "middle", transform: `rotate(${ang.toFixed(1)} ${px(mx)} ${px(my)})`, style: `font-size:${(S * 1.05).toFixed(1)}px` }, "gliss."));
    svg.append(g);
  }
  for (const t of L.tuplets) {
    const g = el("g", { class: "cp-tuplet" });
    const mid = (t.x1 + t.x2) / 2, hook = t.above ? 0.8 : -0.8;
    if (t.bracket) {
      g.append(el("polyline", { class: "cp-tuplet-line", points: `${px(t.x1)},${px(t.y + hook)} ${px(t.x1)},${px(t.y)} ${px(mid - 1.0)},${px(t.y)}` }));
      g.append(el("polyline", { class: "cp-tuplet-line", points: `${px(mid + 1.0)},${px(t.y)} ${px(t.x2)},${px(t.y)} ${px(t.x2)},${px(t.y + hook)}` }));
    }
    g.append(el("text", { x: px(mid), y: px(t.y + 0.55), class: "glyph cp-tuplet-digit", "text-anchor": "middle" }, tupletDigit(t.n)));
    svg.append(g);
  }

  // overlay: ghost + bar flash
  const overlay = el("svg", { class: "cp-overlay", viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, style: `font-size:${fs}px` });
  const flash = el("rect", { class: "cp-flash", x: 0, y: 0, width: 0, height: 0, hidden: "" });
  const ghost = el("g", { class: "cp-ghost", hidden: "" });
  const lassoEl = el("polyline", { class: "cp-lasso", points: "", hidden: "" });
  const playhead = el("line", { class: "cp-playhead", x1: 0, y1: 0, x2: 0, y2: 0, hidden: "" });
  const target = el("rect", { class: "cp-target", x: 0, y: 0, width: 0, height: 0, rx: px(0.6), hidden: "" });
  overlay.append(flash, target, ghost, lassoEl, playhead);
  container.replaceChildren(svg, overlay);

  return {
    svg, overlay,
    /** ids: Set of "ev" or "ev:pi" strings. */
    setSelection(ids) {
      for (const [id, g] of groups) {
        const whole = ids.has(id);
        g.classList.toggle("sel", whole);
        for (const hg of g.querySelectorAll(".cp-head-g")) hg.classList.toggle("sel", whole || ids.has(`${id}:${hg.dataset.pi}`));
      }
    },
    /** { x, y, base, rest, stemUp } in S, an array of them (a phrase), or null to hide. */
    showGhost(spec) {
      if (!spec) { ghost.setAttribute("hidden", ""); return; }
      ghost.replaceChildren();
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
