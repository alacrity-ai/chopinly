// The help articles' illustrations (docs/COMPOSE_HELP_DESIGN.md §5.1): inline SVG,
// drawn from data rather than pasted path strings so a correction is readable in a
// diff. Every figure is one 240 × 140 viewBox, takes its ink from `currentColor`
// and the thing being taught from --accent, and engraves real notes with the
// Bravura table the staff and Compose already share — a picture of a notehead
// would be the one place in Chopinly that is not the real glyph.
//
// Colour rule (tests/help-figures.test.mjs): currentColor and var(--token) only.
// Nothing here may carry a literal colour, so every skin is right for free.
import { G } from "../staff/glyphs.js";

export const W = 240, H = 120;
/** One staff space. Five lines make 4 S; a Bravura glyph is 4 S. */
const S = 7;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const at = (pts) => pts.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
const round = (n) => Math.round(n * 10) / 10;

/** Five lines from x to x + w, the top one at y. */
const staff = (x, y, w, cls = "hp-fig-staff") =>
  [0, 1, 2, 3, 4].map((i) => `<line class="${cls}" x1="${round(x)}" y1="${round(y + i * S)}" x2="${round(x + w)}" y2="${round(y + i * S)}"/>`).join("");

/** A Bravura glyph on its musical anchor. `step` counts half-spaces down from the staff's top line. */
const glyph = (x, y, ch, { size = 4 * S, cls = "hp-fig-ink", anchor = "middle" } = {}) =>
  `<text class="${cls}" x="${round(x)}" y="${round(y)}" font-size="${round(size)}" text-anchor="${anchor}">${esc(ch)}</text>`;

/** y of a step: 0 = the top line, 1 = the space under it, 8 = the bottom line. */
const stepY = (top, step) => top + (step * S) / 2;

/**
 * A quarter / eighth / half note with its stem, and optionally a flag, a halo or an accidental.
 * Stems go up unless the head sits above the middle line.
 */
function note(x, top, step, { head = "black", flag = null, sel = false, acc = null, ghost = false } = {}) {
  const y = stepY(top, step), up = step > 4, len = 3.2 * S;
  const hx = up ? x + 0.63 * S : x - 0.63 * S, tip = up ? y - len : y + len;
  const cls = `hp-fig-ink${ghost ? " hp-fig-ghost" : ""}`;
  let out = "";
  if (sel) out += `<circle class="hp-fig-halo" cx="${round(x)}" cy="${round(y)}" r="${round(1.35 * S)}"/>`;
  if (acc) out += glyph(x - 1.9 * S, y, G[acc], { size: 4 * S, cls });
  out += glyph(x, y, G[head], { size: 4 * S, cls });
  if (head !== "whole") out += `<line class="${cls} hp-fig-stem" x1="${round(hx)}" y1="${round(y)}" x2="${round(hx)}" y2="${round(tip)}"/>`;
  if (flag) out += glyph(hx, tip, G[up ? "flagUp" : "flagDown"], { size: 4 * S, cls, anchor: "start" });
  // ledger line for a head below the staff
  if (step > 8) for (let s = 10; s <= step; s += 2) out += `<line class="${cls}" x1="${round(x - 1.1 * S)}" y1="${round(stepY(top, s))}" x2="${round(x + 1.1 * S)}" y2="${round(stepY(top, s))}"/>`;
  return out;
}

const label = (x, y, text, { anchor = "middle", cls = "hp-fig-label" } = {}) =>
  `<text class="${cls}" x="${round(x)}" y="${round(y)}" text-anchor="${anchor}">${esc(text)}</text>`;

/** The stroke being taught: an accent-coloured path with an arrowhead at its end. */
function stroke(pts, { arrow = true, dash = false } = {}) {
  let out = `<polyline class="hp-fig-stroke${dash ? " hp-fig-dash" : ""}" points="${at(pts)}"/>`;
  if (arrow && pts.length > 1) {
    const [px, py] = pts[pts.length - 2], [x, y] = pts[pts.length - 1];
    const a = Math.atan2(y - py, x - px), r = 5.5, s = 0.45;
    out += `<polygon class="hp-fig-arrow" points="${at([[x, y], [x - r * Math.cos(a - s), y - r * Math.sin(a - s)], [x - r * Math.cos(a + s), y - r * Math.sin(a + s)]])}"/>`;
  }
  return out;
}

const box = (x, y, w, h, { cls = "hp-fig-box", r = 3 } = {}) =>
  `<rect class="${cls}" x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${r}"/>`;

// ---------------------------------------------------------------- the figures

/** A four-note fragment used by several gesture figures. */
const fragment = (top, steps, opts = []) => steps.map((s, i) => note(34 + i * 34, top, s, opts[i] ?? {})).join("");

