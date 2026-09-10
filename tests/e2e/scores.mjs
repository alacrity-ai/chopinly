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

await step("thumbnail renders for the row; search, sort, group by composer and tag chips narrow the list", async () => {
  await page.waitForSelector(".sc-thumb img", { timeout: 15000 });
  await lb((m) => { m.logbook.addScore({ title: "Invention 8", composer: "Bach", pages: 2, sha256: "x1", tags: ["baroque", "two-part"] }); m.logbook.addScore({ title: "Étude Op. 10 No. 3", composer: "Chopin", pages: 4, sha256: "x2", tags: ["romantic"] }); });
  await page.waitForFunction(() => document.querySelectorAll(".sc-row").length === 3);
  if ((await page.locator(".sc-row.remote").count()) !== 2) throw new Error("rows without a file should read remote");
  await page.fill("#sc-q", "bach");
  await page.waitForFunction(() => document.querySelectorAll(".sc-row").length === 1);
  if (!(await text(".sc-title")).includes("Invention")) throw new Error("search by composer");
  await page.fill("#sc-q", "etude");
  await page.waitForFunction(() => document.querySelectorAll(".sc-row").length === 1 && document.querySelector(".sc-title").textContent.includes("Étude"));
  await page.fill("#sc-q", "");
  await page.waitForFunction(() => document.querySelectorAll(".sc-row").length === 3);
  await page.click('[data-sort="title"]');
  await page.waitForFunction(() => document.querySelector(".sc-title").textContent.startsWith("Étude"));
  await page.click("#sc-group");
  await page.waitForSelector(".sc-groupname");
  const groups = await page.$$eval(".sc-groupname", (els) => els.map((e) => e.firstChild.textContent.trim()));
  if (JSON.stringify(groups) !== JSON.stringify(["Bach", "Chopin", "Fixtura Testovna"])) throw new Error("groups " + JSON.stringify(groups));
  await page.screenshot({ path: `${S}/sc-08-library-grouped.png` });
  await page.click("#sc-group");
  await page.click('.sc-tagrail [data-tag="baroque"]');
  await page.waitForFunction(() => document.querySelectorAll(".sc-row").length === 1);
  await page.click('.sc-tagrail [data-tag="baroque"]');
  await page.waitForFunction(() => document.querySelectorAll(".sc-row").length === 3);
  await page.click('[data-sort="recent"]');
  await noWiden();
});

