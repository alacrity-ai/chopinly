// Writes the logo candidate SVGs + one presentation sheet per candidate, then screenshots
// the sheets with Playwright (needs the dev server on 8789 for the Fraunces font files).
//   node dev/logo/build.mjs            → dev/logo/<id>-mark.svg, <id>-mark-light.svg, sheet-<id>.html, + PNGs into $SHOTS (default dev/logo/out, git-ignored)
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
import { CANDIDATES, C, svg } from "./marks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOTS ?? join(HERE, "out");
const BASE = process.env.BASE ?? "http://127.0.0.1:8789";
mkdirSync(OUT, { recursive: true });

const light = { bg: C.ivory, ink: C.ebony, key: C.ebony, accent: C.brass, black: C.ivory };
const dot = { note: `content:""; position:absolute; left:50%; bottom:0.70em; width:0.235em; height:0.16em; border-radius:50%; background:${C.brass}; transform:translateX(-52%) rotate(-22deg);`,
  key: `content:""; position:absolute; left:50%; bottom:0.705em; width:0.15em; height:0.2em; border-radius:0.03em; background:${C.brass}; transform:translateX(-50%);`,
  round: `content:""; position:absolute; left:50%; bottom:0.715em; width:0.17em; height:0.17em; border-radius:50%; background:${C.brass}; transform:translateX(-50%);` };

const wm = (cls = "") => `<span class="wm ${cls}">Chop<span class="i">ı</span>nly</span>`;

