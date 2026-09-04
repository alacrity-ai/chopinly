// The tool registry. A tool is { id, name, glyph, category, mount(rootEl, ctx),
// unmount() } — see docs/DESIGN.md §1. Adding a tool = one folder under
// js/tools/ + one entry here. `category` ("tools" | "training") groups the
// navbar dropdown; a rule is drawn between groups.
import metronome from "./tools/metronome/index.js";
import pitchpipe from "./tools/pitchpipe/index.js";
import tuner from "./tools/tuner/index.js";
import sightsinging from "./tools/sightsinging/index.js";
import logbook from "./tools/logbook/index.js";

export const TOOLS = [metronome, pitchpipe, tuner, logbook, sightsinging];
