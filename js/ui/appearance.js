// The appearance sheet (WSHED-71): one row per skin with a live swatch;
// tapping a row re-skins the app on the spot.
import { openSheet, esc } from "../tools/logbook/util.js";
import { haptic } from "../tools/logbook/motion.js";
import { icon } from "../lib/icons.js";
import { SKINS, currentSkin, setSkin } from "../lib/skins.js";

export function openAppearance() {
  const now = currentSkin();
  const { body, closed } = openSheet({
    title: "appearance",
    cls: "lb-skins-wrap",
    html: `
      <ul class="lb-skins" role="radiogroup" aria-label="appearance">
        ${SKINS.map((s) => `<li><button type="button" class="lb-skin" role="radio" data-skin="${s.id}" aria-checked="${s.id === now}">
          <i class="lb-swatch skin-${s.id}" aria-hidden="true"><i></i></i>
          <span><b>${esc(s.name)}</b><small>${esc(s.blurb)}</small></span>
          <span class="lb-skin-check">${icon("check")}</span>
        </button></li>`).join("")}
      </ul>
      <p class="lb-acct-fine">Saved on this device only.</p>`,
  });
  const rows = [...body.querySelectorAll(".lb-skin")];
  for (const row of rows) row.addEventListener("click", () => {
    const id = setSkin(row.dataset.skin);
    for (const r of rows) r.setAttribute("aria-checked", String(r.dataset.skin === id));
    haptic(10);
  });
  return closed;
}
