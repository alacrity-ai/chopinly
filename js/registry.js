// The tool registry. A tool is { id, name, glyph, mount(rootEl, ctx), unmount() }
// — see docs/DESIGN.md §1. Adding a tool = one folder under js/tools/ + one
// entry here; the shell grows a tab strip automatically once there are two.
import metronome from "./tools/metronome/index.js";
import pitchpipe from "./tools/pitchpipe/index.js";
import tuner from "./tools/tuner/index.js";

export const TOOLS = [metronome, pitchpipe, tuner];
