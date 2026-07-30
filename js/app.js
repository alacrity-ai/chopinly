// Shell: mounts the active tool, renders tabs when there's more than one tool,
// owns the screen wake-lock, registers the service worker.
import { TOOLS } from "./registry.js";
import { getAudio } from "./lib/audio.js";
import { makeStore } from "./lib/store.js";

const root = document.getElementById("tool-root");
const tabs = document.getElementById("tool-tabs");
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

function mount(tool) {
  if (active) { active.unmount(); root.replaceChildren(); }
  active = tool;
  shellStore.set("activeTool", tool.id);
  tool.mount(root, { getAudio, store: makeStore(tool.id), setRunning });
  if (!tabs.hidden) {
    for (const b of tabs.querySelectorAll("button")) {
      b.setAttribute("aria-selected", String(b.dataset.tool === tool.id));
    }
  }
}

if (TOOLS.length > 1) {
  tabs.hidden = false;
  for (const tool of TOOLS) {
    const b = document.createElement("button");
    b.dataset.tool = tool.id;
    b.textContent = `${tool.glyph} ${tool.name}`;
    b.addEventListener("click", () => mount(tool));
    tabs.append(b);
  }
}

const startId = shellStore.get("activeTool", TOOLS[0].id);
mount(TOOLS.find((t) => t.id === startId) ?? TOOLS[0]);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
