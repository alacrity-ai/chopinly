// Bravura (SMuFL) codepoints shared by the sight-singing staff and Compose.
// 1 em = 1 staff height; every glyph's origin sits on its musical anchor, so a
// glyph is one <text x y> at that anchor with font-size = 4 × S.
const cp = (n) => String.fromCodePoint(n);

export const G = {
  brace: cp(0xe000),
  gClef: cp(0xe050), cClef: cp(0xe05c), fClef: cp(0xe062),
  dblWhole: cp(0xe0a0), whole: cp(0xe0a2), half: cp(0xe0a3), black: cp(0xe0a4),
  "-2": cp(0xe264), "-1": cp(0xe260), 0: cp(0xe261), 1: cp(0xe262), 2: cp(0xe263), // ♭♭ ♭ ♮ ♯ 𝄪
  dot: cp(0xe1e7),
  flagUp: cp(0xe240), flagDown: cp(0xe241),
  flag16Up: cp(0xe242), flag16Down: cp(0xe243),
  flag32Up: cp(0xe244), flag32Down: cp(0xe245),
  flag64Up: cp(0xe246), flag64Down: cp(0xe247),
  restDbl: cp(0xe4e2), restWhole: cp(0xe4e3), restHalf: cp(0xe4e4), restQuarter: cp(0xe4e5),
  rest8th: cp(0xe4e6), rest16th: cp(0xe4e7), rest32nd: cp(0xe4e8), rest64th: cp(0xe4e9),
  // palette pictures (SMuFL "metronome" notes: head + stem + flags in one glyph)
  metDblWhole: cp(0xeca0), metWhole: cp(0xeca2), metHalf: cp(0xeca3), metQuarter: cp(0xeca5),
  met8th: cp(0xeca7), met16th: cp(0xeca9), met32nd: cp(0xecab), met64th: cp(0xecad),
};
export const timeDigit = (n) => cp(0xe080 + n);
export const tupletDigit = (n) => cp(0xe880 + n);

/** Rest glyph for a duration base (0 = double whole … 64). */
export const restGlyph = (base) => ({ 0: G.restDbl, 1: G.restWhole, 2: G.restHalf, 4: G.restQuarter, 8: G.rest8th, 16: G.rest16th, 32: G.rest32nd, 64: G.rest64th })[base];
/** Notehead glyph for a duration base. */
export const headGlyph = (base) => (base === 0 ? G.dblWhole : base === 1 ? G.whole : base === 2 ? G.half : G.black);
/** Flag glyph for a base (8 … 64) and stem direction. */
export const flagGlyph = (base, up) => ({ 8: up ? G.flagUp : G.flagDown, 16: up ? G.flag16Up : G.flag16Down, 32: up ? G.flag32Up : G.flag32Down, 64: up ? G.flag64Up : G.flag64Down })[base];
/** Palette picture for a base. */
export const metGlyph = (base) => ({ 0: G.metDblWhole, 1: G.metWhole, 2: G.metHalf, 4: G.metQuarter, 8: G.met8th, 16: G.met16th, 32: G.met32nd, 64: G.met64th })[base];
