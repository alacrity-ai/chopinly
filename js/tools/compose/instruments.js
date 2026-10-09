// The Instruments sheet (docs/COMPOSE_PARTS_DESIGN.md §3, WSHED-182): the piece's parts — name, abbreviation,
// instrument and staves — added, reordered and removed. A sheet, not a rail: instruments are the piece's identity,
// edited rarely, like its title. Every change is one pure engine operation the editor commits (one undo step).
import { icon } from "../../lib/icons.js";
import { esc, toast, openSheet, plural } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";
import { INSTRUMENTS, INSTRUMENT_KEYS, GROUPS } from "../../lib/compose/instruments.js";
import { addPart, removePart, movePart, renamePart, setPartStaves, setPartInstrument, partIsEmpty, Nudge } from "../../lib/compose/engine.js";
import { PART_STAVES_MAX, PARTS_MAX, STAVES_MAX, nStavesOf, partStart, PART_NAME_MAX, PART_ABBR_MAX } from "../../lib/compose/model.js";

const GROUP_LABEL = { keyboard: "keyboards", voice: "voices", strings: "strings", woodwind: "woodwinds", brass: "brass", other: "other" };
/** The catalogue as <option>s grouped by family, for a native select (the one menu that works the same on every device). */
const catalogueOptions = (selected = null) => GROUPS.map((g) => `<optgroup label="${GROUP_LABEL[g]}">${INSTRUMENT_KEYS.filter((k) => INSTRUMENTS[k].group === g).map((k) => `<option value="${k}"${k === selected ? " selected" : ""}>${esc(INSTRUMENTS[k].name)}</option>`).join("")}</optgroup>`).join("");
/** How many bars of a part hold notes. */
const barsWithNotes = (doc, pi) => { const k0 = partStart(doc, pi), n = doc.parts[pi].staves; return doc.measures.filter((m) => m.staves.slice(k0, k0 + n).some((s) => s.voices.some((v) => v && v.some((ev) => ev.kind === "note")))).length; };
const stavesWord = (n) => (n === 1 ? "1 staff" : `${n} staves`);

/**
 * Open the sheet over the editor. `getDoc()` is the editor's current document, `apply(fn)` commits `fn(doc)` (the
 * editor undoes it as one step and shows a Nudge's message). Resolves when the sheet closes.
 */
