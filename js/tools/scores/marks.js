// Bookmarks (docs/SCORES_DESIGN.md §8): a page with a label. The bar button
// is filled when the current page has one; the sheet adds one here, lists
// them all (tap → jump, hold → remove).
import { logbook } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, toast, openSheet, longPress, finePointer } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";

/** Paint the bar button for the current page. */
export function paintMarkButton(btn, scoreId, page) {
  const m = logbook.markAt(scoreId, page);
  btn.classList.toggle("on", !!m);
  btn.setAttribute("aria-label", m ? `bookmarked: ${m.label} — tap for bookmarks` : "bookmarks");
}

/** The bookmarks sheet. Resolves with the page to jump to, or null. */
export function openMarks({ scoreId, page, goTo }) {
  const s = logbook.score(scoreId);
  if (!s) return Promise.resolve(null);
  let jump = null;
  const sheet = openSheet({ title: "bookmarks", cls: "lb-acct-wrap sc-marks-wrap", html: "" });
  const { body, close, closed } = sheet;
  function build() {
    const here = logbook.markAt(scoreId, page);
    const list = logbook.marks(scoreId);
    body.innerHTML = `
      ${here
        ? `<ul class="lb-acct-list"><li><button type="button" class="lb-acct-row lb-danger" id="sc-m-remove">${icon("bookmark")}<span><b>remove the bookmark on page ${page}</b><small>${esc(here.label)}</small></span></button></li></ul>`
        : `<form class="sc-m-add" id="sc-m-add" novalidate>
             <input class="lb-input" id="sc-m-label" placeholder="page ${page}" maxlength="80" autocomplete="off" autocapitalize="sentences" aria-label="bookmark label">
             <button type="submit" class="lb-modal-save" id="sc-m-go">bookmark page ${page}</button>
           </form>`}
      ${list.length
        ? `<ul class="lb-acct-list sc-m-list" id="sc-m-list">${list.map((m) => `<li><button type="button" class="lb-acct-row ${m.page === page ? "sc-m-here" : ""}" data-id="${m.id}" data-page="${m.page}">${icon("bookmark")}<span><b>${esc(m.label)}</b><small>page ${m.page}${m.page === page ? " · you are here" : ""}</small></span></button></li>`).join("")}</ul>
           <p class="lb-acct-fine">tap a bookmark to go there · hold to remove</p>`
        : `<p class="lb-acct-fine">no bookmarks yet. the coda, the tricky bar, where you stopped last time.</p>`}`;
    body.querySelector("#sc-m-add")?.addEventListener("submit", (e) => {
      e.preventDefault();
      try { logbook.addMark({ scoreId, page, label: body.querySelector("#sc-m-label").value }); haptic(); toast("bookmarked"); build(); }
      catch (ex) { toast(ex.message); }
    });
    body.querySelector("#sc-m-remove")?.addEventListener("click", () => { logbook.removeMark(here.id); haptic(); toast("removed"); build(); });
    for (const b of body.querySelectorAll("#sc-m-list [data-id]")) {
      longPress(b, () => { jump = Number(b.dataset.page); close(); goTo?.(jump); }, () => {
        const m = logbook.doc.marks.find((x) => x.id === b.dataset.id);
        if (m && confirm(`Remove the bookmark “${m.label}”?`)) { logbook.removeMark(m.id); haptic(20); build(); }
      });
    }
    if (!here && finePointer()) body.querySelector("#sc-m-label")?.focus();
  }
  build();
  return closed.then(() => jump);
}
