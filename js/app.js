// Shell: navbar with a tool dropdown (rendered from the registry), hash
// routing (#/<tool-id>), screen wake-lock, service-worker registration.
import { TOOLS, GROUPS, DEFAULT_TOOL } from "./registry.js";
import { getAudio } from "./lib/audio.js";
import { makeStore } from "./lib/store.js";
import { logbook } from "./lib/logbook.js";
import { sync } from "./lib/sync.js";
import { openAccount, renderAccountButton } from "./ui/account.js";
import { icon } from "./lib/icons.js";
import { initSkin } from "./lib/skins.js";
import { clock } from "./lib/clock.js";

// WSHED-111: lock zoom. iOS ignores user-scalable in Safari proper but honours it in the home-screen app;
// the gesture events cover pinch in both, and touch-action: manipulation (app.css) covers double-tap.
for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1 || (e.scale !== undefined && e.scale !== 1)) e.preventDefault(); }, { passive: false });
// WSHED-112: no context menus outside text fields — a long press is a gesture in this app.
const editable = (t) => !!t?.closest?.("input, textarea, [contenteditable]");
document.addEventListener("contextmenu", (e) => { if (!editable(e.target)) e.preventDefault(); });
document.addEventListener("selectstart", (e) => { if (!editable(e.target)) e.preventDefault(); });
initSkin(); // WSHED-71: the inline head script already set data-skin; this syncs theme-color

const root = document.getElementById("tool-root");
const picker = document.getElementById("tool-picker");
const shellStore = makeStore("shell");

// The landing lives at / and forwards installed/returning visitors here (WSHED-95);
// `seen` is what it checks, so every app load sets it.
shellStore.set("seen", true);


let active = null;
let wakeLock = null;
let running = false;
const runningKeys = new Set(); // who wants the screen awake: the mounted tool, the metronome clock (WSHED-110)

async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null; // denied (battery saver etc.) — not fatal
  }
}

function setRunning(isRunning, key = "tool") {
  if (isRunning) runningKeys.add(key); else runningKeys.delete(key);
  running = runningKeys.size > 0;
  if (running) { if (!wakeLock) acquireWakeLock(); }
  else if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
clock.on((r) => setRunning(r, "metronome"));

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && running) acquireWakeLock();
});

// --- tool picker: button + menu, top right --------------------------------
const pickerBtn = document.createElement("button");
pickerBtn.className = "picker-btn";
pickerBtn.setAttribute("aria-haspopup", "menu");
pickerBtn.setAttribute("aria-expanded", "false");

const pickerMenu = document.createElement("div");
pickerMenu.className = "picker-menu";
pickerMenu.setAttribute("role", "menu");
pickerMenu.hidden = true;

picker.append(pickerBtn, pickerMenu);

let lastCategory = null;
const flyouts = new Map(); // group id → { item, panel } (WSHED-160)
const toolItem = (tool) => {
  const item = document.createElement("button");
  item.className = "picker-item";
  item.setAttribute("role", "menuitemradio");
  item.dataset.tool = tool.id;
  item.innerHTML = `<span class="picker-glyph" aria-hidden="true">${tool.glyph}</span>${tool.name}`;
  item.addEventListener("click", () => { closeMenu(); mount(tool); });
  return item;
};
for (const tool of TOOLS) {
  const category = tool.category ?? "tools";
  if (lastCategory !== null && category !== lastCategory) {
    const rule = document.createElement("div");
    rule.className = "picker-rule";
    rule.setAttribute("role", "separator");
    pickerMenu.append(rule);
  }
  lastCategory = category;
  if (!tool.group) { pickerMenu.append(toolItem(tool)); continue; }
  // a grouped tool lives in its group's flyout; the group gets the one line in the menu
  if (!flyouts.has(tool.group)) {
    const g = GROUPS[tool.group];
    const item = document.createElement("button");
    item.className = "picker-item picker-group";
    item.setAttribute("role", "menuitem");
    item.setAttribute("aria-haspopup", "menu");
    item.setAttribute("aria-expanded", "false");
    item.dataset.group = g.id;
    item.innerHTML = `<span class="picker-glyph" aria-hidden="true">${g.glyph}</span>${g.name}<span class="picker-more" aria-hidden="true">${icon("next")}</span>`;
    const panel = document.createElement("div");
    panel.className = "picker-flyout";
    panel.setAttribute("role", "menu");
    panel.setAttribute("aria-label", g.name);
    panel.dataset.group = g.id;
    panel.hidden = true;
    panel.innerHTML = `<button class="picker-back" type="button">${icon("back")}<span>${g.name}</span></button>`;
    panel.querySelector(".picker-back").addEventListener("click", () => { closeFlyout(); item.focus(); });
    // a click on a flyout the mouse already opened keeps it; otherwise a click toggles
    item.addEventListener("click", (e) => { if (panel.hidden) openFlyout(g.id, { focusFirst: e.detail === 0 }); else if (panel.dataset.by === "hover") panel.dataset.by = "click"; else closeFlyout(); });
    item.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") openFlyout(g.id, { hover: true }); });
    pickerMenu.append(item);
    picker.append(panel);
    flyouts.set(g.id, { item, panel });
  }
  flyouts.get(tool.group).panel.append(toolItem(tool));
}
// hovering any plain item with a mouse puts a flyout away
pickerMenu.addEventListener("pointerover", (e) => { if (e.pointerType === "mouse" && e.target.closest(".picker-item:not(.picker-group)")) closeFlyout(); });

