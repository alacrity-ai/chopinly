// Compose E2E (WSHED-114 / P0). Start a composition, arm durations, tap the
// staff, select, delete, undo / redo, nudge on overflow, palm safety, Scrub,
// reload. Chromium with an iPad user agent and touch.
// BASE=… SHOTS=… node tests/e2e/compose.mjs
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on("dialog", (d) => d.accept(d.type() === "prompt" ? d.defaultValue() : undefined));
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); await page.screenshot({ path: `${S}/fail-compose.png` }); throw e; } };
const lb = (fn, ...args) => page.evaluate(async ([src, a]) => { const m = await import("/js/lib/logbook.js"); return (new Function("m", "a", src))(m, a); }, [`return (${fn})(m, a)`, args]);
const state = () => page.evaluate(() => { const s = document.querySelector(".cp-editor").__editor.state; return { mode: s.mode, armed: s.armed, S: s.S, selection: s.selection, bars: s.bars }; });
const kinds = (bar, staff = 0) => page.evaluate(([b, st]) => document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[st].voices[0].map((e) => `${e.kind === "rest" ? "r" : "n"}${e.dur.base}${e.dur.dots ? "." : ""}`).join(" "), [bar, staff]);
const point = (place) => page.evaluate((p) => document.querySelector(".cp-editor").__editor.pointFor(p), place);
const tapAt = async (place) => { const p = await point(place); await page.touchscreen.tap(Math.round(p.x), Math.round(p.y)); await page.waitForTimeout(80); };
const noWiden = async () => { const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth })); if (w.doc > w.vw) throw new Error("page widened " + JSON.stringify(w)); };
const PPQ = 6720;
/** Synthetic pointer events straight at the view — the only way to fake a palm or a Pencil in Chromium. */
const synth = (type, opts) => page.evaluate(([type, o]) => { const v = document.querySelector("#cp-view"); v.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, isPrimary: true, ...o })); }, [type, opts]);

await page.goto(`${BASE}/?app=1`);
await page.evaluate(() => { localStorage.setItem("ws.shell.seen", "true"); localStorage.removeItem("ws.shell.skin"); localStorage.removeItem("ws.logbook.data"); localStorage.removeItem("ws.compose.zoom"); localStorage.removeItem("ws.compose.armed"); });
await page.goto(`${BASE}/?app=1&t=1#/compose`);

await step("Compose sits after Scores in the tool menu; the list starts empty", async () => {
  await page.waitForSelector(".compose");
  const order = await page.evaluate(() => [...document.querySelectorAll(".picker-item")].map((b) => b.dataset.tool));
  if (order.indexOf("compose") !== order.indexOf("scores") + 1) throw new Error("menu order " + order.join(","));
  if (!(await page.locator(".cp-empty").textContent()).includes("nothing written yet")) throw new Error("empty copy");
  await noWiden();
  await page.screenshot({ path: `${S}/cp-01-empty.png` });
});

await step("new composition → the editor opens on a blank piano score, eight bars, the quarter armed", async () => {
  await page.click("#cp-new"); // the title prompt is auto-accepted → "Untitled"
  await page.waitForSelector(".cp-editor .cp-svg");
  const s = await state();
  if (!(s.mode === "place" && s.armed.base === 4 && !s.armed.rest && s.bars === 8)) throw new Error(JSON.stringify(s));
  if ((await page.locator(".cp-dur[data-base='4'][aria-pressed='true']").count()) !== 1) throw new Error("quarter not armed on the rail");
  const staves = await page.evaluate(() => document.querySelectorAll(".cp-sys").length);
  if (staves < 2) throw new Error("systems " + staves);
  await page.screenshot({ path: `${S}/cp-02-blank.png` });
});

await step("tap ×4 on bar 1 → four quarters; tap bar 2 beat 1 → a quarter and rests; tap the last bar → a bar is appended", async () => {
  for (const t of [0, PPQ, 2 * PPQ, 3 * PPQ]) await tapAt({ bar: 0, staff: 0, ticks: t + 200, step: 4 + (t / PPQ) });
  if ((await kinds(0)) !== "n4 n4 n4 n4") throw new Error("bar 1: " + (await kinds(0)));
  await tapAt({ bar: 1, staff: 0, ticks: 100, step: 6 });
  if ((await kinds(1)) !== "n4 r4 r2") throw new Error("bar 2: " + (await kinds(1)));
  if ((await state()).bars !== 8) throw new Error("bars grew early");
  await tapAt({ bar: 7, staff: 1, ticks: 2 * PPQ + 50, step: 4 });
  const s = await state();
  if (s.bars !== 9) throw new Error("no bar appended: " + s.bars);
  if ((await kinds(7, 1)) !== "r2 n4 r4") throw new Error("bar 8 bass: " + (await kinds(7, 1)));
  await page.waitForTimeout(400); // the debounced save
  const saved = await lb((m) => m.logbook.compositions()[0].measures.length);
  if (saved !== 9) throw new Error("not saved: " + saved);
  await page.screenshot({ path: `${S}/cp-03-placed.png` });
});

