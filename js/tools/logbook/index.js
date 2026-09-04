// Tool #5: the Logbook — practice log. See docs/LOGBOOK_DESIGN.md and
// docs/LOGBOOK_IMPLEMENTATION.md. Data lives in js/lib/logbook.js so the
// shell, the metronome and sight singing can write to it without this UI.
import { buildUI } from "./ui.js";
import { icon } from "../../lib/icons.js";

let ui = null;

export default {
  id: "logbook",
  name: "Logbook",
  glyph: icon("pencil"),
  category: "logbook",
  mount(root, ctx) {
    ui = buildUI(root, ctx);
  },
  unmount() {
    ui?.destroy();
    ui = null;
  },
};
