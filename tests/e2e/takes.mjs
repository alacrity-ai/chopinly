// Takes E2E (WSHED-75). Chromium's fake microphone produces a tone, so peaks
// are non-zero. BASE=… SHOTS=… node takes.mjs
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ["microphone"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on("dialog", (d) => d.accept());
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); await page.screenshot({ path: `${S}/fail-takes.png` }); throw e; } };
const lb = (fn, ...args) => page.evaluate(async ([src, a]) => { const m = await import("/js/lib/logbook.js"); return (new Function("m", "a", src))(m, a); }, [`return (${fn})(m, a)`, args]);
const text = async (sel) => (await page.locator(sel).first().textContent())?.trim();
const noWiden = async () => { const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth })); if (w.doc > w.vw) throw new Error("page widened " + JSON.stringify(w)); };

await page.goto(`${BASE}/?app=1`);
await page.evaluate(() => { localStorage.setItem("ws.shell.seen", "true"); localStorage.removeItem("ws.shell.skin"); localStorage.removeItem("ws.logbook.data"); indexedDB.deleteDatabase("chopinly-takes"); });
await page.goto(`${BASE}/?app=1&t=1#/logbook`);
await page.waitForSelector("#lb-play");
let goalId;

await step("clock running → ● take in the hero → recording strip → keep → a take row with a waveform, here (not remote)", async () => {
  goalId = await lb((m) => { const g = m.logbook.addGoal({ name: "Waltz in C♯ minor", composer: "Chopin" }); m.logbook.start(g.id); return g.id; });
  await page.waitForSelector("#lb-hero-rec");
  await page.click("#lb-hero-rec");
  await page.waitForSelector("#lb-rec-strip.recording");
  await page.waitForTimeout(1600);
  const el = await text("#lb-rec-elapsed");
  if (!/0:0[1-9]/.test(el)) throw new Error("elapsed " + el);
  await page.screenshot({ path: `${S}/tk-01-recording.png` });
  await page.click("#lb-rec-stop");
  await page.waitForSelector(".lb-take", { timeout: 8000 });
  const row = await page.evaluate(() => { const li = document.querySelector(".lb-take"); return { remote: li.classList.contains("remote"), rects: li.querySelectorAll(".lb-wave rect").length, dur: li.querySelector(".lb-take-dur").textContent.trim(), goal: li.querySelector(".lb-take-goal")?.textContent }; });
  if (row.remote) throw new Error("the take should be on this device");
  if (row.rects !== 48) throw new Error("waveform bars " + row.rects);
  if (!/^0:0[1-3]$/.test(row.dur)) throw new Error("duration " + row.dur);
  if (!row.goal?.includes("Chopin")) throw new Error("goal name " + row.goal);
  const meta = await lb((m) => m.logbook.takes()[0]);
  if (!(meta.durationMs > 900 && meta.size > 0 && meta.peaks.length === 48 && Math.max(...meta.peaks) === 1)) throw new Error("meta " + JSON.stringify(meta));
  if (!(await lb((m) => m.logbook.doc.pending.some((k) => k.startsWith("take:"))))) throw new Error("take not pending for sync");
  await noWiden();
  await page.screenshot({ path: `${S}/tk-02-take-row.png` });
});

await step("play toggles, seek moves the fill, star sticks, all of it survives a reload", async () => {
  await page.click(".lb-take .lb-take-play");
  await page.waitForSelector(".lb-take.playing", { timeout: 5000 });
  await page.waitForTimeout(400);
  const fill = await page.$eval(".lb-take .lb-take-fill", (e) => parseFloat(e.style.width));
  if (!(fill > 0)) throw new Error("no progress " + fill);
  await page.click(".lb-take .lb-take-play");
  await page.waitForFunction(() => !document.querySelector(".lb-take.playing"));
  await page.click(".lb-take .lb-take-star");
  await page.waitForSelector(".lb-take.starred");
  await page.reload(); await page.waitForSelector(".lb-take");
  if (!(await page.locator(".lb-take.starred:not(.remote)").count())) throw new Error("star or blob lost on reload");
});

