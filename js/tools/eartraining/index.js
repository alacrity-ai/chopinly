// Training app #2: ear training (WSHED-81). Exercises share a run shell; the
// first is pitch training. See docs/EAR_TRAINING_DESIGN.md.
import { buildUI } from "./ui.js";
import { icon } from "../../lib/icons.js";

let ui = null;

export default {
  id: "eartraining",
  name: "Ear training",
  glyph: icon("ear"),
  category: "training",
  mount(root, ctx) { ui = buildUI(root, ctx); },
  unmount() { ui?.destroy(); ui = null; },
};
