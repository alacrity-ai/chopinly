import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto((process.env.BASE ?? "http://127.0.0.1:8789") + "/dev/og.html"); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
await p.screenshot({ path: "/home/leif/lets-get-rich/woodshed/og/chopinly.png", clip: { x: 0, y: 0, width: 1200, height: 630 } }); await b.close(); console.log("og rendered");
