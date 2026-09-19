// Compose Help E2E (WSHED-159, docs/COMPOSE_HELP_DESIGN.md §8): the doors in, the
// sidebar, keyword search, the figures, prev/next, a deep link, the phone drawer,
// and that coming back lands on the same piece in the same mode.
// BASE=… SHOTS=… node tests/e2e/compose-help.mjs
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
const step = async (name, f) => {
  try { await f(); console.log("ok  ", name, errors.length ? `(${errors.length} page errors so far)` : ""); }
  catch (e) { console.log("FAIL", name, "—", e.message); if (errors.length) console.log("  page errors:", errors.join("\n  ")); console.log("  url:", page.url()); await page.screenshot({ path: `${S}/fail-compose-help.png` }); throw e; }
};
const state = () => page.evaluate(() => document.querySelector(".cp-editor")?.__editor?.state ?? null);

await page.goto(`${BASE}/?app=1`);
await page.evaluate(() => { localStorage.setItem("ws.shell.seen", "true"); localStorage.removeItem("ws.logbook.data"); for (const k of Object.keys(localStorage)) if (k.startsWith("ws.compose.")) localStorage.removeItem(k); });
const id = await page.evaluate(async () => {
  const [model, lb] = await Promise.all([import("/js/lib/compose/model.js"), import("/js/lib/logbook.js")]);
  const doc = model.newComposition({ id: "help-e2e", title: "Help E2E", composer: "Test" });
  lb.logbook.addComposition(doc);
  return doc.id;
});

await step("the compositions list has a help button, and it opens the help page", async () => {
  await page.goto(`${BASE}/?app=1#/compose`);
  await page.waitForSelector("#cp-help");
  await page.click("#cp-help");
  await page.waitForSelector(".hp-article");
  if (!page.url().endsWith("#/compose/help")) throw new Error("url " + page.url());
});

await step("the contents page lists four sections and 24 articles", async () => {
  const caps = await page.$$eval(".hp-cap", (e) => e.map((x) => x.textContent.trim()));
  if (caps.join("|") !== "Start here|The editor|The rails|Keeping and sharing") throw new Error(caps.join("|"));
  const n = await page.$$eval(".hp-link", (e) => e.length);
  if (n !== 24) throw new Error(`${n} articles in the sidebar`);
  const cards = await page.$$eval(".hp-cards a", (e) => e.length);
  if (cards !== 24) throw new Error(`${cards} cards on the index`);
  await page.screenshot({ path: `${S}/hp-01-index.png` });
});

await step("search: chevron finds Gesture mode first, with the term marked", async () => {
  await page.fill("#hp-q", "chevron");
  await page.waitForSelector(".hp-res");
  const first = await page.textContent(".hp-res b");
  if (first.trim() !== "Gesture mode") throw new Error("first result " + first);
  const marks = await page.$$eval(".hp-res mark", (e) => e.map((x) => x.textContent.toLowerCase()));
  if (!marks.some((m) => m.startsWith("chevron"))) throw new Error("no marked term: " + marks.join(","));
  await page.screenshot({ path: `${S}/hp-02-search.png` });
});

await step("Enter opens the top result; Escape clears the field and the contents come back", async () => {
  await page.focus("#hp-q");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".hp-article h1");
  if ((await page.textContent(".hp-article h1")) !== "Gesture mode") throw new Error(await page.textContent(".hp-article h1"));
  if (!page.url().endsWith("#/compose/help/gestures")) throw new Error("url " + page.url());
  await page.fill("#hp-q", "pedal");
  await page.waitForSelector(".hp-res");
  await page.focus("#hp-q");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".hp-links");
  if (await page.$(".hp-res")) throw new Error("results still showing");
});

await step("the article draws its figures at a real size, and its headings nest in the sidebar", async () => {
  const figs = await page.$$eval(".hp-fig", (e) => e.map((x) => Math.round(x.getBoundingClientRect().width)));
  if (figs.length < 7 || figs.some((w) => w < 100)) throw new Error("figures " + figs.join(","));
  const titled = await page.$$eval(".hp-fig title", (e) => e.length);
  if (titled !== figs.length) throw new Error(`${titled} titles for ${figs.length} figures`);
  const subs = await page.$$eval(".hp-subl", (e) => e.map((x) => x.textContent));
  if (!subs.includes("The four chevrons")) throw new Error(subs.join("|"));
  await page.screenshot({ path: `${S}/hp-03-gestures.png` });
});

