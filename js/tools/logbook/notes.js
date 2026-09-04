// The notes thread — a goal's dated, append-only lines — and the quick-note
// sheet used from the running hero and Today rows (docs/LOGBOOK_V2_DESIGN.md §3.3).
import { logbook } from "../../lib/logbook.js";
import { esc, longPress, relDay, openSheet, finePointer, toast } from "./util.js";
import { slideIn, haptic } from "./motion.js";

const PLACEHOLDER = "add a note — fingering, a spot, what to do next…";

/** A textarea that grows with its text; Enter saves, Shift+Enter is a newline. */
function composer(onSave, { autofocus = false } = {}) {
  const form = document.createElement("form");
  form.className = "lb-composer";
  form.innerHTML = `
    <textarea class="lb-input lb-notebox" rows="1" placeholder="${PLACEHOLDER}" aria-label="new note" maxlength="2000"></textarea>
    <button class="lb-notesave" type="submit" aria-label="save note">save</button>
    <p class="lb-err" role="alert"></p>`;
  const ta = form.querySelector("textarea"), err = form.querySelector(".lb-err");
  const grow = () => { ta.style.height = "auto"; ta.style.height = `${Math.min(220, ta.scrollHeight)}px`; };
  ta.addEventListener("input", grow);
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    try { onSave(ta.value); ta.value = ""; grow(); err.textContent = ""; } catch (ex) { err.textContent = ex.message; }
  });
  if (autofocus) setTimeout(() => ta.focus(), 50);
  return form;
}

function noteItem(n) {
  const li = document.createElement("li");
  li.className = "lb-noteitem";
  li.dataset.id = n.id;
  li.innerHTML = `<span class="lb-noteday">${esc(relDay(n.createdAt))}</span><p class="lb-notebody">${esc(n.body)}</p>`;
  return li;
}

/** Render composer + thread for a goal into `container`. Re-renders itself on save/delete. */
export function renderNotes(container, goalId, { autofocus = false } = {}) {
  container.innerHTML = "";
  const list = document.createElement("ul");
  list.className = "lb-notes";
  const draw = () => {
    list.innerHTML = "";
    const all = logbook.notes(goalId);
    if (!all.length) { list.innerHTML = `<li class="lb-empty lb-dim">no notes yet — the last thing you write here greets you next time you press play.</li>`; return; }
    for (const n of all) {
      const li = noteItem(n);
      longPress(li, null, () => {
        if (confirm("Delete this note?")) { logbook.deleteNote(n.id); draw(); toast("note deleted"); }
      });
      list.append(li);
    }
  };
  const form = composer((body) => {
    logbook.addNote(goalId, body);
    haptic();
    draw();
    slideIn(list.firstElementChild);
  }, { autofocus });
  container.append(form, list);
  draw();
  return { refresh: draw };
}

/** Quick note in a sheet. Resolves with the note or null. */
export function openQuickNote(goalId) {
  const g = logbook.goal(goalId);
  if (!g) return Promise.resolve(null);
  const last = logbook.notes(goalId)[0];
  const sheet = openSheet({
    title: g.name,
    cls: "lb-note-wrap",
    html: last ? `<p class="lb-lastnote"><span class="lb-dim">last note · ${esc(relDay(last.createdAt))}</span><br>${esc(last.body)}</p>` : "",
  });
  let result = null;
  const form = composer((body) => { result = logbook.addNote(goalId, body); haptic(); toast("noted"); sheet.close(); }, { autofocus: true });
  sheet.body.append(form);
  void finePointer;
  return sheet.closed.then(() => result);
}
