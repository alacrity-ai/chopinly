// Training app #1: sight singing. See docs/SIGHTSINGING_PLAN.md.
import { buildUI } from "./ui.js";

let ui = null;

export default {
  id: "sightsinging",
  name: "Sight singing",
  glyph: "♬",
  category: "training",
  mount(root, ctx) {
    ui = buildUI(root, ctx);
  },
  unmount() {
    ui?.destroy();
    ui = null;
  },
};
