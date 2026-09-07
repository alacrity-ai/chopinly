// Finalizes the chosen logo (candidate B, "The Keys" — WSHED-97) into the brand assets the
// site uses. Needs the dev server on 8789 (fonts) and python3 + fonttools + brotli.
//   node dev/logo/finalize.mjs
// Writes: brand/*.svg + *.png, icons/favicon.svg, icons/icon-{192,512,maskable-512}.png,
// icons/apple-touch-icon.png. The wordmark is measured in Chrome (shaping + kerning),
// outlined by dev/logo/outline.py, and composed here — the SVGs carry no font.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
import { keys, C, svg } from "./marks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(HERE, "out");
const BASE = process.env.BASE ?? "http://127.0.0.1:8789";
mkdirSync(OUT, { recursive: true }); mkdirSync(join(ROOT, "brand"), { recursive: true });
const light = { bg: C.ivory, key: C.ebony, accent: C.brass, black: C.ivory };
const b = await chromium.launch();

// 1. Measure the wordmark: glyph origins + baseline at 144px (opsz 144), letter-spacing -0.01em.
const SIZE = 144;
const page = await b.newPage({ viewport: { width: 1400, height: 400 } });
await page.setContent(`<style>@font-face{font-family:F;src:url("${BASE}/fonts/fraunces-roman.woff2") format("woff2");font-weight:100 900}
body{margin:0}#w{font:550 ${SIZE}px/1 F;font-optical-sizing:auto;letter-spacing:-0.01em;position:absolute;left:100px;top:100px;white-space:nowrap}</style>
<span id="w">Chopınly<i id="bl" style="display:inline-block;width:0;height:0"></i></span>`);
await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
const metrics = await page.evaluate(() => {
  const w = document.getElementById("w"), t = w.firstChild, left = w.getBoundingClientRect().left;
  const glyphs = [...t.textContent].map((ch, i) => { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); return { ch, x: r.getBoundingClientRect().left - left }; });
  const r = document.createRange(); r.selectNodeContents(t);
  return { glyphs, baseline: document.getElementById("bl").getBoundingClientRect().bottom - w.getBoundingClientRect().top, advance: r.getBoundingClientRect().width };
});
metrics.size = SIZE;
writeFileSync(join(OUT, "wordmark-metrics.json"), JSON.stringify(metrics));

// 2. Outline with fontTools.
const PY = process.env.PYTHON ?? "python3"; // the fontTools interpreter (miniconda: PYTHON=$(which python3))
try { console.log(execFileSync(PY, [join(HERE, "outline.py"), join(OUT, "wordmark-metrics.json"), join(OUT, "wordmark-paths.json")], { cwd: ROOT }).toString().trim()); }
catch (e) { console.error(String(e.stderr)); await b.close(); process.exit(1); }
const wm = JSON.parse(readFileSync(join(OUT, "wordmark-paths.json"), "utf8"));

// 3. Compose the SVGs. Wordmark box: ink-tight horizontally, ascent..descent vertically, baseline at y = ascent.
const PAD = 4;
const wmW = wm.inkRight - wm.inkLeft + PAD * 2, wmH = wm.ascent + wm.descent + PAD * 2, wmBase = wm.ascent + PAD;
const wordmarkG = (ink, accent, dx = 0, dy = 0) => `<g transform="translate(${(dx - wm.inkLeft + PAD).toFixed(2)} ${(dy + wmBase).toFixed(2)})">${wm.paths.map((p) => `<path transform="translate(${p.x.toFixed(2)} 0) scale(${wm.scale.toFixed(5)} -${wm.scale.toFixed(5)})" d="${p.d}" fill="${ink}"/>`).join("")}<rect x="${wm.dot.x.toFixed(2)}" y="${wm.dot.y.toFixed(2)}" width="${wm.dot.w.toFixed(2)}" height="${wm.dot.h.toFixed(2)}" rx="${wm.dot.rx.toFixed(2)}" fill="${accent}"/></g>`;
const wordmarkSvg = (ink, accent) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wmW.toFixed(1)} ${wmH.toFixed(1)}" width="${wmW.toFixed(1)}" height="${wmH.toFixed(1)}" role="img" aria-label="Chopinly">${wordmarkG(ink, accent)}</svg>\n`;

