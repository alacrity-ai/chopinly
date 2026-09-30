// The tool registry. A tool is { id, name, glyph, category, mount(rootEl, ctx),
// unmount() } (+ optional `short`, the name on the picker button, and `group`) — see docs/DESIGN.md §1. Adding a tool = one folder under
// js/tools/ + one entry here. `category` ("logbook" | "library" | "tools" |
// "training") groups the navbar dropdown; a rule is drawn between groups. Menu
// order is list order: the Logbook first, then your own material — the scores
// library, Compose and the recorder's takes — then the instruments you reach
// for while practicing, then training.
//
// Groups (WSHED-160): a tool with `group` doesn't get its own line — the group
// does, and its tools open in a flyout beside the menu, so a shelf of reference
// tools never makes the main menu longer. Routing is unchanged (#/<tool-id>).
import metronome from "./tools/metronome/index.js";
import pitchpipe from "./tools/pitchpipe/index.js";
import tuner from "./tools/tuner/index.js";
import keyboard from "./tools/keyboard/index.js";
import recorder from "./tools/recorder/index.js";
import scores from "./tools/scores/index.js";
import compose from "./tools/compose/index.js";
import sightsinging from "./tools/sightsinging/index.js";
import eartraining from "./tools/eartraining/index.js";
import logbook from "./tools/logbook/index.js";
import chords from "./tools/chords/index.js";
import { icon } from "./lib/icons.js";

export const TOOLS = [logbook, scores, compose, recorder, metronome, keyboard, pitchpipe, tuner, sightsinging, eartraining, chords];
/** The Almanac: the reference shelf — things you look up rather than play along with. */
export const GROUPS = {
  almanac: { id: "almanac", name: "Almanac", glyph: icon("book") },
};
/** What a first-time visitor lands on (the last-used tool is restored otherwise). */
export const DEFAULT_TOOL = metronome;
