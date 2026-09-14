// Getting a file off the device (WSHED-121 v89, shared with MusicXML in WSHED-119): where a share
// sheet exists (an iPad) ask — Save to device (an <a download> → Downloads / Files) or Share… —
// else download straight away. Resolves "device" | "share" | null (dismissed).
import { icon } from "../../lib/icons.js";
import { esc, openSheet } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";

/** A plain download: the browser's Downloads (Files on an iPad). */
export function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a"); a.href = url; a.download = file.name; a.rel = "noopener"; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
/** Where a share sheet exists, ask: save to the device or share. */
export const chooseWay = (file, { title = "save file", small = "AirDrop, Mail, Files, another app" } = {}) => new Promise((resolve) => {
  let picked = null;
  const s = openSheet({ title, cls: "lb-acct-wrap cp-saveway-wrap", html: `
    <ul class="lb-acct-list">
      <li><button type="button" class="lb-acct-row" id="cp-x-way-device">${icon("download")}<span><b>Save to device</b><small>${esc(file.name)} → Downloads / Files</small></span></button></li>
      <li><button type="button" class="lb-acct-row" id="cp-x-way-share">${icon("share")}<span><b>Share…</b><small>${esc(small)}</small></span></button></li>
    </ul>` });
  s.body.querySelector("#cp-x-way-device").addEventListener("click", () => { picked = "device"; s.close(); });
  s.body.querySelector("#cp-x-way-share").addEventListener("click", () => { picked = "share"; s.close(); });
  s.closed.then(() => resolve(picked));
});
/**
 * Save or share a File the way the device allows. Resolves "device" (downloaded), "share" (handed
 * to the share sheet), or null (the musician dismissed the choice or the share sheet).
 */
export async function saveFile(file, { title = "save file", shareTitle = file.name } = {}) {
  const canShare = !!navigator.canShare?.({ files: [file] });
  const way = canShare ? await chooseWay(file, { title }) : "device";
  if (way === "share") {
    try { await navigator.share({ files: [file], title: shareTitle }); haptic(8); return "share"; }
    catch (e) { if (e.name !== "AbortError") throw e; return null; }
  }
  if (way !== "device") return null;
  download(file);
  haptic(8);
  return "device";
}
