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
  // articulations (above / below the head), ornaments, fermata
  staccatoAbove: cp(0xe4a2), staccatoBelow: cp(0xe4a3), accentAbove: cp(0xe4a0), accentBelow: cp(0xe4a1),
  tenutoAbove: cp(0xe4a4), tenutoBelow: cp(0xe4a5), fermataAbove: cp(0xe4c0), fermataBelow: cp(0xe4c1),
  trill: cp(0xe566), mordent: cp(0xe56c), lowerMordent: cp(0xe56d), turn: cp(0xe567),
  // rolled chords: the precomposed signs (buttons) and the wiggle segments + arrowheads a sign of any height is built from (rotated 90°)
  // dynamics and the text hairpins (buttons); engraved hairpins are drawn as lines
  dynPP: cp(0xe52b), dynP: cp(0xe520), dynMP: cp(0xe52c), dynMF: cp(0xe52d), dynF: cp(0xe522), dynFF: cp(0xe52f), hairpinCresc: cp(0xe53e), hairpinDim: cp(0xe53f),
  arpeggio: cp(0xe63c), arpeggioUp: cp(0xe634), arpeggioDown: cp(0xe635), wiggleArpUp: cp(0xeaa9), wiggleArpDown: cp(0xeaaa), wiggleArpUpArrow: cp(0xeaad), wiggleArpDownArrow: cp(0xeaae),
  // form (WSHED-124): repeat dots (origin on the bottom line, dots in spaces 2 and 3), the signs, the barline pictures for the rail
  repeatDots: cp(0xe043), segno: cp(0xe047), coda: cp(0xe048),
  barSingle: cp(0xe030), barDouble: cp(0xe031), barFinal: cp(0xe032), repeatLeft: cp(0xe040), repeatRight: cp(0xe041), repeatBoth: cp(0xe042),
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
/** Articulation glyph for a mark on the given side. */
export const artGlyph = (mark, above) => ({ staccato: above ? G.staccatoAbove : G.staccatoBelow, accent: above ? G.accentAbove : G.accentBelow, tenuto: above ? G.tenutoAbove : G.tenutoBelow, fermata: above ? G.fermataAbove : G.fermataBelow, trill: G.trill, mordent: G.mordent, lowerMordent: G.lowerMordent, turn: G.turn })[mark];

/** The Bravura glyph of a dynamic mark (pp … ff). */
export const dynGlyph = (d) => ({ pp: G.dynPP, p: G.dynP, mp: G.dynMP, mf: G.dynMF, f: G.dynF, ff: G.dynFF })[d];