await step("an eighth armed inside a rest lands on the off-beat; the rail shows it armed", async () => {
  await page.click(".cp-dur[data-base='8']");
  await tapAt({ bar: 2, staff: 0, ticks: PPQ / 2 + 60, step: 8 });
  if ((await kinds(2)) !== "r8 n8 r4 r2") throw new Error("bar 3: " + (await kinds(2)));
  if ((await state()).armed.base !== 8) throw new Error("not armed");
});

await step("a sixteenth pair beams; a whole into a full bar nudges (toast + no change)", async () => {
  await page.click(".cp-dur[data-base='16']");
  await tapAt({ bar: 3, staff: 0, ticks: 30, step: 6 });
  await tapAt({ bar: 3, staff: 0, ticks: PPQ / 4 + 30, step: 7 });
  if ((await kinds(3)) !== "n16 n16 r8 r4 r2") throw new Error("bar 4: " + (await kinds(3)));
  const beams = await page.evaluate(() => document.querySelectorAll(".cp-svg .beam").length);
  if (beams < 2) throw new Error("beams " + beams);
  await page.click(".cp-dur[data-base='1']");
  const before = await kinds(1); // n4 r4 r2 — three quarters of rest, a whole does not fit
  await tapAt({ bar: 1, staff: 0, ticks: 2 * PPQ + 100, step: 4 });
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("no room"), null, { timeout: 3000 });
  if ((await kinds(1)) !== before) throw new Error("bar changed on a nudge");
  await page.click(".cp-dur[data-base='4']");
});

await step("tap a head → selected; delete → rests come back; undo / redo restore exactly", async () => {
  await tapAt({ bar: 0, staff: 0, ticks: PPQ + 10, step: 5 }); // the second quarter's head (step 5)
  let s = await state();
  if (s.selection.length !== 1) throw new Error("selection " + JSON.stringify(s.selection));
  if ((await page.locator(".cp-head-g.sel").count()) !== 1) throw new Error("no sel class");
  await page.click("[data-act=delete]");
  if ((await kinds(0)) !== "n4 r4 n4 n4") throw new Error("after delete: " + (await kinds(0)));
  await page.click("[data-act=undo]");
  if ((await kinds(0)) !== "n4 n4 n4 n4") throw new Error("after undo: " + (await kinds(0)));
  await page.click("[data-act=redo]");
  if ((await kinds(0)) !== "n4 r4 n4 n4") throw new Error("after redo: " + (await kinds(0)));
  await page.click("[data-act=undo]");
});

await step("Rest toggle: a rest placed into a bar with notes leaves the bar adding up", async () => {
  await page.click("[data-act=rest]");
  if (!(await state()).armed.rest) throw new Error("rest not on");
  await tapAt({ bar: 1, staff: 0, ticks: 2 * PPQ + 40, step: 4 }); // a quarter rest where a half rest was
  if ((await kinds(1)) !== "n4 r4 r2") throw new Error("bar 2: " + (await kinds(1)));
  await page.click("[data-act=rest]");
  if ((await state()).armed.rest) throw new Error("rest still on");
});

await step("palm safety: a wide touch contact and a second simultaneous finger place nothing; a pen tap does", async () => {
  const p = await point({ bar: 4, staff: 0, ticks: 100, step: 4 });
  const base = { clientX: p.x, clientY: p.y, pointerType: "touch" };
  await synth("pointerdown", { ...base, pointerId: 21, width: 60, height: 60 });
  await synth("pointerup", { ...base, pointerId: 21, width: 60, height: 60 });
  if ((await kinds(4)) !== "r1") throw new Error("a palm placed a note: " + (await kinds(4)));
  await synth("pointerdown", { ...base, pointerId: 31, width: 2, height: 2 });
  await synth("pointerdown", { ...base, clientX: p.x + 200, pointerId: 32, width: 2, height: 2 });
  await synth("pointerup", { ...base, pointerId: 31, width: 2, height: 2 });
  await synth("pointerup", { ...base, clientX: p.x + 200, pointerId: 32, width: 2, height: 2 });
  if ((await kinds(4)) !== "r1") throw new Error("two fingers placed a note: " + (await kinds(4)));
  await synth("pointerdown", { ...base, pointerType: "pen", pointerId: 41, width: 1, height: 1, pressure: 0.5 });
  await synth("pointerup", { ...base, pointerType: "pen", pointerId: 41, width: 1, height: 1 });
  await page.waitForTimeout(50);
  if ((await kinds(4)) !== "n4 r4 r2") throw new Error("the pen did not place: " + (await kinds(4)));
});