function sheet(c) {
  const m = (opts, size) => svg(c.mark(opts), size);
  const bare = (opts, size) => svg(c.mark({ ...opts, bg: null }), size);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Chopinly logo — candidate ${c.id}</title>
<style>
@font-face { font-family: "Fraunces"; src: url("${BASE}/fonts/fraunces-roman.woff2") format("woff2"); font-weight: 100 900; font-style: normal; }
@font-face { font-family: "Fraunces"; src: url("${BASE}/fonts/fraunces-italic.woff2") format("woff2"); font-weight: 100 900; font-style: italic; }
html, body { margin: 0; } body { width: 1400px; background: #f3efe6; color: #2a231b; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
.wrap { padding: 44px 56px 56px; }
h1 { font: 550 44px/1.1 Fraunces, Georgia, serif; margin: 0 0 6px; color: #191410; }
h1 small { font: 400 20px/1 system-ui, sans-serif; color: #7a6f60; letter-spacing: 0.12em; text-transform: uppercase; margin-right: 14px; vertical-align: 0.3em; }
.why { max-width: 900px; color: #4a4036; margin: 0 0 4px; font-size: 17px; } .why b { color: #191410; }
.trade { max-width: 900px; color: #7a6f60; margin: 0 0 30px; font-size: 15px; }
h2 { font: 500 12px/1 system-ui, sans-serif; letter-spacing: 0.16em; text-transform: uppercase; color: #7a6f60; margin: 34px 0 12px; }
.row { display: flex; gap: 18px; align-items: stretch; }
.panel { border-radius: 18px; display: flex; align-items: center; justify-content: center; gap: 28px; padding: 28px; }
.dark { background: ${C.ebony}; color: ${C.ivory}; } .lite { background: ${C.ivory}; color: ${C.ebony}; border: 1px solid #e0d6c2; }
.mid { background: ${C.raised}; }
.sizes { display: flex; align-items: flex-end; gap: 28px; } .sizes figure { margin: 0; text-align: center; font-size: 11px; color: ${C.dim}; } .sizes svg { display: block; margin: 0 auto 8px; }
.wm { font-family: Fraunces, Georgia, serif; font-weight: 550; font-optical-sizing: auto; letter-spacing: -0.01em; line-height: 1; white-space: nowrap; }
.wm .i { position: relative; display: inline-block; } .wm .i::after { ${dot[c.idot]} }
.tag { font: italic 400 1em Fraunces, Georgia, serif; color: ${C.brass}; }
.nav { height: 60px; border-radius: 14px; display: flex; align-items: center; gap: 12px; padding: 0 22px; background: ${C.ebony}; color: ${C.ivory}; }
.nav .wm { font-size: 26px; } .nav .navtag { font: italic 13px Fraunces, serif; color: ${C.brass}; margin-left: 2px; margin-top: 10px; }
.nav .sp { flex: 1; } .nav .pill { font: 600 13px system-ui, sans-serif; color: ${C.ebony}; background: linear-gradient(180deg, ${C.bright}, ${C.brass}); border-radius: 999px; padding: 8px 16px; }
.nav .menu { font: 14px system-ui, sans-serif; color: ${C.dim}; margin-right: 12px; }
.hero { flex-direction: column; gap: 0; padding: 56px 40px 52px; text-align: center; }
.hero .wm { font-size: 108px; margin-top: 22px; } .hero .tag { font-size: 30px; margin-top: 10px; } .hero .line { font: 400 26px/1.25 Fraunces, serif; color: ${C.ivory}; margin-top: 26px; max-width: 30ch; }
.ogwrap { width: 720px; height: 378px; overflow: hidden; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.18); }
.og { width: 1200px; height: 630px; transform: scale(0.6); transform-origin: 0 0; position: relative; background: radial-gradient(ellipse at 28% 50%, #2e261d 0%, ${C.ebony} 60%); color: ${C.ivory}; }
.og .mark { position: absolute; left: 96px; top: 115px; } .og .text { position: absolute; left: 560px; top: 150px; }
.og .wm { font-size: 132px; } .og .tag { display: block; font-size: 44px; margin-top: 10px; }
.og .line { font: 30px/1.3 Fraunces, serif; color: ${C.dim}; margin-top: 44px; max-width: 560px; }
.og .rule { position: absolute; left: 560px; right: 80px; bottom: 76px; height: 1px; background: ${C.edge}; }
.og .url { position: absolute; left: 560px; bottom: 36px; font: 24px system-ui, sans-serif; color: ${C.dim}; letter-spacing: 0.04em; }
.icons { gap: 40px; } .icons figure { margin: 0; text-align: center; font-size: 12px; color: ${C.dim}; } .icons svg { display: block; margin: 0 auto 10px; }
.mask { border-radius: 50%; overflow: hidden; width: 120px; height: 120px; margin: 0 auto 10px; }
.foot { margin-top: 40px; color: #9a8f7f; font-size: 12px; }
</style></head><body><div class="wrap">
<h1><small>Candidate ${c.id}</small>${c.name}</h1>
<p class="why"><b>Why:</b> ${c.why}</p>
<p class="trade"><b>Tradeoff:</b> ${c.tradeoff}</p>

<h2>The mark</h2>
<div class="row">
  <div class="panel dark" style="flex:1">${m({}, 220)}</div>
  <div class="panel lite" style="flex:1">${m(light, 220)}</div>
  <div class="panel mid" style="flex:1.4"><div class="sizes">
    <figure>${bare({}, 96)}bare · 96</figure><figure>${m({}, 64)}64</figure><figure>${m({}, 48)}48</figure><figure>${m({}, 32)}32</figure><figure>${m({}, 24)}24</figure><figure>${m({}, 16)}16</figure>
  </div></div>
</div>

<h2>The wordmark</h2>
<div class="row">
  <div class="panel dark" style="flex:1; font-size: 104px">${wm()}</div>
  <div class="panel lite" style="flex:1; font-size: 104px">${wm()}</div>
</div>

<h2>Navbar · top left</h2>
<div class="nav">${m({}, 34)} ${wm()}<span class="navtag">practice assistant</span><span class="sp"></span><span class="menu">Logbook ▾</span><span class="pill">open</span></div>

<div class="row" style="margin-top:18px">
  <div style="flex:1"><h2 style="margin-top:0">Landing · hero</h2>
    <div class="panel dark hero">${m({}, 132)}${wm()}<span class="tag">piano practice assistant</span><span class="line">Choose something. Practice it.<br>See what you actually did.</span></div>
  </div>
  <div style="flex:0 0 720px"><h2 style="margin-top:0">OG card · 1200 × 630</h2>
    <div class="ogwrap"><div class="og"><div class="mark">${m({}, 400)}</div><div class="text">${wm()}<span class="tag">piano practice assistant</span><div class="line">Choose something. Practice it.<br>See what you actually did.</div></div><div class="rule"></div><div class="url">chopinly.com · free · works offline</div></div></div>
    <h2>App icon · home screen</h2>
    <div class="panel dark icons"><figure>${m({}, 120)}iOS · 512 tile</figure><figure><div class="mask">${bare({}, 120).replace("<svg", `<svg style="background:${C.ebony}"`)}</div>Android · maskable</figure><figure>${m(light, 120)}light tile</figure></div>
  </div>
</div>
<p class="foot">Chopinly · candidate ${c.id} of 3 · vector (SVG on a 100-unit grid); wordmark in Fraunces 550, to be outlined to paths on finalisation.</p>
</div></body></html>`;
}

for (const c of CANDIDATES) {
  writeFileSync(join(HERE, `${c.id}-mark.svg`), svg(c.mark(), 512) + "\n");
  writeFileSync(join(HERE, `${c.id}-mark-light.svg`), svg(c.mark(light), 512) + "\n");
  writeFileSync(join(HERE, `${c.id}-mark-bare.svg`), svg(c.mark({ bg: null }), 512) + "\n");
  writeFileSync(join(HERE, `sheet-${c.id}.html`), sheet(c));
}
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1.5 });
for (const c of CANDIDATES) {
  await p.goto(`${BASE}/dev/logo/sheet-${c.id}.html`);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: join(OUT, `chopinly-logo-candidate-${c.id}.png`), fullPage: true });
  console.log("sheet", c.id, c.name);
}
await b.close();