/** Beside the menu when there's room; on a narrow phone it covers the menu, with a back row.
 *  Hover only ever opens it beside — covering the menu under a moving mouse would pull the item away from the click. */
function openFlyout(id, { focusFirst = false, hover = false } = {}) {
  const { item, panel } = flyouts.get(id);
  if (!panel.hidden && hover) return;
  closeFlyout();
  panel.hidden = false;
  panel.classList.remove("over");
  const pr = picker.getBoundingClientRect(), mr = pickerMenu.getBoundingClientRect(), ir = item.getBoundingClientRect();
  const w = panel.offsetWidth;
  const beside = mr.left - 6 - w >= 8;
  if (!beside && hover) { panel.hidden = true; return; }
  panel.dataset.by = hover ? "hover" : "click";
  if (beside) {
    panel.style.top = `${ir.top - pr.top - 5}px`;
    panel.style.right = `${pr.right - mr.left + 6}px`;
    panel.style.minWidth = "";
  } else {
    panel.classList.add("over");
    panel.style.top = `${mr.top - pr.top}px`;
    panel.style.right = `${pr.right - mr.right}px`;
    panel.style.minWidth = `${mr.width}px`;
    pickerMenu.classList.add("behind");
  }
  item.setAttribute("aria-expanded", "true");
  if (focusFirst || panel.classList.contains("over")) panel.querySelector(".picker-item")?.focus({ preventScroll: true });
}
function closeFlyout() {
  for (const { item, panel } of flyouts.values()) { panel.hidden = true; item.setAttribute("aria-expanded", "false"); }
  pickerMenu.classList.remove("behind");
}