await step("Scrub pans and places nothing; leaving Scrub pins the score again; zoom buttons change S", async () => {
  await page.click("[data-act=zoom-in]"); await page.click("[data-act=zoom-in]");
  if ((await state()).S !== 16) throw new Error("zoom " + (await state()).S);
  await page.click("[data-act=scrub]");
  if ((await state()).mode !== "scrub") throw new Error("not scrub");
  const before = await page.evaluate(() => document.querySelector("#cp-view").scrollTop);
  const r = await page.evaluate(() => { const b = document.querySelector("#cp-view").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await synth("pointerdown", { clientX: r.x, clientY: r.y, pointerType: "touch", pointerId: 51, width: 2, height: 2 });
  for (let i = 1; i <= 8; i++) await synth("pointermove", { clientX: r.x, clientY: r.y - i * 20, pointerType: "touch", pointerId: 51, width: 2, height: 2 });
  await synth("pointerup", { clientX: r.x, clientY: r.y - 160, pointerType: "touch", pointerId: 51, width: 2, height: 2 });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.querySelector("#cp-view").scrollTop);
  if (!(after > before)) throw new Error(`did not pan: ${before} → ${after}`);
  const notes = await page.evaluate(() => document.querySelectorAll(".cp-svg .cp-head").length);
  await page.click("[data-act=scrub]");
  if ((await state()).mode !== "place") throw new Error("not back to place");
  if ((await page.evaluate(() => document.querySelectorAll(".cp-svg .cp-head").length)) !== notes) throw new Error("scrub placed something");
  await page.screenshot({ path: `${S}/cp-04-zoomed.png` });
});

await step("reload restores the composition, the zoom and the armed duration", async () => {
  await page.reload();
  await page.waitForSelector(".cp-editor .cp-svg");
  const s = await state();
  if (!(s.bars === 9 && s.S === 16 && s.armed.base === 4)) throw new Error(JSON.stringify(s));
  if ((await kinds(0)) !== "n4 n4 n4 n4") throw new Error("lost: " + (await kinds(0)));
});

await step("back → the list shows the composition with its bar count; sight singing still renders", async () => {
  await page.click("[data-act=back]");
  await page.waitForSelector(".sc-row");
  const sub = await page.locator(".sc-sub").first().textContent();
  if (!/8 bars/.test(sub)) throw new Error("sub " + sub);
  await noWiden();
  await page.goto(`${BASE}/?app=1&t=2#/sightsinging`);
  await page.waitForSelector("#tool-root > *", { timeout: 10000 });
  const glyphs = await page.evaluate(async () => {
    const { renderMelody } = await import("/js/lib/staff/render.js");
    const div = document.createElement("div"); document.body.append(div);
    const r = renderMelody(div, { id: "t", key: "G", mode: "major", clef: "treble", time: [4, 4], notes: [{ p: "G4", d: 4 }, { p: "A4", d: 2 }, { p: "B4", d: 2 }, { p: "C5", d: 4, tie: true }, { p: "C5", d: 4 }] }, { width: 600 });
    const n = div.querySelectorAll(".glyph").length; div.remove(); return n;
  });
  if (glyphs !== 9) throw new Error("sight-singing staff glyphs " + glyphs); // clef + 1 sharp + 2 time digits + 5 heads
});

await step("phone width: the rails wrap, nothing widens, the editor still places", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/?app=1&t=3#/compose`);
  await page.waitForSelector(".sc-row");
  await page.click(".sc-open");
  await page.waitForSelector(".cp-editor .cp-svg");
  await noWiden();
  await tapAt({ bar: 1, staff: 0, ticks: 2 * PPQ + 100, step: 2 }); // bar 2 is on the first system at phone width
  if ((await kinds(1)) !== "n4 r4 n4 r4") throw new Error("phone tap: " + (await kinds(1)));
  await page.screenshot({ path: `${S}/cp-05-phone.png` });
});

if (errors.length) { console.log("page errors:", errors); process.exit(1); }
await browser.close();
console.log("compose e2e: all green");
