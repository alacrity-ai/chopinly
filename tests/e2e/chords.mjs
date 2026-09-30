// Almanac + chord diagrams E2E (WSHED-160). BASE=… SHOTS=… node chords.mjs
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const browser = await chromium.launch();
const errors = [];
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
};
let page;
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); await page.screenshot({ path: `${S}/fail-chords.png` }); await browser.close(); process.exit(1); } };
const noWiden = async () => { const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth })); if (w.doc > w.vw) throw new Error("page widened " + JSON.stringify(w)); };
const names = () => page.$$eval(".cd-card .cd-name", (els) => els.map((e) => e.textContent.trim()));
const expect = (ok, msg) => { if (!ok) throw new Error(msg); };

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page = await phone.newPage();
watch(page);
await page.goto(`${BASE}/?app=1`);
await page.evaluate(() => { localStorage.setItem("ws.shell.seen", "true"); localStorage.removeItem("ws.shell.skin"); for (const k of Object.keys(localStorage)) if (k.startsWith("ws.chords.")) localStorage.removeItem(k); });
await page.goto(`${BASE}/?app=1#/metronome`);
await page.waitForSelector(".picker-btn .picker-name");

await step("the menu has one Almanac line with a chevron — chord diagrams are not in the main list", async () => {
  await page.click(".picker-btn");
  await page.waitForSelector(".picker-menu:not([hidden]) .picker-group");
  expect((await page.textContent(".picker-group")).trim() === "Almanac", "group label");
  expect(await page.locator(".picker-group .picker-more svg").count() === 1, "chevron");
  expect(await page.locator('.picker-menu > [data-tool="chords"]').count() === 0, "chords must live in the flyout");
  await page.screenshot({ path: `${S}/ch-01-menu.png` });
});

await step("phone: the flyout covers the menu with a back row; back returns to the menu", async () => {
  await page.click(".picker-group");
  await page.waitForSelector(".picker-flyout:not([hidden]).over");
  expect(await page.isVisible(".picker-flyout .picker-back"), "back row");
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".picker-menu")).visibility) === "hidden", "the menu steps behind");
  expect((await page.getAttribute(".picker-group", "aria-expanded")) === "true", "aria-expanded");
  await noWiden();
  await page.screenshot({ path: `${S}/ch-02-flyout-phone.png` });
  await page.click(".picker-back");
  await page.waitForSelector(".picker-flyout[hidden]", { state: "attached" });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".picker-menu")).visibility) === "visible", "menu back");
});

await step("Chord diagrams opens from the flyout: button says Chords, hash #/chords/guitar/C, the menu marks Almanac", async () => {
  await page.click(".picker-group");
  await page.click('.picker-flyout [data-tool="chords"]');
  await page.waitForSelector(".cd-card");
  expect((await page.textContent(".picker-btn .picker-name")).trim() === "Chords", "short name");
  expect(new URL(page.url()).hash === "#/chords/guitar/C", "hash " + page.url());
  expect(await page.locator(".picker-group.current").count() === 1, "Almanac marked current");
  expect(await page.isHidden(".picker-menu"), "menu closed");
});

await step("C on guitar: Triads → Slash chords in order, three boxes a row, C first with the open shape, no widening", async () => {
  const cats = await page.$$eval(".cd-section .cd-h span", (els) => els.map((e) => e.textContent));
  expect(cats.join("|") === "Triads|Sixths|Sevenths|Ninths|Elevenths & thirteenths|Slash chords", cats.join("|"));
  const n = await names();
  expect(n.length >= 40 && n[0] === "C" && n[1] === "Cm" && n.includes("Cmaj7") && n.includes("C7♯9") && n.includes("C/E"), n.slice(0, 8).join(" "));
  const lefts = await page.$$eval(".cd-section:first-child .cd-card", (els) => [...new Set(els.slice(0, 6).map((e) => Math.round(e.getBoundingClientRect().left)))]);
  expect(lefts.length === 3, "columns " + lefts);
  const first = await page.locator(".cd-card").first();
  expect(await first.locator(".cd-dot").count() === 3 && await first.locator(".cd-dot.root").count() === 2 && await first.locator(".cd-mute").count() === 1, "C = x32010");
  await noWiden();
  await page.screenshot({ path: `${S}/ch-03-grid.png` });
});

await step("the key rail: A → A's chords, hash follows, remembered after a reload", async () => {
  await page.click('#cd-keys [data-key="A"]');
  expect((await names())[0] === "A", "first " + (await names())[0]);
  expect(new URL(page.url()).hash === "#/chords/guitar/A", page.url());
  await page.goto(`${BASE}/?app=1#/chords`);
  await page.waitForSelector(".cd-card");
  expect((await page.getAttribute('#cd-keys [data-key="A"]', "aria-pressed")) === "true", "A remembered");
});

