// Chopinly logo candidates (WSHED-97). Each mark is pure SVG on a 100×100 grid so it
// scales from a 16px favicon to a 512px app icon. `bg` is the tile behind the mark
// (rounded square) — pass null for a bare mark on any background.
export const C = { ebony: "#191410", raised: "#26201a", edge: "#3a3128", ivory: "#eee5d3", dim: "#a2947d", brass: "#c9a35c", bright: "#e3c284", sage: "#8fae82", felt: "#b0463c" };

const tile = (fill, r = 22) => (fill ? `<rect width="100" height="100" rx="${r}" fill="${fill}"/>` : "");

/** A — Middle C. A brass note head on its ledger line under the staff: the pianist's home note, and the C of Chopinly. */
export function middleC({ bg = C.ebony, ink = C.ivory, accent = C.brass } = {}) {
  const lines = [26, 35, 44, 53, 62].map((y) => `<line x1="16" y1="${y}" x2="84" y2="${y}" stroke="${ink}" stroke-opacity="0.28" stroke-width="1.6" stroke-linecap="round"/>`).join("");
  return `${tile(bg)}${lines}
  <line x1="36" y1="80" x2="68" y2="80" stroke="${ink}" stroke-opacity="0.55" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="60.8" y1="78" x2="60.8" y2="34" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="51.8" cy="80" rx="10.2" ry="7" fill="${accent}" transform="rotate(-22 51.8 80)"/>`;
}

/** B — The Keys. A section of keyboard, C to G, with one key in brass: the note you are practicing. */
export function keys({ bg = C.ebony, key = C.ivory, accent = C.brass, black = null } = {}) {
  const x0 = 17, w = 12.6, gap = 0.8, top = 22, bottom = 82;
  const whites = [0, 1, 2, 3, 4].map((i) => { const x = x0 + i * (w + gap); const fill = i === 2 ? accent : key; return `<rect x="${x}" y="${top}" width="${w}" height="${bottom - top}" rx="2.6" fill="${fill}"/>`; }).join("");
  const bk = black ?? bg;
  const blacks = [1, 2, 4].map((b) => { const x = x0 + b * (w + gap) - 4.3 - gap / 2; return `<rect x="${x}" y="${top - 0.01}" width="8.6" height="35" rx="1.8" fill="${bk}"/>`; }).join("");
  return `${tile(bg)}${whites}${blacks}`;
}

/** C — The Pendulum. The metronome's rod and weight with the arc it swings through: honest time, and the record of it. */
export function pendulum({ bg = C.ebony, ink = C.ivory, accent = C.brass } = {}) {
  return `${tile(bg)}
  <path d="M 22.6 45.2 A 44 44 0 0 1 77.4 45.2" fill="none" stroke="${ink}" stroke-opacity="0.35" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="50" y1="80" x2="63.5" y2="27.5" stroke="${accent}" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="58" cy="48.5" r="9.5" fill="${accent}"/>
  <circle cx="55.2" cy="45.6" r="2.2" fill="${C.bright}"/>
  <circle cx="50" cy="80" r="3.6" fill="${ink}" fill-opacity="0.9"/>
  <circle cx="77.4" cy="45.2" r="2.6" fill="${C.felt}"/>`;
}

export const CANDIDATES = [
  { id: "A", name: "Middle C", mark: middleC, why: "The pianist's home note, drawn where it lives: on its own ledger line below the treble staff. Reads as music at every size, and the note head doubles as the dot of the i.", tradeoff: "Says \"music\" more than \"piano\" — the staff could belong to any instrument.", idot: "note" },
  { id: "B", name: "The Keys", mark: keys, why: "Five keys, C to G, with the black-key pattern that makes a keyboard unmistakable in a glance — and one key in brass: the one you are practicing.", tradeoff: "The most literal of the three; at 16px the black keys blur and it becomes a striped square.", idot: "key" },
  { id: "C", name: "The Pendulum", mark: pendulum, why: "The metronome we already have, composed: rod, weight, and the arc it swings through — time kept honestly, and the arc as the record of it. Continuity with the current icon.", tradeoff: "Says \"metronome\" first; Chopinly is more than its metronome.", idot: "round" },
];

export const svg = (inner, size = 100) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${inner}</svg>`;
