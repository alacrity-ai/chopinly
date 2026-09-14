// Load a vendored UMD bundle (vendor/pdflib/*.js) in node. The repo is "type": "module", so
// require() would parse the file as ESM and the UMD wrapper's `this` / `self` are gone; evaluate
// it as CommonJS instead. Shared by dev/bake-bravura.mjs and the export tests.
import { readFileSync } from "node:fs";
export function loadUmd(path) {
  const m = { exports: {} };
  const g = globalThis;
  new Function("module", "exports", "self", "window", "define", readFileSync(path, "utf8"))(m, m.exports, g, undefined, undefined);
  return m.exports;
}
