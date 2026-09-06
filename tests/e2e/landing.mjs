// Landing at / (WSHED-54 → WSHED-95), forwarding to /app, OG, legal pages. BASE=… SHOTS=… node tests/e2e/landing.mjs
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const browser = await chromium.launch();
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); throw e; } };
const fresh = async (opts = {}) => { const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...opts }); const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); return { ctx, page, errors }; };
const noWiden = async (page, what) => { const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth })); if (w.doc > w.vw) throw new Error(`${what} widened ` + JSON.stringify(w)); };

await step("fresh visitor at / sees the landing (no redirect); canonical /, OG tags + image, JSON-LD parses", async () => {
  const { page, errors, ctx } = await fresh();
  await page.goto(`${BASE}/`);
  await page.waitForSelector("#w-open");
  if (!/\/$/.test(page.url()) || /welcome|app/.test(page.url())) throw new Error("url " + page.url());
  const canon = await page.getAttribute('link[rel="canonical"]', "href");
  if (canon !== "https://chopinly.com/") throw new Error("canonical " + canon);
  const og = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map((m) => [m.getAttribute("property"), m.content])));
  if (og["og:image"] !== "https://chopinly.com/og/chopinly.png" || !og["og:title"]?.startsWith("Chopinly") || og["og:url"] !== "https://chopinly.com/") throw new Error(JSON.stringify(og));
  const ld = await page.evaluate(() => JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent));
  const types = ld["@graph"].map((n) => n["@type"]);
  for (const t of ["Organization", "WebSite", "SoftwareApplication", "Person"]) if (!types.includes(t)) throw new Error("JSON-LD types " + JSON.stringify(types));
  const img = await page.evaluate(async () => { const r = await fetch("/og/chopinly.png"); const b = await r.blob(); const bm = await createImageBitmap(b); return { status: r.status, w: bm.width, h: bm.height }; });
  if (img.status !== 200 || img.w !== 1200 || img.h !== 630) throw new Error(JSON.stringify(img));
  const h1 = await page.textContent("h1");
  if (h1.trim() !== "Chopinly") throw new Error("h1 " + h1);
  await noWiden(page, "landing");
  await page.screenshot({ path: `${S}/landing-01-mobile.png`, fullPage: true });
  if (errors.length) throw new Error(errors.join("; "));
  await ctx.close();
});

await step("Open Chopinly → /app; a later visit to / forwards to /app (seen); /?home shows the landing anyway", async () => {
  const { page, ctx } = await fresh();
  await page.goto(`${BASE}/`);
  await page.click("#w-open");
  await page.waitForSelector("#tool-picker .picker-btn", { timeout: 8000 });
  if (!/\/app$/.test(page.url().split("#")[0])) throw new Error("url " + page.url());
  await page.goto(`${BASE}/`);
  await page.waitForSelector("#tool-picker .picker-btn");
  if (!/\/app/.test(page.url())) throw new Error("returning visitor stayed on the landing: " + page.url());
  await page.goto(`${BASE}/?home`);
  await page.waitForSelector("#w-open");
  if (/\/app/.test(page.url())) throw new Error("?home forwarded: " + page.url());
  await ctx.close();
});

await step("deep links: /#/logbook and /?app=1&x=1#/metronome forward to /app with search + hash intact", async () => {
  const { page, ctx } = await fresh();
  await page.goto(`${BASE}/#/logbook`);
  await page.waitForURL(/\/app#\/logbook$/, { timeout: 8000 });
  await page.waitForSelector(".lb-hero");
  await page.goto(`${BASE}/?app=1&x=1#/metronome`);
  await page.waitForURL(/\/app\?app=1&x=1#\/metronome$/, { timeout: 8000 });
  await page.waitForSelector("#tool-picker .picker-btn");
  await ctx.close();
});

await step("/welcome redirects to / (301); the app shell at /app is noindex", async () => {
  const { page, ctx } = await fresh();
  const r = await page.request.get(`${BASE}/welcome`, { maxRedirects: 0 });
  if (r.status() !== 301 || !/\/$/.test(r.headers().location ?? "")) throw new Error(`welcome ${r.status()} ${r.headers().location}`);
  const app = await page.request.get(`${BASE}/app`);
  if (app.status() !== 200 || !(await app.text()).includes('name="robots" content="noindex"')) throw new Error("app shell not noindex");
  await ctx.close();
});

await step("analytics section: three real screenshots load; In the case links every tool page (WSHED-64/96)", async () => {
  const { page, ctx } = await fresh();
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".w-analytics img");
  const imgs = await page.$$eval(".w-analytics img", (els) => els.map((i) => i.getAttribute("src")));
  if (imgs.length !== 3) throw new Error("images " + JSON.stringify(imgs));
  for (const src of imgs) {
    const r = await page.evaluate(async (s) => { const x = await fetch(s); const b = await x.blob(); const bm = await createImageBitmap(b); return { status: x.status, w: bm.width, h: bm.height }; }, src);
    if (r.status !== 200 || r.w < 600) throw new Error(src + " " + JSON.stringify(r));
  }
  const tools = await page.$$eval(".w-tools li b a", (els) => els.map((e) => e.getAttribute("href")));
  for (const h of ["/metronome", "/piano", "/tuner", "/pitch-pipe", "/recorder", "/sight-singing", "/ear-training", "/practice-log"]) if (!tools.includes(h)) throw new Error("tool link missing " + h + " in " + JSON.stringify(tools));
  const posts = await page.$$eval(".w-posts li a", (els) => els.map((e) => e.getAttribute("href")));
  if (posts.length !== 3 || !posts.every((h) => h.startsWith("/blog/"))) throw new Error("blog teaser " + JSON.stringify(posts));
  await noWiden(page, "landing");
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
    await noWiden(page, slug);
    if (slug === "privacy" && !/Privacy Policy/.test(h1)) throw new Error("privacy h1 " + h1);
  }
  const lic = await page.goto(`${BASE}/LICENSE.md`);
  if (lic.status() !== 200 || !(await lic.text()).includes("Elastic License 2.0")) throw new Error("LICENSE.md");
  await page.goto(`${BASE}/`);
  const foot = await page.$$eval(".w-foot-nav a", (els) => els.map((a) => a.getAttribute("href")));
  for (const h of ["/about", "/privacy", "/terms", "/cookies", "/disclaimer", "/blog"]) if (!foot.includes(h)) throw new Error("footer missing " + h);
  await page.goto(`${BASE}/app`);
  await page.waitForSelector("#account-btn");
  await page.click("#account-btn");
  await page.waitForSelector(".lb-acct-wrap.open");
  const sheet = await page.$$eval(".lb-acct-wrap a", (els) => els.map((a) => a.getAttribute("href")));
  if (!sheet.includes("/terms") || !sheet.includes("/privacy") || !sheet.includes("/?home")) throw new Error("sign-in sheet links " + JSON.stringify(sheet));
  await page.screenshot({ path: `${S}/landing-03-privacy.png`, fullPage: false });
  await ctx.close();
});

await step("desktop landing renders (no horizontal scroll)", async () => {
  const { page, ctx } = await fresh({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/`);
  await page.waitForSelector("#w-open");
  await noWiden(page, "landing");
  await page.screenshot({ path: `${S}/landing-02-desktop.png`, fullPage: true });
  await ctx.close();
});

await browser.close();
console.log("LANDING ALL GREEN");
