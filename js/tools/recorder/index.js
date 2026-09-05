// Tool: the Recorder (WSHED-75). The same take recorder as the Today screen,
// with room: a big button, a level meter, and every take grouped by goal.
import { buildUI } from "./ui.js";
import { icon } from "../../lib/icons.js";

let ui = null;

export default {
  id: "recorder",
  name: "Recorder",
  glyph: icon("mic"),
  mount(root, ctx) { ui = buildUI(root, ctx); },
  unmount() { ui?.destroy(); ui = null; },
};
