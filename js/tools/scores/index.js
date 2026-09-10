// Tool: Scores (WSHED-98) — the sheet-music library and reader. Import PDFs,
// find them, open one full screen and turn pages by tapping the edges.
// Its own group in the tool menu: neither an instrument, a capture device nor a lesson.
import { buildUI } from "./ui.js";
import { icon } from "../../lib/icons.js";

let ui = null;

export default {
  id: "scores",
  name: "Scores",
  glyph: icon("score"),
  category: "library",
  mount(root, ctx) { ui = buildUI(root, ctx); },
  unmount() { ui?.destroy(); ui = null; },
};
