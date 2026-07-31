// Tool #3: the tuner — the pitch pipe's inverse. Listens on the mic.
import { buildUI } from "./ui.js";

let ui = null;

export default {
  id: "tuner",
  name: "Tuner",
  glyph: "♯",
  mount(root, ctx) {
    ui = buildUI(root, ctx);
  },
  unmount() {
    ui?.destroy();
    ui = null;
  },
};