// lockups: mark tile of height = SIZE beside / above the wordmark, cap-height centred on the tile
const markH = Math.round(1.2 * wm.capHeight), gap = 0.28 * SIZE;
const markG = (opts, size, dx, dy) => `<g transform="translate(${dx} ${dy}) scale(${size / 100})">${keys(opts)}</g>`;
const horizontal = (opts, ink, accent) => {
  const W = markH + gap + wmW, H = wmH; // the wordmark box (ascent..descent) sets the height; the mark is centred on the caps
  const my = wmBase - wm.capHeight / 2 - markH / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" role="img" aria-label="Chopinly">${markG(opts, markH, 0, my)}${wordmarkG(ink, accent, markH + gap, 0)}</svg>\n`;
};
const stacked = (opts, ink, accent) => {
  const M = 1.5 * SIZE, W = Math.max(M, wmW), H = M + gap + wmH;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" role="img" aria-label="Chopinly">${markG(opts, M, (W - M) / 2, 0)}${wordmarkG(ink, accent, (W - wmW) / 2, M + gap)}</svg>\n`;
};

const files = {
  "brand/chopinly-mark.svg": svg(keys(), 512) + "\n",
  "brand/chopinly-mark-light.svg": svg(keys(light), 512) + "\n",
  "brand/chopinly-mark-bare.svg": svg(keys({ bg: null }), 512) + "\n",
  "brand/chopinly-mark-bare-light.svg": svg(keys({ ...light, bg: null }), 512) + "\n",
  "brand/chopinly-wordmark.svg": wordmarkSvg(C.ivory, C.brass),
  "brand/chopinly-wordmark-dark.svg": wordmarkSvg(C.ebony, C.brass),
  "brand/chopinly-lockup-horizontal.svg": horizontal({}, C.ivory, C.brass),
  "brand/chopinly-lockup-horizontal-light.svg": horizontal(light, C.ebony, C.brass),
  "brand/chopinly-lockup-stacked.svg": stacked({}, C.ivory, C.brass),
  "brand/chopinly-lockup-stacked-light.svg": stacked(light, C.ebony, C.brass),
  "icons/favicon.svg": svg(keys(), 64).replace(/ width="64" height="64"/, "") + "\n",
};
for (const [rel, content] of Object.entries(files)) { writeFileSync(join(ROOT, rel), content); console.log("wrote", rel); }

// 4. Raster: icons (full-bleed ebony squares — iOS/Android mask their own corners; the keys sit inside the maskable safe zone) + PNG twins of the brand SVGs.
const shot = async (inner, w, h, path, scale = 1) => {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await p.setContent(`<style>html,body{margin:0;background:transparent}</style>${inner}`);
  await p.screenshot({ path, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  await p.close(); console.log("rendered", path.replace(ROOT + "/", ""));
};
const square = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}"><rect width="100" height="100" fill="${C.ebony}"/>${keys({ bg: null })}</svg>`;
await shot(square(512), 512, 512, join(ROOT, "icons/chopinly-512.png"));
await shot(square(512), 512, 512, join(ROOT, "icons/chopinly-maskable-512.png"));
await shot(square(192), 192, 192, join(ROOT, "icons/chopinly-192.png"));
await shot(square(180), 180, 180, join(ROOT, "icons/apple-touch-icon.png"));
for (const name of ["chopinly-mark", "chopinly-mark-light", "chopinly-wordmark", "chopinly-wordmark-dark", "chopinly-lockup-horizontal", "chopinly-lockup-horizontal-light", "chopinly-lockup-stacked", "chopinly-lockup-stacked-light"]) {
  const s = files[`brand/${name}.svg`];
  const [w, h] = [/width="([\d.]+)"/.exec(s)[1], /height="([\d.]+)"/.exec(s)[1]].map(Number);
  const bg = name.endsWith("light") ? C.ivory : name.includes("mark") && !name.includes("wordmark") ? "transparent" : C.ebony;
  await shot(`<div style="background:${bg};width:${w}px;height:${h}px">${s}</div>`, Math.ceil(w), Math.ceil(h), join(ROOT, `brand/${name}.png`), 2);
}
await b.close();
