// Vendors pdf.js (Mozilla, Apache-2.0) into vendor/pdfjs/ from the pinned npm
// tarball — Chopinly has no build step and no dependencies, so the renderer is
// committed like any other file and served from chopinly.com (design §2).
//   node dev/vendor-pdfjs.mjs          # re-vendor the pinned version
//   node dev/vendor-pdfjs.mjs 6.4.0    # bump (then update sw.js if the file set changed)
// Legacy build on purpose: the modern one assumes a newer Safari than the iPads
// this is for. wasm/ (JPEG 2000 + JBIG2 decoders) ships but is not precached —
// it is fetched the first time a scan needs it.
import { mkdirSync, rmSync, cpSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

export const PINNED = "6.3.289";
const version = process.argv[2] ?? PINNED;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "vendor", "pdfjs");
const tmp = join(tmpdir(), `pdfjs-${version}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const url = `https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-${version}.tgz`;
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
writeFileSync(join(tmp, "pdfjs.tgz"), buf);
execFileSync("tar", ["xzf", "pdfjs.tgz"], { cwd: tmp });
const pkg = join(tmp, "package");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(pkg, "legacy/build/pdf.min.mjs"), join(OUT, "pdf.mjs"));
cpSync(join(pkg, "legacy/build/pdf.worker.min.mjs"), join(OUT, "pdf.worker.mjs"));
cpSync(join(pkg, "standard_fonts"), join(OUT, "standard_fonts"), { recursive: true });
cpSync(join(pkg, "wasm"), join(OUT, "wasm"), { recursive: true });
cpSync(join(pkg, "LICENSE"), join(OUT, "LICENSE"));
writeFileSync(join(OUT, "VERSION"), `pdfjs-dist ${version} (legacy build)\n${url}\n`);
const fonts = readdirSync(join(OUT, "standard_fonts")).filter((f) => !f.startsWith("LICENSE"));
console.log(`vendored pdf.js ${version}: pdf.mjs, pdf.worker.mjs, ${fonts.length} standard fonts, wasm/`);
console.log("precache entries for sw.js:\n" + ["/vendor/pdfjs/pdf.mjs", "/vendor/pdfjs/pdf.worker.mjs", ...fonts.map((f) => `/vendor/pdfjs/standard_fonts/${f}`)].map((p) => `  "${p}",`).join("\n"));
