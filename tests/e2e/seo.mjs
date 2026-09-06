// SEO surface (WSHED-88): discovery files + content types, tool pages, the blog, the 404. BASE=… SHOTS=… node tests/e2e/seo.mjs
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const browser = await chromium.launch();
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); throw e; } };
const fresh = async (opts = {}) => { const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...opts }); const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); return { ctx, page, errors }; };
const noWiden = async (page, what) => { const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth })); if (w.doc > w.vw) throw new Error(`${what} widened ` + JSON.stringify(w)); };
const ldOf = (page) => page.evaluate(() => JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent));
const TOOLS = { metronome: "metronome", piano: "keyboard", tuner: "tuner", "pitch-pipe": "pitchpipe", recorder: "recorder", "sight-singing": "sightsinging", "ear-training": "eartraining", "practice-log": "logbook" };

await step("discovery files: robots, sitemap, llms.txt, api-catalog, agent-skills, rss — 200 with the right content-type; Link header", async () => {
  const { page, ctx } = await fresh();
  const want = { "/robots.txt": "text/plain", "/sitemap.xml": "application/xml", "/llms.txt": "text/plain", "/.well-known/api-catalog": "application/linkset+json", "/.well-known/agent-skills/index.json": "application/json", "/rss.xml": "application/rss+xml" };
  for (const [p, type] of Object.entries(want)) {
    const r = await page.request.get(`${BASE}${p}`);
    const ct = r.headers()["content-type"] ?? "";
    if (r.status() !== 200 || !ct.startsWith(type)) throw new Error(`${p} ${r.status()} ${ct}`);
    const body = await r.text();
    if (body.includes("<!doctype html>")) throw new Error(`${p} served HTML`);
  }
  const robots = await (await page.request.get(`${BASE}/robots.txt`)).text();
  if (!/Content-Signal: search=yes, ai-train=yes, ai-input=yes/.test(robots) || !/Sitemap: https:\/\/chopinly\.com\/sitemap\.xml/.test(robots) || /Disallow: \/\s*$/m.test(robots)) throw new Error("robots content");
  const link = (await page.request.get(`${BASE}/`)).headers().link ?? "";
  if (!/rel="api-catalog"/.test(link) || !/rel="sitemap"/.test(link)) throw new Error("Link header: " + link);
  const skills = JSON.parse(await (await page.request.get(`${BASE}/.well-known/agent-skills/index.json`)).text());
  if (!skills.skills?.[0]?.url?.endsWith("/llms.txt")) throw new Error("agent-skills shape");
  await ctx.close();
});

