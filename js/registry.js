// The tool registry. A tool is { id, name, glyph, category, mount(rootEl, ctx),
// unmount() } — see docs/DESIGN.md §1. Adding a tool = one folder under
// js/tools/ + one entry here. `category` ("logbook" | "tools" | "training")
// groups the navbar dropdown; a rule is drawn between groups. Menu order is
// list order: the Logbook first, then the instruments, then training.
import metronome from "./tools/metronome/index.js";
import pitchpipe from "./tools/pitchpipe/index.js";
import tuner from "./tools/tuner/index.js";
import sightsinging from "./tools/sightsinging/index.js";
import logbook from "./tools/logbook/index.js";

export const TOOLS = [logbook, metronome, pitchpipe, tuner, sightsinging];
/** What a first-time visitor lands on (the last-used tool is restored otherwise). */
export const DEFAULT_TOOL = metronome;