function openMenu() { pickerMenu.hidden = false; pickerBtn.setAttribute("aria-expanded", "true"); }
function closeMenu() { closeFlyout(); pickerMenu.hidden = true; pickerBtn.setAttribute("aria-expanded", "false"); }
pickerBtn.addEventListener("click", () => (pickerMenu.hidden ? openMenu() : closeMenu()));
document.addEventListener("click", (e) => { if (!picker.contains(e.target)) closeMenu(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = [...flyouts.values()].find((f) => !f.panel.hidden);
  if (open) { closeFlyout(); open.item.focus(); } else closeMenu(); // Escape peels the flyout first
});

// --- mounting + routing ----------------------------------------------------
function mount(tool) {
  if (active === tool) { syncHash(tool); return; }
  if (active) { active.unmount(); root.replaceChildren(); }
  active = tool;
  shellStore.set("activeTool", tool.id);
  syncHash(tool);
  pickerBtn.innerHTML =
    `<span class="picker-glyph" aria-hidden="true">${tool.glyph}</span><span class="picker-name">${tool.short ?? tool.name}</span>` +
    `<span class="chevron" aria-hidden="true">&#9662;</span>`;
  for (const item of picker.querySelectorAll(".picker-item[data-tool]")) {
    item.setAttribute("aria-checked", String(item.dataset.tool === tool.id));
  }
  for (const [id, { item }] of flyouts) item.classList.toggle("current", tool.group === id);
  tool.mount(root, { getAudio, store: makeStore(tool.id), setRunning });
  syncMetroChip();
}

function syncHash(tool) {
  // Tools may own sub-paths (#/sightsinging/campaign) — only rewrite the hash
  // when it isn't already somewhere inside this tool.
  if (!hashPath().startsWith(`#/${tool.id}`)) history.replaceState(null, "", `#/${tool.id}`);
}

// --- metronome pill: the click keeps going across tools; this says so (WSHED-110) ---
const metroChip = document.createElement("span");
metroChip.className = "metro-chip";
metroChip.hidden = true;
metroChip.innerHTML = `<a class="metro-chip-go" href="#/metronome" aria-label="metronome playing — open it"><span class="metro-chip-beat" aria-hidden="true">♩</span><span class="metro-chip-bpm"></span></a><button type="button" class="metro-chip-stop" aria-label="stop the metronome">${icon("stop")}</button>`;
picker.before(metroChip);
metroChip.querySelector(".metro-chip-stop").addEventListener("click", () => clock.stop());
let metroRaf = 0, metroBeat = -1;
function metroFrame() {
  const p = clock.pointer();
  const beat = p.running ? p.beat : -1;
  if (beat !== metroBeat) { metroBeat = beat; metroChip.classList.toggle("on-beat", beat >= 0 && p.phase < 0.25); metroChip.classList.toggle("downbeat", beat === 0); }
  else metroChip.classList.toggle("on-beat", p.running && p.phase < 0.25);
  metroRaf = requestAnimationFrame(metroFrame);
}
function syncMetroChip() {
  const show = clock.running && active?.id !== "metronome";
  metroChip.hidden = !show;
  metroChip.querySelector(".metro-chip-bpm").textContent = String(clock.settings.bpm);
  cancelAnimationFrame(metroRaf);
  if (show) metroRaf = requestAnimationFrame(metroFrame);
}
clock.on(syncMetroChip);
clock.onTempo(syncMetroChip);

// --- session chip: the Logbook's clock, visible on every tool ---------------
const chip = document.createElement("a");
chip.className = "session-chip";
chip.href = "#/logbook";
chip.hidden = true;
chip.setAttribute("aria-label", "practicing — open the logbook");
chip.innerHTML = `<span class="session-dot" aria-hidden="true"></span><span class="session-time">0:00</span><span class="session-goal"></span>`;
picker.before(chip);
let chipTimer = 0;
function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function syncChip() {
  clearInterval(chipTimer);
  const r = logbook.running();
  chip.hidden = !r;
  if (!r) return;
  const time = chip.querySelector(".session-time");
  const dot = chip.querySelector(".session-dot");
  dot.className = `session-dot t-${r.goal?.type ?? "piece"}`;
  chip.querySelector(".session-goal").textContent = r.goal?.name ?? "";
  chip.title = r.goal?.name ?? "";
  const tick = () => { time.textContent = fmtElapsed(Date.now() - r.segment.startedAt); };
  tick();
  chipTimer = setInterval(tick, 1000);
}
logbook.on(syncChip);
syncChip();

// `#/metronome?bpm=96` carries a query; match on the
// path part only.
const hashPath = () => location.hash.split("?")[0];
const fromHash = () =>
  TOOLS.find((t) => hashPath() === `#/${t.id}` || hashPath().startsWith(`#/${t.id}/`));
window.addEventListener("hashchange", () => {
  const tool = fromHash();
  if (tool) mount(tool);
});

mount(
  fromHash()
    ?? TOOLS.find((t) => t.id === shellStore.get("activeTool", DEFAULT_TOOL.id))
    ?? DEFAULT_TOOL
);

// Accounts (WSHED-52/53): the navbar button mirrors the sync state; the
// session is confirmed in the background and never blocks the shell.
const accountBtn = document.getElementById("account-btn");
accountBtn.querySelector(".account-glyph").innerHTML = icon("user");
const paintAccount = () => renderAccountButton(accountBtn, sync.snapshot());
sync.on(paintAccount);
logbook.on(paintAccount);
paintAccount();
accountBtn.addEventListener("click", () => openAccount());
sync.start();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
  // A new worker took over (a deploy): pick up the new modules by reloading —
  // now if nothing is running, otherwise the next time the app is idle and
  // visible. Only for pages that already had a worker (never on first install).
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type !== "sw-updated" || !hadController) return;
    const idle = () => !logbook.running() && !document.querySelector(".lb-sheet-wrap, .lb-ceremony") && document.visibilityState === "visible";
    if (idle()) { location.reload(); return; }
    const t = setInterval(() => { if (idle()) { clearInterval(t); location.reload(); } }, 5000);
  });
}
