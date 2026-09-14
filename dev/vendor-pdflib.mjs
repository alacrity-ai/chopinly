#!/usr/bin/env node
// Vendor the PDF export's runtime pieces (docs/COMPOSE_DESIGN.md §10.1). Run once per bump:
//   node dev/vendor-pdflib.mjs
// - pdf-lib (MIT) + @pdf-lib/fontkit (MIT): the self-contained UMD builds — the ESM builds
//   carry bare imports (pako, tslib, …) and cannot be served as-is. Loaded with <script> at
//   export time (js/lib/compose/export/pdflib.js), required in node tests.
// - Fraunces Regular + Italic as STATIC TrueType instances (OFL): fontkit's subsetter throws
//   "Index out of range" on the variable woff2 the screen uses; the static instances subset
//   cleanly (verified 2026-09-14, MuPDF + pdf.js). Google Fonts serves static instances to a
//   client that does not advertise variable-font support (the default curl / node UA).
// - Bravura is NOT vendored as a font: its glyph outlines are baked by dev/bake-bravura.mjs.
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "vendor/pdflib"), FONTS = join(ROOT, "fonts");
const PINS = { "pdf-lib": "1.17.1", "@pdf-lib/fontkit": "1.1.1" };
const MIT = (who) => `MIT License\n\nCopyright (c) ${who}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`;
const tmp = join(ROOT, ".vendor-tmp"); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true }); mkdirSync(OUT, { recursive: true });

for (const [pkg, ver] of Object.entries(PINS)) {
  const tgz = execSync(`npm pack ${pkg}@${ver} --pack-destination ${tmp}`, { encoding: "utf8" }).trim().split("\n").pop();
  const dir = join(tmp, tgz.replace(/\.tgz$/, "")); mkdirSync(dir, { recursive: true });
  execSync(`tar xzf ${join(tmp, tgz)} -C ${dir}`);
  const dist = join(dir, "package/dist");
  const file = pkg === "pdf-lib" ? "pdf-lib.min.js" : "fontkit.umd.min.js";
  writeFileSync(join(OUT, file), readFileSync(join(dist, file)));
  const lic = ["LICENSE.md", "LICENSE"].map((f) => join(dir, "package", f)).find((f) => existsSync(f));
  // @pdf-lib/fontkit ships no licence file in its tarball or repo (package.json + README: MIT) — write the MIT notice
  const pj = JSON.parse(readFileSync(join(dir, "package/package.json"), "utf8"));
  if (pj.license !== "MIT") throw new Error(pkg + ": expected MIT, package.json says " + pj.license);
  const text = lic ? readFileSync(lic, "utf8") : MIT(`${pj.name} ${pj.version} — ${pj.author?.name ?? pj.author ?? "the fontkit authors"} (a fork of fontkit by Devon Govett); licence per package.json`);
  writeFileSync(join(OUT, `LICENSE-${pkg.replace(/[@/]/g, "")}`), text.replace(/\r/g, "").trim() + "\n");
  console.log("vendored", pkg, ver, file);
}
writeFileSync(join(OUT, "VERSION"), `pdf-lib ${PINS["pdf-lib"]} (dist/pdf-lib.min.js)\n@pdf-lib/fontkit ${PINS["@pdf-lib/fontkit"]} (dist/fontkit.umd.min.js)\nvendored ${new Date().toISOString().slice(0, 10)} by dev/vendor-pdflib.mjs\n`);

const css = await (await fetch("https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;1,400", { headers: { "user-agent": "node" } })).text();
// one @font-face block per face; take each by its declared style, never by order (Google lists the italic first)
const faces = [...css.matchAll(/font-style: (normal|italic);[^}]*?src: url\((https:[^)]+)\) format\('truetype'\)/g)].map((m) => [m[1], m[2]]);
if (faces.length !== 2) throw new Error("expected two TrueType Fraunces faces from Google Fonts, got " + faces.length);
for (const [style, url] of faces) {
  const name = style === "italic" ? "Fraunces-Italic.ttf" : "Fraunces-Regular.ttf";
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "\0\x01\0\0") throw new Error(name + " is not a TrueType file");
  writeFileSync(join(FONTS, name), bytes); console.log("font", name, bytes.length);
}
const ofl = await (await fetch("https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt")).text();
writeFileSync(join(FONTS, "FRAUNCES-LICENSE.txt"), ofl);
rmSync(tmp, { recursive: true, force: true });
console.log("done");
