// Bookmarks (docs/SCORES_DESIGN.md §8): a page with a label. The bar button
// is filled when the current page has one; the sheet adds one here, lists
// them all (tap → jump, hold → actions). A bookmark can belong to a goal
// (WSHED-108): that is where the goal lives, so starting practice on it opens
// the score on that page — one book of sonatas, one bookmark per sonata.
// Adding a bookmark while a goal runs offers the link in the same gesture.
import { logbook, displayName } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, toast, openSheet, longPress, finePointer } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";
import { openPicker } from "../logbook/picker.js";

/** Paint the bar button for the current page. */
export function paintMarkButton(btn, scoreId, page) {
  const m = logbook.markAt(scoreId, page);
  btn.classList.toggle("on", !!m);
  btn.setAttribute("aria-label", m ? `bookmarked: ${m.label} — tap for bookmarks` : "bookmarks");
}

const goalOf = (m) => (m.goalId ? logbook.goal(m.goalId) : null);

/** Start the clock on a bookmark's goal, creating one from its label when it has none. */
function practiceMark(m, s) {
  let g = goalOf(m);
  if (!g) { g = logbook.addGoal({ name: m.label, type: "piece", composer: s.composer ?? "" }); logbook.updateMark(m.id, { goalId: g.id }); }
  const run = logbook.running();
  if (run?.goal.id === g.id) { toast(`already practicing ${displayName(g)}`); return g; }
  logbook.start(g.id);
  haptic(12);
  toast(`practicing ${displayName(g)}`);
  return g;
}

