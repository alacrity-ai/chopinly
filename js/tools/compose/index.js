// Tool: Compose (WSHED-114) — tap-driven music notation. Pick a duration,
// tap the staff, the note lands exactly there. Lives in the sheet-music group
// next to Scores.
import { buildUI } from "./ui.js";
import { icon } from "../../lib/icons.js";

let ui = null;

export default {
  id: "compose",
  name: "Compose",
  glyph: icon("pencil"),
  category: "library",
  mount(root, ctx) { ui = buildUI(root, ctx); },
  unmount() { ui?.destroy(); ui = null; },
};
