// Takes UI (WSHED-75): the recording session, the take row, and compare.
// Shared by the Today screen, the goal page and the Recorder tool. The audio
// stays on this device (js/lib/takes/store.js); a row whose audio is on
// another device is shown greyed.
import { logbook, displayName } from "../../lib/logbook.js";
import { getAudio } from "../../lib/audio.js";
import { icon } from "../../lib/icons.js";
import { takeStore } from "../../lib/takes/store.js";
import { createRecorder, recordingSupported } from "../../lib/takes/recorder.js";
import { player } from "../../lib/takes/player.js";
import { fmtDur } from "../../lib/takes/peaks.js";
import { esc, longPress, relDay, fmtDate, toast } from "./util.js";
import { haptic } from "./motion.js";

takeStore.attach(logbook);

// --- the recording session: one at a time, app-wide, survives re-renders ------
const sess = { rec: null, goalId: null, startedAt: 0, listeners: new Set() };
const emit = () => { for (const fn of sess.listeners) fn(); };
export const recording = {
  /** { goalId, state, elapsedMs, level } or null. */
  current() { return sess.rec ? { goalId: sess.goalId, state: sess.rec.state, elapsedMs: sess.rec.elapsedMs(), level: sess.rec.level } : null; },
  on(fn) { sess.listeners.add(fn); return () => sess.listeners.delete(fn); },
  supported: recordingSupported,
  /** Start recording a take of a goal. Throws if the mic is refused. */
  async start(goalId) {
    if (sess.rec) return;
    if (!recordingSupported()) throw new Error("this browser can't record audio");
    player.stop();
    const rec = createRecorder(getAudio, { onAutoStop: (r) => finish(r, "ten minutes — the take was kept") });
    sess.rec = rec; sess.goalId = goalId; sess.startedAt = Date.now();
    try { await rec.start(); } catch (e) { sess.rec = null; sess.goalId = null; throw new Error(e?.name === "NotAllowedError" ? "the microphone was refused — allow it in the browser's site settings" : "the microphone isn't available"); }
    haptic(14); emit();
  },
  pause() { sess.rec?.pause(); emit(); },
  resume() { sess.rec?.resume(); emit(); },
  /** Stop and keep the take. → the take, or null if it was too short. */
  async stop() { if (!sess.rec) return null; const r = await sess.rec.stop(); return finish(r); },
  cancel() { sess.rec?.cancel(); sess.rec = null; sess.goalId = null; emit(); },
};
async function finish(r, note) {
  const goalId = sess.goalId;
  sess.rec = null; sess.goalId = null;
  if (!r || r.durationMs < 700 || !r.blob.size) { emit(); toast("too short — not kept"); return null; }
  const id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await takeStore.put(id, r.blob, r.mime);   // audio first, so the row is never "on another device" for a moment
  const t = logbook.addTake({ id, goalId, durationMs: r.durationMs, size: r.blob.size, mime: r.mime, peaks: r.peaks });
  haptic([10, 30, 14]);
  if (note) toast(note);
  emit();
  return t;
}

/** The live recording strip: red dot, elapsed, meter, pause / resume, stop. */
export function recordingStrip() {
  const cur = recording.current();
  if (!cur) return "";
  const g = logbook.goal(cur.goalId);
  return `<div class="lb-rec-strip ${cur.state}" id="lb-rec-strip" role="status" aria-live="off">
    <i class="lb-rec-dot" aria-hidden="true"></i>
    <span class="lb-rec-elapsed" id="lb-rec-elapsed">${fmtDur(cur.elapsedMs)}</span>
    <span class="lb-rec-meter" id="lb-rec-meter" aria-hidden="true">${"<i></i>".repeat(7)}</span>
    <span class="lb-rec-goal">${esc(g ? displayName(g) : "")}</span>
    <button type="button" class="lb-rec-pause" id="lb-rec-pause" aria-label="${cur.state === "paused" ? "resume" : "pause"}">${icon(cur.state === "paused" ? "play" : "pause")}</button>
    <button type="button" class="lb-rec-stop" id="lb-rec-stop" aria-label="stop and keep the take">${icon("stop")}<span>keep</span></button>
  </div>`;
}
/** Wire a rendered strip; `onDone(take)` after stop. Returns a cleanup. */
export function wireRecording(root, onDone) {
  const strip = root.querySelector("#lb-rec-strip");
  if (!strip) return () => {};
  const el = strip.querySelector("#lb-rec-elapsed"), bars = [...strip.querySelectorAll("#lb-rec-meter i")];
  const timer = setInterval(() => {
    const cur = recording.current();
    if (!cur) { clearInterval(timer); return; }
    el.textContent = fmtDur(cur.elapsedMs);
    const lit = Math.round(cur.level * bars.length);
    bars.forEach((b, i) => b.classList.toggle("on", i < lit));
  }, 100);
  strip.querySelector("#lb-rec-pause").addEventListener("click", () => {
    const cur = recording.current();
    if (!cur) return;
    if (cur.state === "paused") recording.resume(); else recording.pause();
    strip.classList.toggle("paused", cur.state !== "paused");
    strip.querySelector("#lb-rec-pause").innerHTML = icon(cur.state !== "paused" ? "play" : "pause");
    haptic(6);
  });
  strip.querySelector("#lb-rec-stop").addEventListener("click", async () => { strip.classList.add("stopping"); const t = await recording.stop(); onDone?.(t); });
  return () => clearInterval(timer);
}

