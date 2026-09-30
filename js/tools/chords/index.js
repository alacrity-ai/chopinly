// Tool: chord diagrams for guitar and ukulele (WSHED-160) — the first book on
// the Almanac shelf. The theory and the data live in js/lib/chords/.
import { buildUI } from "./ui.js";
import { icon } from "../../lib/icons.js";

let ui = null;

export default {
  id: "chords",
  name: "Chord diagrams",
  short: "Chords", // the picker button; the long name overflows a phone's navbar
  glyph: icon("chordbox"),
  category: "almanac",
  group: "almanac",
  mount(root, ctx) { ui = buildUI(root, ctx); },
  unmount() { ui?.destroy(); ui = null; },
};
