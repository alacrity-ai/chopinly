// Landing + first-run redirect + OG (WSHED-54). BASE=… SHOTS=… node e2e-landing.mjs
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const browser = await chromium.launch();
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); throw e; } };
const fresh = async (opts = {}) => { const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...opts }); const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); return { ctx, page, errors }; };

await step("fresh visitor at / → /welcome; OG tags + image present", async () => {
  const { page, errors, ctx } = await fresh();
  await page.goto(`${BASE}/`);
  await page.waitForURL(/\/welcome$/, { timeout: 8000 });
  await page.waitForSelector("#w-open");
  const og = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map((m) => [m.getAttribute("property"), m.content])));
  if (og["og:image"] !== "https://chopinly.com/og/chopinly.png" || !og["og:title"]?.startsWith("Chopinly")) throw new Error(JSON.stringify(og));
  const img = await page.evaluate(async () => { const r = await fetch("/og/chopinly.png"); const b = await r.blob(); const bm = await createImageBitmap(b); return { status: r.status, w: bm.width, h: bm.height, type: r.headers.get("content-type") }; });
  if (img.status !== 200 || img.w !== 1200 || img.h !== 630) throw new Error(JSON.stringify(img));
  const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth }));
  if (w.doc > w.vw) throw new Error("landing widened " + JSON.stringify(w));
  await page.screenshot({ path: `${S}/landing-01-mobile.png`, fullPage: true });
  if (errors.length) throw new Error(errors.join("; "));
  await ctx.close();
});

await step("Open Chopinly → the app; a reload of / stays in the app (seen)", async () => {
  const { page, ctx } = await fresh();
  await page.goto(`${BASE}/`);
  await page.waitForURL(/\/welcome$/);
  await page.click("#w-open");
  await page.waitForSelector("#tool-picker .picker-btn", { timeout: 8000 });
  if (!/\/\?app=1/.test(page.url())) throw new Error("url " + page.url());
  await page.goto(`${BASE}/`);
  await page.waitForSelector("#tool-picker .picker-btn");
  if (/welcome/.test(page.url())) throw new Error("returning visitor was redirected");
  await ctx.close();
});

await step("existing local data → no redirect even without the seen flag", async () => {
  const { page, ctx } = await fresh();
  await page.goto(`${BASE}/welcome`);
  await page.evaluate(() => localStorage.setItem("ws.logbook.data", JSON.stringify({ schemaVersion: 2, goals: [{ id: "g1", name: "X", type: "piece", status: "active", kind: "user", createdAt: 1, updatedAt: 1, finishedAt: null }], segments: [], notes: [], deleted: [], pending: [] })));
  await page.goto(`${BASE}/`);
  await page.waitForSelector("#tool-picker .picker-btn");
  if (/welcome/.test(page.url())) throw new Error("user with data was redirected");
  await ctx.close();
});

await step("desktop landing renders (no horizontal scroll)", async () => {
  const { page, ctx } = await fresh({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/welcome`);
  await page.waitForSelector("#w-open");
  const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth }));
  if (w.doc > w.vw) throw new Error("landing widened " + JSON.stringify(w));
  await page.screenshot({ path: `${S}/landing-02-desktop.png`, fullPage: true });
  await ctx.close();
});

await browser.close();
console.log("LANDING ALL GREEN");