const FIG = {
  "gesture-lasso": () => {
    const top = 38;
    return staff(14, top, 212) + fragment(top, [6, 3, 5, 2])
      + stroke([[52, 24], [86, 16], [110, 30], [112, 62], [92, 82], [58, 80], [44, 58], [52, 26]], { arrow: false });
  },
  "gesture-strike": () => {
    const top = 38;
    return staff(14, top, 212) + fragment(top, [6, 3, 5, 2], [{}, { sel: true }, { sel: true }, {}])
      + stroke([[56, 66], [92, 44], [126, 52]]);
  },
  "gesture-chevron-right": () => {
    const top = 34;
    return stroke([[26, 30], [60, 62], [26, 94]], { arrow: false })
      + staff(88, top, 138) + note(114, top, 5) + label(150, stepY(top, 5) + 4, "→", { cls: "hp-fig-arrowword" }) + note(188, top, 5, { flag: true });
  },
  "gesture-chevron-left": () => {
    const top = 34;
    return stroke([[60, 30], [26, 62], [60, 94]], { arrow: false })
      + staff(88, top, 138) + note(114, top, 5, { flag: true }) + label(150, stepY(top, 5) + 4, "→", { cls: "hp-fig-arrowword" }) + note(188, top, 5);
  },
  "gesture-chevron-up": () => {
    const top = 34;
    return stroke([[26, 82], [46, 42], [66, 82]], { arrow: false })
      + staff(92, top, 134) + note(122, top, 10) + label(158, stepY(top, 8) + 4, "→", { cls: "hp-fig-arrowword" }) + note(198, top, 10, { acc: "1" });
  },
  "gesture-chevron-down": () => {
    const top = 34;
    return stroke([[26, 42], [46, 82], [66, 42]], { arrow: false })
      + staff(92, top, 134) + note(122, top, 10, { acc: "1" }) + label(158, stepY(top, 8) + 4, "→", { cls: "hp-fig-arrowword" }) + note(198, top, 10, { acc: "0" });
  },
  "gesture-hold": () => {
    const cx = 62, cy = 66;
    return `<circle class="hp-fig-ring" cx="${cx}" cy="${cy}" r="26"/><circle class="hp-fig-ring hp-fig-dash" cx="${cx}" cy="${cy}" r="17"/><circle class="hp-fig-dot" cx="${cx}" cy="${cy}" r="6"/>`
      + label(cx, cy - 36, "hold 2 s")
      + box(118, 30, 104, 76, { cls: "hp-fig-panel" })
      + box(118, 30, 104, 14, { cls: "hp-fig-panel-bar", r: 0 })
      + [0, 1, 2].flatMap((c) => [0, 1].map((r) => box(126 + c * 32, 50 + r * 26, 26, 20))).join("");
  },
  "gesture-aim": () => {
    const top = 34, fx = 120, fy = 100;
    return staff(14, top, 212)
      + note(fx, top, 6, { ghost: true })
      + `<line class="hp-fig-stroke hp-fig-dash" x1="${fx}" y1="${fy - 8}" x2="${fx}" y2="${round(stepY(top, 6)) + 10}"/>`
      + `<circle class="hp-fig-finger" cx="${fx}" cy="${fy}" r="11"/>`
      + label(fx + 52, fy - 2, "the ghost lifts", { anchor: "start" })
      + label(120, 20, "hold, then slide to aim");
  },
  "anatomy-editor": () => {
    const rows = [["File ▾ · title · Options ▾", 12, 13], ["Controls · Transport", 28, 12], ["Notes · the rails you show", 42, 12]];
    return box(12, 6, 216, 108, { cls: "hp-fig-panel" })
      + rows.map(([t, y, h]) => box(18, y, 204, h, { cls: "hp-fig-band" }) + label(120, y + h - 3.5, t, { cls: "hp-fig-small" })).join("")
      + box(18, 58, 204, 50, { cls: "hp-fig-band" })
      + staff(30, 66, 180) + note(60, 66, 6) + note(104, 66, 3) + note(148, 66, 5)
      + label(120, 104, "the score — it never moves while you write", { cls: "hp-fig-small" });
  },
  "anatomy-rail": () => {
    const y = 52, h = 34;
    return box(10, y, 220, h, { cls: "hp-fig-panel" })
      + label(26, y + h / 2 + 4, "NOTES", { anchor: "start", cls: "hp-fig-cap" })
      + [0, 1, 2].map((i) => box(70 + i * 30, y + 5, 24, 24)).join("")
      + glyph(82, y + h / 2 + 5, G.whole, { size: 16 }) + glyph(112, y + h / 2 + 5, G.half, { size: 16 }) + glyph(142, y + h / 2 + 5, G.black, { size: 16 })
      + box(162, y + 5, 24, 24, { cls: "hp-fig-box hp-fig-lit" })
      + `<polyline class="hp-fig-chev" points="${at([[178, y + 24], [181, y + 27], [184, y + 24]])}"/>`
      + box(194, y + 5, 24, 24)
      + label(66, 34, "the caption stays put", { anchor: "start", cls: "hp-fig-small" })
      + stroke([[60, 38], [42, 50]], { arrow: true })
      + label(120, 104, "a corner chevron means: hold for more", { cls: "hp-fig-small" })
      + stroke([[168, 98], [176, 88]], { arrow: true });
  },
  "modes-triangle": () => {
    const pts = [[64, 36], [176, 36], [120, 96]], names = ["Place", "Select", "Pan"];
    return pts.map(([x, y], i) => `<ellipse class="hp-fig-panel" cx="${x}" cy="${y}" rx="34" ry="17"/>` + label(x, y + 4, names[i])).join("")
      + stroke([[98, 30], [142, 30]], { arrow: true }) + label(120, 22, "tap the armed value", { cls: "hp-fig-small" })
      + stroke([[142, 42], [98, 42]], { arrow: true }) + label(120, 56, "Esc", { cls: "hp-fig-small" })
      + stroke([[152, 52], [134, 78]], { arrow: true })
      + stroke([[106, 78], [88, 52]], { arrow: true });
  },
  "slot-grid": () => {
    const top = 40, x0 = 26, w = 188, n = 8, gap = w / n;
    return staff(x0, top, w)
      + `<line class="hp-fig-ink" x1="${x0}" y1="${top}" x2="${x0}" y2="${top + 4 * S}"/><line class="hp-fig-ink" x1="${x0 + w}" y1="${top}" x2="${x0 + w}" y2="${top + 4 * S}"/>`
      + Array.from({ length: n }, (_, i) => {
        const x = x0 + i * gap, strong = i % 2 === 0;
        return `<line class="hp-fig-slot${strong ? " hp-fig-slot-strong" : ""}" x1="${round(x)}" y1="${top - 6}" x2="${round(x)}" y2="${top + 4 * S + 6}"/>`
          + label(round(x), top + 4 * S + 20, strong ? String(i / 2 + 1) : "&", { cls: "hp-fig-small" });
      }).join("")
      + glyph(x0 + 2 * gap + gap, top + 4 * S + 34, G.dynMF, { size: 22, cls: "hp-fig-accentink" })
      + label(120, 20, "eight slots in a 4/4 bar — beats and their &");
  },
  "layout-pins": () => {
    const top = 46, x0 = 18, edges = [18, 78, 120, 176, 222];
    return staff(x0, top, 204)
      + edges.map((x) => `<line class="hp-fig-ink" x1="${x}" y1="${top}" x2="${x}" y2="${top + 4 * S}"/>`).join("")
      + label(48, top - 10, "1", { cls: "hp-fig-small" }) + label(99, top - 10, "2", { cls: "hp-fig-small" }) + label(148, top - 10, "3", { cls: "hp-fig-small" }) + label(199, top - 10, "4", { cls: "hp-fig-small" })
      + stroke([[78, top - 20], [78, top - 8]], { arrow: true }) + label(78, top - 24, "break", { cls: "hp-fig-accentword" })
      + `<path class="hp-fig-stroke" d="M126 ${top - 10} Q148 ${top - 24} 170 ${top - 10}" fill="none"/>` + label(148, top - 26, "keep", { cls: "hp-fig-accentword" })
      + `<line class="hp-fig-stroke" x1="176" y1="${top + 4 * S + 10}" x2="222" y2="${top + 4 * S + 10}"/>` + label(199, top + 4 * S + 24, "128 %", { cls: "hp-fig-accentword" });
  },
  "ghost-note": () => {
    const top = 40;
    return staff(14, top, 212)
      + note(86, top, 6, { ghost: true }) + label(86, top + 4 * S + 22, "the ghost", { cls: "hp-fig-small" })
      + stroke([[112, top + 14], [146, top + 14]], { arrow: true })
      + note(180, top, 6) + label(180, top + 4 * S + 22, "the note you placed", { cls: "hp-fig-small" })
      + label(120, 20, "what the tap will do, before it does it");
  },
};