/** The bookmarks sheet. Resolves with the page to jump to, or null. */
export function openMarks({ scoreId, page, goTo }) {
  const s = logbook.score(scoreId);
  if (!s) return Promise.resolve(null);
  let jump = null, after = null; // `after`: a picker to open once this sheet has closed
  const sheet = openSheet({ title: "bookmarks", cls: "lb-acct-wrap sc-marks-wrap", html: "" });
  const { body, close, closed } = sheet;
  const row = (m) => { const g = goalOf(m); return `<li><button type="button" class="lb-acct-row ${m.page === page ? "sc-m-here" : ""}" data-id="${m.id}" data-page="${m.page}">${icon("bookmark")}<span><b>${esc(m.label)}</b><small>page ${m.page}${g ? ` · <span class="sc-m-goal">${esc(displayName(g))}</span>` : ""}${m.page === page ? " · you are here" : ""}</small></span></button></li>`; };

  function build() {
    const here = logbook.markAt(scoreId, page);
    const list = logbook.marks(scoreId);
    const run = logbook.running(), runGoal = run?.goal ?? null;
    const runHasMark = runGoal ? logbook.marksForGoal(runGoal.id).length > 0 : false;
    body.innerHTML = `
      ${here
        ? `<ul class="lb-acct-list"><li><button type="button" class="lb-acct-row" id="sc-m-acts-here">${icon("bookmark")}<span><b>${esc(here.label)} · this page</b><small>${goalOf(here) ? `where ${esc(displayName(goalOf(here)))} starts` : "tap for what you can do with it"}</small></span></button></li></ul>`
        : `<form class="sc-m-add" id="sc-m-add" novalidate>
             <div class="sc-m-addrow">
               <input class="lb-input" id="sc-m-label" placeholder="${runGoal && !runHasMark ? esc(displayName(runGoal)) : `page ${page}`}" maxlength="80" autocomplete="off" autocapitalize="sentences" aria-label="bookmark label">
               <button type="submit" class="lb-modal-save" id="sc-m-go">bookmark page ${page}</button>
             </div>
             ${runGoal ? `<label class="sc-m-link"><input type="checkbox" id="sc-m-goal" ${runHasMark ? "" : "checked"}><span><b>this is where ${esc(displayName(runGoal))} starts</b><small>practicing it opens the score on this page${runHasMark ? " (it already has a bookmark; this one takes over)" : ""}</small></span></label>` : ""}
           </form>`}
      ${list.length
        ? `<ul class="lb-acct-list sc-m-list" id="sc-m-list">${list.map(row).join("")}</ul>
           <p class="lb-acct-fine">tap a bookmark to go there · hold for more (link it to a goal, practice, remove)</p>`
        : `<p class="lb-acct-fine">no bookmarks yet. the coda, the tricky bar, where a sonata starts in a big book.</p>`}`;
    body.querySelector("#sc-m-add")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const link = body.querySelector("#sc-m-goal")?.checked && runGoal ? runGoal.id : null;
      const label = body.querySelector("#sc-m-label").value.trim() || (link ? displayName(runGoal) : "");
      try { logbook.addMark({ scoreId, page, label, goalId: link }); haptic(); toast(link ? `bookmarked — ${displayName(runGoal)} starts here` : "bookmarked"); build(); }
      catch (ex) { toast(ex.message); }
    });
    body.querySelector("#sc-m-acts-here")?.addEventListener("click", () => actions(here.id));
    for (const b of body.querySelectorAll("#sc-m-list [data-id]")) {
      longPress(b, () => { jump = Number(b.dataset.page); close(); goTo?.(jump); }, () => { haptic(); actions(b.dataset.id); });
    }
    if (!here && finePointer()) body.querySelector("#sc-m-label")?.focus();
  }

  /** What you can do with one bookmark: go there, link / unlink a goal, practice it, remove it. */
  function actions(id) {
    const m = logbook.doc.marks.find((x) => x.id === id);
    if (!m) return build();
    const g = goalOf(m);
    body.innerHTML = `
      <ul class="lb-acct-list">
        <li><button type="button" class="lb-acct-row" id="sc-ma-go">${icon("bookmark")}<span><b>${esc(m.label)}</b><small>page ${m.page}${m.page === page ? " · you are here" : " · tap to go there"}</small></span></button></li>
      </ul>
      <ul class="lb-acct-list">
        <li><button type="button" class="lb-acct-row" id="sc-ma-link">${icon("log")}<span><b>${g ? esc(displayName(g)) : "link to a goal"}</b><small>${g ? "the goal that starts here — tap to change" : "practicing that goal opens the score on this page"}</small></span></button></li>
        ${g ? `<li><button type="button" class="lb-acct-row" id="sc-ma-unlink">${icon("eraser")}<span><b>unlink from ${esc(displayName(g))}</b><small>the bookmark stays</small></span></button></li>` : ""}
        <li><button type="button" class="lb-acct-row" id="sc-ma-practice">${icon("play")}<span><b>practice this</b><small>${g ? `start the clock on ${esc(displayName(g))}` : `starts the clock on a new piece called ${esc(m.label)}`}</small></span></button></li>
      </ul>
      <ul class="lb-acct-list">
        <li><button type="button" class="lb-acct-row lb-danger" id="sc-ma-remove">${icon("trash")}<span><b>remove the bookmark</b><small>${g ? `${esc(displayName(g))} keeps its history` : "just the bookmark"}</small></span></button></li>
      </ul>
      <p class="lb-acct-fine"><button type="button" class="lb-link" id="sc-ma-back">← all bookmarks</button></p>`;
    body.querySelector("#sc-ma-go").addEventListener("click", () => { if (m.page === page) return build(); jump = m.page; close(); goTo?.(jump); });
    body.querySelector("#sc-ma-back").addEventListener("click", build);
    body.querySelector("#sc-ma-link").addEventListener("click", () => {
      // the picker is its own sheet: hand off after this one has closed, then link
      after = async () => {
        const r = await openPicker({ mode: "mark" });
        if (!r) return;
        logbook.updateMark(m.id, { goalId: r.goal.id });
        toast(`${displayName(r.goal)} starts at ${m.label}`);
      };
      close();
    });
    body.querySelector("#sc-ma-unlink")?.addEventListener("click", () => { logbook.updateMark(m.id, { goalId: null }); haptic(); toast("unlinked"); actions(id); });
    body.querySelector("#sc-ma-practice").addEventListener("click", () => { try { practiceMark(m, s); close(); } catch (ex) { toast(ex.message); } });
    body.querySelector("#sc-ma-remove").addEventListener("click", () => { if (!confirm(`Remove the bookmark “${m.label}”?`)) return; logbook.removeMark(m.id); haptic(20); toast("removed"); build(); });
  }

  build();
  return closed.then(async () => { if (after) await after(); return jump; });
}
