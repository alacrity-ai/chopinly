import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const walkAll = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walkAll(p) : [p.slice(ROOT.length - 1)]; });
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p.slice(ROOT.length - 1)] : []; });

test("the service worker precaches every module under js/ (offline broke once because analytics.js was missing)", () => {
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const shell = new Set([...sw.matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]));
  const missing = walk(join(ROOT, "js")).filter((p) => !shell.has(p));
  assert.deepEqual(missing, []);
  for (const p of shell) if (p.startsWith("/js/")) assert.ok(statSync(join(ROOT, p)).isFile(), `${p} precached but gone`);
  assert.ok(shell.has("/app") && !shell.has("/"), "the app shell, not the landing, is the offline fallback");
  // pdf.js (WSHED-98): the renderer and the standard fonts must be there offline; wasm/ (rare
  // JPEG 2000 / JBIG2 scans) and the licence files are fetched on demand.
  const vendor = walkAll(join(ROOT, "vendor", "pdfjs")).filter((p) => !p.includes("/wasm/") && !/LICENSE|VERSION/.test(p));
  assert.deepEqual(vendor.filter((p) => !shell.has(p)), [], "vendor/pdfjs files missing from the precache");
  // pdf-lib + fontkit + the two Fraunces faces (WSHED-121): the PDF export must work offline too
  const pdflib = walkAll(join(ROOT, "vendor", "pdflib")).filter((p) => !/LICENSE|VERSION/.test(p));
  assert.ok(pdflib.length >= 2, "vendor/pdflib is empty — run dev/vendor-pdflib.mjs");
  assert.deepEqual(pdflib.filter((p) => !shell.has(p)), [], "vendor/pdflib files missing from the precache");
  for (const f of ["/fonts/Fraunces-Regular.ttf", "/fonts/Fraunces-Italic.ttf"]) { assert.ok(shell.has(f), f + " missing from the precache"); assert.ok(statSync(join(ROOT, f)).isFile(), f + " is gone"); }
  assert.match(sw, /BUSTABLE = .*vendor/, "vendor/ fetches must carry ?v=<CACHE> like js/");
});
