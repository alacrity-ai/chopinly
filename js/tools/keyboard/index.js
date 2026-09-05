// Tool: the piano keyboard (WSHED-73). The reusable parts live in
// js/lib/keyboard/; this folder is just the tool around them.
import { buildUI } from "./ui.js";
import { icon } from "../../lib/icons.js";

let ui = null;

export default {
  id: "keyboard",
  name: "Piano",
  glyph: icon("keys"),
  mount(root, ctx) { ui = buildUI(root, ctx); },
  unmount() { ui?.destroy(); ui = null; },
};
