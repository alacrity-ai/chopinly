// Piano keyboard E2E (WSHED-73). BASE=… SHOTS=… node keyboard.mjs
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); await page.screenshot({ path: `${S}/fail-kb.png` }); throw e; } };
const noWiden = async () => { const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth })); if (w.doc > w.vw) throw new Error("page widened " + JSON.stringify(w)); };
const centre = async (sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height * 0.8 }; };
const held = () => page.$$eval(".kb-key.down", (els) => els.map((e) => e.dataset.midi));

await page.goto(`${BASE}/?app=1`);
await page.evaluate(() => { localStorage.setItem("ws.shell.seen", "true"); localStorage.removeItem("ws.shell.skin"); });
await page.goto(`${BASE}/?app=1&k=1#/keyboard`);
await page.waitForSelector(".kb-key");

await step("two octaves on a phone: 15 white keys, 10 black, C labels only, no widening", async () => {
  const n = await page.evaluate(() => ({ w: document.querySelectorAll(".kb-white").length, b: document.querySelectorAll(".kb-black").length, labels: [...document.querySelectorAll(".kb-label")].map((l) => l.textContent).filter(Boolean) }));
  if (n.w !== 15 || n.b !== 10) throw new Error(JSON.stringify(n));
  if (n.labels.join() !== "C4,C5,C6") throw new Error("labels " + n.labels.join());
  const black = await page.locator(".kb-black").first().boundingBox(), white = await page.locator(".kb-white").first().boundingBox();
  if (!(black.height < white.height * 0.75 && black.width < white.width)) throw new Error("black keys should be shorter and narrower");
  await noWiden();
  await page.screenshot({ path: `${S}/kb-01-idle.png` });
});

await step("press a key: it goes down and the readout names it; release: it comes back", async () => {
  const c = await centre('.kb-key[data-midi="64"]');
  await page.mouse.move(c.x, c.y); await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('.kb-key[data-midi="64"].down'));
  if ((await page.textContent("#kb-notes")).trim() !== "E4") throw new Error("readout " + await page.textContent("#kb-notes"));
  await page.screenshot({ path: `${S}/kb-02-down.png` });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector(".kb-key.down"));
  if (!(await page.locator("#kb-notes.dim").count())) throw new Error("last note should stay, dimmed");
});

await step("glide: dragging across keys releases the old one and presses the new one", async () => {
  const a = await centre('.kb-key[data-midi="60"]'), b = await centre('.kb-key[data-midi="62"]');
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.waitForFunction(() => document.querySelector('.kb-key[data-midi="62"].down') && !document.querySelector('.kb-key[data-midi="60"].down'));
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector(".kb-key.down"));
});

await step("the computer keyboard plays: A = bottom C, K = the C above; chords hold", async () => {
  await page.keyboard.down("a"); await page.keyboard.down("k");
  await page.waitForFunction(() => document.querySelectorAll(".kb-key.down").length === 2);
  if ((await held()).join() !== "60,72") throw new Error("held " + (await held()).join());
  if ((await page.textContent("#kb-notes")).trim() !== "C4 · C5") throw new Error("readout " + await page.textContent("#kb-notes"));
  await page.keyboard.up("a"); await page.keyboard.up("k");
  await page.waitForFunction(() => !document.querySelector(".kb-key.down"));
});

await step("octave shift moves the range and is remembered; sustain toggles", async () => {
  await page.click("#kb-up");
  await page.waitForFunction(() => document.querySelector(".kb-label")?.textContent === "C5");
  if ((await page.textContent("#kb-range")).trim() !== "C5 – C7") throw new Error(await page.textContent("#kb-range"));
  await page.click("#kb-sustain");
  if ((await page.getAttribute("#kb-sustain", "aria-pressed")) !== "true") throw new Error("pedal");
  await page.reload(); await page.waitForSelector(".kb-key");
  if ((await page.textContent("#kb-range")).trim() !== "C5 – C7" || (await page.getAttribute("#kb-sustain", "aria-pressed")) !== "true") throw new Error("not remembered");
  await page.click("#kb-down"); await page.click("#kb-sustain");
});

await step("labels: all / none", async () => {
  await page.click('#kb-labels [data-l="all"]');
  if ((await page.$$eval(".kb-label", (els) => els.filter((l) => l.textContent).length)) !== 25) throw new Error("all labels");
  await page.click('#kb-labels [data-l="none"]');
  if ((await page.$$eval(".kb-label", (els) => els.filter((l) => l.textContent).length)) !== 0) throw new Error("no labels");
  await page.click('#kb-labels [data-l="c"]');
});

await step("skins recolor the keys", async () => {
  const bg = () => page.$eval(".kb-white", (e) => getComputedStyle(e).backgroundColor);
  const ebony = await bg();
  await page.evaluate(() => localStorage.setItem("ws.shell.skin", JSON.stringify("green-piano")));
  await page.reload(); await page.waitForSelector(".kb-key");
  const green = await bg();
  if (ebony === green) throw new Error("white key did not change with the skin: " + ebony);
  await page.screenshot({ path: `${S}/kb-03-green.png` });
  await page.evaluate(() => localStorage.removeItem("ws.shell.skin"));
});

await browser.close();
if (errors.length) { console.log("PAGE ERRORS", errors); process.exit(1); }
console.log("KEYBOARD ALL GREEN");
