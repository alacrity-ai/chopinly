// The control rail and the palette rail (docs/COMPOSE_DESIGN.md §8.1). Pure
// markup + click wiring; the editor owns the state and calls `update`.
import { icon } from "../../lib/icons.js";
import { metGlyph, restGlyph, artGlyph, dynGlyph, G } from "../../lib/staff/glyphs.js";
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
const clefBtn = (c) => `<button type="button" class="cp-btn cp-clef" data-act="clef" data-clef="${c}" aria-pressed="false" aria-label="${c} clef — then tap the beat it starts on"><span class="cp-glyph cp-glyph-sm">${G[CLEFS[c].glyph]}</span><small>${c}</small></button>`;

/** The rolled-chord menu: the sign, its glyph, what the row says. */
const ARP_ROWS = [["plain", G.arpeggio, "rolled"], ["up", G.arpeggioUp, "rolled upward"], ["down", G.arpeggioDown, "rolled downward"]];
/** What the mark buttons say; a mark not listed reads as its id. */
const MARK_NAMES = { lowerMordent: "lower mordent — the one with the line through it" };
/** The rails a reader can show or hide, in order — the header that holds the menu is not one of them. */
export const RAILS = [["control", "Controls"], ["transport", "Transport"], ["palette", "Notes"], ["utility", "Key · time · clef · marks"], ["expression", "Dynamics · hairpins · text"]]; // expression marks arm a cursor and land on half-beats (docs/COMPOSE_EXPRESSIONS_DESIGN.md)
export const DEFAULT_RAILS = { control: true, transport: true, palette: true, utility: false, expression: false };
/** Dynamics in rail order and the text suggestions (free typing too). */
const DYNS = ["pp", "p", "mp", "mf", "f", "ff"];
const TEXTS = ["rit.", "a tempo", "accel.", "rall.", "cresc.", "dim.", "dolce", "espress.", "legato", "rubato", "cantabile", "marcato"];
/** The voice menu (hold a voice button, or ▾ at phone width): rows are enabled by what the selection allows. */
const VOICE_ROWS = [...[0, 1, 2, 3].map((v) => ["voice", `voice ${v + 1}`, { v }]), ["voice-swap", "swap 1 ↔ 2 in these bars", {}], ["cross", "cross to the upper staff", { dir: -1 }], ["cross", "cross to the lower staff", { dir: 1 }], ["hide-rest", "hide rest", {}]];
/** The File menu: the two PDF rows open the export sheet (WSHED-121); MusicXML / MIDI wait for WSHED-119. */
const FILE_ITEMS = [["save-pdf", "Save to Scores as PDF", true], ["export-pdf", "Export PDF", true], ["export-xml", "Export MusicXML", true], ["export-midi", "Export MIDI", false]];

