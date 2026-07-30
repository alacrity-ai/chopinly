// Tool #2: the pitch pipe. A sustained reference tone for tuning.
import { buildUI } from "./ui.js";

let ui = null;

export default {
  id: "pitchpipe",
  name: "Pitch pipe",
  glyph: "◉",
  mount(root, ctx) {
    ui = buildUI(root, ctx);
  },
  unmount() {
    ui?.destroy();
    ui = null;
  },
};
