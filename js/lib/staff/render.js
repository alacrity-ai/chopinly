// Staff renderer: layout coordinates → SVG. Glyphs are Bravura (SMuFL) text;
// geometry is drawn. Renders once; grading states are pure class toggles.
import { layoutMelody } from "./layout.js";

const NS = "http://www.w3.org/2000/svg";
const G = {
  gClef: "", cClef: "", fClef: "",
  whole: "", half: "", black: "",
  "-1": "", 0: "", 1: "",          // flat, natural, sharp
  dot: "", flagUp: "", flagDown: "",
  restWhole: "", restHalf: "", restQuarter: "", rest8th: "",
};
const timeDigit = (n) => String.fromCharCode(0xe080 + n);

function el(name, attrs, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderMelody(container, melody, opts = {}) {
  const width = opts.width ?? Math.max(container.clientWidth, 300);
  const S = opts.unit ?? 10;
  const L = layoutMelody(melody, { unit: S, width });
  const fs = 4 * S; // SMuFL: 1 em = 1 staff height

  const svg = el("svg", {
    class: "staff-svg",
    viewBox: `0 0 ${width} ${L.height}`,
    width: "100%",
    style: `font-size:${fs}px`,
  });
  const glyph = (x, y, ch, cls = "glyph") =>
    el("text", { x: (x * S).toFixed(1), y: (y * S).toFixed(1), class: cls }, ch);
  const px = (v) => (v * S).toFixed(1);

  // systems: staff lines, clef, key sig, time sig, barlines
  L.systems.forEach((sys, si) => {
    const topY = sys.topY;
    const lastBar = sys.barlines[sys.barlines.length - 1];
    for (let i = 0; i < 5; i++) {
      svg.append(el("line", {
        x1: px(0.3), y1: px(topY + i), x2: px(lastBar), y2: px(topY + i), class: "sline",
      }));
    }
    const clefStep = (sys.leading.clef.line - 1) * 2;
    svg.append(glyph(sys.leading.x, topY + (8 - clefStep) / 2, G[sys.leading.clef.glyph]));
    sys.leading.keysig.forEach((k, i) => {
      svg.append(glyph(1.0 + 3.4 + i * 1.15, topY + (8 - k.step) / 2, G[k.acc]));
    });
    if (sys.first) {
      const tsX = 1.0 + 3.4 + sys.leading.keysig.length * 1.15 + (sys.leading.keysig.length ? 0.8 : 0);
      svg.append(glyph(tsX, topY + 1, timeDigit(melody.time[0])));
      svg.append(glyph(tsX, topY + 3, timeDigit(melody.time[1])));
    }
    sys.barlines.forEach((bx, bi) => {
      const isFinal = si === L.systems.length - 1 && bi === sys.barlines.length - 1;
      svg.append(el("rect", {
        x: px(bx - (isFinal ? 0.9 : 0.065)), y: px(topY),
        width: px(0.13), height: px(4), class: "sline-bar",
      }));
      if (isFinal) {
        svg.append(el("rect", { x: px(bx - 0.45), y: px(topY), width: px(0.5), height: px(4), class: "sline-bar" }));
      }
    });
  });

  // beams + ties (neutral geometry, under the notes)
  for (const b of L.beams) {
    const t = b.dir === "up" ? 0.55 : -0.55;
    svg.append(el("polygon", {
      points: `${px(b.x1)},${px(b.y1)} ${px(b.x2)},${px(b.y2)} ${px(b.x2)},${px(b.y2 + t)} ${px(b.x1)},${px(b.y1 + t)}`,
      class: "beam",
    }));
  }
  for (const t of L.ties) {
    const sgn = t.up ? -1 : 1;
    const y1 = t.y1 + sgn * 0.55, y2 = t.y2 + sgn * 0.55;
    const rise = sgn * 0.85;
    svg.append(el("path", {
      d: `M ${px(t.x1)} ${px(y1)} C ${px(t.x1 + (t.x2 - t.x1) * 0.3)} ${px(y1 + rise)}, ${px(t.x1 + (t.x2 - t.x1) * 0.7)} ${px(y2 + rise)}, ${px(t.x2)} ${px(y2)}`,
      class: "tie",
    }));
  }

  // notes + rests
  const groups = [];
  for (const d of L.drawn) {
    const g = el("g", { class: "note", "data-i": d.index });
    if (d.rest) {
      const ch = d.dur >= 16 ? G.restWhole : d.dur >= 8 ? G.restHalf : d.dur >= 4 ? G.restQuarter : G.rest8th;
      g.append(glyph(d.x, d.y, ch, "glyph rest"));
      if (d.dot) g.append(glyph(d.x + 1.6, d.y - 0.5, G.dot, "glyph head-part"));
    } else {
      g.append(el("circle", { cx: px(d.x + d.headW / 2), cy: px(d.y), r: px(1.5), class: "halo" }));
      for (const ly of d.ledgers) {
        svg.append(el("line", {
          x1: px(d.x - 0.35), y1: px(ly), x2: px(d.x + d.headW + 0.35), y2: px(ly), class: "sline",
        }));
      }
      if (d.accDrawn !== null) g.append(glyph(d.x - 1.35, d.y, G[d.accDrawn], "glyph head-part"));
      if (d.stem) {
        g.append(el("rect", {
          x: px(d.stemX - 0.065),
          y: px(Math.min(d.y, d.stemTipY)),
          width: px(0.13),
          height: px(Math.abs(d.y - d.stemTipY)),
          class: "stem",
        }));
        if (d.flagOrBeam && !d.beamed) {
          g.append(glyph(d.stemX - 0.065, d.stemTipY, d.stem === "up" ? G.flagUp : G.flagDown, "glyph head-part"));
        }
      }
      g.append(glyph(d.x, d.y, G[d.kind], "glyph head"));
      if (d.dot) {
        const dotY = d.step % 2 === 0 ? d.y - 0.5 : d.y; // dots live in spaces
        g.append(glyph(d.x + d.headW + 0.4, dotY, G.dot, "glyph head-part"));
      }
    }
    svg.append(g);
    groups.push(g);
  }

  container.replaceChildren(svg);
  const STATES = ["n-current", "n-nailed", "n-good", "n-rough", "n-missed"];
  return {
    svg,
    count: groups.length,
    layout: L,
    setState(i, state) {
      const g = groups[i];
      if (!g) return;
      g.classList.remove(...STATES);
      if (state && state !== "idle") g.classList.add(`n-${state}`);
    },
    /** Position marker (ivory halo), orthogonal to grade states — a note can
     *  be "here" and carry a live tier color at the same time. */
    setHere(i, on) {
      const g = groups[i];
      if (g) g.classList.toggle("n-here", Boolean(on));
    },
    clearStates() {
      for (const g of groups) g.classList.remove(...STATES, "n-here", "n-pop");
    },
    /** One-shot celebratory bounce on a note (used by live grading). */
    pulse(i) {
      const g = groups[i];
      if (!g) return;
      g.classList.remove("n-pop");
      requestAnimationFrame(() => {
        g.classList.add("n-pop");
        setTimeout(() => g.classList.remove("n-pop"), 650);
      });
    },
  };
}
