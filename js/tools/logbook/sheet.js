// The log sheet — the whole product. One card: goal (picker if not given),
// tempo stepper, spot chips (tap = worked on, long-press = fixed), note,
// next time, save. Fastest path is log → save.
import { logbook } from "../../lib/logbook.js";
import { esc, longPress } from "./util.js";

/**
 * @param {HTMLElement} root
 * @param {{goalId?: string|null, bpm?: number|null, onDone: () => void, onCancel: () => void}} opts
 */
export function renderSheet(root, { goalId = null, bpm = null, onDone, onCancel }) {
  const active = logbook.goals("active").filter((g) => g.kind === "user");
  let goal = goalId ? logbook.goal(goalId) : active.length === 1 ? active[0] : null;
  const worked = new Set();
  let tempo = Number.isFinite(Number(bpm)) && bpm !== null && bpm !== "" ? Number(bpm) : goal ? logbook.lastBpm(goal.id) : null;
  const pickerNeeded = !goalId && active.length !== 1;

  const draw = () => {
    root.innerHTML = `
      <section class="logbook lb-sheet">
        <div class="ss-head">
          <button class="tap lb-back" id="lb-cancel" aria-label="back">&larr;</button>
          <div class="ss-head-title">log</div>
          <span></span>
        </div>
        ${pickerNeeded ? `
          <label class="lb-field">
            <span class="lb-label">goal</span>
            <select id="lb-goal" class="lb-select" aria-label="goal">
              <option value="" ${goal ? "" : "selected"} disabled>choose a goal…</option>
              ${active.map((g) => `<option value="${g.id}" ${goal?.id === g.id ? "selected" : ""}>${esc(g.title)}</option>`).join("")}
            </select>
          </label>` : `<h2 class="lb-sheet-title">${esc(goal?.title ?? "")}</h2>`}
        <div class="lb-field">
          <span class="lb-label">tempo</span>
          <div class="lb-stepper">
            <button class="nudge" id="lb-minus" aria-label="slower by one, hold for five">&minus;</button>
            <input class="lb-bpm" id="lb-bpm" inputmode="numeric" pattern="[0-9]*" placeholder="—"
                   value="${tempo ?? ""}" aria-label="tempo in beats per minute">
            <button class="nudge" id="lb-plus" aria-label="faster by one, hold for five">+</button>
          </div>
        </div>
        ${goal && goal.spots.some((s) => !s.fixedAt) ? `
          <div class="lb-field lb-field-col">
            <span class="lb-label">spots worked <span class="lb-hint">tap = worked · hold = fixed</span></span>
            <div class="lb-chips" id="lb-spots">
              ${goal.spots.filter((s) => !s.fixedAt).map((s) =>
                `<button class="lb-chip ${worked.has(s.id) ? "on" : ""}" data-id="${s.id}" aria-pressed="${worked.has(s.id)}">${esc(s.text)}</button>`).join("")}
            </div>
          </div>` : ""}
        <label class="lb-field lb-field-col">
          <span class="lb-label">note</span>
          <input class="lb-input" id="lb-note" placeholder="optional, one line" autocomplete="off">
        </label>
        <label class="lb-field lb-field-col">
          <span class="lb-label">next time</span>
          <input class="lb-input" id="lb-next" placeholder="${esc(goal?.next ?? "what to do next session")}" autocomplete="off">
        </label>
        <div class="transport">
          <button class="start" id="lb-save" ${goal ? "" : "disabled"}>save</button>
        </div>
        <p class="tuner-status" id="lb-err" role="alert"></p>
      </section>`;

    const $ = (id) => root.querySelector(`#${id}`);
    $("lb-cancel").addEventListener("click", onCancel);
    const bpmEl = $("lb-bpm");
    const step = (d) => {
      const v = Number(bpmEl.value) || (goal ? logbook.lastBpm(goal.id) : null) || 96;
      bpmEl.value = Math.min(300, Math.max(20, v + d));
    };
    longPress($("lb-minus"), () => step(-1), () => step(-5));
    longPress($("lb-plus"), () => step(1), () => step(5));
    const sel = $("lb-goal");
    if (sel) sel.addEventListener("change", () => {
      goal = logbook.goal(sel.value);
      worked.clear();
      tempo = Number(bpmEl.value) || logbook.lastBpm(goal.id);
      draw();
    });
    const chips = $("lb-spots");
    if (chips) for (const chip of chips.querySelectorAll(".lb-chip")) {
      longPress(chip,
        () => { const id = chip.dataset.id; worked.has(id) ? worked.delete(id) : worked.add(id); chip.classList.toggle("on", worked.has(id)); chip.setAttribute("aria-pressed", String(worked.has(id))); },
        () => { logbook.fixSpot(goal.id, chip.dataset.id); worked.add(chip.dataset.id); toast(root, `fixed — ${chip.textContent}`); goal = logbook.goal(goal.id); tempo = Number(bpmEl.value) || null; draw(); });
    }
    $("lb-save").addEventListener("click", () => {
      try {
        logbook.addEntry({
          goalId: goal.id,
          bpm: bpmEl.value === "" ? null : Number(bpmEl.value),
          spotIds: [...worked],
          note: $("lb-note").value,
          ...($("lb-next").value.trim() ? { next: $("lb-next").value } : {}),
        });
        onDone();
      } catch (err) {
        $("lb-err").textContent = err.message;
      }
    });
    root.querySelector(".lb-sheet").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); $("lb-save").click(); }
    });
  };
  draw();
}

export function toast(root, text) {
  let t = root.querySelector(".lb-toast");
  if (!t) { t = document.createElement("div"); t.className = "lb-toast"; t.setAttribute("role", "status"); root.append(t); }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 1600);
}
