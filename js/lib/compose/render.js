// Layout → SVG (docs/COMPOSE_DESIGN.md §9). Bravura glyphs as <text>, geometry
// as primitives, one <svg> for the score plus a separate overlay for the ghost
// and the bar flash so pointer moves never touch the score's DOM.
import { G, timeDigit, restGlyph, headGlyph, flagGlyph } from "../staff/glyphs.js";

const NS = "http://www.w3.org/2000/svg";
function el(name, attrs, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderComposition(container, L) {
  const S = L.S, px = (v) => (v * S).toFixed(2), fs = 4 * S;
  const svg = el("svg", { class: "cp-svg staff-svg", viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, style: `font-size:${fs}px` });
  const glyph = (x, y, ch, cls = "glyph") => el("text", { x: px(x), y: px(y), class: cls }, ch);

  for (const sys of L.systems) {
    const lastBar = sys.barlines[sys.barlines.length - 1].x;
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
        if (lead.clef) { const clefStep = (st.clef.line - 1) * 2; g.append(glyph(lead.x + 0.2, topY + (8 - clefStep) / 2, G[st.clef.glyph])); }
        if (lead.key) st.keysig.forEach((k, i) => g.append(glyph(lead.keyX + i * 1.15, topY + (8 - k.step) / 2, G[k.acc])));
        if (lead.time) { const b = sys.bars[sys.leading.indexOf(lead)]; g.append(glyph(lead.timeX, topY + 1, timeDigit(b.time.beats))); g.append(glyph(lead.timeX, topY + 3, timeDigit(b.time.unit))); }
      });
    }
    // barlines spanning both staves
    for (const bl of sys.barlines) {
      g.append(el("rect", { x: px(bl.x - (bl.final ? 0.9 : 0.065)), y: px(t0), width: px(0.13), height: px(t1 - t0), class: "sline-bar" }));
      if (bl.final) g.append(el("rect", { x: px(bl.x - 0.45), y: px(t0), width: px(0.5), height: px(t1 - t0), class: "sline-bar" }));
    }
    svg.append(g);
  }
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
        if (h.acc !== null && h.acc !== undefined) hg.append(glyph(h.x - 1.35 - (h.flip && d.stem === "up" ? d.headW : 0), h.y, G[h.acc], "glyph head-part"));
        hg.append(glyph(h.x, h.y, headGlyph(d.base), "glyph head cp-head"));
        for (let i = 0; i < (d.dots ?? 0); i++) hg.append(glyph(Math.max(h.x, d.x) + d.headW + 0.4 + i * 0.7, h.step % 2 === 0 ? h.y - 0.5 : h.y, G.dot, "glyph head-part"));
        g.append(hg);
      }
    }
    svg.append(g);
    groups.set(d.id, g);
  }

  // overlay: ghost + bar flash
  const overlay = el("svg", { class: "cp-overlay", viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, style: `font-size:${fs}px` });
  const flash = el("rect", { class: "cp-flash", x: 0, y: 0, width: 0, height: 0, hidden: "" });
  const ghost = el("g", { class: "cp-ghost", hidden: "" });
  const lassoEl = el("polyline", { class: "cp-lasso", points: "", hidden: "" });
  overlay.append(flash, ghost, lassoEl);
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
    /** { x, y, base, rest, stemUp } in S, or null to hide. */
    showGhost(spec) {
      if (!spec) { ghost.setAttribute("hidden", ""); return; }
      ghost.replaceChildren();
      if (spec.rest) ghost.append(glyph(spec.x, spec.y, restGlyph(spec.base), "glyph rest"));
      else {
        const headW = spec.base <= 1 ? 1.7 : 1.18;
        if (spec.base >= 2) { const up = spec.stemUp, sx = up ? spec.x + headW - 0.07 : spec.x + 0.07; ghost.append(el("rect", { x: px(sx - 0.065), y: px(up ? spec.y - 3.5 : spec.y), width: px(0.13), height: px(3.5), class: "stem" })); }
        for (const ly of spec.ledgers ?? []) ghost.append(el("line", { x1: px(spec.x - 0.35), y1: px(ly), x2: px(spec.x + headW + 0.35), y2: px(ly), class: "sline" }));
        ghost.append(glyph(spec.x, spec.y, headGlyph(spec.base), "glyph head"));
      }
      ghost.removeAttribute("hidden");
    },
    /** The lasso path while it is drawn (points in S), or null to hide. */
    showLasso(points) {
      if (!points) { lassoEl.setAttribute("hidden", ""); return; }
      lassoEl.setAttribute("points", points.map((p) => `${px(p.x)},${px(p.y)}`).join(" "));
      lassoEl.removeAttribute("hidden");
    },
    /** Flash a bar (system-local rect) for a refused edit. */
    flashBar(hbar, sys) {
      flash.setAttribute("x", px(hbar.x0)); flash.setAttribute("y", px(sys.top + 1)); flash.setAttribute("width", px(hbar.x1 - hbar.x0)); flash.setAttribute("height", px(sys.bottom - sys.top - 2));
      flash.removeAttribute("hidden"); flash.classList.remove("on"); void flash.getBBox?.(); requestAnimationFrame(() => flash.classList.add("on"));
      setTimeout(() => { flash.classList.remove("on"); flash.setAttribute("hidden", ""); }, 420);
    },
  };
}
