// Scores E2E (WSHED-98 / P0). Import the fixture PDF, open it, turn pages by
// tapping the edges and with the keys, survive a reload, work offline.
// BASE=… SHOTS=… node tests/e2e/scores.mjs
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const FIXTURE = new URL("../fixtures/score-12p.pdf", import.meta.url).pathname;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on("dialog", (d) => d.accept());
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); await page.screenshot({ path: `${S}/fail-scores.png` }); throw e; } };
const lb = (fn, ...args) => page.evaluate(async ([src, a]) => { const m = await import("/js/lib/logbook.js"); return (new Function("m", "a", src))(m, a); }, [`return (${fn})(m, a)`, args]);
const text = async (sel) => (await page.locator(sel).first().textContent())?.trim();
const noWiden = async () => { const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth })); if (w.doc > w.vw) throw new Error("page widened " + JSON.stringify(w)); };
const pageNo = () => text("#sc-pageno");
const waitPage = (n) => page.waitForFunction((n) => document.querySelector("#sc-pageno")?.textContent.trim().startsWith(`${n} /`), n, { timeout: 8000 });
/** Fraction of dark pixels in the visible page canvas (0 when blank/white). */
const darkness = () => page.evaluate(() => {
  const c = document.querySelector("#sc-page"); if (!c || c.width < 2) return -1;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let dark = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 128) dark++;
  return dark / (d.length / 16);
});
const tap = async (fx, fy = 0.5) => { const v = page.viewportSize(); await page.touchscreen.tap(Math.round(v.width * fx), Math.round(v.height * fy)); };
const chrome = () => page.evaluate(() => document.querySelector(".sc-reader")?.classList.contains("chrome"));
/** Make the bar visible (a middle tap toggles it, so only tap when hidden). */
const ensureChrome = async () => { if (!(await chrome())) { await tap(0.5); await page.waitForFunction(() => document.querySelector(".sc-reader").classList.contains("chrome")); } };

await page.goto(`${BASE}/?app=1`);
await page.evaluate(() => { localStorage.setItem("ws.shell.seen", "true"); localStorage.removeItem("ws.shell.skin"); localStorage.removeItem("ws.logbook.data"); localStorage.removeItem("ws.scores.pos"); indexedDB.deleteDatabase("chopinly-scores"); });
await page.goto(`${BASE}/?app=1&t=1#/scores`);

await step("the Scores tool: empty state, then import the fixture PDF → a row with title from the PDF metadata and 12 pages", async () => {
  await page.waitForSelector(".scores");
  if (!(await text(".sc-empty"))?.includes("no scores yet")) throw new Error("empty copy");
  await noWiden();
  await page.screenshot({ path: `${S}/sc-01-empty.png` });
  await page.setInputFiles("#sc-file", FIXTURE);
  await page.waitForSelector(".sc-row", { timeout: 15000 });
  const row = await page.evaluate(() => ({ title: document.querySelector(".sc-title").textContent, sub: document.querySelector(".sc-sub").textContent, remote: document.querySelector(".sc-row").classList.contains("remote") }));
  if (row.title !== "Fixture Sonata") throw new Error("title " + row.title);
  if (!row.sub.includes("Fixtura Testovna") || !row.sub.includes("12 pages")) throw new Error("sub " + row.sub);
  if (row.remote) throw new Error("file should be on this device");
  const meta = await lb((m) => m.logbook.scores()[0]);
  if (!(meta.pages === 12 && meta.size > 1000 && meta.sha256.length === 64)) throw new Error("meta " + JSON.stringify(meta));
  await page.waitForTimeout(700); // the stamp flourish on the new row
  await page.screenshot({ path: `${S}/sc-02-library.png` });
});