await step("a screenshot article shows a real image, not a broken one", async () => {
  await page.goto(`${BASE}/?app=1#/compose/help/rail-form`);
  await page.waitForSelector(".hp-shot img");
  const ok = await page.$$eval(".hp-shot img", (e) => e.map((x) => x.naturalWidth > 100 && x.getBoundingClientRect().width > 100));
  if (!ok.length || ok.some((v) => !v)) throw new Error("shots " + JSON.stringify(ok));
  if ((await page.textContent(".hp-article h1")) !== "The Form rail") throw new Error("deep link");
});

await step("prev / next walk the reading order, and an in-article link jumps", async () => {
  await page.click(".hp-next");
  await page.waitForFunction(() => document.querySelector(".hp-article h1")?.textContent === "The Piano rail");
  await page.click(".hp-prev");
  await page.waitForFunction(() => document.querySelector(".hp-article h1")?.textContent === "The Form rail");
  await page.click('.hp-article a[href="#/compose/help/rail-dynamics"]');
  await page.waitForFunction(() => document.querySelector(".hp-article h1")?.textContent === "Dynamics · hairpins · text");
  if (!page.url().endsWith("#/compose/help/rail-dynamics")) throw new Error("url " + page.url());
});

await step("a deep link reloads straight into its article", async () => {
  await page.goto(`${BASE}/?app=1#/compose/help/layout`);
  await page.waitForSelector(".hp-article h1");
  if ((await page.textContent(".hp-article h1")) !== "The Layout editor") throw new Error(await page.textContent(".hp-article h1"));
  const on = await page.textContent(".hp-link.on");
  if (on.trim() !== "The Layout editor") throw new Error("sidebar not marked: " + on);
});

await step("Options ▾ → Help opens it from the editor, and ‹ comes back to the same piece and mode", async () => {
  await page.goto(`${BASE}/?app=1#/compose/${id}`);
  await page.waitForSelector(".cp-editor .cp-svg");
  await page.click('[data-act="select"]'); // a mode to come back to — the Controls rail, not the panel
  if ((await state()).mode !== "select") throw new Error("mode not set");
  await page.click("[data-pop=cp-options-more]");
  await page.waitForSelector('[data-act="help"]', { state: "visible" });
  await page.click('[data-act="help"]');
  await page.waitForSelector(".hp-article");
  if (!page.url().endsWith("#/compose/help")) throw new Error("url " + page.url());
  if (await page.isVisible(".cp-editor")) throw new Error("the editor is still showing under the help page");
  await page.click(".hp-back");
  await page.waitForSelector(".cp-editor .cp-svg", { state: "visible" });
  const s = await state();
  if (s.mode !== "select") throw new Error("came back in mode " + s.mode);
  if (s.title !== "Help E2E") throw new Error("came back to " + s.title);
});

await step("? from the editor opens help too", async () => {
  await page.keyboard.press("Shift+/");
  await page.waitForSelector(".hp-article");
  await page.click(".hp-back");
  await page.waitForSelector(".cp-editor .cp-svg", { state: "visible" });
});

await step("at phone width the sidebar is a drawer", async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA });
  const p = await phone.newPage();
  await p.goto(`${BASE}/?app=1`);
  await p.evaluate(() => localStorage.setItem("ws.shell.seen", "true"));
  await p.goto(`${BASE}/?app=1#/compose/help/gestures`);
  await p.waitForSelector(".hp-article");
  // "off screen" is measured against the drawer's own width: .hp-body is inset from the viewport,
  // so a closed drawer's right edge is a few px in, not below zero.
  const shut = () => p.evaluate(() => { const el = document.querySelector(".hp-side"); return el.getBoundingClientRect().right < el.offsetWidth / 2; });
  if (!(await shut())) throw new Error("the drawer is open at rest");
  await p.click(".hp-contents");
  await p.waitForTimeout(300);
  if (await shut()) throw new Error("the drawer did not open");
  await p.screenshot({ path: `${S}/hp-04-phone.png` });
  await p.click('.hp-link:text("The Layout editor")');
  await p.waitForTimeout(300);
  if (!(await shut())) throw new Error("the drawer stayed open after choosing");
  if ((await p.textContent(".hp-article h1")) !== "The Layout editor") throw new Error("the drawer did not navigate");
  if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("the page widened");
  await p.close();
  await phone.close();
});

await step("no page errors anywhere", () => { if (errors.length) throw new Error(errors.join("\n  ")); });

await browser.close();
console.log("ALL GREEN");