export function openInstrumentsSheet({ getDoc, apply }) {
  const sheet = openSheet({ title: "instruments", cls: "lb-acct-wrap cp-ins-wrap", html: `<div class="cp-ins-body"></div>` });
  const { body, close, closed } = sheet;
  const host = body.querySelector(".cp-ins-body");
  const run = (fn) => { try { apply(fn); } catch (e) { if (e instanceof Nudge) { toast(e.message); haptic(20); } else throw e; } render(); };
  function render() {
    const doc = getDoc(), n = nStavesOf(doc), full = doc.parts.length >= PARTS_MAX || n >= STAVES_MAX;
    host.innerHTML = `
      <ul class="lb-acct-list cp-ins-list" aria-label="instruments">
        ${doc.parts.map((p, pi) => {
          const ins = INSTRUMENTS[p.instrument] ?? INSTRUMENTS.other;
          return `<li class="cp-ins-row" data-part="${p.id}">
            <span class="cp-ins-grip" aria-hidden="true">${icon("grip")}</span>
            <div class="cp-ins-fields">
              <input class="lb-input cp-ins-name" value="${esc(p.name)}" maxlength="${PART_NAME_MAX}" aria-label="name of instrument ${pi + 1}" autocomplete="off" autocapitalize="words" data-field="name" data-part="${p.id}">
              <input class="lb-input cp-ins-abbr" value="${esc(p.abbr)}" maxlength="${PART_ABBR_MAX}" placeholder="abbr." aria-label="abbreviation of instrument ${pi + 1}" autocomplete="off" data-field="abbr" data-part="${p.id}">
              <label class="cp-ins-kind"><span class="cp-ins-kind-label">${esc(ins.name)} · ${stavesWord(p.staves)}${ins.note ? `<small>${esc(ins.note)}</small>` : ""}</span><select class="cp-ins-select" aria-label="instrument ${pi + 1}" data-part="${p.id}">${catalogueOptions(p.instrument)}</select></label>
              <span class="cp-ins-staves" role="group" aria-label="staves">${[1, 2, 3].filter((k) => k <= Math.max(p.staves, ins.clefs.length, 2) && k <= PART_STAVES_MAX).map((k) => `<button type="button" class="cp-btn cp-ins-stave" data-act="staves" data-part="${p.id}" data-n="${k}" aria-pressed="${k === p.staves}"${k > p.staves && n + k - p.staves > STAVES_MAX ? " disabled" : ""}>${k}</button>`).join("")}</span>
            </div>
            <span class="cp-ins-acts">
              <button type="button" class="cp-btn cp-sq" data-act="move" data-part="${p.id}" data-dir="-1" aria-label="move ${esc(p.name)} up"${pi === 0 ? " disabled" : ""}>${icon("chev")}</button>
              <button type="button" class="cp-btn cp-sq cp-ins-down" data-act="move" data-part="${p.id}" data-dir="1" aria-label="move ${esc(p.name)} down"${pi === doc.parts.length - 1 ? " disabled" : ""}>${icon("chev")}</button>
              <button type="button" class="cp-btn cp-sq lb-danger" data-act="remove" data-part="${p.id}" aria-label="remove ${esc(p.name)}"${doc.parts.length === 1 ? " disabled" : ""}>${icon("trash")}</button>
            </span>
          </li>`;
        }).join("")}
      </ul>
      <label class="cp-ins-add${full ? " cp-ins-full" : ""}">
        <span class="cp-btn cp-ins-add-btn">${icon("plus")}<span>add an instrument</span></span>
        <select class="cp-ins-select cp-ins-add-select" aria-label="add an instrument"${full ? " disabled" : ""}><option value="" selected disabled>add an instrument…</option>${catalogueOptions()}</select>
      </label>
      <p class="lb-acct-fine">${plural(doc.parts.length, "instrument")} · ${stavesWord(n)} · every instrument plays with the piano's sound for now; clarinet, horn, trumpet and guitar are written as they sound.</p>`;
    // names and abbreviations commit on blur or Enter (one undo step each)
    for (const inp of host.querySelectorAll("input[data-field]")) {
      const commitField = () => { const p = getDoc().parts.find((x) => x.id === inp.dataset.part); if (!p) return; const v = inp.value.replace(/\s+/g, " ").trim(); if ((inp.dataset.field === "name" ? p.name : p.abbr) === v) { inp.value = inp.dataset.field === "name" ? p.name : p.abbr; return; } run((d) => renamePart(d, p.id, { [inp.dataset.field]: v })); };
      inp.addEventListener("change", commitField);
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } });
    }
    for (const sel of host.querySelectorAll(".cp-ins-row .cp-ins-select")) sel.addEventListener("change", () => {
      const pi = getDoc().parts.findIndex((x) => x.id === sel.dataset.part), p = getDoc().parts[pi];
      if (!p || sel.value === p.instrument) return;
      const empty = partIsEmpty(getDoc(), pi), defaults = INSTRUMENTS[sel.value].clefs, same = defaults.length === p.staves && defaults.every((c, k) => c === p.clefs[k]);
      const reset = empty && !same && confirm(`set ${INSTRUMENTS[sel.value].name}'s staves to ${defaults.join(" and ")} clef?`); // an empty part may take the instrument's clefs; one with notes keeps what it has
      run((d) => { let e = setPartInstrument(d, p.id, sel.value, { resetClefs: reset }); if (reset && defaults.length !== p.staves) e = setPartStaves(e, p.id, defaults.length); return e; });
    });
    host.querySelector(".cp-ins-add-select").addEventListener("change", (e) => { const key = e.target.value; if (!key) return; run((d) => addPart(d, key)); haptic(6); host.querySelector(".cp-ins-row:last-child .cp-ins-name")?.focus(); });
    for (const b of host.querySelectorAll("button[data-act]")) b.addEventListener("click", () => {
      const doc = getDoc(), id = b.dataset.part, pi = doc.parts.findIndex((x) => x.id === id), p = doc.parts[pi];
      if (!p) return;
      if (b.dataset.act === "move") { run((d) => movePart(d, id, Number(b.dataset.dir))); haptic(6); host.querySelector(`[data-act="move"][data-part="${id}"][data-dir="${b.dataset.dir}"]`)?.focus(); }
      else if (b.dataset.act === "staves") run((d) => setPartStaves(d, id, Number(b.dataset.n)));
      else if (b.dataset.act === "remove") {
        const bars = barsWithNotes(doc, pi);
        if (bars && !confirm(`remove ${p.name} and its ${plural(bars, "bar")} of notes?`)) return; // destructive: the notes go with the staves (undo brings them back)
        run((d) => removePart(d, id)); haptic(12);
      }
    });
  }
  render();
  return { closed, close, render };
}
