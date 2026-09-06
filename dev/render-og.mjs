// Renders the OG images with Playwright against a running dev server (BASE, default 8789).
//   node dev/render-og.mjs           → og/chopinly.png (the site card, from dev/og.html)
//   node dev/render-og.mjs --posts   → og/blog/<slug>.png for every post (dev/og-post.html)
import { mkdirSync } from "node:fs";
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
import { loadPosts, ROOT } from "./build-site.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const snap = async (url, path) => {
  await p.goto(url); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(250);
  await p.screenshot({ path, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log("rendered", path.replace(ROOT + "/", ""));
};
if (process.argv.includes("--posts")) {
  mkdirSync(`${ROOT}/og/blog`, { recursive: true });
  for (const post of loadPosts()) {
    const q = new URLSearchParams({ title: post.title, tag: `${post.minutes} min read · ${post.tags.join(" · ")}` });
    await snap(`${BASE}/dev/og-post.html?${q}`, `${ROOT}/og/blog/${post.slug}.png`);
  }
} else {
  await snap(`${BASE}/dev/og.html`, `${ROOT}/og/chopinly.png`);
}
await b.close();