await step("importing the same file again does not duplicate", async () => {
  await page.setInputFiles("#sc-file", FIXTURE);
  await page.waitForSelector(".lb-toast.show", { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector(".sc-add.busy"));
  if ((await page.locator(".sc-row").count()) !== 1) throw new Error("duplicated");
});

let scoreId;
await step("open → page 1 renders (dark pixels on the canvas), bar shows 1 / 12", async () => {
  scoreId = await lb((m) => m.logbook.scores()[0].id);
  await page.click(".sc-open");
  await page.waitForSelector(".sc-reader");
  await waitPage(1);
  await page.waitForFunction(() => document.querySelector("#sc-spin")?.hidden, null, { timeout: 15000 });
  const dk = await darkness();
  if (!(dk > 0.005)) throw new Error("page looks blank: " + dk);
  const hash = await page.evaluate(() => location.hash);
  if (!hash.startsWith("#/scores/")) throw new Error("hash " + hash);
  await page.screenshot({ path: `${S}/sc-03-reader-p1.png` });
});

await step("tap right ×3 → 4 / 12; tap left → 3 / 12; middle tap toggles the bar", async () => {
  await tap(0.9); await waitPage(2);
  await tap(0.9); await waitPage(3);
  await tap(0.9); await waitPage(4);
  await tap(0.1); await waitPage(3);
  const dk = await darkness();
  if (!(dk > 0.005)) throw new Error("page 3 blank: " + dk);
  await page.waitForFunction(() => !document.querySelector(".sc-reader").classList.contains("chrome"), null, { timeout: 4000 });
  await tap(0.5);
  await page.waitForFunction(() => document.querySelector(".sc-reader").classList.contains("chrome"));
  await page.screenshot({ path: `${S}/sc-04-reader-p3-chrome.png` });
  await tap(0.5);
  await page.waitForFunction(() => !document.querySelector(".sc-reader").classList.contains("chrome"));
});

await step("keys: End → 12 / 12, ArrowRight stays (soft stop), Home → 1, PageDown → 2, Space → 3", async () => {
  await page.keyboard.press("End"); await waitPage(12);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150);
  if (!(await pageNo()).startsWith("12 /")) throw new Error("wrapped past the end");
  await tap(0.9); await page.waitForTimeout(150);
  if (!(await pageNo()).startsWith("12 /")) throw new Error("tap wrapped past the end");
  await page.keyboard.press("Home"); await waitPage(1);
  await page.keyboard.press("PageDown"); await waitPage(2);
  await page.keyboard.press("Space"); await waitPage(3);
  await page.keyboard.press("ArrowLeft"); await waitPage(2);
});

await step("landscape: fit-page, then back to portrait fit-width", async () => {
  await page.setViewportSize({ width: 860, height: 420 });
  await page.waitForFunction(() => document.querySelector(".sc-reader")?.dataset.fit === "page", null, { timeout: 4000 });
  await page.waitForTimeout(400);
  const w = await page.evaluate(() => { const c = document.querySelector("#sc-page"); const r = c.getBoundingClientRect(); return { w: r.width, h: r.height, vh: innerHeight }; });
  if (!(w.h <= w.vh + 1 && w.w < 860)) throw new Error("not fit to page " + JSON.stringify(w));
  await page.screenshot({ path: `${S}/sc-05-landscape.png` });
  await page.setViewportSize({ width: 420, height: 860 });
  await page.waitForFunction(() => document.querySelector(".sc-reader")?.dataset.fit === "width", null, { timeout: 4000 });
  await page.waitForTimeout(400);
  const w2 = await page.evaluate(() => Math.round(document.querySelector("#sc-page").getBoundingClientRect().width));
  if (w2 !== 420) throw new Error("not fit to width " + w2);
});

await step("reload reopens on the same page (per-device position); back returns to the library", async () => {
  await page.reload();
  await page.waitForSelector(".sc-reader", { timeout: 15000 });
  await waitPage(2);
  await ensureChrome();
  await page.click("#sc-back");
  await page.waitForFunction(() => !document.querySelector(".sc-reader"));
  await page.waitForSelector(".sc-row");
  if (await page.evaluate(() => location.hash) !== "#/scores") throw new Error("hash after back");
});

await step("the more sheet offers fit + save; `save this score to a file` yields the original bytes", async () => {
  await page.click(".sc-open");
  await page.waitForSelector(".sc-reader");
  await waitPage(2);
  await ensureChrome();
  await page.click("#sc-more");
  await page.waitForSelector(".sc-more-wrap.open");
  await page.screenshot({ path: `${S}/sc-06-more.png` });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.click(".sc-more-wrap [data-save]")]);
  const path = await dl.path();
  const { readFileSync } = await import("node:fs");
  const got = readFileSync(path), want = readFileSync(FIXTURE);
  if (!got.equals(want)) throw new Error("exported PDF differs from the import");
  await page.waitForFunction(() => !document.querySelector(".lb-sheet-wrap:not(.closing)"));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sc-reader"));
});

await step("offline: the score still opens from the device store", async () => {
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  try {
    await page.reload().catch(() => {});
    await page.waitForSelector(".sc-row", { timeout: 15000 });
    await page.click(".sc-open");
    await page.waitForSelector(".sc-reader", { timeout: 15000 });
    await waitPage(2);
    await page.waitForFunction(() => document.querySelector("#sc-spin")?.hidden, null, { timeout: 15000 });
    if (!((await darkness()) > 0.005)) throw new Error("blank offline");
    await page.screenshot({ path: `${S}/sc-07-offline.png` });
  } finally { await ctx.setOffline(false); }
});

await step("hold a row → delete → empty state again", async () => {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sc-reader"));
  const box = await page.locator(".sc-open").boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  await page.waitForSelector(".sc-empty", { timeout: 5000 });
  const left = await page.evaluate(async () => { const { scoreStore } = await import("/js/lib/scores/store.js"); return (await scoreStore.usage()).count; });
  if (left !== 0) throw new Error("blob left behind");
});

await noWiden();
await browser.close();
if (errors.length) { console.log("ERRORS", errors); process.exit(1); }
console.log("scores e2e: all green");