await step("details sheet: edit title, composer, tags; link a goal through the picker", async () => {
  await lb((m) => m.logbook.addGoal({ name: "Fixture Sonata", composer: "Fixtura Testovna" }));
  const box = await page.locator('.sc-row:has-text("Fixture Sonata") .sc-open').boundingBox();
  await page.mouse.move(box.x + 60, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await page.waitForSelector(".sc-details-wrap.open #sc-d-title");
  await page.screenshot({ path: `${S}/sc-09-details.png` });
  await page.fill("#sc-d-title", "Fixture Sonata No. 1");
  await page.fill("#sc-d-tags", "exam, baroque");
  await page.click("#sc-d-save");
  await page.waitForFunction(() => !document.querySelector(".lb-sheet-wrap:not(.closing)"));
  await page.waitForFunction(() => document.querySelector(".sc-row:not(.remote) .sc-title")?.textContent === "Fixture Sonata No. 1");
  if (!(await page.locator(".sc-row:not(.remote) .sc-sub").textContent()).includes("exam")) throw new Error("tags not shown");
  const box2 = await page.locator('.sc-row:has-text("Fixture Sonata No. 1") .sc-open').boundingBox();
  await page.mouse.move(box2.x + 60, box2.y + box2.height / 2); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await page.waitForSelector(".sc-details-wrap.open #sc-d-goal");
  await page.click("#sc-d-goal");
  await page.waitForSelector(".lb-picker-wrap.open");
  await page.click('.lb-pick-row:has-text("Fixture Sonata")');
  await page.waitForSelector(".sc-details-wrap.open #sc-d-goal");
  if (!(await text("#sc-d-goal b")).includes("Fixture Sonata")) throw new Error("goal not linked in the sheet");
  await page.click(".sc-details-wrap .lb-close");
  await page.waitForFunction(() => !document.querySelector(".lb-sheet-wrap:not(.closing)"));
  const linked = await lb((m) => { const s = m.logbook.scores().find((x) => x.title === "Fixture Sonata No. 1"); return { goal: m.logbook.goal(s.goalId)?.name, tags: s.tags }; });
  if (linked.goal !== "Fixture Sonata" || linked.tags.join() !== "exam,baroque") throw new Error(JSON.stringify(linked));
  if (!(await page.locator(".sc-row:not(.remote) .sc-goal").textContent()).includes("Fixture Sonata")) throw new Error("goal chip on the row");
});

let scoreId;
await step("open → page 1 renders (dark pixels on the canvas), bar shows 1 / 12", async () => {
  scoreId = await lb((m) => m.logbook.scores().find((x) => x.title === "Fixture Sonata No. 1").id);
  await page.click('.sc-row:has-text("Fixture Sonata No. 1") .sc-open');
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
  await page.click('.sc-row:has-text("Fixture Sonata No. 1") .sc-open');
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

await step("bookmarks: add on page 3 with a label, button fills, jump back from page 5", async () => {
  await page.click('.sc-row:has-text("Fixture Sonata No. 1") .sc-open');
  await page.waitForSelector(".sc-reader");
  await waitPage(2);
  await page.keyboard.press("ArrowRight"); await waitPage(3);
  await ensureChrome();
  if (await page.evaluate(() => document.querySelector("#sc-mark").classList.contains("on"))) throw new Error("page 3 should not be marked yet");
  await page.click("#sc-mark");
  await page.waitForSelector(".sc-marks-wrap.open #sc-m-label");
  await page.fill("#sc-m-label", "coda");
  await page.click("#sc-m-go");
  await page.waitForSelector(".sc-marks-wrap.open #sc-m-remove");
  await page.screenshot({ path: `${S}/sc-10-bookmarks.png` });
  await page.click(".sc-marks-wrap .lb-close");
  await page.waitForFunction(() => !document.querySelector(".lb-sheet-wrap:not(.closing)"));
  await page.waitForFunction(() => document.querySelector("#sc-mark").classList.contains("on"));
  await page.keyboard.press("ArrowRight"); await waitPage(4);
  await page.keyboard.press("ArrowRight"); await waitPage(5);
  await page.waitForFunction(() => !document.querySelector("#sc-mark").classList.contains("on"));
  await ensureChrome();
  await page.click("#sc-mark");
  await page.waitForSelector(".sc-marks-wrap.open #sc-m-list");
  await page.click('#sc-m-list [data-page="3"]');
  await waitPage(3);
  await page.waitForFunction(() => !document.querySelector(".lb-sheet-wrap:not(.closing)"));
  const marks = await lb((m, a) => m.logbook.marks(a[0]).map((x) => [x.page, x.label]), scoreId);
  if (JSON.stringify(marks) !== JSON.stringify([[3, "coda"]])) throw new Error("marks " + JSON.stringify(marks));
});

await step("⋯ → practice this: the clock starts on the linked goal, the bar says practicing; Today shows a score link; the goal page lists the score", async () => {
  await ensureChrome();
  await page.click("#sc-more");
  await page.waitForSelector(".sc-more-wrap.open [data-practice]");
  await page.click(".sc-more-wrap [data-practice]");
  await page.waitForFunction(() => document.querySelector(".sc-reader")?.classList.contains("live"), null, { timeout: 5000 });
  const running = await lb((m) => m.logbook.running()?.goal.name);
  if (running !== "Fixture Sonata") throw new Error("running " + running);
  await page.screenshot({ path: `${S}/sc-11-practicing.png` });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sc-reader"));
  await page.goto(`${BASE}/?app=1#/logbook`);
  await page.waitForSelector("#lb-hero-score", { timeout: 8000 });
  await page.screenshot({ path: `${S}/sc-12-hero-score-link.png` });
  await page.click("#lb-hero-score");
  await page.waitForSelector(".sc-reader", { timeout: 10000 });
  await waitPage(3);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sc-reader"));
  const gid = await lb((m) => m.logbook.running().goal.id);
  await page.goto(`${BASE}/?app=1#/logbook/goals/${gid}`);
  await page.waitForSelector(".lb-gp-score", { timeout: 8000 });
  if (!(await text(".lb-gp-score b")).includes("Fixture Sonata No. 1")) throw new Error("goal page score row");
  await lb((m) => m.logbook.stop());
  await page.goto(`${BASE}/?app=1#/scores`);
  await page.waitForSelector(".sc-row");
});

await step("starting practice on a goal with a score asks to open it: stay here from play; open from the goal page (WSHED-103)", async () => {
  await page.goto(`${BASE}/?app=1#/logbook`);
  await page.waitForSelector("#lb-play");
  await page.click("#lb-play");
  await page.waitForSelector(".lb-picker-wrap.open");
  await page.click('.lb-pick-row:has-text("Fixture Sonata")');
  await page.waitForSelector(".lb-ceremony.engage.in");
  await page.waitForFunction(() => !document.querySelector(".lb-ceremony"), null, { timeout: 8000 });
  await page.waitForSelector(".lb-score-prompt.open #lb-score-open", { timeout: 8000 });
  await page.screenshot({ path: `${S}/sc-16-open-score-prompt.png` });
  await page.click("#lb-score-stay");
  await page.waitForFunction(() => !document.querySelector(".lb-sheet-wrap:not(.closing)"));
  await page.waitForSelector(".lb-hero.running");
  if (await page.locator(".sc-reader").count()) throw new Error("stay here opened the reader");
  const gid = await lb((m) => { const g = m.logbook.running().goal.id; m.logbook.stop(); return g; });
  await page.goto(`${BASE}/?app=1#/logbook/goals/${gid}`);
  await page.waitForSelector("#lb-gp-practice");
  await page.click("#lb-gp-practice");
  await page.waitForSelector(".lb-ceremony.engage.in");
  await page.waitForFunction(() => !document.querySelector(".lb-ceremony"), null, { timeout: 8000 });
  await page.waitForSelector(".lb-score-prompt.open #lb-score-open", { timeout: 8000 });
  await page.click("#lb-score-open");
  await page.waitForSelector(".sc-reader", { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector(".sc-reader")?.classList.contains("live"), null, { timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sc-reader"));
  // a goal without a score never asks
  await lb((m) => { m.logbook.stop(); const g = m.logbook.addGoal({ name: "Scales", type: "technique" }); m.logbook.start(g.id); m.logbook.stop(); });
  await page.goto(`${BASE}/?app=1#/logbook`);
  await page.waitForSelector("#lb-play");
  await page.click("#lb-play");
  await page.waitForSelector(".lb-picker-wrap.open");
  await page.click('.lb-pick-row:has-text("Scales")');
  await page.waitForFunction(() => !document.querySelector(".lb-ceremony"), null, { timeout: 8000 });
  await page.waitForTimeout(400);
  if (await page.locator(".lb-score-prompt").count()) throw new Error("asked for a goal without a score");
  await lb((m) => m.logbook.stop());
  await page.goto(`${BASE}/?app=1#/scores`);
  await page.waitForSelector(".sc-row");
});

/** Draw a stroke on the ink overlay with synthetic pen pointer events (fractions of the page). */
const penStroke = (pts, { type = "pen", pressure = 0.6 } = {}) => page.evaluate(([pts, type, pressure]) => {
  const c = document.querySelector(".sc-ink"); const r = c.getBoundingClientRect();
  const ev = (name, fx, fy, extra = {}) => c.dispatchEvent(new PointerEvent(name, { bubbles: true, cancelable: true, pointerId: 7, pointerType: type, isPrimary: true, clientX: r.left + fx * r.width, clientY: r.top + fy * r.height, pressure, button: 0, buttons: 1, ...extra }));
  ev("pointerdown", pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ev("pointermove", x, y);
  ev("pointerup", pts[pts.length - 1][0], pts[pts.length - 1][1], { buttons: 0 });
}, [pts, type, pressure]);
/** Count of non-transparent pixels on the ink overlay. */
const inkPixels = () => page.evaluate(() => { const c = document.querySelector(".sc-ink"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; });
/** The most opaque pixel within a few px of a page fraction on the overlay ([r,g,b,a]). */
const NEAR = `(fx, fy) => { const c = document.querySelector(".sc-ink"); const r = 5, x0 = Math.round(fx * c.width) - r, y0 = Math.round(fy * c.height) - r; const d = c.getContext("2d").getImageData(x0, y0, 2 * r + 1, 2 * r + 1).data; let best = [0, 0, 0, 0]; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > best[3]) best = [d[i], d[i + 1], d[i + 2], d[i + 3]]; return best; }`;
const inkAt = (fx, fy) => page.evaluate(([fx, fy, src]) => (new Function("return " + src)())(fx, fy), [fx, fy, NEAR]);
const inkNearFn = (fx, fy, pred) => page.waitForFunction(([fx, fy, src, p]) => (new Function("return " + p)())((new Function("return " + src)())(fx, fy)), [fx, fy, NEAR, pred.toString()], { timeout: 8000 });

await step("ink: pen draws, a pen tap on the edge still turns, a finger does not draw unless toggled", async () => {
  await page.click('.sc-row:has-text("Fixture Sonata No. 1") .sc-open');
  await page.waitForSelector(".sc-reader");
  await waitPage(3);
  await page.waitForFunction(() => document.querySelector("#sc-spin")?.hidden, null, { timeout: 15000 });
  await ensureChrome();
  await page.click("#sc-ink");
  await page.waitForSelector(".sc-inkbar:not([hidden])");
  if ((await inkPixels()) !== 0) throw new Error("overlay should start clean");
  await penStroke([[0.2, 0.3], [0.3, 0.32], [0.4, 0.3], [0.5, 0.33], [0.6, 0.3]]);
  await page.waitForFunction(() => document.querySelector('.sc-inkbar [data-act="undo"]')?.disabled === false);
  const px1 = await inkPixels();
  if (!(px1 > 200)) throw new Error("pen stroke did not draw: " + px1);
  const col = await inkAt(0.4, 0.3);
  if (!(col[3] > 100 && col[0] < 60)) throw new Error("ink colour " + col);
  // a pen tap on the right edge is a tap, not a stroke: the page turns
  await penStroke([[0.92, 0.5]]);
  await waitPage(4);
  await page.waitForFunction(() => document.querySelector("#sc-spin")?.hidden, null, { timeout: 15000 });
  await page.waitForFunction(() => { const c = document.querySelector(".sc-ink"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) return false; return true; });
  await penStroke([[0.08, 0.5]]);
  await waitPage(3);
  await page.waitForFunction(() => { const c = document.querySelector(".sc-ink"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n > 200; });
  // a finger with the toggle off draws nothing — it falls through to the stage, where a drag is a swipe (this one turns back a page)
  await penStroke([[0.2, 0.6], [0.3, 0.62], [0.4, 0.6], [0.5, 0.63], [0.6, 0.6]], { type: "touch" });
  await waitPage(2);
  await page.keyboard.press("ArrowRight"); await waitPage(3);
  await page.waitForFunction(() => document.querySelector("#sc-spin")?.hidden, null, { timeout: 15000 });
  await inkNearFn(0.3, 0.32, (d) => d[3] > 100);
  if ((await inkAt(0.4, 0.6))[3] > 40) throw new Error("a finger drew with the toggle off");
  await page.click('.sc-inkbar [data-act="finger"]');
  await penStroke([[0.2, 0.6], [0.3, 0.62], [0.4, 0.6], [0.5, 0.63], [0.6, 0.6]], { type: "touch" });
  await inkNearFn(0.4, 0.6, (d) => d[3] > 40);
  await page.click('.sc-inkbar [data-act="finger"]');
  await page.screenshot({ path: `${S}/sc-14-ink.png` });
});

await step("ink: the yellow highlighter brush, eraser removes a stroke, undo brings it back, ink survives a reload and is synced under the ink cap", async () => {
  await page.click('.sc-inkbar [data-brush="b-yellow"]');
  await penStroke([[0.2, 0.45], [0.7, 0.45]]);
  await inkNearFn(0.45, 0.45, (d) => d[3] > 20 && d[0] > d[2]);
  await page.waitForTimeout(600); // the debounced save
  const saved = await lb((m, a) => { const k = m.logbook.inkFor(a[0], 3); return { n: k?.s.length, hi: k?.s.filter((x) => x.t === "hi").length, bytes: JSON.stringify(k).length, pending: m.logbook.doc.pending.filter((p) => p.startsWith("ink:")).length }; }, scoreId);
  if (saved.n !== 3 || saved.hi !== 1 || saved.pending !== 1) throw new Error("saved " + JSON.stringify(saved));
  await page.click('.sc-inkbar [data-tool="eraser"]');
  await penStroke([[0.4, 0.25], [0.4, 0.36]]); // crosses the first pen stroke
  await inkNearFn(0.3, 0.32, (d) => d[3] <= 40);
  await page.waitForTimeout(600);
  if ((await lb((m, a) => m.logbook.inkFor(a[0], 3).s.length, scoreId)) !== 2) throw new Error("eraser did not remove the stroke");
  await page.click('.sc-inkbar [data-act="undo"]');
  await inkNearFn(0.3, 0.32, (d) => d[3] > 100);
  await page.waitForTimeout(600);
  if ((await lb((m, a) => m.logbook.inkFor(a[0], 3).s.length, scoreId)) !== 3) throw new Error("undo did not restore");
  await page.screenshot({ path: `${S}/sc-15-ink-tools.png` });
  // brushes (WSHED-106): the sheet adds one, it lands in the bar in hand, a delete falls back to the first brush
  await page.click('.sc-inkbar [data-act="brushes"]');
  await page.waitForSelector("#sc-br-add");
  await page.screenshot({ path: `${S}/sc-15b-brushes.png` });
  await page.click("#sc-br-add");
  await page.fill("#sc-br-name", "fat blue");
  await page.click('[data-color="#2f6f9f"]');
  await page.$eval("#sc-br-width", (r) => { r.value = "6"; r.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.screenshot({ path: `${S}/sc-15c-brush-editor.png` });
  await page.click("#sc-br-save");
  await page.waitForSelector(".sc-br-row");
  await page.click(".lb-close");
  await page.waitForFunction(() => !document.querySelector(".lb-sheet-wrap") && document.querySelector(".sc-ink-brush.on")?.getAttribute("aria-label").startsWith("fat blue — 6 px"), null, { timeout: 5000 });
  await penStroke([[0.2, 0.7], [0.7, 0.7]]);
  await inkNearFn(0.45, 0.7, (d) => d[3] > 100 && d[2] > d[0]);
  await page.waitForTimeout(600); // the debounced save
  const custom = await lb((m, a) => m.logbook.inkFor(a[0], 3).s.at(-1), scoreId);
  if (custom.k !== "#2f6f9f" || custom.a !== 100) throw new Error("stroke should carry the brush colour: " + JSON.stringify(custom));
  await lb((m) => { const b = m.logbook.brushes().find((x) => x.name === "fat blue"); m.logbook.reorderBrushes([b.id]); m.logbook.removeBrush(b.id); });
  await page.waitForFunction(() => document.querySelector(".sc-ink-brush.on")?.dataset.brush === "b-ink");
  if ((await lb((m) => m.logbook.doc.deleted.filter((t) => t.kind === "brush").length)) !== 1) throw new Error("brush delete should tombstone");
  await page.reload();
  await page.waitForSelector(".sc-reader", { timeout: 15000 });
  await waitPage(3);
  await page.waitForFunction(() => document.querySelector("#sc-spin")?.hidden, null, { timeout: 15000 });
  await inkNearFn(0.3, 0.32, (d) => d[3] > 100);
  if (await page.evaluate(() => document.querySelector(".sc-inkbar").hidden === false)) throw new Error("ink mode should start off");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sc-reader"));
});

await step("the persistent page tier: a cache asked to persist stores a page, the next cache decodes it, eviction clears it", async () => {
  const r = await page.evaluate(async (id) => {
    const { scoreStore } = await import("/js/lib/scores/store.js");
    const { open } = await import("/js/lib/scores/pdf.js");
    const { createPageCache } = await import("/js/lib/scores/pagecache.js");
    const before = await scoreStore.pagesUsage();
    const doc = await open(await scoreStore.get(id));
    const c1 = createPageCache(doc, { width: 300, dpr: 1, scoreId: id, persist: true, size: 0 });
    await c1.get(1);
    for (let i = 0; i < 40 && c1.stats.stored < 1; i++) await new Promise((r) => setTimeout(r, 100));
    const mid = await scoreStore.pagesUsage();
    c1.close();
    const c2 = createPageCache(doc, { width: 300, dpr: 1, scoreId: id, persist: true, size: 0 });
    const bmp = await c2.get(1);
    const decoded = c2.stats.decoded, w = bmp.width;
    c2.close();
    const evicted = await scoreStore.evictPages(0, [id]);
    const after = await scoreStore.pagesUsage();
    doc.close();
    return { before: before.count, mid: mid.count, midBytes: mid.bytes, decoded, w, evicted, after: after.count };
  }, scoreId);
  if (!(r.mid > r.before && r.midBytes > 1000)) throw new Error("page not stored " + JSON.stringify(r));
  if (r.decoded !== 1 || r.w !== 300) throw new Error("second cache should decode from the store " + JSON.stringify(r));
  if (r.evicted[0] !== scoreId || r.after !== 0) throw new Error("eviction " + JSON.stringify(r));
});

await step("account sheet: scores on this device", async () => {
  await page.click("#account-btn");
  await page.waitForSelector("#acct-scores-sub");
  await page.waitForFunction(() => /1 score/.test(document.querySelector("#acct-scores-sub").textContent));
  await page.click("#acct-scores");
  await page.waitForSelector("#sc-copy");
  await page.waitForFunction(() => /1 score here/.test(document.querySelector("#sc-copy").textContent));
  await page.screenshot({ path: `${S}/sc-13-storage.png` });
  await page.click(".lb-sheet-wrap .lb-close");
  await page.waitForFunction(() => !document.querySelector(".lb-sheet-wrap:not(.closing)"));
});

await step("offline: the score still opens from the device store", async () => {
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  try {
    await page.reload().catch(() => {});
    await page.waitForSelector(".sc-row", { timeout: 15000 });
    await page.click('.sc-row:has-text("Fixture Sonata No. 1") .sc-open');
    await page.waitForSelector(".sc-reader", { timeout: 15000 });
    await waitPage(3);
    await page.waitForFunction(() => document.querySelector("#sc-spin")?.hidden, null, { timeout: 15000 });
    if (!((await darkness()) > 0.005)) throw new Error("blank offline");
    await page.screenshot({ path: `${S}/sc-07-offline.png` });
  } finally { await ctx.setOffline(false); }
});

await step("hold a row → details → delete: file, thumbnail, bookmarks all go; remote rows stay", async () => {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sc-reader"));
  const box = await page.locator('.sc-row:has-text("Fixture Sonata No. 1") .sc-open').boundingBox();
  await page.mouse.move(box.x + 60, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await page.waitForSelector(".sc-details-wrap.open #sc-d-delete");
  await page.click("#sc-d-delete");
  await page.waitForFunction(() => document.querySelectorAll(".sc-row").length === 2, null, { timeout: 5000 });
  const left = await page.evaluate(async () => { const { scoreStore } = await import("/js/lib/scores/store.js"); return { files: (await scoreStore.usage()).count, pages: (await scoreStore.pagesUsage()).count }; });
  if (left.files !== 0 || left.pages !== 0) throw new Error("blob or pages left behind " + JSON.stringify(left));
  const gone = await lb((m, a) => ({ score: m.logbook.score(a[0]), marks: m.logbook.marks(a[0]).length, ink: m.logbook.inkPages(a[0]).length, tomb: m.logbook.doc.deleted.filter((t) => t.kind === "mark").length, inkTomb: m.logbook.doc.deleted.filter((t) => t.kind === "ink").length }), scoreId);
  if (gone.score || gone.marks || gone.ink || gone.tomb !== 1 || gone.inkTomb !== 1) throw new Error(JSON.stringify(gone));
});

await noWiden();
await browser.close();
if (errors.length) { console.log("ERRORS", errors); process.exit(1); }
console.log("scores e2e: all green");
