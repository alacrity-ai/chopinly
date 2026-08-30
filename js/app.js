// Shell: navbar with a tool dropdown (rendered from the registry), hash
// routing (#/<tool-id>), screen wake-lock, service-worker registration.
import { TOOLS } from "./registry.js";
import { getAudio } from "./lib/audio.js";
import { makeStore } from "./lib/store.js";
import { logbook } from "./lib/logbook.js";

const root = document.getElementById("tool-root");
const picker = document.getElementById("tool-picker");
const shellStore = makeStore("shell");

let active = null;
let wakeLock = null;
let running = false;

async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null; // denied (battery saver etc.) — not fatal
  }
}

function setRunning(isRunning) {
  running = isRunning;
  if (running) acquireWakeLock();
  else if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

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
for (const tool of TOOLS) {
  const category = tool.category ?? "tools";
  if (lastCategory !== null && category !== lastCategory) {
    const rule = document.createElement("div");
    rule.className = "picker-rule";
    rule.setAttribute("role", "separator");
    pickerMenu.append(rule);
  }
  lastCategory = category;
  const item = document.createElement("button");
  item.className = "picker-item";
  item.setAttribute("role", "menuitemradio");
  item.dataset.tool = tool.id;
  item.innerHTML = `<span class="picker-glyph" aria-hidden="true">${tool.glyph}</span>${tool.name}`;
  item.addEventListener("click", () => { closeMenu(); mount(tool); });
  pickerMenu.append(item);
}

function openMenu() { pickerMenu.hidden = false; pickerBtn.setAttribute("aria-expanded", "true"); }
function closeMenu() { pickerMenu.hidden = true; pickerBtn.setAttribute("aria-expanded", "false"); }
pickerBtn.addEventListener("click", () => (pickerMenu.hidden ? openMenu() : closeMenu()));
document.addEventListener("click", (e) => { if (!picker.contains(e.target)) closeMenu(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

// --- mounting + routing ----------------------------------------------------
function mount(tool) {
  if (active === tool) { syncHash(tool); return; }
  if (active) { active.unmount(); root.replaceChildren(); }
  active = tool;
  shellStore.set("activeTool", tool.id);
  syncHash(tool);
  pickerBtn.innerHTML =
    `<span class="picker-glyph" aria-hidden="true">${tool.glyph}</span>${tool.name}` +
    `<span class="chevron" aria-hidden="true">&#9662;</span>`;
  for (const item of pickerMenu.children) {
    item.setAttribute("aria-checked", String(item.dataset.tool === tool.id));
  }
  tool.mount(root, { getAudio, store: makeStore(tool.id), setRunning });
}

function syncHash(tool) {
  // Tools may own sub-paths (#/sightsinging/campaign) — only rewrite the hash
  // when it isn't already somewhere inside this tool.
  if (!hashPath().startsWith(`#/${tool.id}`)) history.replaceState(null, "", `#/${tool.id}`);
}

// --- session chip: the Logbook's clock, visible on every tool ---------------
const chip = document.createElement("a");
chip.className = "session-chip";
chip.href = "#/logbook";
chip.hidden = true;
chip.setAttribute("aria-label", "practice session running — open the logbook");
chip.innerHTML = `<span class="session-dot" aria-hidden="true"></span><span class="session-time">0:00</span>`;
picker.before(chip);
let chipTimer = 0;
function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function syncChip() {
  clearInterval(chipTimer);
  const c = logbook.clock();
  chip.hidden = !c;
  if (!c) return;
  const time = chip.querySelector(".session-time");
  const tick = () => { time.textContent = fmtElapsed(Date.now() - c.startedAt); };
  tick();
  chipTimer = setInterval(tick, 1000);
}
logbook.on(syncChip);
syncChip();

// `#/metronome?bpm=96` and `#/logbook/log?goal=…` carry a query; match on the
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
    ?? TOOLS.find((t) => t.id === shellStore.get("activeTool", TOOLS[0].id))
    ?? TOOLS[0]
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
