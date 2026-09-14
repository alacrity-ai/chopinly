// The control rail and the palette rail (docs/COMPOSE_DESIGN.md §8.1). Pure
// markup + click wiring; the editor owns the state and calls `update`.
import { icon } from "../../lib/icons.js";
import { metGlyph, restGlyph, G } from "../../lib/staff/glyphs.js";
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
  // the box's centre sits (font ascent − font descent) / 2 above the baseline; the ink's centre (ink ascent − ink descent) / 2 above it
  const dy = (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  span.style.setProperty("--dy", `${dy.toFixed(2)}px`);
}

export function buildRails(host, { title, onAction }) {
  host.innerHTML = `
    <div class="cp-rail cp-control" role="toolbar" aria-label="controls">
      <button type="button" class="cp-btn" data-act="back" aria-label="back to compositions">${icon("back")}</button>
      <button type="button" class="cp-btn" data-act="undo" aria-label="undo" disabled>${icon("undo")}</button>
      <button type="button" class="cp-btn" data-act="redo" aria-label="redo" disabled>${icon("redo")}</button>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-mode" data-act="select" aria-pressed="false">${icon("cursor")}<span class="cp-word">Select</span></button>
      <button type="button" class="cp-btn cp-mode" data-act="scrub" aria-pressed="false">${icon("hand")}<span class="cp-word">Scrub</span></button>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn" data-act="delete" aria-label="delete the selection" disabled>${icon("trash")}</button>
      <button type="button" class="cp-btn" data-act="copy" aria-label="copy the selection" disabled>${icon("copy")}</button>
      <button type="button" class="cp-btn" data-act="cut" aria-label="cut the selection" disabled>${icon("cut")}</button>
      <button type="button" class="cp-btn" data-act="paste" aria-label="paste — then tap where it goes" aria-pressed="false" disabled>${icon("paste")}</button>
      <span class="cp-title" id="cp-title">${esc(title)}</span>
      <button type="button" class="cp-btn cp-zoom" data-act="zoom-out" aria-label="smaller">&minus;</button>
      <button type="button" class="cp-btn cp-zoom" data-act="zoom-in" aria-label="bigger">+</button>
    </div>
    <div class="cp-rail cp-transport" role="toolbar" aria-label="transport">
      <button type="button" class="cp-btn" data-act="stop" aria-label="stop — back to the start">${icon("stop")}</button>
      <button type="button" class="cp-btn" data-act="rew" aria-label="a bar back">${icon("skipBack")}</button>
      <button type="button" class="cp-btn cp-play" data-act="play" aria-label="play" aria-pressed="false"><span class="cp-play-ic">${icon("play")}</span><span class="cp-pause-ic">${icon("pause")}</span></button>
      <button type="button" class="cp-btn" data-act="ff" aria-label="a bar forward">${icon("skipFwd")}</button>
      <span class="cp-pos-wrap">
        <input type="range" class="cp-pos" id="cp-pos" min="0" max="1" step="1" value="0" aria-label="position in the piece">
        <span class="cp-pos-read" id="cp-pos-read" aria-live="off">bar 1 of 8</span>
      </span>
      <span class="cp-tempo" role="group" aria-label="tempo">
        <span class="cp-tempo-mark" aria-hidden="true"><span class="cp-glyph cp-glyph-xs">${metGlyph(4)}</span><span class="cp-tempo-eq">=</span></span>
        <button type="button" class="cp-btn cp-tempo-btn" data-act="tempo-down" aria-label="slower">&minus;</button>
        <button type="button" class="cp-btn cp-bpm" data-act="tempo" id="cp-bpm" aria-label="tempo — tap to type one">100</button>
        <button type="button" class="cp-btn cp-tempo-btn" data-act="tempo-up" aria-label="faster">+</button>
      </span>
    </div>
    <div class="cp-rail cp-palette" role="toolbar" aria-label="palette">
      ${MAIN_BASES.map((b) => `<button type="button" class="cp-btn cp-dur" data-act="dur" data-base="${b}" aria-pressed="false" aria-label="${NAMES[b]}"><span class="cp-glyph">${metGlyph(b)}</span></button>`).join("")}
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-dur-more" data-act="more" aria-label="more durations" aria-expanded="false"><span class="cp-glyph cp-glyph-sm" id="cp-more-glyph">${metGlyph(32)}</span>&#9662;</button>
        <span class="cp-more" id="cp-more" hidden>${MORE_BASES.map((b) => `<button type="button" class="cp-btn cp-dur" data-act="dur" data-base="${b}" aria-pressed="false" aria-label="${NAMES[b]}"><span class="cp-glyph">${metGlyph(b)}</span></button>`).join("")}</span>
      </span>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-dot" data-act="dot" aria-pressed="false" aria-label="dot"><span class="cp-glyph cp-dot-glyph" id="cp-dot-glyph">${G.dot}</span></button>
      <button type="button" class="cp-btn" data-act="tie" aria-label="tie — select a note first"><span class="cp-tie-pic" aria-hidden="true"></span></button>
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-tuplet" data-act="tuplet" aria-pressed="false" aria-label="tuplet — hold for 2, 5, 6 or 7"><span class="cp-glyph cp-glyph-sm">${G.black}</span><small id="cp-tuplet-n">3</small></button>
        <span class="cp-more" id="cp-tup-more" hidden>${[2, 3, 5, 6, 7].map((n) => `<button type="button" class="cp-btn cp-tup-n" data-act="tuplet" data-n="${n}" aria-label="${TUPLET_NAMES[n]}"><span class="cp-glyph cp-glyph-sm">${G.black}</span><small>${n}</small></button>`).join("")}</span>
      </span>
      <span class="cp-sep" aria-hidden="true"></span>
      ${[[1, "sharp"], [-1, "flat"], [0, "natural"]].map(([a, name]) => `<button type="button" class="cp-btn cp-acc" data-act="acc" data-alter="${a}" aria-pressed="false" aria-label="${name}"><span class="cp-glyph">${G[a]}</span></button>`).join("")}
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-acc-more" data-act="more-acc" aria-label="double sharp, double flat" aria-expanded="false"><span class="cp-glyph cp-glyph-sm" id="cp-acc-more-glyph">${G[2]}</span>&#9662;</button>
        <span class="cp-more" id="cp-acc-more" hidden>${[[2, "double sharp"], [-2, "double flat"]].map(([a, name]) => `<button type="button" class="cp-btn cp-acc" data-act="acc" data-alter="${a}" aria-pressed="false" aria-label="${name}"><span class="cp-glyph">${G[a]}</span></button>`).join("")}</span>
      </span>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-rest" data-act="rest" aria-pressed="false" aria-label="rest"><span class="cp-glyph cp-glyph-rest" id="cp-rest-glyph">${restGlyph(4)}</span><span class="cp-rest-word">rest</span></button>
    </div>`;
  const more = host.querySelector("#cp-more"), moreBtn = host.querySelector(".cp-dur-more");
  const accMore = host.querySelector("#cp-acc-more"), accMoreBtn = host.querySelector(".cp-acc-more");
  const tupMore = host.querySelector("#cp-tup-more"), tupBtn = host.querySelector(".cp-tuplet");
  // Bravura glyphs sit on a musical anchor, not a typographic centre: measure each one's ink and
  // slide it so the ink is centred in its button (re-done whenever a glyph's text changes).
  const centreAll = () => { for (const g of host.querySelectorAll(".cp-glyph")) centreGlyph(g); };
  (document.fonts?.load?.('2rem "Bravura"') ?? Promise.resolve()).then(centreAll, centreAll);
  const closeMore = () => { for (const [m, b] of [[more, moreBtn], [accMore, accMoreBtn], [tupMore, tupBtn]]) { m.hidden = true; b.setAttribute("aria-expanded", "false"); } };
  const toggle = (m, b) => { const open = m.hidden; closeMore(); if (open) { m.hidden = false; b.setAttribute("aria-expanded", "true"); } };
  let swallow = false; // a click that follows a hold
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    if (swallow) { swallow = false; return; }
    const act = b.dataset.act;
    if (act === "more") { toggle(more, moreBtn); return; }
    if (act === "more-acc") { toggle(accMore, accMoreBtn); return; }
    closeMore();
    if (act === "dur") { onAction("dur", Number(b.dataset.base)); return; }
    if (act === "acc") { onAction("acc", Number(b.dataset.alter)); return; }
    if (act === "tuplet") { onAction("tuplet", b.dataset.n ? Number(b.dataset.n) : undefined); return; }
    onAction(act);
  });
  // hold the tuplet button for the other sizes
  { let timer = 0;
    tupBtn.addEventListener("pointerdown", (e) => { if (e.button && e.button !== 0) return; clearTimeout(timer); timer = setTimeout(() => { swallow = true; toggle(tupMore, tupBtn); }, 450); });
    for (const t of ["pointerup", "pointercancel", "pointerleave"]) tupBtn.addEventListener(t, () => clearTimeout(timer));
  }
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
    update({ armed, mode, canUndo, canRedo, hasSelection, hasClip = false, pasting = false, tupletN = 3, title }) {
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
      host.querySelector("[data-act=scrub]").setAttribute("aria-pressed", String(mode === "scrub"));
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