await step("Ukulele: four strings, remembered; back to guitar", async () => {
  await page.click('#cd-inst [data-inst="ukulele"]');
  await page.waitForFunction(() => document.querySelector(".cd-card")?.querySelectorAll(".cd-string").length === 4);
  const am = page.locator(".cd-card").filter({ has: page.locator(".cd-name", { hasText: /^Am$/ }) }).first();
  expect(await am.locator(".cd-dot").count() === 1, "uke Am = 2000");
  await page.screenshot({ path: `${S}/ch-04-ukulele.png` });
  await page.reload(); await page.waitForSelector(".cd-card");
  expect((await page.getAttribute('#cd-inst [data-inst="ukulele"]', "aria-pressed")) === "true", "remembered");
  await page.click('#cd-inst [data-inst="guitar"]');
  await page.waitForFunction(() => document.querySelector(".cd-card")?.querySelectorAll(".cd-string").length === 6);
});

await step("search a type: m7 → all twelve keys, the rail steps aside, ✕ clears", async () => {
  await page.fill("#cd-q", "m7");
  await page.waitForFunction(() => document.querySelector(".cd-bar.searching"));
  const n = await names();
  expect(n.slice(0, 12).join(" ") === "Cm7 C♯m7 Dm7 E♭m7 Em7 Fm7 F♯m7 Gm7 A♭m7 Am7 B♭m7 Bm7", n.slice(0, 12).join(" "));
  expect(await page.isHidden("#cd-keys"), "rail hidden");
  await page.screenshot({ path: `${S}/ch-05-search-m7.png` });
  await page.click("#cd-clear");
  expect(await page.isVisible("#cd-keys") && (await page.inputValue("#cd-q")) === "", "cleared");
});

await step("search a symbol + enter: F#m7b5 opens its sheet — spelled tones, shapes, strum", async () => {
  await page.fill("#cd-q", "F#m7b5");
  expect((await names())[0] === "F♯m7♭5", (await names())[0]);
  expect(await page.locator(".cd-card.best").count() === 1, "best match marked");
  await page.press("#cd-q", "Enter");
  await page.waitForSelector(".cd-sheet-wrap .cd-big svg");
  expect((await page.textContent(".lb-sheet-title")).trim() === "F♯m7♭5", "title");
  expect((await page.$$eval(".cd-tone b", (els) => els.map((e) => e.textContent))).join(" ") === "F♯ A C E", "tones");
  expect(/^shape 1 of \d/.test(await page.textContent("#cd-shape")), await page.textContent("#cd-shape"));
  expect(new URL(page.url()).hash.startsWith("#/chords/guitar/F%23/m7b5"), page.url());
  await page.click("#cd-strum");
  await page.click("#cd-next");
  expect((await page.textContent("#cd-shape")).startsWith("shape 2 of"), "next shape");
  expect(new URL(page.url()).hash.startsWith("#/chords/guitar/F%23/m7b5/2"), "shape in the hash " + page.url());
  await page.screenshot({ path: `${S}/ch-06-sheet.png` });
});

await step("the sheet closes with ✕ and with the back button; the hash goes back to the grid", async () => {
  await page.click(".cd-sheet-wrap .lb-close");
  await page.waitForSelector(".cd-sheet-wrap", { state: "detached" });
  expect(!/m7b5/.test(new URL(page.url()).hash), "hash after ✕ " + page.url());
  await page.fill("#cd-q", "Bbmaj9");
  await page.locator(".cd-card").first().click();
  await page.waitForSelector(".cd-sheet-wrap .cd-big svg");
  expect((await page.textContent(".lb-sheet-title")).trim() === "B♭maj9", "B♭maj9");
  await page.goBack();
  await page.waitForSelector(".cd-sheet-wrap", { state: "detached" });
  expect(new URL(page.url()).hash.startsWith("#/chords/guitar/"), "still on chords " + page.url());
  await page.fill("#cd-q", "");
});

await step("no match: a friendly line with chords to try; tapping one searches it", async () => {
  await page.fill("#cd-q", "Hzz");
  await page.waitForSelector(".cd-try");
  await page.click(".cd-try >> text=dim7");
  expect((await page.inputValue("#cd-q")) === "dim7" && (await names())[0] === "Cdim7", "tried");
  await page.fill("#cd-q", "");
});

await step("deep link #/chords/guitar/Db/7 opens D♭7 spelled as typed; slash chords link too", async () => {
  await page.goto(`${BASE}/?app=1#/chords/guitar/Db/7`);
  await page.waitForSelector(".cd-sheet-wrap .cd-big svg");
  expect((await page.textContent(".lb-sheet-title")).trim() === "D♭7", await page.textContent(".lb-sheet-title"));
  expect((await page.$$eval(".cd-tone b", (els) => els.map((e) => e.textContent))).join(" ") === "D♭ F A♭ C♭", "tones");
  await page.goto(`${BASE}/?app=1#/chords/guitar/C/major/E`);
  await page.waitForFunction(() => document.querySelector(".lb-sheet-title")?.textContent.trim() === "C/E");
  expect(await page.locator(".cd-tone.bass").count() === 1, "bass chip");
  await page.click(".cd-sheet-wrap .lb-close");
  await page.waitForSelector(".cd-sheet-wrap", { state: "detached" });
});