await step("goal page: takes section with count, red chip on the day, compare A then B → bar + flip", async () => {
  // a second, older take via the module path (what another day would have left behind)
  await page.evaluate(async (gid) => {
    const { logbook } = await import("/js/lib/logbook.js"); const { takeStore } = await import("/js/lib/takes/store.js");
    const blob = new Blob([new Uint8Array(2000)], { type: "audio/webm" });
    await takeStore.put("old-take", blob, "audio/webm");
    logbook.addTake({ id: "old-take", goalId: gid, recordedAt: Date.now() - 3 * 86400000, durationMs: 4000, size: 2000, mime: "audio/webm", peaks: Array.from({ length: 48 }, (_, i) => (i % 5) / 4) });
  }, goalId);
  await page.goto(`${BASE}/?app=1&t=2#/logbook/goals/${goalId}`);
  await page.waitForSelector("#lb-gp-takes");
  if ((await text("#lb-gp-takes-h .lb-sect-sub")) !== "2") throw new Error("count");
  if ((await page.locator(".lb-takeday").count()) !== 2) throw new Error("two day groups");
  if (!(await page.locator(".lb-segday .lb-take-chip").count())) throw new Error("no chip on the practice day");
  await page.click(".lb-cmp-btn");
  await page.waitForSelector(".lb-takes.picking");
  if (!(await page.locator(".lb-take.pick-a").count())) throw new Error("A should default to the latest take");
  await page.click('.lb-take[data-id="old-take"]');
  await page.waitForSelector(".lb-take.pick-b");
  if ((await page.getAttribute("#lb-cmp-play", "disabled")) !== null) throw new Error("play should enable with A and B");
  await page.click("#lb-cmp-play");
  await page.waitForSelector(".lb-take.cmp-a.playing", { timeout: 5000 });
  await page.click("#lb-cmp-flip");
  await page.waitForFunction(() => document.querySelector(".lb-take.cmp-b.current"), null, { timeout: 5000 });
  await page.screenshot({ path: `${S}/tk-03-compare.png` });
  await page.click(".lb-cmp-btn");
  await page.waitForFunction(() => !document.querySelector(".lb-takes.picking"));
});

await step("a remote take (metadata without audio) renders greyed with no play", async () => {
  await lb((m, [gid]) => m.logbook.addTake({ id: "remote-take", goalId: gid, durationMs: 9000, size: 5, mime: "audio/mp4", peaks: [] }), goalId);
  await page.waitForSelector('.lb-take[data-id="remote-take"].remote');
  if (!(await page.locator('.lb-take[data-id="remote-take"] .lb-take-play[disabled]').count())) throw new Error("play should be disabled");
  if (!(await text('.lb-take[data-id="remote-take"] .lb-take-remote')).includes("another device")) throw new Error("copy");
  await lb((m) => m.logbook.deleteTake("remote-take"));
});

await step("Recorder tool: inherits the running goal, records, the take lands in the goal's group; save button present", async () => {
  await page.goto(`${BASE}/?app=1&t=3#/recorder`);
  await page.waitForSelector("#rc-rec:not([disabled])");
  if (!(await text("#rc-goal")).includes("Chopin")) throw new Error("goal chip " + await text("#rc-goal"));
  await page.click("#rc-rec");
  await page.waitForSelector(".rc-stage.recording");
  await page.waitForTimeout(1200);
  await page.click("#rc-pause"); await page.waitForSelector(".rc-stage.paused"); await page.click("#rc-pause"); await page.waitForSelector(".rc-stage.recording");
  await page.screenshot({ path: `${S}/tk-04-recorder.png` });
  await page.click("#rc-rec");
  await page.waitForFunction(() => document.querySelectorAll("#rc-takes .lb-take").length === 3, null, { timeout: 8000 });
  if ((await page.locator(".rc-group").count()) !== 1) throw new Error("one goal group");
  if (!(await page.locator("#rc-takes .lb-take-save").count())) throw new Error("no save-to-file");
  await noWiden();
  await page.screenshot({ path: `${S}/tk-05-recorder-list.png` });
});

await step("account sheet: takes on this device → purge all → rows grey, count 0, metadata kept", async () => {
  await page.click("#account-btn");
  await page.waitForSelector("#acct-takes");
  await page.waitForFunction(() => /3 takes/.test(document.querySelector("#acct-takes-sub")?.textContent ?? ""));
  await page.click("#acct-takes");
  await page.waitForSelector('[data-purge="all"]');
  await page.click('[data-purge="all"]');
  await page.waitForFunction(() => /No takes stored/.test(document.querySelector("#tk-copy")?.textContent ?? ""));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelectorAll("#rc-takes .lb-take.remote").length === 3, null, { timeout: 5000 });
  if ((await lb((m) => m.logbook.takes().length)) !== 3) throw new Error("metadata should stay");
});

await step("deleting a goal removes its takes; idle Today offers 'record a take' → the picker", async () => {
  await lb((m, [gid]) => { m.logbook.stop(); m.logbook.deleteGoal(gid); }, goalId);
  if ((await lb((m) => m.logbook.takes().length)) !== 0) throw new Error("cascade");
  await page.goto(`${BASE}/?app=1&t=4#/logbook`);
  await page.waitForSelector("#lb-rec-idle");
  await page.click("#lb-rec-idle");
  await page.waitForSelector(".lb-picker-wrap.open");
  if ((await text(".lb-picker-wrap .lb-sheet-title")) !== "What is this a take of?") throw new Error("picker title");
  await page.keyboard.press("Escape");
});

await browser.close();
if (errors.length) { console.log("PAGE ERRORS", errors); process.exit(1); }
console.log("TAKES ALL GREEN");
