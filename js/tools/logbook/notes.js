// Notes — a goal's dated, append-only lines. Writing one always happens in a
// dedicated modal (a few lines of textarea, cancel + save) opened from the
// goal page's "add a note" button, the running hero's "+ note", or a
// long-press on a Today row (docs/LOGBOOK_V2_DESIGN.md §3.3, WSHED-42).
import { logbook } from "../../lib/logbook.js";
import { esc, longPress, relDay, openSheet, toast } from "./util.js";
import { slideIn, stamp, haptic } from "./motion.js";

const PLACEHOLDER = "fingering, a trouble spot, a tempo, what to do next time…";

function noteItem(n) {
  const li = document.createElement("li");
  li.className = "lb-noteitem";
  li.dataset.id = n.id;
  li.innerHTML = `<span class="lb-noteday">${esc(relDay(n.createdAt))}</span><p class="lb-notebody">${esc(n.body)}</p>`;
  return li;
}

/** "add a note" button + the thread. Re-renders itself on save/delete. */
export function renderNotes(container, goalId) {
  container.innerHTML = "";
  const btn = document.createElement("button");
  btn.className = "lb-addnote";
  btn.type = "button";
  btn.innerHTML = `<span class="lb-addnote-glyph" aria-hidden="true">✎</span><span>add a note</span>`;
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
  btn.addEventListener("click", async () => {
    haptic();
    const n = await openQuickNote(goalId);
    if (!n) return;
    draw();
    const first = list.firstElementChild;
    slideIn(first); stamp(first);
  });
  container.append(btn, list);
  draw();
  return { refresh: draw };
}

/** The note modal. Resolves with the saved note, or null on cancel. */
export function openQuickNote(goalId) {
  const g = logbook.goal(goalId);
  if (!g) return Promise.resolve(null);
  const last = logbook.notes(goalId)[0];
  const sheet = openSheet({
    title: g.name,
    cls: "lb-note-wrap",
    html: `
      ${last ? `<p class="lb-lastnote"><span class="lb-dim">last note · ${esc(relDay(last.createdAt))}</span><br>${esc(last.body)}</p>` : ""}
      <form class="lb-notemodal" id="lb-notemodal">
        <textarea class="lb-input lb-notearea" id="lb-notearea" rows="4" placeholder="${PLACEHOLDER}" aria-label="note" maxlength="2000"></textarea>
        <p class="lb-err" id="lb-note-err" role="alert"></p>
        <div class="lb-modal-acts">
          <button type="button" class="lb-modal-cancel" id="lb-note-cancel">cancel</button>
          <button type="submit" class="lb-modal-save" id="lb-note-save">save</button>
        </div>
      </form>`,
  });
  const { body, close, closed } = sheet;
  const ta = body.querySelector("#lb-notearea"), err = body.querySelector("#lb-note-err");
  let result = null;
  const grow = () => { ta.style.height = "auto"; ta.style.height = `${Math.min(320, Math.max(ta.scrollHeight, 96))}px`; };
  ta.addEventListener("input", grow);
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); body.querySelector("#lb-notemodal").requestSubmit(); } });
  body.querySelector("#lb-note-cancel").addEventListener("click", close);
  body.querySelector("#lb-notemodal").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      result = logbook.addNote(goalId, ta.value);
      haptic(18);
      body.querySelector("#lb-note-save").classList.add("lb-saved");
      toast("noted");
      setTimeout(close, 120);
    } catch (ex) { err.textContent = ex.message; ta.focus(); }
  });
  setTimeout(() => ta.focus(), 60);
  return closed.then(() => result);
}
