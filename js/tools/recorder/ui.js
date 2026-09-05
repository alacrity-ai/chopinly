// Recorder: pick (or inherit) the goal, record a take, listen back; every take
// on this account grouped by goal, newest first, with compare and save-to-file.
import { logbook, TYPES, displayName } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, toast, relDay, sheetOpen } from "../logbook/util.js";
import { openPicker } from "../logbook/picker.js";
import { recording, wireRecording, takeRow, wireTakeRows, mountCompare } from "../logbook/takes.js";
import { fmtDur } from "../../lib/takes/peaks.js";
import { takeStore } from "../../lib/takes/store.js";
import { haptic, stamp } from "../logbook/motion.js";

const PAGE = 20;

export function buildUI(root, { store }) {
  let goalId = store.get("goalId", null), shown = PAGE, cleanups = [], meterTimer = 0;

  const pickGoal = async () => {
    const r = await openPicker({ mode: "take" });
    if (!r) return null;
    goalId = r.goal.id; store.set("goalId", goalId); render(); return goalId;
  };

  function render() {
    for (const c of cleanups) c(); cleanups = []; clearInterval(meterTimer);
    const run = logbook.running();
    const cur = recording.current();
    const g = logbook.goal(cur?.goalId ?? run?.goal.id ?? goalId) ?? null;
    if (g && g.id !== goalId && !cur) { goalId = g.id; store.set("goalId", goalId); }
    const t = g ? (TYPES[g.type] ?? TYPES.other) : null;
    const all = logbook.takes();
    const list = all.slice(0, shown);
    // group consecutive rows by goal
    const groups = [];
    for (const tk of list) { const last = groups[groups.length - 1]; if (last && last.goalId === tk.goalId) last.takes.push(tk); else groups.push({ goalId: tk.goalId, takes: [tk] }); }

    root.innerHTML = `
      <section class="recorder">
        <button type="button" class="rc-goal ${g ? "" : "empty"}" id="rc-goal" ${cur ? "disabled" : ""} aria-label="${g ? "take of " + esc(displayName(g)) + " — tap to change" : "choose what this is a take of"}">
          ${g ? `<i class="lb-type ${t.cls}" aria-hidden="true">${t.glyph}</i><span>${esc(displayName(g))}</span>${run?.goal.id === g.id ? `<span class="lb-auto">practicing</span>` : ""}` : `<span>what is this a take of?</span>`}
          <span class="rc-goal-chev" aria-hidden="true">&#9662;</span>
        </button>
        <div class="rc-stage ${cur ? cur.state : "idle"}">
          <div class="rc-meter" id="rc-meter" aria-hidden="true">${"<i></i>".repeat(12)}</div>
          <div class="rc-elapsed" id="rc-elapsed">${cur ? fmtDur(cur.elapsedMs) : "0:00"}</div>
          <div class="rc-state" id="rc-state">${cur ? (cur.state === "paused" ? "paused" : "recording") : g ? "tap to record a take" : "choose a goal, then record"}</div>
        </div>
        <div class="transport rc-transport">
          ${cur ? `<button type="button" class="tap rc-pause" id="rc-pause">${icon(cur.state === "paused" ? "play" : "pause")}<span>${cur.state === "paused" ? "resume" : "pause"}</span></button>` : ""}
          <button type="button" class="rc-rec ${cur ? "on" : ""}" id="rc-rec" aria-label="${cur ? "stop and keep the take" : "record"}" ${!g && !cur ? "disabled" : ""}>${cur ? icon("stop") : `<i class="rc-rec-dot"></i>`}</button>
          ${cur ? `<button type="button" class="tap rc-cancel" id="rc-cancel">discard</button>` : ""}
        </div>
        <div class="lb-sect rc-sect" id="rc-sect">takes${all.length ? `<span class="lb-sect-sub">${all.length}</span>` : ""}</div>
        <div id="rc-cmp"></div>
        ${all.length ? `<ul class="lb-takes rc-takes" id="rc-takes">${groups.map((gr) => { const gg = logbook.goal(gr.goalId); return `<li class="rc-group"><div class="rc-group-h">${gg ? `<i class="lb-type ${(TYPES[gg.type] ?? TYPES.other).cls}" aria-hidden="true">${(TYPES[gg.type] ?? TYPES.other).glyph}</i>${esc(displayName(gg))}` : "—"}</div><ul class="lb-takes">${gr.takes.map((tk) => takeRow(tk, { when: "day", download: true })).join("")}</ul></li>`; }).join("")}</ul>
          ${all.length > shown ? `<div class="lb-foot"><button class="lb-link" id="rc-more">show ${Math.min(PAGE, all.length - shown)} more</button></div>` : ""}`
          : `<p class="lb-empty lb-dim">no takes yet. record a passage, then record it again next week and compare.</p>`}
      </section>`;

    root.querySelector("#rc-goal").addEventListener("click", pickGoal);
    root.querySelector("#rc-more")?.addEventListener("click", () => { shown += PAGE; render(); });
    const rec = root.querySelector("#rc-rec");
    rec.addEventListener("click", async () => {
      if (recording.current()) { rec.disabled = true; const tk = await recording.stop(); render(); if (tk) stamp(root.querySelector(`.lb-take[data-id="${tk.id}"]`)); return; }
      const id = g?.id ?? await pickGoal();
      if (!id) return;
      try { await recording.start(id); render(); } catch (e) { toast(e.message); }
    });
    root.querySelector("#rc-pause")?.addEventListener("click", () => { const c = recording.current(); if (!c) return; if (c.state === "paused") recording.resume(); else recording.pause(); render(); });
    root.querySelector("#rc-cancel")?.addEventListener("click", () => { if (confirm("Discard this recording?")) { recording.cancel(); render(); } });
    if (cur) {
      const el = root.querySelector("#rc-elapsed"), bars = [...root.querySelectorAll("#rc-meter i")];
      meterTimer = setInterval(() => { const c = recording.current(); if (!c) { clearInterval(meterTimer); render(); return; } el.textContent = fmtDur(c.elapsedMs); const lit = Math.round(c.level * bars.length); bars.forEach((b, i) => b.classList.toggle("on", i < lit)); }, 100);
    }
    const listEl = root.querySelector("#rc-takes");
    if (listEl) {
      cleanups.push(wireTakeRows(listEl, { onChange: () => {} }));
      mountCompare({ head: root.querySelector("#rc-sect"), barEl: root.querySelector("#rc-cmp"), listEl });
    }
  }

  const offLb = logbook.on(() => { if (!sheetOpen()) render(); });
  const offStore = takeStore.on(() => render()); // a purge from the account sheet must grey the rows under it
  const offRec = recording.on(() => render());
  render();
  return { destroy() { for (const c of cleanups) c(); clearInterval(meterTimer); offLb(); offStore(); offRec(); } };
}
