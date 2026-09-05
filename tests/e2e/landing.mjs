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

await step("analytics section: three real screenshots load; In the case lists Analytics (WSHED-64)", async () => {
  const { page, ctx } = await fresh();
  await page.goto(`${BASE}/welcome`);
  await page.waitForSelector(".w-analytics img");
  const imgs = await page.$$eval(".w-analytics img", (els) => els.map((i) => i.getAttribute("src")));
  if (imgs.length !== 3) throw new Error("images " + JSON.stringify(imgs));
  for (const src of imgs) {
    const r = await page.evaluate(async (s) => { const x = await fetch(s); const b = await x.blob(); const bm = await createImageBitmap(b); return { status: x.status, w: bm.width, h: bm.height }; }, src);
    if (r.status !== 200 || r.w < 600) throw new Error(src + " " + JSON.stringify(r));
  }
  const tools = await page.$$eval(".w-tools li b", (els) => els.map((e) => e.textContent));
  if (!tools.includes("Analytics")) throw new Error("tools " + JSON.stringify(tools));
  const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth }));
  if (w.doc > w.vw) throw new Error("landing widened " + JSON.stringify(w));
  await ctx.close();
});

await step("legal pages: five documents render, cross-link, no widening; landing footer + sign-in copy link them (WSHED-65)", async () => {
  const { page, ctx } = await fresh();
  for (const slug of ["about", "privacy", "terms", "cookies", "disclaimer"]) {
    const res = await page.goto(`${BASE}/${slug}`);
    if (res.status() !== 200) throw new Error(`${slug} ${res.status()}`);
    await page.waitForSelector(".l-doc h1");
    const h1 = await page.textContent(".l-doc h1");
    const links = await page.$$eval(".l-nav a", (els) => els.map((a) => a.getAttribute("href")));
    if (links.length !== 5 || !links.includes("/privacy")) throw new Error(`${slug} nav ${JSON.stringify(links)}`);
    if (!(await page.textContent(".l-meta")).includes("Effective")) throw new Error(`${slug} no effective date`);
    if (slug !== "about" && !(await page.locator(".l-summary li").count())) throw new Error(`${slug} no summary`);
    const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth }));
    if (w.doc > w.vw) throw new Error(`${slug} widened ` + JSON.stringify(w));
    if (slug === "privacy" && !/Privacy Policy/.test(h1)) throw new Error("privacy h1 " + h1);
  }
  const lic = await page.goto(`${BASE}/LICENSE.md`);
  if (lic.status() !== 200 || !(await lic.text()).includes("Elastic License 2.0")) throw new Error("LICENSE.md");
  await page.goto(`${BASE}/welcome`);
  const foot = await page.$$eval(".w-foot-nav a", (els) => els.map((a) => a.getAttribute("href")));
  for (const h of ["/about", "/privacy", "/terms", "/cookies", "/disclaimer"]) if (!foot.includes(h)) throw new Error("footer missing " + h);
  await page.goto(`${BASE}/?app=1`);
  await page.waitForSelector("#account-btn");
  await page.click("#account-btn");
  await page.waitForSelector(".lb-acct-wrap.open");
  const sheet = await page.$$eval(".lb-acct-wrap a", (els) => els.map((a) => a.getAttribute("href")));
  if (!sheet.includes("/terms") || !sheet.includes("/privacy")) throw new Error("sign-in sheet links " + JSON.stringify(sheet));
  await page.screenshot({ path: `${S}/landing-03-privacy.png`, fullPage: false });
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