await step("dots: notes / degrees relabel every box; left hand mirrors; both remembered", async () => {
  await page.goto(`${BASE}/?app=1#/chords/guitar/C`);
  await page.waitForSelector(".cd-card");
  const muteX = () => page.$eval(".cd-card .cd-mute", (e) => Number(/M([\d.]+)/.exec(e.getAttribute("d"))[1]));
  const before = await muteX();
  await page.click('#cd-labels [data-l="notes"]');
  expect((await page.locator(".cd-card").first().locator(".cd-label").allTextContents()).filter(Boolean).join(" ") === "C E C", "C major labels");
  await page.click('#cd-labels [data-l="degrees"]');
  expect((await page.locator(".cd-card").first().locator(".cd-label").allTextContents()).filter(Boolean).join(" ") === "1 3 1", "degrees");
  await page.click('#cd-hand [data-h="left"]');
  expect((await muteX()) > before, "mirrored");
  await page.reload(); await page.waitForSelector(".cd-card");
  expect((await page.getAttribute('#cd-labels [data-l="degrees"]', "aria-pressed")) === "true" && (await page.getAttribute('#cd-hand [data-h="left"]', "aria-pressed")) === "true", "remembered");
  await page.screenshot({ path: `${S}/ch-07-degrees-lefty.png` });
  await page.click('#cd-labels [data-l="fingers"]'); await page.click('#cd-hand [data-h="right"]');
  await noWiden();
});

await step("every skin draws the box (no hard-coded colours)", async () => {
  for (const skin of ["green-piano", "ebony"]) {
    await page.evaluate((s) => localStorage.setItem("ws.shell.skin", JSON.stringify(s)), skin);
    await page.reload(); await page.waitForSelector(".cd-card");
    const c = await page.$eval(".cd-card .cd-dot.root", (e) => getComputedStyle(e).fill);
    const acc = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
    expect(c && c !== "none", `${skin}: root fill ${c} (accent ${acc})`);
    if (skin === "green-piano") await page.screenshot({ path: `${S}/ch-08-green-piano.png` });
  }
  await page.evaluate(() => localStorage.removeItem("ws.shell.skin"));
});
await phone.close();

const ipad = await browser.newContext({ viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 1 });
page = await ipad.newPage();
watch(page);
await page.goto(`${BASE}/?app=1`);
await page.evaluate(() => localStorage.setItem("ws.shell.seen", "true"));
await page.goto(`${BASE}/?app=1#/metronome`);
await page.waitForSelector(".picker-btn .picker-name");

await step("wide screen: hovering Almanac opens the flyout beside the menu; clicking keeps it; a click opens chords", async () => {
  await page.click(".picker-btn");
  await page.hover(".picker-group");
  await page.waitForSelector(".picker-flyout:not([hidden]):not(.over)");
  await page.click(".picker-group");
  expect(await page.isVisible(".picker-flyout"), "click after hover keeps it open");
  const f = await page.locator(".picker-flyout").boundingBox(), m = await page.locator(".picker-menu").boundingBox();
  expect(f.x + f.width <= m.x + 1, "flyout sits left of the menu");
  await page.screenshot({ path: `${S}/ch-09-flyout-ipad.png` });
  await page.hover('.picker-menu [data-tool="tuner"]');
  await page.waitForSelector(".picker-flyout[hidden]", { state: "attached" });
  await page.hover(".picker-group");
  await page.click('.picker-flyout [data-tool="chords"]');
  await page.waitForSelector(".cd-card");
  const cols = await page.$$eval(".cd-section:first-child .cd-card", (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect(cols === 1 || cols === 2, "triads fit in one or two rows on a wide screen, rows=" + cols);
  await page.screenshot({ path: `${S}/ch-10-grid-ipad.png` });
});

await step("keyboard: Escape peels the flyout, then the menu", async () => {
  await page.click(".picker-btn");
  await page.hover(".picker-group");
  await page.waitForSelector(".picker-flyout:not([hidden])");
  await page.keyboard.press("Escape");
  expect(await page.isHidden(".picker-flyout") && await page.isVisible(".picker-menu"), "flyout first");
  await page.keyboard.press("Escape");
  expect(await page.isHidden(".picker-menu"), "then the menu");
});

await step("no page errors", async () => { if (errors.length) throw new Error(errors.join("\n")); });
await browser.close();