await step("sitemap: every URL resolves 200 on this host; /nope is a real 404; /api/* is noindex", async () => {
  const { page, ctx } = await fresh();
  const sm = await (await page.request.get(`${BASE}/sitemap.xml`)).text();
  const locs = [...sm.matchAll(/<loc>https:\/\/chopinly\.com([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
  if (locs.length < 20) throw new Error("sitemap too short " + locs.length);
  for (const p of locs) { const r = await page.request.get(`${BASE}${p}`); if (r.status() !== 200) throw new Error(`${p} → ${r.status()}`); }
  const nope = await page.request.get(`${BASE}/nope-${Date.now()}`);
  if (nope.status() !== 404 || !(await nope.text()).includes("Nothing here")) throw new Error(`404 page: ${nope.status()}`);
  const api = await page.request.get(`${BASE}/api/health`);
  if (!/noindex/.test(api.headers()["x-robots-tag"] ?? "")) throw new Error("api x-robots-tag " + api.headers()["x-robots-tag"]);
  const app = await page.request.get(`${BASE}/app`);
  if (!/noindex/.test(app.headers()["x-robots-tag"] ?? "")) throw new Error("app x-robots-tag " + app.headers()["x-robots-tag"]);
  await ctx.close();
});

await step("tool pages: h1, canonical, SoftwareApplication + Breadcrumb JSON-LD, CTA into the right hash route, no widening", async () => {
  const { page, ctx, errors } = await fresh();
  for (const [slug, route] of Object.entries(TOOLS)) {
    const res = await page.goto(`${BASE}/${slug}`);
    if (res.status() !== 200) throw new Error(`${slug} ${res.status()}`);
    await page.waitForSelector(".l-tool h1");
    if ((await page.getAttribute('link[rel="canonical"]', "href")) !== `https://chopinly.com/${slug}`) throw new Error(`${slug} canonical`);
    const ld = await ldOf(page);
    const types = ld["@graph"].map((n) => n["@type"]);
    if (!types.includes("SoftwareApplication") || !types.includes("BreadcrumbList")) throw new Error(`${slug} ld ${types}`);
    const cta = await page.getAttribute(".l-cta a.l-open", "href");
    if (cta !== `/app#/${route}`) throw new Error(`${slug} cta ${cta}`);
    const words = (await page.textContent(".l-tool")).split(/\s+/).length;
    if (words < 300) throw new Error(`${slug} thin: ${words} words`);
    await noWiden(page, slug);
    if (slug === "metronome") await page.screenshot({ path: `${S}/seo-01-tool-metronome.png`, fullPage: true });
  }
  const tools = await page.goto(`${BASE}/tools`);
  if (tools.status() !== 200) throw new Error("tools index");
  const links = await page.$$eval(".l-toollist-big a", (els) => els.map((a) => a.getAttribute("href")));
  if (links.length !== 8) throw new Error("tools index links " + JSON.stringify(links));
  if (errors.length) throw new Error(errors.join("; "));
  await ctx.close();
});

await step("the CTA really lands in the app on that tool", async () => {
  const { page, ctx } = await fresh();
  await page.goto(`${BASE}/metronome`);
  await page.click(".l-cta a.l-open");
  await page.waitForURL(/\/app#\/metronome$/, { timeout: 8000 });
  await page.waitForSelector("#tap", { timeout: 8000 });
  await ctx.close();
});

await step("blog: index lists the posts; a post has BlogPosting + Breadcrumb JSON-LD, article meta, its own OG image, a TOC, prev/next; rss has every post", async () => {
  const { page, ctx, errors } = await fresh();
  await page.goto(`${BASE}/blog`);
  await page.waitForSelector(".l-posts-index li a");
  const posts = await page.$$eval(".l-posts-index li > a", (els) => els.map((a) => a.getAttribute("href")));
  if (posts.length < 6) throw new Error("posts " + posts.length);
  await noWiden(page, "blog index");
  await page.screenshot({ path: `${S}/seo-02-blog-index.png`, fullPage: true });
  const rss = await (await page.request.get(`${BASE}/rss.xml`)).text();
  for (const p of posts) if (!rss.includes(`<link>https://chopinly.com${p}</link>`)) throw new Error("rss missing " + p);
  for (const p of posts) {
    const res = await page.goto(`${BASE}${p}`);
    if (res.status() !== 200) throw new Error(`${p} ${res.status()}`);
    await page.waitForSelector(".l-post h1");
    const ld = await ldOf(page);
    const post = ld["@graph"].find((n) => n["@type"] === "BlogPosting");
    if (!post || !post.datePublished || post.author?.name !== "Leif Taylor" || !ld["@graph"].some((n) => n["@type"] === "BreadcrumbList")) throw new Error(`${p} ld`);
    const og = await page.getAttribute('meta[property="og:image"]', "content");
    if (og !== `https://chopinly.com/og/blog${p.replace("/blog", "")}.png`) throw new Error(`${p} og ${og}`);
    const img = await page.evaluate(async (u) => { const r = await fetch(u.replace("https://chopinly.com", "")); if (!r.ok) return { status: r.status }; const bm = await createImageBitmap(await r.blob()); return { status: r.status, w: bm.width, h: bm.height }; }, og);
    if (img.status !== 200 || img.w !== 1200 || img.h !== 630) throw new Error(`${p} og image ${JSON.stringify(img)}`);
    if (!(await page.getAttribute('meta[property="article:published_time"]', "content"))) throw new Error(`${p} article meta`);
    if (!(await page.locator(".l-toc li").count())) throw new Error(`${p} no toc`);
    if ((await page.locator(".l-body h2").count()) < 3) throw new Error(`${p} too few sections`);
    await noWiden(page, p);
  }
  await page.goto(`${BASE}${posts[0]}`);
  await page.screenshot({ path: `${S}/seo-03-post.png`, fullPage: true });
  if (errors.length) throw new Error(errors.join("; "));
  await ctx.close();
});

await step("desktop: tool page + post render without horizontal scroll", async () => {
  const { page, ctx } = await fresh({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/practice-log`); await noWiden(page, "practice-log desktop");
  await page.screenshot({ path: `${S}/seo-04-tool-desktop.png`, fullPage: true });
  await page.goto(`${BASE}/blog/how-to-practice-piano-effectively`); await noWiden(page, "post desktop");
  await page.screenshot({ path: `${S}/seo-05-post-desktop.png`, fullPage: true });
  await ctx.close();
});

await browser.close();
console.log("SEO ALL GREEN");
