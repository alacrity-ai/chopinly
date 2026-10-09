// The composition details modal (WSHED-117): title · subtitle (WSHED-169) · composer · tags — the same
// form Scores uses, so a composition saved to Scores carries its identity 1:1.
// With an id it edits that composition (and can delete it); without one it
// creates a new composition on save.
import { logbook } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, toast, openSheet, plural } from "../logbook/util.js";
import { haptic, stamp } from "../logbook/motion.js";
import { suggestComposers } from "../../lib/scores/library.js";
import { newComposition } from "../../lib/compose/model.js";
import { TEMPLATES, templateParts, INSTRUMENTS } from "../../lib/compose/instruments.js";
import { detailsFormHtml, wireDetailsForm } from "../shared/catalog.js";

export const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const barsOf = (c) => { let last = c.measures.length - 1; while (last > 0 && c.measures[last].staves.every((s) => s.voices.every((v) => !v || v.every((e) => e.kind === "rest")))) last--; return last + 1; };
/** "Violin I, Violin II, Viola, Cello" — the parts of a piece in one line (an old piece's bare part reads as its name). */
export const instrumentsLine = (c) => (c.parts ?? []).map((p) => p.name || INSTRUMENTS[p.instrument]?.name || "Piano").join(", ");
/** Tags are drawn from scores and compositions alike: one vocabulary across the library. */
const catalogue = () => [...logbook.scores(), ...logbook.compositions()];

/**
 * Open the modal. Resolves with { saved?: composition, created?: composition,
 * deleted?: true } once it closes (empty when dismissed).
 */
export function openCompositionDetails(id = null) {
  const c = id ? logbook.composition(id) : null;
  if (id && !c) { toast("that composition is gone"); return Promise.resolve({ deleted: true }); }
  const composers = suggestComposers(logbook.goals({ status: "all" }), catalogue());
  const allTags = [...new Set(catalogue().flatMap((x) => x.tags ?? []))];
  const sheet = openSheet({
    title: c ? "composition" : "new composition",
    cls: "lb-acct-wrap sc-details-wrap cp-details-wrap",
    html: `
      ${detailsFormHtml({ prefix: "cp-d", item: c ?? { title: "", composer: "", tags: [] }, composers, allTags, save: c ? "save" : "start composing", subtitle: true })}
      ${c ? `
      <ul class="lb-acct-list">
        <li><button type="button" class="lb-acct-row" id="cp-d-instruments">${icon("group")}<span><b>instruments</b><small>${esc(instrumentsLine(c))}</small></span></button></li>
        <li><button type="button" class="lb-acct-row lb-danger" id="cp-d-delete">${icon("trash")}<span><b>delete this composition</b><small>${plural(barsOf(c), "bar")} — gone from this device</small></span></button></li>
      </ul>
      <p class="lb-acct-fine">${plural(barsOf(c), "bar")} · started ${esc(new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))}</p>` : ""}`,
  });
  const { body, close, closed } = sheet;
  let result = {};
  if (!c) { // a new piece: what it is for (docs/COMPOSE_PARTS_DESIGN.md §3) — the piano unless told otherwise; "choose…" opens the Instruments sheet right after
    const titleEl = body.querySelector("#cp-d-title");
    titleEl.insertAdjacentHTML("afterend", `<label class="lb-acct-label" for="cp-d-for">for</label><select class="lb-select" id="cp-d-for">${TEMPLATES.map((t) => `<option value="${t.key}">${esc(t.name)}</option>`).join("")}<option value="choose">choose…</option></select>`);
  }
  const form = wireDetailsForm(body, { prefix: "cp-d", items: catalogue, onSubmit: (v) => {
    try {
      if (c) { result = { saved: logbook.updateComposition(id, v) }; toast("saved"); }
      else { const forKey = body.querySelector("#cp-d-for")?.value ?? "piano"; const fresh = newComposition({ id: uuid(), title: v.title, composer: v.composer, tags: v.tags, parts: templateParts(forKey === "choose" ? "piano" : forKey) }); const sub = String(v.subtitle ?? "").trim().slice(0, 80); if (sub) fresh.subtitle = sub; result = { created: logbook.addComposition(fresh), ...(forKey === "choose" ? { instruments: true } : {}) }; }
      form.clearError(); haptic(); stamp(body.querySelector("#cp-d-save")); close();
    } catch (e) { form.fail(e.message); }
  } });
  form.focus();
  body.querySelector("#cp-d-instruments")?.addEventListener("click", () => { result = { instruments: true }; close(); }); // the editor opens the Instruments sheet (the list ignores it)
  body.querySelector("#cp-d-delete")?.addEventListener("click", () => {
    if (!confirm(`delete “${c.title}”?`)) return;
    logbook.removeComposition(id); haptic(20); toast("deleted"); result = { deleted: true }; close();
  });
  return closed.then(() => result);
}
