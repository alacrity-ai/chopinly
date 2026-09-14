// The control rail and the palette rail (docs/COMPOSE_DESIGN.md §8.1). Pure
// markup + click wiring; the editor owns the state and calls `update`.
import { icon } from "../../lib/icons.js";
import { metGlyph, restGlyph, G } from "../../lib/staff/glyphs.js";
import { esc } from "../logbook/util.js";

export const MAIN_BASES = [1, 2, 4, 8, 16];
export const MORE_BASES = [0, 32, 64];
const NAMES = { 0: "double whole", 1: "whole", 2: "half", 4: "quarter", 8: "eighth", 16: "sixteenth", 32: "thirty-second", 64: "sixty-fourth" };
export const durName = (base) => NAMES[base];

export function buildRails(host, { title, onAction }) {
  host.innerHTML = `
    <div class="cp-rail cp-control" role="toolbar" aria-label="controls">
      <button type="button" class="cp-btn" data-act="back" aria-label="back to compositions">${icon("back")}</button>
      <button type="button" class="cp-btn" data-act="undo" aria-label="undo" disabled>${icon("undo")}</button>
      <button type="button" class="cp-btn" data-act="redo" aria-label="redo" disabled>${icon("redo")}</button>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-mode" data-act="select" aria-pressed="false">Select</button>
      <button type="button" class="cp-btn cp-mode" data-act="scrub" aria-pressed="false">Scrub</button>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn" data-act="delete" aria-label="delete the selection" disabled>${icon("trash")}</button>
      <button type="button" class="cp-btn" data-act="copy" aria-label="copy the selection" disabled>${icon("copy")}</button>
      <button type="button" class="cp-btn" data-act="cut" aria-label="cut the selection" disabled>${icon("cut")}</button>
      <button type="button" class="cp-btn" data-act="paste" aria-label="paste — then tap where it goes" aria-pressed="false" disabled>${icon("paste")}</button>
      <span class="cp-title" id="cp-title">${esc(title)}</span>
      <button type="button" class="cp-btn cp-zoom" data-act="zoom-out" aria-label="smaller">&minus;</button>
      <button type="button" class="cp-btn cp-zoom" data-act="zoom-in" aria-label="bigger">+</button>
    </div>
    <div class="cp-rail cp-palette" role="toolbar" aria-label="palette">
      ${MAIN_BASES.map((b) => `<button type="button" class="cp-btn cp-dur" data-act="dur" data-base="${b}" aria-pressed="false" aria-label="${NAMES[b]}"><span class="cp-glyph">${metGlyph(b)}</span></button>`).join("")}
      <span class="cp-more-wrap">
        <button type="button" class="cp-btn cp-dur-more" data-act="more" aria-label="more durations" aria-expanded="false"><span class="cp-glyph cp-glyph-sm" id="cp-more-glyph">${metGlyph(32)}</span>&#9662;</button>
        <span class="cp-more" id="cp-more" hidden>${MORE_BASES.map((b) => `<button type="button" class="cp-btn cp-dur" data-act="dur" data-base="${b}" aria-pressed="false" aria-label="${NAMES[b]}"><span class="cp-glyph">${metGlyph(b)}</span></button>`).join("")}</span>
      </span>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-soon" data-act="dot" aria-label="dot — coming next" disabled><span class="cp-glyph">${G.dot}</span></button>
      <button type="button" class="cp-btn cp-soon" data-act="tie" aria-label="tie — coming next" disabled><span class="cp-tie-pic" aria-hidden="true"></span></button>
      <button type="button" class="cp-btn cp-soon" data-act="tuplet" aria-label="tuplet — coming next" disabled><span class="cp-glyph cp-glyph-sm">${G.black}</span><small>3</small></button>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-soon" data-act="sharp" aria-label="sharp — coming next" disabled><span class="cp-glyph">${G[1]}</span></button>
      <button type="button" class="cp-btn cp-soon" data-act="flat" aria-label="flat — coming next" disabled><span class="cp-glyph">${G[-1]}</span></button>
      <button type="button" class="cp-btn cp-soon" data-act="natural" aria-label="natural — coming next" disabled><span class="cp-glyph">${G[0]}</span></button>
      <span class="cp-sep" aria-hidden="true"></span>
      <button type="button" class="cp-btn cp-rest" data-act="rest" aria-pressed="false" aria-label="rest"><span class="cp-glyph cp-glyph-rest" id="cp-rest-glyph">${restGlyph(4)}</span><span class="cp-rest-word">rest</span></button>
    </div>`;
  const more = host.querySelector("#cp-more"), moreBtn = host.querySelector(".cp-dur-more");
  const closeMore = () => { more.hidden = true; moreBtn.setAttribute("aria-expanded", "false"); };
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "more") { more.hidden = !more.hidden; moreBtn.setAttribute("aria-expanded", String(!more.hidden)); return; }
    if (act === "dur") { closeMore(); onAction("dur", Number(b.dataset.base)); return; }
    closeMore();
    onAction(act);
  });
  document.addEventListener("pointerdown", (e) => { if (!host.querySelector(".cp-more-wrap").contains(e.target)) closeMore(); });

  return {
    /** Reflect the editor's state: { armed, mode, canUndo, canRedo, hasSelection, title }. */
    update({ armed, mode, canUndo, canRedo, hasSelection, hasClip = false, pasting = false, title }) {
      for (const b of host.querySelectorAll(".cp-dur")) b.setAttribute("aria-pressed", String(mode === "place" && Number(b.dataset.base) === armed.base));
      const moreOn = mode === "place" && MORE_BASES.includes(armed.base);
      moreBtn.classList.toggle("on", moreOn);
      host.querySelector("#cp-more-glyph").textContent = metGlyph(moreOn ? armed.base : 32);
      host.querySelector("[data-act=select]").setAttribute("aria-pressed", String(mode === "select"));
      host.querySelector("[data-act=scrub]").setAttribute("aria-pressed", String(mode === "scrub"));
      host.querySelector("[data-act=rest]").setAttribute("aria-pressed", String(armed.rest));
      host.querySelector("#cp-rest-glyph").textContent = restGlyph(armed.base);
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
