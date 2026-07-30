// Tool #1: the metronome. See docs/DESIGN.md for the tool contract.
import { buildUI } from "./ui.js";

let ui = null;

export default {
  id: "metronome",
  name: "Metronome",
  glyph: "♩",
  mount(root, ctx) {
    ui = buildUI(root, ctx);
  },
  unmount() {
    ui?.destroy();
    ui = null;
  },
};