export const FIGURES = Object.keys(FIG).sort();

/** The caption a figure carries when the article gives none. */
const TITLES = {
  "gesture-lasso": "Drawing a lasso around two notes",
  "gesture-strike": "Striking through two selected notes",
  "gesture-chevron-right": "A right chevron shortens the value",
  "gesture-chevron-left": "A left chevron lengthens the value",
  "gesture-chevron-up": "An up chevron raises the accidental",
  "gesture-chevron-down": "A down chevron lowers the accidental",
  "gesture-hold": "Holding two seconds summons Favorites",
  "gesture-aim": "Holding then sliding lifts the ghost to aim",
  "anatomy-editor": "The editor: header, rails, score",
  "anatomy-rail": "One rail: caption, buttons, hold menus",
  "modes-triangle": "Place, Select and Pan, and the ways between",
  "slot-grid": "The half-beat slots a dynamic can sit on",
  "layout-pins": "A break, a keep and a bar given more width",
  "ghost-note": "The ghost note and the note it becomes",
};

/**
 * One figure as an SVG string. `title` overrides the built-in caption (the article's
 * alt text usually does). Unknown names throw — the generator turns that into a build failure.
 */
export function figure(name, title = TITLES[name]) {
  const draw = FIG[name];
  if (!draw) throw new Error(`no such figure: ${name}`);
  return `<svg class="hp-fig" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="fg-${name}" preserveAspectRatio="xMidYMid meet">`
    + `<title id="fg-${name}">${esc(title ?? name)}</title>${draw()}</svg>`;
}