// --- the take row -------------------------------------------------------------
const wave = (peaks) => {
  const p = peaks?.length ? peaks : new Array(48).fill(0.08);
  const w = 100 / p.length;
  return `<svg class="lb-wave" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">${p.map((v, i) => { const h = Math.max(1.6, v * 22); return `<rect x="${(i * w + w * 0.15).toFixed(2)}" y="${(12 - h / 2).toFixed(2)}" width="${(w * 0.7).toFixed(2)}" height="${h.toFixed(2)}" rx="0.6"/>`; }).join("")}</svg>`;
};

/**
 * One take as a list item. opts: goal (show the goal's name), when ("time" | "day" | "none"), download.
 */
export function takeRow(t, { goal = false, when = "time", download = false, index = null } = {}) {
  const here = takeStore.has(t.id);
  const g = goal ? logbook.goal(t.goalId) : null;
  const label = index !== null ? `take ${index}` : when === "day" ? relDay(t.recordedAt) : new Date(t.recordedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `<li class="lb-take ${here ? "" : "remote"} ${t.starred ? "starred" : ""}" data-id="${t.id}" title="${here ? "hold to delete" : "recorded on another device — the audio stays where it was made"}">
    <button type="button" class="lb-take-play" aria-label="${here ? "play" : "not on this device"}" ${here ? "" : "disabled"}>${icon(here ? "play" : "cloud")}</button>
    <div class="lb-take-main">
      <div class="lb-take-head"><span class="lb-take-label">${esc(label)}</span>${g ? `<span class="lb-take-goal">${esc(displayName(g))}</span>` : ""}<span class="lb-take-dur"><span class="lb-take-at"></span>${fmtDur(t.durationMs)}</span></div>
      <div class="lb-take-wavewrap" role="slider" aria-label="position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${wave(t.peaks)}<div class="lb-take-fill"></div></div>
      ${here ? "" : `<span class="lb-take-remote">on another device</span>`}
    </div>
    <div class="lb-take-side">
      <button type="button" class="lb-take-star" aria-pressed="${t.starred}" aria-label="${t.starred ? "unstar" : "star — keep this one"}">${icon("star")}</button>
      ${download && here ? `<button type="button" class="lb-take-save" aria-label="save this take to a file">${icon("download")}</button>` : ""}
    </div>
  </li>`;
}

/**
 * Wire every .lb-take in `container`: play/pause, seek on the waveform, star,
 * hold to delete, live progress. Returns a cleanup function.
 */
export function wireTakeRows(container, { onChange = null } = {}) {
  const rows = [...container.querySelectorAll(".lb-take")];
  const paint = (s) => {
    for (const li of rows) {
      const mine = s.id === li.dataset.id;
      li.classList.toggle("playing", mine && s.playing);
      li.classList.toggle("current", mine);
      const btn = li.querySelector(".lb-take-play");
      if (!btn.disabled) btn.innerHTML = icon(mine && s.playing ? "pause" : "play");
      li.querySelector(".lb-take-fill").style.width = mine ? `${(s.frac * 100).toFixed(1)}%` : "0%";
      li.querySelector(".lb-take-wavewrap").setAttribute("aria-valuenow", mine ? Math.round(s.frac * 100) : 0);
      li.querySelector(".lb-take-at").textContent = mine && (s.playing || s.frac > 0) ? `${fmtDur(s.t)} / ` : "";
      li.classList.toggle("cmp-a", s.pair?.a.id === li.dataset.id);
      li.classList.toggle("cmp-b", s.pair?.b.id === li.dataset.id);
    }
  };
  const off = player.on(paint);
  paint(player.snapshot());
  for (const li of rows) {
    const t = () => logbook.take(li.dataset.id);
    li.querySelector(".lb-take-play").addEventListener("click", (e) => { e.stopPropagation(); const take = t(); if (take) player.toggle(take); });
    li.querySelector(".lb-take-wavewrap").addEventListener("click", (e) => { const take = t(); if (!take || !takeStore.has(take.id)) return; const r = e.currentTarget.getBoundingClientRect(); player.seek(take, Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); });
    li.querySelector(".lb-take-star").addEventListener("click", (e) => { e.stopPropagation(); const take = t(); if (!take) return; logbook.starTake(take.id); li.classList.toggle("starred", take.starred); e.currentTarget.setAttribute("aria-pressed", String(take.starred)); haptic(8); onChange?.(); });
    li.querySelector(".lb-take-save")?.addEventListener("click", async (e) => { e.stopPropagation(); const take = t(); const blob = take && await takeStore.get(take.id); if (!blob) return; const a = document.createElement("a"); a.href = URL.createObjectURL(blob); const g = logbook.goal(take.goalId); a.download = `${(g ? displayName(g) : "take").replace(/[^\w\- ]+/g, "").trim()} ${fmtDate(take.recordedAt, { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-")}.${/mp4/.test(take.mime) ? "m4a" : /ogg/.test(take.mime) ? "ogg" : "webm"}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); });
    longPress(li.querySelector(".lb-take-main"), null, () => {
      const take = t(); if (!take) return;
      if (confirm(`Delete this ${fmtDur(take.durationMs)} take? This can't be undone.`)) { if (player.snapshot().id === take.id) player.stop(); logbook.deleteTake(take.id); li.remove(); toast("take deleted"); onChange?.(); }
    });
  }
  return off;
}

// --- compare: A then B, flip -----------------------------------------------------
/**
 * Mount compare on a section: a "compare" toggle in `head`, a bar in `barEl`,
 * and row taps in `listEl` pick A then B while picking. `takesById` resolves ids.
 */
export function mountCompare({ head, barEl, listEl, onState = null }) {
  let mode = "off", a = null, b = null;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "lb-link lb-cmp-btn"; btn.textContent = "compare";
  head.append(btn);
  const draw = () => {
    listEl.classList.toggle("picking", mode === "pick");
    for (const li of listEl.querySelectorAll(".lb-take")) { li.classList.toggle("pick-a", a?.id === li.dataset.id); li.classList.toggle("pick-b", b?.id === li.dataset.id); }
    btn.textContent = mode === "off" ? "compare" : "done";
    btn.setAttribute("aria-pressed", String(mode !== "off"));
    if (mode === "off") { barEl.innerHTML = ""; onState?.(mode); return; }
    const side = (t, l) => t ? `<span class="lb-cmp-side ${l}"><b>${l.toUpperCase()}</b> ${esc(relDay(t.recordedAt))} · ${fmtDur(t.durationMs)}${t.starred ? " ★" : ""}</span>` : `<span class="lb-cmp-side ${l} empty"><b>${l.toUpperCase()}</b> tap a take</span>`;
    barEl.innerHTML = `<div class="lb-cmp-bar">${side(a, "a")}<span class="lb-cmp-vs">then</span>${side(b, "b")}
      <span class="lb-cmp-acts"><button type="button" class="lb-cmp-play" id="lb-cmp-play" ${a && b ? "" : "disabled"}>${icon("play")}<span>A then B</span></button><button type="button" class="lb-cmp-flip" id="lb-cmp-flip" ${a && b ? "" : "disabled"} aria-label="flip to the other take at this spot">${icon("flip")}<span>flip</span></button></span></div>`;
    barEl.querySelector("#lb-cmp-play")?.addEventListener("click", () => { if (a && b) player.compare(a, b); });
    barEl.querySelector("#lb-cmp-flip")?.addEventListener("click", () => { const s = player.snapshot(); if (!s.pair) { if (a && b) player.compare(a, b); } else player.flip(); });
    onState?.(mode);
  };
  btn.addEventListener("click", () => {
    if (mode === "off") { mode = "pick"; const rows = [...listEl.querySelectorAll(".lb-take:not(.remote)")]; a = rows[0] ? logbook.take(rows[0].dataset.id) : null; b = null; }
    else { mode = "off"; a = b = null; player.endCompare(); }
    draw();
  });
  listEl.addEventListener("click", (e) => {
    if (mode !== "pick") return;
    const li = e.target.closest(".lb-take"); if (!li || li.classList.contains("remote") || e.target.closest(".lb-take-star, .lb-take-save")) return;
    e.preventDefault(); e.stopPropagation();
    const t = logbook.take(li.dataset.id); if (!t) return;
    if (!a || (a && b)) { a = t; b = null; } else if (t.id !== a.id) { b = t; }
    haptic(6); draw();
  }, true);
  draw();
  return { get mode() { return mode; }, set(x, y) { a = x; b = y; mode = "pick"; draw(); }, off() { mode = "off"; a = b = null; draw(); } };
}
