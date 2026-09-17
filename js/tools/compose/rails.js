// The control rail and the palette rail (docs/COMPOSE_DESIGN.md §8.1). Pure
// markup + click wiring; the editor owns the state and calls `update`.
import { icon } from "../../lib/icons.js";
import { metGlyph, artGlyph, dynGlyph, G } from "../../lib/staff/glyphs.js";
import { CLEFS } from "../../lib/music.js";
import { esc } from "../logbook/util.js";

export const MAIN_BASES = [1, 2, 4, 8, 16];
export const MORE_BASES = [0, 32, 64];
const NAMES = { 0: "double whole", 1: "whole", 2: "half", 4: "quarter", 8: "eighth", 16: "sixteenth", 32: "thirty-second", 64: "sixty-fourth" };
export const durName = (base) => NAMES[base];
const TUPLET_NAMES = { 2: "duplet", 3: "triplet", 5: "quintuplet", 6: "sextuplet", 7: "septuplet" };
export const tupletName = (n) => TUPLET_NAMES[n];

let meter = null;
/** Slide a Bravura glyph so its ink is vertically centred where a typographic centre would be. */
export function centreGlyph(span) {
  meter ??= document.createElement("canvas").getContext("2d");
  if (!meter) return;
  const cs = getComputedStyle(span);
  meter.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = meter.measureText(span.textContent);
  if (!("fontBoundingBoxAscent" in m) || !("actualBoundingBoxAscent" in m)) return;
  // The zero-height glyph box sits on the button's centre line with its baseline (font ascent − font descent) / 2
  // above that line. A note's head is centred on the baseline, so a note slides down by just that much (the stem and
  // flags rise above); anything else centres its ink, which sits (ink ascent − ink descent) / 2 above the baseline,
  // so it slides down by that too. (v83: this term was subtracted — symmetric glyphs such as accidentals hid it, the
  // ornaments sat up to 13 px high and the rolled-chord sign was clipped; measured on 4× screenshots.)
  const note = span.classList.contains("cp-glyph-note");
  const dy = (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + (note ? 0 : (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  span.style.setProperty("--dy", `${dy.toFixed(2)}px`);
}

/** The fifteen keys, flats to sharps, with their major and relative minor names. */
export const KEYS = [["C♭", "A♭"], ["G♭", "E♭"], ["D♭", "B♭"], ["A♭", "F"], ["E♭", "C"], ["B♭", "G"], ["F", "D"], ["C", "A"], ["G", "E"], ["D", "B"], ["A", "F♯"], ["E", "C♯"], ["B", "G♯"], ["F♯", "D♯"], ["C♯", "A♯"]].map(([major, minor], i) => ({ fifths: i - 7, major, minor }));
export const TIMES = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 8], [9, 8], [12, 8], [2, 2], [3, 8], [7, 8]];
/** The clef menu, in staff order from the top down. */
export const CLEF_NAMES = ["treble", "soprano", "mezzo", "alto", "tenor", "baritone", "bass"];
/** The pickers' chevron (v100): an icon, so it sizes and colours with the button. */
const CHEV = `<span class="cp-chev" aria-hidden="true">${icon("chev")}</span>`;
/** At phone width a picker shows a glyph in place of its word (v100): the word alone left a bare chevron. */
const pickIc = (html) => `<span class="cp-pick-ic" aria-hidden="true">${html}</span>`;
const clefBtn = (c) => `<button type="button" class="cp-btn cp-clef" data-act="clef" data-clef="${c}" aria-pressed="false" aria-label="${c} clef — then tap the beat it starts on"><span class="cp-glyph cp-glyph-sm">${G[CLEFS[c].glyph]}</span><small>${c}</small></button>`;

/** The rolled-chord menu: the sign, its glyph, what the row says. */
const ARP_ROWS = [["plain", G.arpeggio, "rolled"], ["up", G.arpeggioUp, "rolled upward"], ["down", G.arpeggioDown, "rolled downward"]];
/** What the mark buttons say; a mark not listed reads as its id. */
const MARK_NAMES = { lowerMordent: "lower mordent — the one with the line through it" };
/** The rails a reader can show or hide, in order — the header that holds the menu is not one of them. */
export const RAILS = [["control", "Controls"], ["transport", "Transport"], ["palette", "Notes"], ["utility", "Key · time · clef · marks"], ["expression", "Dynamics · hairpins · text"], ["form", "Form · repeats · tempo"], ["piano", "Piano · pedal · 8va · fingering"], ["notes2", "Grace · tremolo · marks"]]; // expression marks arm a cursor and land on half-beats (docs/COMPOSE_EXPRESSIONS_DESIGN.md)
/** Pen | Touch (v101): the switch exists only where a finger can touch the score. */
const TOUCHY = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
/** The captions on the palette rails (v100): the word that says which rail this is, sticky at the left while the rail scrolls. */
const CAPTIONS = { palette: "Notes", utility: "Key · time", expression: "Dynamics", form: "Form", piano: "Piano", notes2: "Marks" };
export const DEFAULT_RAILS = { control: true, transport: true, palette: true, utility: false, expression: false, form: false, piano: false, notes2: false };
export const TREMS = [1, 2, 3];
export const FINGERS = [1, 2, 3, 4, 5];
/** The Form rail (docs/COMPOSE_FORM_DESIGN.md §3): barline pictures, the ending numbers, the jump rows — each arms a tap on a bar. */
export const BARLINES = [["single", "barSingle", "single barline (clears a repeat or double bar)"], ["double", "barDouble", "double barline"], ["final", "barFinal", "final barline"], ["repeat-start", "repeatLeft", "repeat start"], ["repeat", "repeatRight", "repeat end"], ["both", "repeatBoth", "repeat end and a repeat start on the next bar"], ["repeat3", "repeatRight", "repeat end, played three times", "3×"], ["repeat4", "repeatRight", "repeat end, played four times", "4×"]];
/** The rails filled out (docs/COMPOSE_RAILS2_DESIGN.md §4): the extreme and sudden dynamics, the hairpin variants, the tempo units, the pedal styles, the ornament rows. */
export const SUDDENS = ["sf", "sfz", "sfp", "fp", "rfz"];
export const TEMPO_UNIT_ROWS = [[8, 0, "eighth"], [4, 0, "quarter"], [4, 1, "dotted quarter"], [2, 0, "half"]];
export const PEDAL_STYLE_ROWS = [["line", "Ped. with a line to the lift"], ["sign", "Ped. … ✱"], ["sost", "Sost. Ped. (sostenuto)"]];
export const HANDS = { en: ["r.h.", "l.h."], fr: ["m.d.", "m.g."], it: ["m.d.", "m.s."] };
export const ORN_ROWS = [["trill", { line: true }, "trill with a wavy line"], ["trill", { alter: 1 }, "trill with a sharp"], ["trill", { alter: -1 }, "trill with a flat"], ["trill", { alter: 0 }, "trill with a natural"], ["art", "invertedTurn", "inverted turn"], ["art", "delayedTurn", "turn after the note"]];
export const ENDINGS = [1, 2, 3];
export const JUMP_ROWS = [["dc", "D.C."], ["dcAlFine", "D.C. al Fine"], ["dcAlCoda", "D.C. al Coda"], ["ds", "D.S."], ["dsAlFine", "D.S. al Fine"], ["dsAlCoda", "D.S. al Coda"], ["toCoda", "To Coda"], ["fine", "Fine"]];
export const JUMP_LABEL = Object.fromEntries(JUMP_ROWS);
/** Dynamics in rail order and the text suggestions (free typing too). */
const DYNS = ["pp", "p", "mp", "mf", "f", "ff"];
const TEXTS = ["rit.", "a tempo", "accel.", "rall.", "cresc.", "dim.", "dolce", "espress.", "legato", "rubato", "cantabile", "marcato", "più f", "meno f", "sub. p", "poco a poco", "sempre", "leggiero", "sotto voce", "sim."];
const dynBtn = (d, extra = "") => `<button type="button" class="cp-btn cp-sq cp-expr-btn cp-dyn-btn${extra}" data-act="dyn" data-dyn="${d}" aria-label="${d} — tap the beat it goes on" aria-pressed="false"><span class="cp-glyph cp-glyph-dyn">${dynGlyph(d)}</span></button>`;
/** A hairpin's hold menu: the hairpin, the dashed words, from / to nothing. */
const hairpinRows = (kind) => { const cresc = kind === "cresc"; return [`<button type="button" class="cp-btn cp-menu-row cp-hairpin-row" data-act="hairpin" data-kind="${kind}"><span class="cp-glyph cp-glyph-xs">${cresc ? G.hairpinCresc : G.hairpinDim}</span><span>${cresc ? "crescendo" : "diminuendo"} hairpin</span></button>`, `<button type="button" class="cp-btn cp-menu-row cp-textline-row" data-act="textline" data-text="${cresc ? "cresc." : "dim."}"><i>${cresc ? "cresc." : "dim."} – – –</i><span>dashed words</span></button>`, `<button type="button" class="cp-btn cp-menu-row cp-hairpin-row" data-act="hairpin" data-kind="${kind}" data-niente="1"><span>${cresc ? "o&lt;" : "&gt;o"}</span><span>${cresc ? "from nothing" : "to nothing"}</span></button>`].join(""); };
/** The voice menu (hold a voice button, or ▾ at phone width): rows are enabled by what the selection allows. */
const VOICE_ROWS = [...[0, 1, 2, 3].map((v) => ["voice", `voice ${v + 1}`, { v }]), ["voice-swap", "swap 1 ↔ 2 in these bars", {}], ["cross", "cross to the upper staff", { dir: -1 }], ["cross", "cross to the lower staff", { dir: 1 }], ["hide-rest", "hide rest", {}]];
/** The File menu: the two PDF rows open the export sheet (WSHED-121); MusicXML / MIDI wait for WSHED-119. */
const FILE_ITEMS = [["save-pdf", "Save to Scores as PDF", true], ["export-pdf", "Export PDF", true], ["export-xml", "Export MusicXML", true], ["export-midi", "Export MIDI", false]];

export function buildRails(host, { title, onAction, onCapture }) {
  host.innerHTML = `
    <div class="cp-rail cp-header" role="toolbar" aria-label="composition">
      <button type="button" class="cp-btn cp-sq" data-act="back" aria-label="back to compositions">${icon("back")}</button>
      <button type="button" class="cp-title" id="cp-title" data-act="details" aria-label="details — title, composer, tags">${esc(title)}</button>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick cp-file" data-pop="cp-file-more" aria-label="file" aria-expanded="false"><span class="cp-pick-label">File</span>${CHEV}</button>
        <span class="cp-more cp-menu" id="cp-file-more" hidden>${FILE_ITEMS.map(([act, label, live]) => `<button type="button" class="cp-btn cp-menu-row" data-act="${act}"${live ? "" : " disabled"}><span>${label}</span>${live ? "" : "<small>soon</small>"}</button>`).join("")}</span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick cp-rails-btn" data-pop="cp-rails-more" aria-label="show or hide rails" aria-expanded="false">${icon("grip")}<span class="cp-pick-label">Rails</span>${CHEV}</button>
        <span class="cp-more cp-menu" id="cp-rails-more" hidden>${RAILS.map(([k, label]) => `<button type="button" class="cp-btn cp-menu-row cp-rail-row" role="menuitemcheckbox" data-act="rail" data-rail="${k}" aria-checked="true"><span class="cp-check">${icon("check")}</span><span>${label}</span></button>`).join("")}</span>
      </span>
    </div>
    <div class="cp-rail cp-control" role="toolbar" aria-label="controls" data-rail="control">
      <span class="cp-tray">
        <button type="button" class="cp-btn cp-sq" data-act="undo" aria-label="undo" disabled>${icon("undo")}</button>
        <button type="button" class="cp-btn cp-sq" data-act="redo" aria-label="redo" disabled>${icon("redo")}</button>
      </span>
      <span class="cp-group cp-switch" role="group" aria-label="mode">
        <button type="button" class="cp-btn cp-mode" data-act="select" aria-pressed="false">${icon("cursor")}<span class="cp-word">Select</span></button>
        <button type="button" class="cp-btn cp-mode" data-act="pan" aria-pressed="false" aria-label="pan — one finger scrolls, two zoom">${icon("hand")}<span class="cp-word">Pan</span></button>
      </span>
      <span class="cp-group cp-switch cp-setting cp-input" role="group" aria-label="what draws"${TOUCHY ? "" : " hidden"}>
        <button type="button" class="cp-btn cp-inp" data-act="input" data-input="pen" aria-pressed="false" aria-label="the pencil draws — fingers rest">${icon("nib")}<span class="cp-word">Pen</span></button>
        <button type="button" class="cp-btn cp-inp" data-act="input" data-input="touch" aria-pressed="false" aria-label="a finger draws">${icon("finger")}<span class="cp-word">Touch</span></button>
      </span>
      <span class="cp-group cp-switch cp-setting cp-gesture" role="group" aria-label="gestures">
        <button type="button" class="cp-btn cp-gest" data-act="gesture" aria-pressed="false" aria-label="gesture mode — drag to lasso, a line through selected notes deletes them">${icon("gesture")}<span class="cp-word">Gesture</span></button>
      </span>
      <span class="cp-group cp-switch cp-setting cp-favs" role="group" aria-label="favorites">
        <button type="button" class="cp-btn cp-favbtn" data-act="favorites" aria-pressed="false" aria-label="favorites — a floating palette of your own buttons; hold two seconds on the staff to summon it">${icon("star")}<span class="cp-word">Favorites</span></button>
      </span>
      <span class="cp-tray">
        <button type="button" class="cp-btn cp-sq" data-act="delete" aria-label="delete the selection" disabled>${icon("trash")}</button>
        <button type="button" class="cp-btn cp-sq" data-act="copy" aria-label="copy the selection" disabled>${icon("copy")}</button>
        <button type="button" class="cp-btn cp-sq" data-act="cut" aria-label="cut the selection" disabled>${icon("cut")}</button>
        <button type="button" class="cp-btn cp-sq" data-act="paste" aria-label="paste — then tap where it goes" aria-pressed="false" disabled>${icon("paste")}</button>
      </span>
      <span class="cp-spring" aria-hidden="true"></span>
      <span class="cp-tray">
        <button type="button" class="cp-btn cp-sq cp-zoom" data-act="zoom-out" aria-label="smaller">&minus;</button>
        <button type="button" class="cp-btn cp-sq cp-zoom" data-act="zoom-in" aria-label="bigger">+</button>
      </span>
    </div>
    <div class="cp-rail cp-transport" role="toolbar" aria-label="transport" data-rail="transport">
      <span class="cp-tray">
        <button type="button" class="cp-btn cp-sq" data-act="stop" aria-label="stop — back to the start">${icon("stop")}</button>
        <button type="button" class="cp-btn cp-sq" data-act="rew" aria-label="a bar back">${icon("skipBack")}</button>
        <button type="button" class="cp-btn cp-sq cp-play" data-act="play" aria-label="play" aria-pressed="false"><span class="cp-play-ic">${icon("play")}</span><span class="cp-pause-ic">${icon("pause")}</span></button>
        <button type="button" class="cp-btn cp-sq" data-act="ff" aria-label="a bar forward">${icon("skipFwd")}</button>
      </span>
      <span class="cp-pos-wrap">
        <input type="range" class="cp-pos" id="cp-pos" min="0" max="1" step="1" value="0" aria-label="position in the piece">
        <span class="cp-pos-read" id="cp-pos-read" aria-live="off">bar 1 of 8</span>
      </span>
      <span class="cp-tempo cp-group" role="group" aria-label="tempo">
        <span class="cp-tempo-mark" aria-hidden="true"><span class="cp-glyph cp-glyph-xs cp-glyph-note">${metGlyph(4)}</span><span class="cp-tempo-eq">=</span></span>
        <button type="button" class="cp-btn cp-sq cp-tempo-btn" data-act="tempo-down" aria-label="slower">&minus;</button>
        <button type="button" class="cp-btn cp-bpm" data-act="tempo" id="cp-bpm" aria-label="tempo — tap to type one">100</button>
        <button type="button" class="cp-btn cp-sq cp-tempo-btn" data-act="tempo-up" aria-label="faster">+</button>
      </span>
    </div>
    <div class="cp-rail cp-palette" role="toolbar" aria-label="palette" data-rail="palette">
      <span class="cp-more-wrap cp-voices">
        <button type="button" class="cp-btn cp-pick cp-voice-pick" data-pop="cp-voice-more" data-v="0" aria-label="voice — the one the next tap writes in; with notes selected, the one they move to; swap, cross-staff, hide rest" aria-expanded="false"><span class="cp-pick-label">voice</span><b class="cp-voice-n">1</b>${CHEV}</button>
        <span class="cp-more cp-menu" id="cp-voice-more" hidden>${VOICE_ROWS.map(([act, label, d]) => `<button type="button" class="cp-btn cp-menu-row cp-voice-row" data-act="${act}"${d.v !== undefined ? ` data-v="${d.v}"` : ""}${d.dir !== undefined ? ` data-dir="${d.dir}"` : ""}><span>${label}</span><small></small></button>`).join("")}</span>
      </span>
      <span class="cp-group" role="group" aria-label="note values">
      ${MAIN_BASES.map((b) => `<button type="button" class="cp-btn cp-sq cp-dur" data-act="dur" data-base="${b}" aria-pressed="false" aria-label="${NAMES[b]}"><span class="cp-glyph cp-glyph-note">${metGlyph(b)}</span></button>`).join("")}
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-dur-more" data-pop="cp-more" aria-label="more durations" aria-expanded="false"><span class="cp-glyph cp-glyph-sm cp-glyph-note" id="cp-more-glyph">${metGlyph(32)}</span>${CHEV}</button>
        <span class="cp-more" id="cp-more" hidden>${MORE_BASES.map((b) => `<button type="button" class="cp-btn cp-sq cp-dur" data-act="dur" data-base="${b}" aria-pressed="false" aria-label="${NAMES[b]}"><span class="cp-glyph cp-glyph-note">${metGlyph(b)}</span></button>`).join("")}</span>
      </span>
      </span>
      <span class="cp-group" role="group" aria-label="dot, tie, tuplet">
      <button type="button" class="cp-btn cp-sq cp-dot" data-act="dot" aria-pressed="false" aria-label="dot"><span class="cp-glyph cp-dot-glyph" id="cp-dot-glyph">${G.dot}</span></button>
      <button type="button" class="cp-btn cp-sq" data-act="tie" aria-label="tie — select a note first"><span class="cp-tie-pic" aria-hidden="true"></span></button>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-sq cp-tuplet" data-act="tuplet" aria-pressed="false" aria-label="tuplet — hold for 2, 5, 6 or 7"><span class="cp-glyph cp-glyph-sm">${G.black}</span><small id="cp-tuplet-n">3</small></button>
        <span class="cp-more" id="cp-tup-more" hidden>${[2, 3, 5, 6, 7].map((n) => `<button type="button" class="cp-btn cp-sq cp-tup-n" data-act="tuplet" data-n="${n}" aria-label="${TUPLET_NAMES[n]}"><span class="cp-glyph cp-glyph-sm">${G.black}</span><small>${n}</small></button>`).join("")}</span>
      </span>
      </span>
      <span class="cp-group" role="group" aria-label="accidentals">
      ${[[1, "sharp"], [-1, "flat"], [0, "natural"]].map(([a, name]) => `<button type="button" class="cp-btn cp-sq cp-acc" data-act="acc" data-alter="${a}" aria-pressed="false" aria-label="${name}"><span class="cp-glyph">${G[a]}</span></button>`).join("")}
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-acc-more" data-pop="cp-acc-more" aria-label="double sharp, double flat" aria-expanded="false"><span class="cp-glyph cp-glyph-sm" id="cp-acc-more-glyph">${G[2]}</span>${CHEV}</button>
        <span class="cp-more" id="cp-acc-more" hidden>${[[2, "double sharp"], [-2, "double flat"]].map(([a, name]) => `<button type="button" class="cp-btn cp-sq cp-acc" data-act="acc" data-alter="${a}" aria-pressed="false" aria-label="${name}"><span class="cp-glyph">${G[a]}</span></button>`).join("")}</span>
      </span>
      </span>
    </div>
    <div class="cp-rail cp-utility" id="cp-utility" role="toolbar" aria-label="key, time, clef and marks" data-rail="utility" hidden>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick" data-pop="cp-key-more" aria-label="key signature — pick one, then tap the bar it starts at" aria-expanded="false" aria-pressed="false"><span class="cp-pick-label">Key</span>${pickIc(`<span class="cp-glyph cp-glyph-xs">${G[1]}${G[-1]}</span>`)}<b class="cp-pick-val" id="cp-key-val"></b>${CHEV}</button>
        <span class="cp-more cp-grid cp-key-grid" id="cp-key-more" hidden>${KEYS.map((k) => `<button type="button" class="cp-btn cp-key" data-act="key" data-fifths="${k.fifths}" aria-pressed="false" aria-label="${k.major} major, ${k.minor} minor"><b>${k.major}</b><small>${k.minor}m</small></button>`).join("")}</span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick" data-pop="cp-time-more" aria-label="time signature — pick one, then tap the bar it starts at" aria-expanded="false" aria-pressed="false"><span class="cp-pick-label">Time</span>${pickIc(`<span class="cp-glyph cp-glyph-xs">${G.timeSigCommon}</span>`)}<b class="cp-pick-val" id="cp-time-val"></b>${CHEV}</button>
        <span class="cp-more cp-grid" id="cp-time-more" hidden>${TIMES.map((t) => `<button type="button" class="cp-btn cp-time" data-act="time" data-beats="${t[0]}" data-unit="${t[1]}" aria-pressed="false" aria-label="${t[0]} ${t[1]}"><b>${t[0]}</b><b>${t[1]}</b></button>`).join("")}<button type="button" class="cp-btn cp-time-custom" data-act="time" data-custom="1" aria-label="another time signature">other…</button></span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick" data-pop="cp-clef-more" aria-label="clef — pick one, then tap the beat it starts on" aria-expanded="false" aria-pressed="false"><span class="cp-pick-label">Clef</span>${pickIc(`<span class="cp-glyph cp-glyph-xs cp-glyph-clef">${G.gClef}</span>`)}<span class="cp-pick-val cp-clef-val" id="cp-clef-val"></span>${CHEV}</button>
        <span class="cp-more cp-grid cp-clef-grid" id="cp-clef-more" hidden>${CLEF_NAMES.map(clefBtn).join("")}</span>
      </span>
      <span class="cp-group" role="group" aria-label="marks">
      ${["fermata", "staccato", "accent", "tenuto"].map((m) => `<button type="button" class="cp-btn cp-sq cp-art-btn" data-act="art" data-mark="${m}" aria-label="${MARK_NAMES[m] ?? m}"><span class="cp-glyph">${artGlyph(m, true)}</span></button>`).join("")}
      <button type="button" class="cp-btn cp-sq cp-slur-btn" data-act="slur" aria-label="slur — from the first selected note to the last (one note: to the next)" disabled><span class="cp-slur-pic" aria-hidden="true"></span></button>
      </span>
      <span class="cp-group" role="group" aria-label="ornaments">
      ${["trill", "mordent", "lowerMordent", "turn"].map((m) => `<button type="button" class="cp-btn cp-sq cp-art-btn" data-act="art" data-mark="${m}" aria-label="${MARK_NAMES[m] ?? m}"><span class="cp-glyph">${artGlyph(m, true)}</span></button>`).join("")}
      </span>
      <span class="cp-group" role="group" aria-label="glissando, rolled chord">
      <button type="button" class="cp-btn cp-gliss-btn" data-act="gliss" aria-label="glissando to the next note"><i>gliss.</i></button>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-arp-btn" data-pop="cp-arp-more" aria-label="rolled chord — pick the roll" aria-expanded="false" disabled><span class="cp-glyph cp-glyph-xs">${G.arpeggio}</span>${CHEV}</button>
        <span class="cp-more cp-menu" id="cp-arp-more" hidden>${ARP_ROWS.map(([kind, glyph, label]) => `<button type="button" class="cp-btn cp-menu-row cp-arp-row" data-act="arp" data-kind="${kind}"><span class="cp-glyph cp-glyph-xs">${glyph}</span><span>${label}</span></button>`).join("")}</span>
      </span>
      </span>
    </div>
    <div class="cp-rail cp-expression" id="cp-expression" role="toolbar" aria-label="dynamics, hairpins and text" data-rail="expression" hidden>
      <span class="cp-group" role="group" aria-label="dynamics">
      <span class="cp-more-wrap">${dynBtn("pp", " cp-hold-pp")}<span class="cp-more" id="cp-pp-more" hidden>${dynBtn("ppp")}${dynBtn("pppp")}</span></span>
      ${DYNS.slice(1, -1).map((d) => dynBtn(d)).join("")}
      <span class="cp-more-wrap">${dynBtn("ff", " cp-hold-ff")}<span class="cp-more" id="cp-ff-more" hidden>${dynBtn("fff")}${dynBtn("ffff")}</span></span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-expr-btn cp-sf-btn" data-pop="cp-sf-more" aria-label="sudden dynamics — sf, sfz, sfp, fp, rfz: pick one, then tap the beat" aria-expanded="false" aria-pressed="false"><span class="cp-glyph cp-glyph-dyn" id="cp-sf-glyph">${dynGlyph("sf")}</span>${CHEV}</button>
        <span class="cp-more" id="cp-sf-more" hidden>${SUDDENS.map((d) => dynBtn(d)).join("")}</span>
      </span>
      </span>
      <span class="cp-group" role="group" aria-label="hairpins">
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-sq cp-expr-btn cp-hairpin-btn" data-act="hairpin" data-kind="cresc" aria-label="crescendo — tap where it starts, then where it ends; hold for the dashed words or from nothing" aria-pressed="false"><span class="cp-glyph cp-glyph-sm">${G.hairpinCresc}</span></button>
        <span class="cp-more cp-menu" id="cp-cresc-more" hidden>${hairpinRows("cresc")}</span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-sq cp-expr-btn cp-hairpin-btn" data-act="hairpin" data-kind="dim" aria-label="diminuendo — tap where it starts, then where it ends; hold for the dashed words or to nothing" aria-pressed="false"><span class="cp-glyph cp-glyph-sm">${G.hairpinDim}</span></button>
        <span class="cp-more cp-menu" id="cp-dim-more" hidden>${hairpinRows("dim")}</span>
      </span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-expr-btn cp-text-btn" data-pop="cp-text-more" aria-label="text — rit., a tempo, dolce… or your own: pick it, then tap the beat it goes over" aria-expanded="false" aria-pressed="false"><i id="cp-text-lbl">text</i>${CHEV}</button>
        <span class="cp-more cp-menu cp-text-menu" id="cp-text-more" hidden>
          <span class="cp-text-chips">${TEXTS.map((t) => `<button type="button" class="cp-btn cp-chip" data-act="text" data-text="${t}"><i>${t}</i></button>`).join("")}</span>
          <span class="cp-text-row"><input class="cp-text-in" id="cp-text-in" type="text" maxlength="40" placeholder="your own…" aria-label="expression text"><button type="button" class="cp-btn cp-text-set" data-act="text-set">set</button></span>
        </span>
      </span>
    </div>
    <div class="cp-rail cp-form" id="cp-form" role="toolbar" aria-label="barlines, repeats, endings, jumps, rehearsal marks and tempo" data-rail="form" hidden>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick" data-pop="cp-bar-more" aria-label="barline — pick one, then tap the bar" aria-expanded="false" aria-pressed="false"><span class="cp-pick-label">Barline</span>${pickIc(`<span class="cp-glyph cp-glyph-xs">${G.barDouble}</span>`)}<span class="cp-pick-val cp-bar-val" id="cp-bar-val"></span>${CHEV}</button>
        <span class="cp-more cp-grid cp-bar-grid" id="cp-bar-more" hidden>${BARLINES.map(([k, g, label, tag]) => `<button type="button" class="cp-btn cp-sq cp-bar" data-act="barline" data-kind="${k}" aria-pressed="false" aria-label="${label}"><span class="cp-glyph cp-glyph-bar">${G[g]}</span>${tag ? `<small class="cp-bar-tag">${tag}</small>` : ""}</button>`).join("")}</span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick" data-pop="cp-ending-more" aria-label="ending — pick the number, then tap its first bar and its last" aria-expanded="false" aria-pressed="false"><span class="cp-pick-label">Ending</span>${pickIc("<b>1.</b>")}<b class="cp-pick-val" id="cp-ending-val"></b>${CHEV}</button>
        <span class="cp-more cp-grid" id="cp-ending-more" hidden>${ENDINGS.map((n) => `<button type="button" class="cp-btn cp-sq cp-ending" data-act="ending" data-n="${n}" aria-pressed="false" aria-label="ending ${n}"><b>${n}.</b></button>`).join("")}</span>
      </span>
      <span class="cp-group" role="group" aria-label="signs">
      <button type="button" class="cp-btn cp-sq cp-sign-btn" data-act="sign" data-kind="segno" aria-pressed="false" aria-label="segno — tap the bar it marks"><span class="cp-glyph cp-glyph-sm">${G.segno}</span></button>
      <button type="button" class="cp-btn cp-sq cp-sign-btn" data-act="sign" data-kind="coda" aria-pressed="false" aria-label="coda sign — tap the bar it marks"><span class="cp-glyph cp-glyph-sm">${G.coda}</span></button>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick" data-pop="cp-jump-more" aria-label="jump — D.C., D.S., To Coda, Fine: pick one, then tap the bar it ends" aria-expanded="false" aria-pressed="false"><span class="cp-pick-label">Jump</span>${pickIc("<i>D.S.</i>")}<i class="cp-pick-val" id="cp-jump-val"></i>${CHEV}</button>
        <span class="cp-more cp-menu" id="cp-jump-more" hidden>${JUMP_ROWS.map(([k, label]) => `<button type="button" class="cp-btn cp-menu-row cp-jump-row" data-act="jump" data-kind="${k}" aria-pressed="false"><i>${label}</i></button>`).join("")}</span>
      </span>
      <span class="cp-group" role="group" aria-label="rehearsal mark, tempo mark">
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-sq cp-rehearsal-btn" data-act="rehearsal" aria-pressed="false" aria-label="rehearsal mark — tap the bar; hold for numbers or a word"><b class="cp-rehearsal-pic">A</b></button>
        <span class="cp-more cp-menu" id="cp-rehearsal-more" hidden>${[["letter", "letters — A, B, C…"], ["number", "numbers — 1, 2, 3…"], ["word", "a word… (Trio, Coda)"]].map(([st, label]) => `<button type="button" class="cp-btn cp-menu-row cp-rehearsal-row" data-act="rehearsal" data-style="${st}"><span>${label}</span></button>`).join("")}</span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-tempo-mark-btn" data-act="tempo-mark" aria-pressed="false" aria-label="tempo mark — say the tempo, then tap the bar it starts at; hold for the beat unit"><span class="cp-glyph cp-glyph-xs" id="cp-tempo-unit-glyph">${G.metQuarter}</span><span id="cp-tempo-mark-lbl">= tempo</span></button>
        <span class="cp-more cp-menu" id="cp-tempo-unit-more" hidden>${TEMPO_UNIT_ROWS.map(([base, dots, label]) => `<button type="button" class="cp-btn cp-menu-row cp-tempo-unit-row" data-act="tempo-unit" data-base="${base}" data-dots="${dots}" aria-pressed="false"><span class="cp-glyph cp-glyph-xs">${metGlyph(base)}${dots ? G.dot : ""}</span><span>${label} =</span></button>`).join("")}</span>
      </span>
      </span>
      <span class="cp-group" role="group" aria-label="bars">
      <button type="button" class="cp-btn cp-sq cp-bar-insert" data-act="bar-insert" aria-pressed="false" aria-label="insert a bar — tap the bar the new one goes before">${icon("barPlus")}</button>
      <button type="button" class="cp-btn cp-sq cp-bar-delete" data-act="bar-delete" aria-pressed="false" aria-label="delete a bar — tap it">${icon("barMinus")}</button>
      </span>
      <span class="cp-group" role="group" aria-label="bar repeat">
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-sq cp-simile-btn" data-act="simile" data-n="1" aria-pressed="false" aria-label="bar repeat — tap an empty bar: it plays the bar before it; hold for two bars"><span class="cp-glyph cp-glyph-sm">${G.repeat1Bar}</span></button>
        <span class="cp-more cp-menu" id="cp-simile-more" hidden>${[[1, G.repeat1Bar, "one bar — repeats the bar before"], [2, G.repeat2Bars, "two bars — repeat the two before"]].map(([n, g, label]) => `<button type="button" class="cp-btn cp-menu-row cp-simile-row" data-act="simile" data-n="${n}" aria-pressed="false"><span class="cp-glyph cp-glyph-xs">${g}</span><span>${label}</span></button>`).join("")}</span>
      </span>
      </span>
    </div>
    <div class="cp-rail cp-piano" id="cp-piano" role="toolbar" aria-label="pedal, octave lines and fingering" data-rail="piano" hidden>
      <span class="cp-group" role="group" aria-label="pedals">
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-sq cp-pedal-btn" data-act="pedal" aria-pressed="false" aria-label="pedal — tap where it goes down, then where it lifts; hold for the style"><span class="cp-glyph cp-glyph-pedal" id="cp-pedal-glyph">${G.pedal}</span></button>
        <span class="cp-more cp-menu" id="cp-pedal-more" hidden>${PEDAL_STYLE_ROWS.map(([st, label]) => `<button type="button" class="cp-btn cp-menu-row cp-pedal-row" data-act="pedal" data-style="${st}" aria-pressed="false"><span class="cp-glyph cp-glyph-xs">${st === "sost" ? G.pedalSost : G.pedal}${st === "sign" ? ` ${G.pedalUp}` : ""}</span><span>${label}</span></button>`).join("")}</span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-textline-btn" data-act="textline" data-text="una corda" data-end="tre corde" aria-pressed="false" aria-label="una corda — tap where the soft pedal goes down, then where tre corde lifts it"><i>u.c.</i></button>
      </span>
      </span>
      <span class="cp-group" role="group" aria-label="octave lines">
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-sq cp-ottava-btn" data-act="ottava" data-dir="1" data-size="8" aria-pressed="false" aria-label="8va — tap the first note it covers, then the last; hold for 15ma"><span class="cp-glyph cp-glyph-ottava">${G.ottavaAlta}</span></button>
        <span class="cp-more" id="cp-8va-more" hidden><button type="button" class="cp-btn cp-sq cp-ottava-btn" data-act="ottava" data-dir="1" data-size="15" aria-pressed="false" aria-label="15ma — two octaves up"><span class="cp-glyph cp-glyph-ottava">${G.quindicesimaAlta}</span></button></span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-sq cp-ottava-btn" data-act="ottava" data-dir="-1" data-size="8" aria-pressed="false" aria-label="8vb — tap the first note it covers, then the last; hold for 15mb"><span class="cp-glyph cp-glyph-ottava">${G.ottavaBassa}</span></button>
        <span class="cp-more" id="cp-8vb-more" hidden><button type="button" class="cp-btn cp-sq cp-ottava-btn cp-ottava-wide" data-act="ottava" data-dir="-1" data-size="15" aria-pressed="false" aria-label="15mb — two octaves down"><span class="cp-glyph cp-glyph-ottava">${G.quindicesimaBassa}</span></button></span>
      </span>
      </span>
      <span class="cp-group" role="group" aria-label="fingering">
      ${FINGERS.map((n) => `<button type="button" class="cp-btn cp-sq cp-finger-btn" data-act="finger" data-n="${n}" aria-pressed="false" aria-label="finger ${n} — on the selected notes, or tap the notes"><b>${n}</b></button>`).join("")}
      </span>
      <span class="cp-group" role="group" aria-label="hands">
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-hand-btn" data-act="text" data-text="r.h." id="cp-rh" aria-pressed="false" aria-label="right hand — tap the beat it goes over; hold for the language"><i id="cp-rh-lbl">r.h.</i></button>
        <span class="cp-more cp-menu" id="cp-hands-more" hidden>${Object.entries(HANDS).map(([lang, [r, l]]) => `<button type="button" class="cp-btn cp-menu-row cp-hands-row" data-act="hands" data-lang="${lang}" aria-pressed="false"><i>${r} / ${l}</i><span>${lang === "en" ? "English" : lang === "fr" ? "French" : "Italian"}</span></button>`).join("")}</span>
      </span>
      <button type="button" class="cp-btn cp-hand-btn" data-act="text" data-text="l.h." id="cp-lh" aria-pressed="false" aria-label="left hand — tap the beat it goes over"><i id="cp-lh-lbl">l.h.</i></button>
      </span>
    </div>
    <div class="cp-rail cp-notes2" id="cp-notes2" role="toolbar" aria-label="grace notes, tremolo and more marks" data-rail="notes2" hidden>
      <span class="cp-group" role="group" aria-label="grace notes">
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-sq cp-grace-btn" data-act="grace" aria-pressed="false" aria-label="grace notes — on, a tap before a note adds one of the armed value; hold for slashed or plain"><span class="cp-glyph cp-glyph-grace">${G.graceSlash}</span></button>
        <span class="cp-more cp-menu" id="cp-grace-more" hidden>${[["1", "slashed — acciaccatura, before the beat"], ["0", "plain — appoggiatura, on the beat"]].map(([s, label]) => `<button type="button" class="cp-btn cp-menu-row cp-grace-row" data-act="grace" data-slash="${s}" aria-pressed="false"><span>${label}</span></button>`).join("")}<button type="button" class="cp-btn cp-menu-row cp-grace-chord-row" data-act="grace-chord" aria-pressed="false"><span>chord — stack on the last grace</span></button></span>
      </span>
      </span>
      <span class="cp-group" role="group" aria-label="tremolo">
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-trem-btn" data-pop="cp-trem-more" aria-label="tremolo — pick the strokes for the selected notes" aria-expanded="false" disabled><span class="cp-glyph cp-glyph-trem">${G.trem2}</span>${CHEV}</button>
        <span class="cp-more cp-menu" id="cp-trem-more" hidden>${TREMS.map((n) => `<button type="button" class="cp-btn cp-menu-row cp-trem-row" data-act="trem" data-n="${n}"><span class="cp-glyph cp-glyph-trem">${G[`trem${n}`]}</span><span>${n} ${n === 1 ? "stroke" : "strokes"}</span></button>`).join("")}</span>
      </span>
      </span>
      <span class="cp-group" role="group" aria-label="more marks">
      ${["marcato", "staccatissimo", "portato"].map((m) => `<button type="button" class="cp-btn cp-sq cp-art-btn" data-act="art" data-mark="${m}" aria-label="${m}"><span class="cp-glyph">${artGlyph(m, true)}</span></button>`).join("")}
      ${["breath", "caesura"].map((m) => `<button type="button" class="cp-btn cp-sq cp-art-btn cp-after-btn" data-act="art" data-mark="${m}" aria-label="${m === "breath" ? "breath mark" : "caesura"} — after the selected notes"><span class="cp-glyph cp-glyph-sm">${artGlyph(m, true)}</span></button>`).join("")}
      </span>
      <span class="cp-group" role="group" aria-label="ornaments">
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-orn-btn" data-pop="cp-orn-more" aria-label="ornaments — a trill with a line or an accidental, an inverted or delayed turn, on the selected notes" aria-expanded="false" disabled><span class="cp-glyph cp-glyph-xs">${G.trill}</span>${CHEV}</button>
        <span class="cp-more cp-menu" id="cp-orn-more" hidden>${ORN_ROWS.map(([act, v, label], i) => `<button type="button" class="cp-btn cp-menu-row cp-orn-row" data-act="${act}" data-i="${i}"><span class="cp-glyph cp-glyph-xs">${act === "art" ? artGlyph(v, true) : `${v.alter !== undefined ? G[v.alter] : ""}${G.trill}${v.line ? G.wiggleTrill.repeat(2) : ""}`}</span><span>${label}</span></button>`).join("")}</span>
      </span>
      </span>
      <span class="cp-group" role="group" aria-label="stems and beams">
      <button type="button" class="cp-btn cp-sq cp-stem-btn" data-act="stem" aria-label="flip the stems of the selected notes (every one already set → automatic again)" disabled><span class="cp-glyph cp-glyph-xs cp-glyph-note">${metGlyph(4)}</span><small>flip</small></button>
      <button type="button" class="cp-btn cp-sq cp-beam-btn" data-act="beam" aria-label="break the beam before the selected notes (again → join)" disabled><span class="cp-glyph cp-glyph-xs cp-glyph-note">${metGlyph(8)}${metGlyph(8)}</span><small>break</small></button>
      </span>
    </div>`;
  // v100 (WSHED-128): every rail is one line that scrolls sideways — each sits in a lane that carries the
  // overflow fades; the palette rails get a caption that stays put while the rail slides under it
  for (const r of host.querySelectorAll(".cp-rail")) {
    const lane = document.createElement("div"); lane.className = "cp-lane";
    if (r.hidden) { r.hidden = false; lane.hidden = true; }
    if (r.dataset.rail) lane.dataset.lane = r.dataset.rail;
    const cap = CAPTIONS[r.dataset.rail];
    if (cap) { lane.classList.add("cp-capped"); r.insertAdjacentHTML("afterbegin", `<span class="cp-cap" aria-hidden="true">${cap}</span>`); }
    r.replaceWith(lane); lane.append(r);
  }
  const moreBtn = host.querySelector(".cp-dur-more"), accMoreBtn = host.querySelector(".cp-acc-more");
  const tupMore = host.querySelector("#cp-tup-more"), tupBtn = host.querySelector(".cp-tuplet");
  const graceMore = host.querySelector("#cp-grace-more"), graceBtn = host.querySelector(".cp-grace-btn");
  // the hold menus of v98 (docs/COMPOSE_RAILS2_DESIGN.md §4): a square and the menu behind it
  const HOLDS = [[".cp-hold-pp", "#cp-pp-more"], [".cp-hold-ff", "#cp-ff-more"], [".cp-hairpin-btn[data-kind=cresc]", "#cp-cresc-more"], [".cp-hairpin-btn[data-kind=dim]", "#cp-dim-more"], [".cp-rehearsal-btn", "#cp-rehearsal-more"], [".cp-tempo-mark-btn", "#cp-tempo-unit-more"], [".cp-simile-btn", "#cp-simile-more"], [".cp-pedal-btn", "#cp-pedal-more"], [".cp-ottava-btn[data-dir='1'][data-size='8']", "#cp-8va-more"], [".cp-ottava-btn[data-dir='-1'][data-size='8']", "#cp-8vb-more"], ["#cp-rh", "#cp-hands-more"]].map(([b, m]) => [host.querySelector(m), host.querySelector(b)]);
  const pops = [...host.querySelectorAll("[data-pop]")].map((b) => [host.querySelector(`#${b.dataset.pop}`), b]).concat([[tupMore, tupBtn], [graceMore, graceBtn]], HOLDS);
  // Bravura glyphs sit on a musical anchor, not a typographic centre: measure each one's ink and
  // slide it so the ink is centred in its button (re-done whenever a glyph's text changes).
  const centreAll = () => { for (const g of host.querySelectorAll(".cp-glyph")) centreGlyph(g); };
  (document.fonts?.load?.('2rem "Bravura"') ?? Promise.resolve()).then(() => { centreAll(); flagAll(); }, centreAll);
  const closeMore = () => { for (const [m, b] of pops) { m.hidden = true; b.setAttribute("aria-expanded", "false"); } };
  // a menu is fixed on the screen (its rail scrolls sideways and would clip it): under its button, left- or right-aligned
  // by which half of the screen the button is in, kept on screen, and it grows out from the button's middle
  const place = (m, b) => {
    const r = b.getBoundingClientRect();
    m.style.left = "0px"; m.style.top = "0px";
    const mw = m.offsetWidth, mh = m.offsetHeight, pad = 8;
    let left = r.left + r.width / 2 > innerWidth / 2 ? r.right - mw : r.left;
    left = Math.max(pad, Math.min(left, innerWidth - mw - pad));
    let top = r.bottom + 6;
    if (top + mh > innerHeight - pad) top = Math.max(pad, innerHeight - mh - pad);
    m.style.left = `${left}px`; m.style.top = `${top}px`;
    m.style.setProperty("--ox", `${Math.max(0, Math.min(mw, r.left + r.width / 2 - left)).toFixed(1)}px`);
  };
  const toggle = (m, b) => { const open = m.hidden; closeMore(); if (open) { m.hidden = false; b.setAttribute("aria-expanded", "true"); place(m, b); } };
  for (const b of host.querySelectorAll("[data-pop]")) if (b.closest(".cp-rail")) b.classList.add("cp-pick-pop");
  // a rail never wraps (v100, Leif's rule): it scrolls sideways; the lane shows a fade on the side there is more
  const lanes = [...host.querySelectorAll(".cp-rail")];
  const flag = (r) => { const lane = r.parentElement, l = r.scrollLeft > 1, rt = r.scrollLeft + r.clientWidth < r.scrollWidth - 1, v = l && rt ? "left right" : l ? "left" : rt ? "right" : "";
    if ((lane.dataset.over ?? "") !== v) { if (v) lane.dataset.over = v; else delete lane.dataset.over; } };
  const flagAll = () => { for (const r of lanes) flag(r); };
  for (const r of lanes) r.addEventListener("scroll", () => { flag(r); closeMore(); }, { passive: true });
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(flagAll) : null; ro?.observe(host);
  // the button the editor just lit slides into view (a voice change re-arms the palette, a hold menu arms its square)
  const lit = new Map(), motionOk = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reveal = () => {
    for (const r of lanes) {
      if (!r.dataset.rail || r.parentElement.hidden) continue;
      const b = [...r.querySelectorAll(".cp-btn[aria-pressed='true'], .cp-btn.on")].find((x) => !x.closest(".cp-more"));
      if (b === lit.get(r)) continue;
      lit.set(r, b);
      if (!b || r.scrollWidth <= r.clientWidth + 1) continue;
      const rr = r.getBoundingClientRect(), br = b.getBoundingClientRect(), cap = r.querySelector(".cp-cap"), capW = cap && cap.offsetWidth ? cap.getBoundingClientRect().width : 0;
      if (br.left < rr.left + capW || br.right > rr.right) r.scrollTo({ left: r.scrollLeft + br.left - rr.left - capW - 12, behavior: motionOk ? "smooth" : "auto" });
    }
  };
  let swallow = false; // a click that follows a hold
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act], [data-pop]");
    if (!b || b.disabled) return;
    if (swallow) { swallow = false; return; }
    if (b.dataset.pop) { toggle(host.querySelector(`#${b.dataset.pop}`), b); return; }
    if (onCapture?.(b)) { closeMore(); return; } // Favorites (v109, §8.5o): a listening slot takes the button instead of firing it
    const act = b.dataset.act;
    if (act === "rail") { onAction("rail", b.dataset.rail); return; } // the menu stays open: several rails can be toggled in one go
    if (act === "input") { onAction("input", b.dataset.input); return; } // Pen | Touch (v101)
    if (act === "gesture") { onAction("gesture"); return; } // Gesture mode (v102)
    if (act === "favorites") { onAction("favorites"); return; } // Favorites (v109)
    closeMore();
    if (act === "dur") { onAction("dur", Number(b.dataset.base)); return; }
    if (act === "key") { onAction("key", Number(b.dataset.fifths)); return; }
    if (act === "time") { onAction("time", b.dataset.custom ? "custom" : { beats: Number(b.dataset.beats), unit: Number(b.dataset.unit) }); return; }
    if (act === "clef") { onAction("clef", b.dataset.clef); return; }
    if (act === "art") { onAction("art", b.dataset.mark); return; }
    if (act === "arp") { onAction("arp", b.dataset.kind); return; }
    if (act === "dyn") { onAction("dyn", b.dataset.dyn); return; }
    if (act === "text") { onAction("text", b.dataset.text ?? ""); return; }
    if (act === "text-set") { const inp = host.querySelector("#cp-text-in"); onAction("text", inp.value); inp.value = ""; inp.blur(); return; }
    if (act === "acc") { onAction("acc", Number(b.dataset.alter)); return; }
    if (act === "voice") { onAction("voice", Number(b.dataset.v)); return; }
    if (act === "cross") { onAction("cross", Number(b.dataset.dir)); return; }
    if (act === "tuplet") { onAction("tuplet", b.dataset.n ? Number(b.dataset.n) : undefined); return; }
    if (act === "barline" || act === "sign" || act === "jump") { onAction(act, b.dataset.kind); return; }
    if (act === "bar-insert" || act === "bar-delete") { onAction(act); return; } // bars (v104, WSHED-132)
    if (act === "ending") { onAction("ending", Number(b.dataset.n)); return; }
    if (act === "ottava") { onAction("ottava", { dir: Number(b.dataset.dir), size: Number(b.dataset.size ?? 8) }); return; }
    if (act === "finger") { onAction("finger", Number(b.dataset.n)); return; }
    if (act === "grace") { onAction("grace", b.dataset.slash === undefined ? undefined : b.dataset.slash === "1"); return; }
    if (act === "trem") { onAction("trem", Number(b.dataset.n)); return; }
    if (act === "hairpin") { onAction("hairpin", b.dataset.niente ? { kind: b.dataset.kind, niente: true } : b.dataset.kind); return; }
    if (act === "textline") { onAction("textline", { text: b.dataset.text, endText: b.dataset.end ?? "" }); return; }
    if (act === "rehearsal") { onAction("rehearsal", b.dataset.style); return; }
    if (act === "tempo-unit") { onAction("tempo-unit", { base: Number(b.dataset.base), dots: Number(b.dataset.dots) }); return; }
    if (act === "simile") { onAction("simile", Number(b.dataset.n)); return; }
    if (act === "pedal") { onAction("pedal", b.dataset.style); return; }
    if (act === "hands") { onAction("hands", b.dataset.lang); return; }
    if (act === "trill") { onAction("trill", ORN_ROWS[Number(b.dataset.i)][1]); return; }
    if (act === "art" && b.dataset.i !== undefined) { onAction("art", ORN_ROWS[Number(b.dataset.i)][1]); return; }
    onAction(act);
  });
  // hold the tuplet button for the other sizes; hold a voice button for the voice menu
  const hold = (btn, open) => { let timer = 0;
    btn.addEventListener("pointerdown", (e) => { if (e.button && e.button !== 0) return; clearTimeout(timer); timer = setTimeout(() => { swallow = true; open(); }, 450); });
    for (const t of ["pointerup", "pointercancel", "pointerleave"]) btn.addEventListener(t, () => clearTimeout(timer));
  };
  hold(tupBtn, () => toggle(tupMore, tupBtn));
  hold(graceBtn, () => toggle(graceMore, graceBtn)); // hold Grace for slashed / plain / chord
  for (const [m, b] of HOLDS) if (m && b) hold(b, () => toggle(m, b));
  for (const b of [tupBtn, graceBtn, ...HOLDS.map(([, b]) => b)]) b?.classList.add("cp-hold"); // the dot that says "hold me" (v100)
  // typing in the text box: Enter sets; the editor's shortcuts stay out of inputs
  { const inp = host.querySelector("#cp-text-in");
    inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); closeMore(); onAction("text", inp.value); inp.value = ""; inp.blur(); } else if (e.key === "Escape") { closeMore(); inp.blur(); } }); // the words are armed: focus leaves the box so the pen (and Escape) go to the staff
    inp.addEventListener("pointerdown", (e) => e.stopPropagation()); }
  const onDocDown = (e) => { if (![...host.querySelectorAll(".cp-more-wrap")].some((w) => w.contains(e.target))) closeMore(); };
  document.addEventListener("pointerdown", onDocDown);
  const onResize = () => { closeMore(); flagAll(); };
  addEventListener("resize", onResize);
  // the tempo buttons repeat while held (a click after a hold is swallowed)
  for (const b of host.querySelectorAll(".cp-tempo-btn")) {
    let timer = 0, held = false;
    const stop = () => { clearTimeout(timer); timer = 0; };
    b.addEventListener("pointerdown", (e) => { if (e.button && e.button !== 0) return; held = false; stop(); timer = setTimeout(function rep() { held = true; onAction(b.dataset.act); timer = setTimeout(rep, 70); }, 380); });
    for (const t of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(t, stop);
    b.addEventListener("click", (e) => { if (held) { held = false; e.stopPropagation(); } }, true);
  }
  // the position slider: seek on input; while a finger is on it, ticks leave it alone
  const pos = host.querySelector("#cp-pos"), posRead = host.querySelector("#cp-pos-read");
  let scrubbing = false;
  pos.addEventListener("pointerdown", () => { scrubbing = true; });
  for (const t of ["pointerup", "pointercancel"]) pos.addEventListener(t, () => { scrubbing = false; });
  pos.addEventListener("input", () => onAction("seek", Number(pos.value)));
  pos.addEventListener("change", () => { scrubbing = false; onAction("seek", Number(pos.value)); });

  return {
    destroy() { document.removeEventListener("pointerdown", onDocDown); removeEventListener("resize", onResize); ro?.disconnect(); },
    /** The playhead: { pos, total, bar, bars, playing?, bpm? } — called every frame while playing, so it touches only what changed. */
    transport({ pos: t, total, bar, bars, playing, bpm }) {
      if (total !== undefined && Number(pos.max) !== total) pos.max = String(total);
      if (!scrubbing && t !== undefined) { pos.value = String(Math.round(t)); pos.style.setProperty("--p", `${(100 * Math.round(t) / Math.max(1, Number(pos.max))).toFixed(2)}%`); }
      if (bar !== undefined) { const read = `bar ${bar + 1} of ${bars}`; if (posRead.textContent !== read) posRead.textContent = read; }
      if (playing !== undefined) { const b = host.querySelector("[data-act=play]"); b.setAttribute("aria-pressed", String(playing)); b.setAttribute("aria-label", playing ? "pause" : "play"); }
      if (bpm !== undefined) host.querySelector("#cp-bpm").textContent = String(bpm);
    },
    /** Reflect the editor's state: { armed, mode, canUndo, canRedo, hasSelection, title }. */
    update({ armed, mode, canUndo, canRedo, hasSelection, hasClip = false, pasting = false, tupletN = 3, rails = DEFAULT_RAILS, pending = null, title, voice = 0, used = new Set([0]), sel = {}, tempoUnit = { base: 4, dots: 0 }, hands = "en", pedalStyle = "line", input = "touch", gesture = false, favorites = false }) {
      let shown = false;
      for (const b of host.querySelectorAll(".cp-inp")) b.setAttribute("aria-pressed", String(b.dataset.input === input)); // Pen | Touch (v101, docs/COMPOSE_DESIGN.md §8.5i)
      host.querySelector(".cp-gest").setAttribute("aria-pressed", String(!!gesture)); // Gesture mode (v102, §8.5j)
      host.querySelector(".cp-favbtn").setAttribute("aria-pressed", String(!!favorites)); // Favorites (v109, §8.5o): shown or hidden
      // the voice picker (v90: one ▾ button, not four squares — the rail wrapped on many devices): the active voice's number in its colour;
      // the menu's rows: the active one lit, voices the piece uses in full ink, the rest dim; the rows follow the selection
      { const pick = host.querySelector(".cp-voice-pick"); pick.dataset.v = String(voice); pick.querySelector(".cp-voice-n").textContent = String(voice + 1); }
      for (const r of host.querySelectorAll(".cp-voice-row")) {
        const act = r.dataset.act, hint = r.querySelector("small");
        if (act === "voice") { const v = Number(r.dataset.v); r.disabled = false; r.setAttribute("aria-pressed", String(v === voice)); r.classList.toggle("cp-unused", v !== voice && !used.has(v)); hint.textContent = sel.notes ? (v === voice ? "here" : "move") : v === voice ? "writing" : used.has(v) ? "write" : "write (new)"; }
        else if (act === "voice-swap") { r.disabled = !sel.any; hint.textContent = ""; }
        else if (act === "cross") { r.disabled = !(Number(r.dataset.dir) < 0 ? sel.up : sel.down); hint.textContent = Number(r.dataset.dir) < 0 ? "⌘⇧↑" : "⌘⇧↓"; }
        else if (act === "hide-rest") { r.disabled = !sel.rests; r.querySelector("span").textContent = sel.hidden ? "show rest" : "hide rest"; hint.textContent = ""; }
      }
      for (const [k] of RAILS) {
        const lane = host.querySelector(`.cp-rail[data-rail="${k}"]`).parentElement, on = !!rails[k];
        if (lane.hidden === on) { lane.hidden = !on; if (on) shown = true; }
        host.querySelector(`.cp-rail-row[data-rail="${k}"]`).setAttribute("aria-checked", String(on));
      }
      if (shown) centreAll(); // a lane that was display:none had no metrics to measure
      for (const b of host.querySelectorAll(".cp-art-btn, .cp-gliss-btn, .cp-arp-btn, .cp-slur-btn, .cp-trem-btn, .cp-orn-btn, .cp-stem-btn, .cp-beam-btn")) b.disabled = !hasSelection;
      // the extended Notes rail (WSHED-126): Grace is lit while on; the hold menu shows which kind
      graceBtn.setAttribute("aria-pressed", String(pending?.kind === "grace"));
      for (const r of host.querySelectorAll(".cp-grace-row")) r.setAttribute("aria-pressed", String(pending?.kind === "grace" && (r.dataset.slash === "1") === !!pending.value?.slash));
      host.querySelector(".cp-grace-chord-row").setAttribute("aria-pressed", String(pending?.kind === "grace" && !!pending.value?.chord));
      // the rails filled out (WSHED-127): the sudden picker shows the armed one; the text line, bar repeat, hands, pedal style, tempo unit
      { const sd = pending?.kind === "dyn" && SUDDENS.includes(pending.value) ? pending.value : null, sg = host.querySelector("#cp-sf-glyph"), want = dynGlyph(sd ?? "sf");
        if (sg.textContent !== want) { sg.textContent = want; centreGlyph(sg); }
        host.querySelector(".cp-sf-btn").setAttribute("aria-pressed", String(!!sd));
        host.querySelector(".cp-textline-btn").setAttribute("aria-pressed", String(pending?.kind === "textline" && /^una corda/i.test(pending.value?.text ?? "")));
        for (const r of host.querySelectorAll(".cp-textline-row")) r.setAttribute("aria-pressed", String(pending?.kind === "textline" && pending.value?.text === r.dataset.text));
        for (const r of host.querySelectorAll(".cp-hairpin-row")) r.setAttribute("aria-pressed", String(pending?.kind === "hairpin" && pending.value === r.dataset.kind && !!pending.niente === !!r.dataset.niente));
        const sm = pending?.kind === "simile" ? pending.value : null;
        host.querySelector(".cp-simile-btn").setAttribute("aria-pressed", String(!!sm));
        for (const r of host.querySelectorAll(".cp-simile-row")) r.setAttribute("aria-pressed", String(Number(r.dataset.n) === sm));
        for (const r of host.querySelectorAll(".cp-rehearsal-row")) r.setAttribute("aria-pressed", String(pending?.kind === "rehearsal" && (r.dataset.style === "word" ? !!pending.value?.text : r.dataset.style === "number" ? pending.value?.style === "number" : !pending.value?.text && !pending.value?.style)));
        const ug = host.querySelector("#cp-tempo-unit-glyph"), ut = `${metGlyph(tempoUnit.base)}${tempoUnit.dots ? G.dot : ""}`;
        if (ug.textContent !== ut) { ug.textContent = ut; centreGlyph(ug); }
        for (const r of host.querySelectorAll(".cp-tempo-unit-row")) r.setAttribute("aria-pressed", String(Number(r.dataset.base) === tempoUnit.base && Number(r.dataset.dots) === (tempoUnit.dots ?? 0)));
        const pg = host.querySelector("#cp-pedal-glyph"), pt = pedalStyle === "sost" ? G.pedalSost : G.pedal;
        if (pg.textContent !== pt) { pg.textContent = pt; centreGlyph(pg); }
        for (const r of host.querySelectorAll(".cp-pedal-row")) r.setAttribute("aria-pressed", String(r.dataset.style === pedalStyle));
        const [rh, lh] = HANDS[hands] ?? HANDS.en, rb = host.querySelector("#cp-rh"), lb2 = host.querySelector("#cp-lh");
        rb.dataset.text = rh; lb2.dataset.text = lh; host.querySelector("#cp-rh-lbl").textContent = rh; host.querySelector("#cp-lh-lbl").textContent = lh;
        rb.setAttribute("aria-pressed", String(pending?.kind === "text" && pending.value === rh)); lb2.setAttribute("aria-pressed", String(pending?.kind === "text" && pending.value === lh));
        for (const r of host.querySelectorAll(".cp-hands-row")) r.setAttribute("aria-pressed", String(r.dataset.lang === hands)); }
      // the expression buttons always work: they arm a cursor (WSHED-122), or retype a selection of their own kind; the armed one is lit
      for (const b of host.querySelectorAll(".cp-dyn-btn")) b.setAttribute("aria-pressed", String(pending?.kind === "dyn" && pending.value === b.dataset.dyn));
      for (const b of host.querySelectorAll(".cp-hairpin-btn")) b.setAttribute("aria-pressed", String(pending?.kind === "hairpin" && pending.value === b.dataset.kind));
      host.querySelector(".cp-text-btn").setAttribute("aria-pressed", String(pending?.kind === "text"));
      { const lbl = host.querySelector("#cp-text-lbl"), want = pending?.kind === "text" ? pending.value : "text"; if (lbl.textContent !== want) lbl.textContent = want; }
      // the form rail (WSHED-124): the armed thing lights its picker or button
      { const bl = pending?.kind === "barline" ? pending.value : null, pic = BARLINES.find(([k]) => k === bl);
        const bv = host.querySelector("#cp-bar-val"), bvHtml = pic ? `<span class="cp-glyph cp-glyph-xs">${G[pic[1]]}</span>` : "";
        if (bv.innerHTML !== bvHtml) { bv.innerHTML = bvHtml; for (const g of bv.querySelectorAll(".cp-glyph")) centreGlyph(g); }
        host.querySelector("[data-pop=cp-bar-more]").setAttribute("aria-pressed", String(!!bl));
        for (const b of host.querySelectorAll(".cp-bar")) b.setAttribute("aria-pressed", String(b.dataset.kind === bl));
        const en = pending?.kind === "ending" ? pending.value : null;
        host.querySelector("#cp-ending-val").textContent = en ? `${en}.${pending.start !== undefined ? " …" : ""}` : "";
        host.querySelector("[data-pop=cp-ending-more]").setAttribute("aria-pressed", String(!!en));
        for (const b of host.querySelectorAll(".cp-ending")) b.setAttribute("aria-pressed", String(Number(b.dataset.n) === en));
        for (const b of host.querySelectorAll(".cp-sign-btn")) b.setAttribute("aria-pressed", String(pending?.kind === "sign" && pending.value === b.dataset.kind));
        const jp = pending?.kind === "jump" ? pending.value : null;
        host.querySelector("#cp-jump-val").textContent = jp ? JUMP_LABEL[jp] : "";
        host.querySelector("[data-pop=cp-jump-more]").setAttribute("aria-pressed", String(!!jp));
        for (const b of host.querySelectorAll(".cp-jump-row")) b.setAttribute("aria-pressed", String(b.dataset.kind === jp));
        host.querySelector(".cp-rehearsal-btn").setAttribute("aria-pressed", String(pending?.kind === "rehearsal"));
        host.querySelector(".cp-bar-insert").setAttribute("aria-pressed", String(pending?.kind === "bar-insert"));
        host.querySelector(".cp-bar-delete").setAttribute("aria-pressed", String(pending?.kind === "bar-delete"));
        const tm = pending?.kind === "tempo-mark" ? pending.value : null;
        host.querySelector(".cp-tempo-mark-btn").setAttribute("aria-pressed", String(!!tm));
        const tl = host.querySelector("#cp-tempo-mark-lbl"), want = tm ? `= ${tm.bpm}${tm.text ? ` ${tm.text}` : ""}` : "= tempo"; if (tl.textContent !== want) tl.textContent = want; }
      // the Piano rail (WSHED-125): the armed line or finger is lit
      host.querySelector(".cp-pedal-btn").setAttribute("aria-pressed", String(pending?.kind === "pedal"));
      for (const b of host.querySelectorAll(".cp-ottava-btn")) b.setAttribute("aria-pressed", String(pending?.kind === "ottava" && pending.value === Number(b.dataset.dir) && (pending.size ?? 8) === Number(b.dataset.size ?? 8)));
      for (const b of host.querySelectorAll(".cp-finger-btn")) b.setAttribute("aria-pressed", String(pending?.kind === "finger" && pending.value === Number(b.dataset.n)));
      // the armed change (key / time / clef waiting for a tap) shows on its picker and its button
      const key = pending?.kind === "key" ? KEYS.find((k) => k.fifths === pending.value) : null;
      host.querySelector("#cp-key-val").textContent = key ? `${key.major} / ${key.minor}m` : "";
      host.querySelector("[data-pop=cp-key-more]").setAttribute("aria-pressed", String(!!key));
      for (const b of host.querySelectorAll(".cp-key")) b.setAttribute("aria-pressed", String(!!key && Number(b.dataset.fifths) === pending.value));
      const time = pending?.kind === "time" ? pending.value : null;
      host.querySelector("#cp-time-val").textContent = time ? `${time.beats}/${time.unit}` : "";
      host.querySelector("[data-pop=cp-time-more]").setAttribute("aria-pressed", String(!!time));
      for (const b of host.querySelectorAll(".cp-time")) b.setAttribute("aria-pressed", String(!!time && Number(b.dataset.beats) === time.beats && Number(b.dataset.unit) === time.unit));
      const clef = pending?.kind === "clef" ? pending.value : null;
      for (const b of host.querySelectorAll(".cp-clef")) b.setAttribute("aria-pressed", String(b.dataset.clef === clef));
      host.querySelector("[data-pop=cp-clef-more]").setAttribute("aria-pressed", String(!!clef));
      const cv = host.querySelector("#cp-clef-val"), cvHtml = clef ? `<span class="cp-glyph cp-glyph-xs">${G[CLEFS[clef].glyph]}</span><b>${clef}</b>` : "";
      if (cv.innerHTML !== cvHtml) { cv.innerHTML = cvHtml; for (const g of cv.querySelectorAll(".cp-glyph")) centreGlyph(g); }
      for (const b of host.querySelectorAll(".cp-dur")) b.setAttribute("aria-pressed", String(mode === "place" && Number(b.dataset.base) === armed.base));
      const dg = host.querySelector("#cp-dot-glyph"), dt = G.dot.repeat(Math.max(1, armed.dots || 1));
      if (dg.textContent !== dt) { dg.textContent = dt; centreGlyph(dg); }
      host.querySelector("[data-act=dot]").setAttribute("aria-pressed", String(mode === "place" && armed.dots > 0));
      tupBtn.setAttribute("aria-pressed", String(mode === "place" && !!armed.tuplet));
      host.querySelector("#cp-tuplet-n").textContent = String(armed.tuplet ?? tupletN);
      for (const b of host.querySelectorAll(".cp-acc")) b.setAttribute("aria-pressed", String(mode === "place" && armed.alter !== null && armed.alter !== undefined && Number(b.dataset.alter) === armed.alter));
      const ag = host.querySelector("#cp-acc-more-glyph"), at = G[Math.abs(armed.alter ?? 0) === 2 ? armed.alter : 2];
      if (ag.textContent !== at) { ag.textContent = at; centreGlyph(ag); }
      accMoreBtn.classList.toggle("on", mode === "place" && Math.abs(armed.alter ?? 0) === 2);
      const moreOn = mode === "place" && MORE_BASES.includes(armed.base);
      moreBtn.classList.toggle("on", moreOn);
      const mg = host.querySelector("#cp-more-glyph"), mt = metGlyph(moreOn ? armed.base : 32);
      if (mg.textContent !== mt) { mg.textContent = mt; centreGlyph(mg); }
      host.querySelector("[data-act=select]").setAttribute("aria-pressed", String(mode === "select"));
      host.querySelector("[data-act=pan]").setAttribute("aria-pressed", String(mode === "pan"));
      host.querySelector("[data-act=undo]").disabled = !canUndo;
      host.querySelector("[data-act=redo]").disabled = !canRedo;
      host.querySelector("[data-act=delete]").disabled = !hasSelection;
      host.querySelector("[data-act=copy]").disabled = !hasSelection;
      host.querySelector("[data-act=cut]").disabled = !hasSelection;
      const pasteBtn = host.querySelector("[data-act=paste]");
      pasteBtn.disabled = !hasClip; pasteBtn.setAttribute("aria-pressed", String(pasting));
      if (title !== undefined) host.querySelector("#cp-title").textContent = title;
      if (shown) flagAll();
      reveal();
    },
  };
}
