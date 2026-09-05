// Appearance (WSHED-71). A skin is a block of CSS tokens on :root (css/app.css
// "skins"); this module only chooses which one. The choice lives in
// localStorage (ws.shell.skin) and nowhere else — it is not part of the
// account and never syncs. index.html applies it before first paint with a
// two-line inline script that mirrors currentSkin().
import { makeStore } from "./store.js";

export const SKINS = [
  { id: "ebony", name: "Ebony", blurb: "inside the piano — the original", theme: "#191410" },
  { id: "green-piano", name: "Green Piano", blurb: "paper white, black type, one green", theme: "#f6f3ec" },
  { id: "nocturne", name: "Nocturne", blurb: "lights out — OLED black for the late session", theme: "#050507" },
  { id: "manuscript", name: "Manuscript", blurb: "parchment, sepia ink, a fountain pen", theme: "#eee3c8" },
  { id: "neon", name: "Neon", blurb: "midnight arcade — magenta and cyan", theme: "#120f24" },
];
export const DEFAULT_SKIN = SKINS[0].id;

const store = makeStore("shell");
const known = (id) => SKINS.some((s) => s.id === id);

/** The skin in effect: the stored id if it is one we know, else the default. */
export function currentSkin() {
  const id = store.get("skin", DEFAULT_SKIN);
  return known(id) ? id : DEFAULT_SKIN;
}

/** Apply a skin now (data-skin on <html>, theme-color) and remember it. */
export function setSkin(id) {
  if (!known(id)) id = DEFAULT_SKIN;
  const html = document.documentElement;
  if (id === DEFAULT_SKIN) delete html.dataset.skin; else html.dataset.skin = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", SKINS.find((s) => s.id === id).theme);
  store.set("skin", id);
  document.dispatchEvent(new CustomEvent("skinchange", { detail: { skin: id } }));
  return id;
}

/** Re-apply the stored choice (boot: makes the meta + dataset agree with storage). */
export const initSkin = () => setSkin(currentSkin());

/** A token's current value, for code that paints a canvas and cannot use var(). */
export const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