export function buildRails(host, { title, onAction }) {
  host.innerHTML = `
    <div class="cp-rail cp-header" role="toolbar" aria-label="composition">
      <button type="button" class="cp-btn cp-sq" data-act="back" aria-label="back to compositions">${icon("back")}</button>
      <button type="button" class="cp-title" id="cp-title" data-act="details" aria-label="details — title, composer, tags">${esc(title)}</button>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick cp-file" data-pop="cp-file-more" aria-label="file" aria-expanded="false"><span class="cp-pick-label">File</span>&#9662;</button>
        <span class="cp-more cp-menu" id="cp-file-more" hidden>${FILE_ITEMS.map(([act, label, live]) => `<button type="button" class="cp-btn cp-menu-row" data-act="${act}"${live ? "" : " disabled"}><span>${label}</span>${live ? "" : "<small>soon</small>"}</button>`).join("")}</span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick cp-rails-btn" data-pop="cp-rails-more" aria-label="show or hide rails" aria-expanded="false">${icon("grip")}<span class="cp-pick-label">Rails</span>&#9662;</button>
        <span class="cp-more cp-menu" id="cp-rails-more" hidden>${RAILS.map(([k, label]) => `<button type="button" class="cp-btn cp-menu-row cp-rail-row" role="menuitemcheckbox" data-act="rail" data-rail="${k}" aria-checked="true"><span class="cp-check">${icon("check")}</span><span>${label}</span></button>`).join("")}</span>
      </span>
    </div>
    <div class="cp-rail cp-control" role="toolbar" aria-label="controls" data-rail="control">
      <button type="button" class="cp-btn cp-sq" data-act="undo" aria-label="undo" disabled>${icon("undo")}</button>
      <button type="button" class="cp-btn cp-sq" data-act="redo" aria-label="redo" disabled>${icon("redo")}</button>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-mode" data-act="select" aria-pressed="false">${icon("cursor")}<span class="cp-word">Select</span></button>
      <button type="button" class="cp-btn cp-mode" data-act="pan" aria-pressed="false" aria-label="pan — one finger scrolls, two zoom">${icon("hand")}<span class="cp-word">Pan</span></button>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-sq" data-act="delete" aria-label="delete the selection" disabled>${icon("trash")}</button>
      <button type="button" class="cp-btn cp-sq" data-act="copy" aria-label="copy the selection" disabled>${icon("copy")}</button>
      <button type="button" class="cp-btn cp-sq" data-act="cut" aria-label="cut the selection" disabled>${icon("cut")}</button>
      <button type="button" class="cp-btn cp-sq" data-act="paste" aria-label="paste — then tap where it goes" aria-pressed="false" disabled>${icon("paste")}</button>
      <span class="cp-spring" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-sq cp-zoom" data-act="zoom-out" aria-label="smaller">&minus;</button>
      <button type="button" class="cp-btn cp-sq cp-zoom" data-act="zoom-in" aria-label="bigger">+</button>
    </div>
    <div class="cp-rail cp-transport" role="toolbar" aria-label="transport" data-rail="transport">
      <button type="button" class="cp-btn cp-sq" data-act="stop" aria-label="stop — back to the start">${icon("stop")}</button>
      <button type="button" class="cp-btn cp-sq" data-act="rew" aria-label="a bar back">${icon("skipBack")}</button>
      <button type="button" class="cp-btn cp-sq cp-play" data-act="play" aria-label="play" aria-pressed="false"><span class="cp-play-ic">${icon("play")}</span><span class="cp-pause-ic">${icon("pause")}</span></button>
      <button type="button" class="cp-btn cp-sq" data-act="ff" aria-label="a bar forward">${icon("skipFwd")}</button>
      <span class="cp-pos-wrap">
        <input type="range" class="cp-pos" id="cp-pos" min="0" max="1" step="1" value="0" aria-label="position in the piece">
        <span class="cp-pos-read" id="cp-pos-read" aria-live="off">bar 1 of 8</span>
      </span>
      <span class="cp-tempo" role="group" aria-label="tempo">
        <span class="cp-tempo-mark" aria-hidden="true"><span class="cp-glyph cp-glyph-xs cp-glyph-note">${metGlyph(4)}</span><span class="cp-tempo-eq">=</span></span>
        <button type="button" class="cp-btn cp-sq cp-tempo-btn" data-act="tempo-down" aria-label="slower">&minus;</button>
        <button type="button" class="cp-btn cp-bpm" data-act="tempo" id="cp-bpm" aria-label="tempo — tap to type one">100</button>
        <button type="button" class="cp-btn cp-sq cp-tempo-btn" data-act="tempo-up" aria-label="faster">+</button>
      </span>
    </div>
    <div class="cp-rail cp-palette" role="toolbar" aria-label="palette" data-rail="palette">
      <span class="cp-more-wrap cp-voices">
        <button type="button" class="cp-btn cp-pick cp-voice-pick" data-pop="cp-voice-more" data-v="0" aria-label="voice — the one the next tap writes in; with notes selected, the one they move to; swap, cross-staff, hide rest" aria-expanded="false"><span class="cp-pick-label">voice</span><b class="cp-voice-n">1</b>&#9662;</button>
        <span class="cp-more cp-menu" id="cp-voice-more" hidden>${VOICE_ROWS.map(([act, label, d]) => `<button type="button" class="cp-btn cp-menu-row cp-voice-row" data-act="${act}"${d.v !== undefined ? ` data-v="${d.v}"` : ""}${d.dir !== undefined ? ` data-dir="${d.dir}"` : ""}><span>${label}</span><small></small></button>`).join("")}</span>
      </span>
      <span class="cp-sep" aria-hidden="true"></span>
      ${MAIN_BASES.map((b) => `<button type="button" class="cp-btn cp-sq cp-dur" data-act="dur" data-base="${b}" aria-pressed="false" aria-label="${NAMES[b]}"><span class="cp-glyph cp-glyph-note">${metGlyph(b)}</span></button>`).join("")}
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-dur-more" data-pop="cp-more" aria-label="more durations" aria-expanded="false"><span class="cp-glyph cp-glyph-sm cp-glyph-note" id="cp-more-glyph">${metGlyph(32)}</span>&#9662;</button>
        <span class="cp-more" id="cp-more" hidden>${MORE_BASES.map((b) => `<button type="button" class="cp-btn cp-sq cp-dur" data-act="dur" data-base="${b}" aria-pressed="false" aria-label="${NAMES[b]}"><span class="cp-glyph cp-glyph-note">${metGlyph(b)}</span></button>`).join("")}</span>
      </span>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-sq cp-dot" data-act="dot" aria-pressed="false" aria-label="dot"><span class="cp-glyph cp-dot-glyph" id="cp-dot-glyph">${G.dot}</span></button>
      <button type="button" class="cp-btn cp-sq" data-act="tie" aria-label="tie — select a note first"><span class="cp-tie-pic" aria-hidden="true"></span></button>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-sq cp-tuplet" data-act="tuplet" aria-pressed="false" aria-label="tuplet — hold for 2, 5, 6 or 7"><span class="cp-glyph cp-glyph-sm">${G.black}</span><small id="cp-tuplet-n">3</small></button>
        <span class="cp-more" id="cp-tup-more" hidden>${[2, 3, 5, 6, 7].map((n) => `<button type="button" class="cp-btn cp-sq cp-tup-n" data-act="tuplet" data-n="${n}" aria-label="${TUPLET_NAMES[n]}"><span class="cp-glyph cp-glyph-sm">${G.black}</span><small>${n}</small></button>`).join("")}</span>
      </span>
      <span class="cp-sep" aria-hidden="true"></span>
      ${[[1, "sharp"], [-1, "flat"], [0, "natural"]].map(([a, name]) => `<button type="button" class="cp-btn cp-sq cp-acc" data-act="acc" data-alter="${a}" aria-pressed="false" aria-label="${name}"><span class="cp-glyph">${G[a]}</span></button>`).join("")}
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-acc-more" data-pop="cp-acc-more" aria-label="double sharp, double flat" aria-expanded="false"><span class="cp-glyph cp-glyph-sm" id="cp-acc-more-glyph">${G[2]}</span>&#9662;</button>
        <span class="cp-more" id="cp-acc-more" hidden>${[[2, "double sharp"], [-2, "double flat"]].map(([a, name]) => `<button type="button" class="cp-btn cp-sq cp-acc" data-act="acc" data-alter="${a}" aria-pressed="false" aria-label="${name}"><span class="cp-glyph">${G[a]}</span></button>`).join("")}</span>
      </span>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-rest" data-act="rest" aria-pressed="false" aria-label="rest"><span class="cp-glyph cp-glyph-rest" id="cp-rest-glyph">${restGlyph(4)}</span><span class="cp-rest-word">rest</span></button>
    </div>
    <div class="cp-rail cp-utility" id="cp-utility" role="toolbar" aria-label="key, time, clef and marks" data-rail="utility" hidden>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick" data-pop="cp-key-more" aria-label="key signature — pick one, then tap the bar it starts at" aria-expanded="false" aria-pressed="false"><span class="cp-pick-label">Key</span><b class="cp-pick-val" id="cp-key-val"></b>&#9662;</button>
        <span class="cp-more cp-grid cp-key-grid" id="cp-key-more" hidden>${KEYS.map((k) => `<button type="button" class="cp-btn cp-key" data-act="key" data-fifths="${k.fifths}" aria-pressed="false" aria-label="${k.major} major, ${k.minor} minor"><b>${k.major}</b><small>${k.minor}m</small></button>`).join("")}</span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick" data-pop="cp-time-more" aria-label="time signature — pick one, then tap the bar it starts at" aria-expanded="false" aria-pressed="false"><span class="cp-pick-label">Time</span><b class="cp-pick-val" id="cp-time-val"></b>&#9662;</button>
        <span class="cp-more cp-grid" id="cp-time-more" hidden>${TIMES.map((t) => `<button type="button" class="cp-btn cp-time" data-act="time" data-beats="${t[0]}" data-unit="${t[1]}" aria-pressed="false" aria-label="${t[0]} ${t[1]}"><b>${t[0]}</b><b>${t[1]}</b></button>`).join("")}<button type="button" class="cp-btn cp-time-custom" data-act="time" data-custom="1" aria-label="another time signature">other…</button></span>
      </span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-pick" data-pop="cp-clef-more" aria-label="clef — pick one, then tap the beat it starts on" aria-expanded="false" aria-pressed="false"><span class="cp-pick-label">Clef</span><span class="cp-pick-val cp-clef-val" id="cp-clef-val"></span>&#9662;</button>
        <span class="cp-more cp-grid cp-clef-grid" id="cp-clef-more" hidden>${CLEF_NAMES.map(clefBtn).join("")}</span>
      </span>
      <span class="cp-sep" aria-hidden="true"></span>
      ${["fermata", "staccato", "accent", "tenuto"].map((m) => `<button type="button" class="cp-btn cp-sq cp-art-btn" data-act="art" data-mark="${m}" aria-label="${MARK_NAMES[m] ?? m}"><span class="cp-glyph">${artGlyph(m, true)}</span></button>`).join("")}
      <button type="button" class="cp-btn cp-sq cp-slur-btn" data-act="slur" aria-label="slur — from the first selected note to the last (one note: to the next)" disabled><span class="cp-slur-pic" aria-hidden="true"></span></button>
      <span class="cp-sep" aria-hidden="true"></span>
      ${["trill", "mordent", "lowerMordent", "turn"].map((m) => `<button type="button" class="cp-btn cp-sq cp-art-btn" data-act="art" data-mark="${m}" aria-label="${MARK_NAMES[m] ?? m}"><span class="cp-glyph">${artGlyph(m, true)}</span></button>`).join("")}
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-gliss-btn" data-act="gliss" aria-label="glissando to the next note"><i>gliss.</i></button>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-arp-btn" data-pop="cp-arp-more" aria-label="rolled chord — pick the roll" aria-expanded="false" disabled><span class="cp-glyph cp-glyph-xs">${G.arpeggio}</span>&#9662;</button>
        <span class="cp-more cp-menu" id="cp-arp-more" hidden>${ARP_ROWS.map(([kind, glyph, label]) => `<button type="button" class="cp-btn cp-menu-row cp-arp-row" data-act="arp" data-kind="${kind}"><span class="cp-glyph cp-glyph-xs">${glyph}</span><span>${label}</span></button>`).join("")}</span>
      </span>
    </div>
    <div class="cp-rail cp-expression" id="cp-expression" role="toolbar" aria-label="dynamics, hairpins and text" data-rail="expression" hidden>
      ${DYNS.map((d) => `<button type="button" class="cp-btn cp-sq cp-expr-btn cp-dyn-btn" data-act="dyn" data-dyn="${d}" aria-label="${d} — tap the beat it goes on" aria-pressed="false"><span class="cp-glyph cp-glyph-dyn">${dynGlyph(d)}</span></button>`).join("")}
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-sq cp-expr-btn cp-hairpin-btn" data-act="hairpin" data-kind="cresc" aria-label="crescendo — tap where it starts, then where it ends" aria-pressed="false"><span class="cp-glyph cp-glyph-sm">${G.hairpinCresc}</span></button>
      <button type="button" class="cp-btn cp-sq cp-expr-btn cp-hairpin-btn" data-act="hairpin" data-kind="dim" aria-label="diminuendo — tap where it starts, then where it ends" aria-pressed="false"><span class="cp-glyph cp-glyph-sm">${G.hairpinDim}</span></button>
      <span class="cp-sep" aria-hidden="true"></span>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-expr-btn cp-text-btn" data-pop="cp-text-more" aria-label="text — rit., a tempo, dolce… or your own: pick it, then tap the beat it goes over" aria-expanded="false" aria-pressed="false"><i id="cp-text-lbl">text</i>&#9662;</button>
        <span class="cp-more cp-menu cp-text-menu" id="cp-text-more" hidden>
          <span class="cp-text-chips">${TEXTS.map((t) => `<button type="button" class="cp-btn cp-chip" data-act="text" data-text="${t}"><i>${t}</i></button>`).join("")}</span>
          <span class="cp-text-row"><input class="cp-text-in" id="cp-text-in" type="text" maxlength="40" placeholder="your own…" aria-label="expression text"><button type="button" class="cp-btn cp-text-set" data-act="text-set">set</button></span>
        </span>
      </span>
    </div>`;
  const moreBtn = host.querySelector(".cp-dur-more"), accMoreBtn = host.querySelector(".cp-acc-more");
  const tupMore = host.querySelector("#cp-tup-more"), tupBtn = host.querySelector(".cp-tuplet");
  const pops = [...host.querySelectorAll("[data-pop]")].map((b) => [host.querySelector(`#${b.dataset.pop}`), b]).concat([[tupMore, tupBtn]]);
  // Bravura glyphs sit on a musical anchor, not a typographic centre: measure each one's ink and
  // slide it so the ink is centred in its button (re-done whenever a glyph's text changes).
  const centreAll = () => { for (const g of host.querySelectorAll(".cp-glyph")) centreGlyph(g); };
  (document.fonts?.load?.('2rem "Bravura"') ?? Promise.resolve()).then(centreAll, centreAll);
  const closeMore = () => { for (const [m, b] of pops) { m.hidden = true; b.setAttribute("aria-expanded", "false"); } };
  const toggle = (m, b) => { const open = m.hidden; closeMore(); if (open) { m.hidden = false; b.setAttribute("aria-expanded", "true"); } };
  let swallow = false; // a click that follows a hold
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act], [data-pop]");
    if (!b || b.disabled) return;
    if (swallow) { swallow = false; return; }
    if (b.dataset.pop) { toggle(host.querySelector(`#${b.dataset.pop}`), b); return; }
    const act = b.dataset.act;
    if (act === "rail") { onAction("rail", b.dataset.rail); return; } // the menu stays open: several rails can be toggled in one go
    closeMore();
    if (act === "dur") { onAction("dur", Number(b.dataset.base)); return; }
    if (act === "key") { onAction("key", Number(b.dataset.fifths)); return; }
    if (act === "time") { onAction("time", b.dataset.custom ? "custom" : { beats: Number(b.dataset.beats), unit: Number(b.dataset.unit) }); return; }
    if (act === "clef") { onAction("clef", b.dataset.clef); return; }
    if (act === "art") { onAction("art", b.dataset.mark); return; }
    if (act === "arp") { onAction("arp", b.dataset.kind); return; }
    if (act === "dyn") { onAction("dyn", b.dataset.dyn); return; }
    if (act === "hairpin") { onAction("hairpin", b.dataset.kind); return; }
    if (act === "text") { onAction("text", b.dataset.text ?? ""); return; }
    if (act === "text-set") { const inp = host.querySelector("#cp-text-in"); onAction("text", inp.value); inp.value = ""; inp.blur(); return; }
    if (act === "acc") { onAction("acc", Number(b.dataset.alter)); return; }
    if (act === "voice") { onAction("voice", Number(b.dataset.v)); return; }
    if (act === "cross") { onAction("cross", Number(b.dataset.dir)); return; }
    if (act === "tuplet") { onAction("tuplet", b.dataset.n ? Number(b.dataset.n) : undefined); return; }
    onAction(act);
  });
  // hold the tuplet button for the other sizes; hold a voice button for the voice menu
  const hold = (btn, open) => { let timer = 0;
    btn.addEventListener("pointerdown", (e) => { if (e.button && e.button !== 0) return; clearTimeout(timer); timer = setTimeout(() => { swallow = true; open(); }, 450); });
    for (const t of ["pointerup", "pointercancel", "pointerleave"]) btn.addEventListener(t, () => clearTimeout(timer));
  };
  hold(tupBtn, () => toggle(tupMore, tupBtn));
  // typing in the text box: Enter sets; the editor's shortcuts stay out of inputs
  { const inp = host.querySelector("#cp-text-in");
    inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); closeMore(); onAction("text", inp.value); inp.value = ""; inp.blur(); } else if (e.key === "Escape") { closeMore(); inp.blur(); } }); // the words are armed: focus leaves the box so the pen (and Escape) go to the staff
    inp.addEventListener("pointerdown", (e) => e.stopPropagation()); }
  const onDocDown = (e) => { if (![...host.querySelectorAll(".cp-more-wrap")].some((w) => w.contains(e.target))) closeMore(); };
  document.addEventListener("pointerdown", onDocDown);
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
    destroy() { document.removeEventListener("pointerdown", onDocDown); },
    /** The playhead: { pos, total, bar, bars, playing?, bpm? } — called every frame while playing, so it touches only what changed. */
    transport({ pos: t, total, bar, bars, playing, bpm }) {
      if (total !== undefined && Number(pos.max) !== total) pos.max = String(total);
      if (!scrubbing && t !== undefined) { pos.value = String(Math.round(t)); pos.style.setProperty("--p", `${(100 * Math.round(t) / Math.max(1, Number(pos.max))).toFixed(2)}%`); }
      if (bar !== undefined) { const read = `bar ${bar + 1} of ${bars}`; if (posRead.textContent !== read) posRead.textContent = read; }
      if (playing !== undefined) { const b = host.querySelector("[data-act=play]"); b.setAttribute("aria-pressed", String(playing)); b.setAttribute("aria-label", playing ? "pause" : "play"); }
      if (bpm !== undefined) host.querySelector("#cp-bpm").textContent = String(bpm);
    },
    /** Reflect the editor's state: { armed, mode, canUndo, canRedo, hasSelection, title }. */
    update({ armed, mode, canUndo, canRedo, hasSelection, hasClip = false, pasting = false, tupletN = 3, rails = DEFAULT_RAILS, pending = null, title, voice = 0, used = new Set([0]), sel = {} }) {
      let shown = false;
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
        const lane = host.querySelector(`.cp-rail[data-rail="${k}"]`), on = !!rails[k];
        if (lane.hidden === on) { lane.hidden = !on; if (on) shown = true; }
        host.querySelector(`.cp-rail-row[data-rail="${k}"]`).setAttribute("aria-checked", String(on));
      }
      if (shown) centreAll(); // a lane that was display:none had no metrics to measure
      for (const b of host.querySelectorAll(".cp-art-btn, .cp-gliss-btn, .cp-arp-btn, .cp-slur-btn")) b.disabled = !hasSelection;
      // the expression buttons always work: they arm a cursor (WSHED-122), or retype a selection of their own kind; the armed one is lit
      for (const b of host.querySelectorAll(".cp-dyn-btn")) b.setAttribute("aria-pressed", String(pending?.kind === "dyn" && pending.value === b.dataset.dyn));
      for (const b of host.querySelectorAll(".cp-hairpin-btn")) b.setAttribute("aria-pressed", String(pending?.kind === "hairpin" && pending.value === b.dataset.kind));
      host.querySelector(".cp-text-btn").setAttribute("aria-pressed", String(pending?.kind === "text"));
      { const lbl = host.querySelector("#cp-text-lbl"), want = pending?.kind === "text" ? pending.value : "text"; if (lbl.textContent !== want) lbl.textContent = want; }
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
      host.querySelector("[data-act=rest]").setAttribute("aria-pressed", String(armed.rest));
      const rg = host.querySelector("#cp-rest-glyph"), rt = restGlyph(armed.base);
      if (rg.textContent !== rt) { rg.textContent = rt; centreGlyph(rg); }
      host.querySelector("[data-act=undo]").disabled = !canUndo;
      host.querySelector("[data-act=redo]").disabled = !canRedo;
      host.querySelector("[data-act=delete]").disabled = !hasSelection;
      host.querySelector("[data-act=copy]").disabled = !hasSelection;
      host.querySelector("[data-act=cut]").disabled = !hasSelection;
      const pasteBtn = host.querySelector("[data-act=paste]");
      pasteBtn.disabled = !hasClip; pasteBtn.setAttribute("aria-pressed", String(pasting));
      if (title !== undefined) host.querySelector("#cp-title").textContent = title;
    },
  };
}
