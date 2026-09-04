// The two-step goal creation sheet: type → name → create. Shared by the
// library's "+ goal" and the picker's "+ new goal" (docs/LOGBOOK_V2_DESIGN.md §4.2).
import { logbook, TYPES, TYPE_IDS } from "../../lib/logbook.js";
import { esc, openSheet, finePointer } from "./util.js";
import { haptic } from "./motion.js";

/**
 * @param {{ name?: string, type?: string }} opts
 * @returns {Promise<object|null>} the new goal, or null if dismissed
 */
export function openCreate({ name = "", type = "piece" } = {}) {
  let current = TYPES[type] ? type : "piece";
  const sheet = openSheet({
    title: "new goal",
    cls: "lb-create-wrap",
    html: `
      <div class="lb-typechips" role="radiogroup" aria-label="type">
        ${TYPE_IDS.map((t) => `<button type="button" class="lb-typechip ${TYPES[t].cls}" role="radio" data-type="${t}" aria-checked="${t === current}">
          <i class="lb-type ${TYPES[t].cls}" aria-hidden="true">${TYPES[t].glyph}</i>${TYPES[t].label}</button>`).join("")}
      </div>
      <p class="lb-examples" id="lb-create-ex">${esc(TYPES[current].examples)}</p>
      <form class="lb-create-form" id="lb-create-form">
        <input class="lb-input lb-input-lg" id="lb-create-name" placeholder="name" autocomplete="off" autocapitalize="sentences" maxlength="120" value="${esc(name)}">
        <p class="lb-err" id="lb-create-err" role="alert"></p>
        <div class="transport"><button class="start" type="submit">create</button></div>
      </form>`,
  });
  const { body, close, closed } = sheet;
  const chips = [...body.querySelectorAll(".lb-typechip")];
  const ex = body.querySelector("#lb-create-ex");
  const input = body.querySelector("#lb-create-name");
  const err = body.querySelector("#lb-create-err");
  const pick = (t) => {
    current = t;
    for (const c of chips) c.setAttribute("aria-checked", String(c.dataset.type === t));
    ex.textContent = TYPES[t].examples;
  };
  for (const c of chips) c.addEventListener("click", () => { pick(c.dataset.type); input.focus(); });
  let result = null;
  body.querySelector("#lb-create-form").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      result = logbook.addGoal({ name: input.value, type: current });
      haptic();
      close();
    } catch (ex2) { err.textContent = ex2.message; input.focus(); }
  });
  // With a name carried in from the picker the next keystroke must land here
  // (Enter creates). With no name, focus only on desktop — on a phone the
  // keyboard would cover the type chips, and the field is one tap away.
  if (name || finePointer()) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  return closed.then(() => result);
}
