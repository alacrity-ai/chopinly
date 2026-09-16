// Compose E2E (WSHED-114 / P0). Start a composition, arm durations, tap the
// staff, select, delete, undo / redo, nudge on overflow, palm safety, Pan,
// reload, export, MusicXML both ways. Chromium with an iPad user agent and touch.
// BASE=… SHOTS=… node tests/e2e/compose.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA });
await ctx.addInitScript(() => { const orig = Element.prototype.setAttribute; Element.prototype.setAttribute = function (k, v) { if (/NaN/.test(String(v))) console.error(`NaN attribute ${this.tagName} ${k} class=${this.getAttribute("class")} at ${(new Error().stack ?? "").split("\n").slice(2, 5).join(" | ")}`); return orig.call(this, k, v); }; }); // a NaN coordinate names its painter
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) { const l = m.location(); errors.push(`console: ${m.text()}${l?.url ? ` @ ${l.url.replace(/^.*\/js\//, "js/")}:${l.lineNumber + 1}` : ""}`); } });
page.on("dialog", (d) => d.accept(d.type() === "prompt" ? d.defaultValue() : undefined));
const step = async (name, f) => { try { await f(); console.log("ok  ", name, errors.length ? `(${errors.length} page errors so far)` : ""); } catch (e) { console.log("FAIL", name, "—", e.message); if (errors.length) console.log("  page errors:", errors.join("\n  ")); try { console.log("  toast:", await page.evaluate(() => document.querySelector(".lb-toast")?.textContent), "url:", page.url()); } catch { /* gone */ } try { console.log("  state:", JSON.stringify(await state())); } catch { /* no editor */ } await page.screenshot({ path: `${S}/fail-compose.png` }); throw e; } };
const lb = (fn, ...args) => page.evaluate(async ([src, a]) => { const m = await import("/js/lib/logbook.js"); return (new Function("m", "a", src))(m, a); }, [`return (${fn})(m, a)`, args]);
const state = () => page.evaluate(() => { const s = document.querySelector(".cp-editor").__editor.state; return { mode: s.mode, armed: s.armed, voice: s.voice, S: s.S, selection: s.selection, bars: s.bars, dragging: s.dragging, lassoing: s.lassoing, pasting: s.pasting, hasClip: s.hasClip, pending: s.pending, input: s.input, penSeen: s.penSeen, gesture: s.gesture }; });
/** Every visible icon/glyph button (.cp-sq) is one exact square per rail height: the header's own, the lanes' shared one. */
const squares = () => page.evaluate(() => {
  const out = { header: new Set(), lanes: new Set(), n: 0, bad: [] };
  for (const b of document.querySelectorAll(".cp-editor .cp-btn.cp-sq")) {
    const r = b.getBoundingClientRect(); if (!r.width) continue;
    out.n++;
    const w = Math.round(r.width * 2) / 2, h = Math.round(r.height * 2) / 2;
    if (Math.abs(w - h) > 0.5) out.bad.push(`${b.dataset.act ?? b.className}: ${w}×${h}`);
    (b.closest(".cp-header") ? out.header : out.lanes).add(`${w}×${h}`);
  }
  return { n: out.n, bad: out.bad, header: [...out.header], lanes: [...out.lanes] };
});
const kinds = (bar, staff = 0) => page.evaluate(([b, st]) => document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[st].voices[0].map((e) => `${e.kind === "rest" ? "r" : "n"}${e.dur.base}${e.dur.dots ? "." : ""}`).join(" "), [bar, staff]);
const point = (place) => page.evaluate((p) => document.querySelector(".cp-editor").__editor.pointFor(p), place);
const tapAt = async (place) => { let p = await point(place); const vr = await page.evaluate(() => { const r = document.querySelector("#cp-view").getBoundingClientRect(); return [r.top, r.bottom]; }); if (p.y > vr[1] - 24 || p.y < vr[0] + 12) { await page.evaluate((y) => { const v = document.querySelector("#cp-view"); v.scrollTop += y - v.getBoundingClientRect().top - v.clientHeight * 0.5; }, p.y); p = await point(place); } if (process.env.DEBUG_TAP) console.log("  tap", JSON.stringify(place), JSON.stringify(p), await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); const v = document.querySelector("#cp-view").getBoundingClientRect(); return { under: el?.closest?.(".cp-ev")?.dataset.ev ?? el?.tagName, view: [v.top, v.bottom], scrollTop: document.querySelector("#cp-view").scrollTop }; }, [p.x, p.y])); await page.touchscreen.tap(Math.round(p.x), Math.round(p.y)); await page.waitForTimeout(80); };
const noWiden = async () => { const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth })); if (w.doc > w.vw) throw new Error("page widened " + JSON.stringify(w)); };
const PPQ = 6720, AIM = 40; // AIM: the Touch-mode ghost floats this far above the finger (editor.js AIM_PX)
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
  await page.click("#cp-new"); // the details modal: title · composer · tags, then start composing
  await page.waitForSelector("#cp-d-title");
  await page.fill("#cp-d-title", "Untitled");
  await page.click("#cp-d-save");
  await page.waitForSelector(".cp-editor .cp-svg");
  const s = await state();
  if (!(s.mode === "place" && s.armed.base === 4 && s.bars === 8)) throw new Error(JSON.stringify(s));
  if ((await page.locator(".cp-dur[data-base='4'][aria-pressed='true']").count()) !== 1) throw new Error("quarter not armed on the rail");
  const staves = await page.evaluate(() => document.querySelectorAll(".cp-sys").length);
  if (staves < 2) throw new Error("systems " + staves);
  await page.screenshot({ path: `${S}/cp-02-blank.png` });
});

await step("the very first tap on a brand-new score is undoable after its save, and redoable (WSHED-136: the history was seeded with the stored object, which every save overwrote — fixed in v104)", async () => {
  await tapAt({ bar: 0, staff: 0, ticks: 200, step: 4 });
  if ((await kinds(0)) !== "n4 r4 r2") throw new Error("first tap: " + (await kinds(0)));
  await page.waitForTimeout(450); // past the 300 ms debounced save — the case Leif hit
  if ((await lb((m) => m.logbook.compositions()[0].measures[0].staves[0].voices[0].length)) !== 3) throw new Error("not saved yet");
  await page.click("[data-act=undo]");
  if ((await kinds(0)) !== "r1") throw new Error("undo of the first edit after its save: " + (await kinds(0)));
  await page.click("[data-act=redo]");
  if ((await kinds(0)) !== "n4 r4 r2") throw new Error("redo: " + (await kinds(0)));
  await page.click("[data-act=undo]");
  if ((await kinds(0)) !== "r1" || (await page.getAttribute("[data-act=undo]", "disabled")) === null) throw new Error("back to the blank bar with undo spent: " + (await kinds(0)));
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

await step("grab + drag: pen down on a head takes it, dragging up two steps re-pitches (B4 → D5), Place mode stays armed and the next tap still places; a finger drags too; a tap on the selected note lets it go", async () => {
  const S = (await state()).S;
  const headPt = async (bar, ticks, step) => { const p = await point({ bar, staff: 0, ticks, step }); return { x: p.x + 0.6 * S, y: p.y }; }; // the head's centre sits right of the column x
  const pitchAt = (bar, i) => page.evaluate(([b, i]) => { const e = document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[0].voices[0][i]; return e.pitches?.map((p) => p.step + p.octave).join("+") ?? e.kind; }, [bar, i]);
  let h = await headPt(0, 0, 4); // bar 1 beat 1: B4 on the middle line
  const pen = (type, o) => synth(type, { pointerType: "pen", pointerId: 71, width: 1, height: 1, pressure: 0.5, ...o });
  await pen("pointerdown", { clientX: h.x, clientY: h.y });
  if (!(await state()).dragging) throw new Error("pen down did not grab");
  if ((await state()).selection.length !== 1) throw new Error("grab did not select");
  await pen("pointermove", { clientX: h.x, clientY: h.y - S / 2 });
  await pen("pointermove", { clientX: h.x, clientY: h.y - S });
  if ((await pitchAt(0, 0)) !== "D5") throw new Error("mid-drag pitch " + (await pitchAt(0, 0)));
  await pen("pointerup", { clientX: h.x, clientY: h.y - S });
  if ((await pitchAt(0, 0)) !== "D5") throw new Error("after drag " + (await pitchAt(0, 0)));
  let s = await state();
  if (s.mode !== "place" || s.armed.base !== 4 || s.selection.length !== 1 || s.dragging) throw new Error("state after drag " + JSON.stringify(s));
  await page.click("[data-act=undo]");
  if ((await pitchAt(0, 0)) !== "B4") throw new Error("undo of a drag " + (await pitchAt(0, 0)));
  await page.click("[data-act=redo]");
  if ((await pitchAt(0, 0)) !== "D5") throw new Error("redo of a drag " + (await pitchAt(0, 0)));
  // still placing: a tap elsewhere lands a quarter
  await tapAt({ bar: 1, staff: 0, ticks: 2 * PPQ + 60, step: 2 });
  if ((await kinds(1)) !== "n4 r4 n4 r4") throw new Error("placing after a drag: " + (await kinds(1)));
  // a finger drags too (one contact, narrow)
  h = await headPt(1, 2 * PPQ, 2);
  const finger = (type, o) => synth(type, { pointerType: "touch", pointerId: 72, width: 3, height: 3, ...o });
  await finger("pointerdown", { clientX: h.x, clientY: h.y });
  await finger("pointermove", { clientX: h.x, clientY: h.y + S });
  await finger("pointerup", { clientX: h.x, clientY: h.y + S });
  if ((await pitchAt(1, 2)) !== "E4") throw new Error("finger drag " + (await pitchAt(1, 2)));
  // a clean tap on the selected note deselects it; the bar is unchanged
  h = await headPt(1, 2 * PPQ, 0);
  await pen("pointerdown", { clientX: h.x, clientY: h.y }); await pen("pointerup", { clientX: h.x, clientY: h.y });
  s = await state();
  if (s.selection.length !== 0) throw new Error("tap on a selected note should let it go: " + JSON.stringify(s.selection));
  if ((await kinds(1)) !== "n4 r4 n4 r4") throw new Error("tap changed the bar");
  await page.click("[data-act=undo]"); await page.click("[data-act=undo]"); await page.click("[data-act=undo]"); // finger drag, placement, pen drag → bar 1 back to n4 r4 r2, bar 0 to B4
  if ((await kinds(1)) !== "n4 r4 r2" || (await pitchAt(0, 0)) !== "B4") throw new Error("undo chain: " + (await kinds(1)) + " " + (await pitchAt(0, 0)));
});

await step("lasso (Select mode): a pen stroke around two heads selects them; the cluster drags together; a palette tap retypes an all-notes selection (all or nothing); Rest turns selected notes into rests; a mixed selection is refused", async () => {
  const S = (await state()).S;
  const pen = (type, o) => synth(type, { pointerType: "pen", pointerId: 81, width: 1, height: 1, pressure: 0.5, ...o });
  const pitchAt = (bar, i) => page.evaluate(([b, i]) => { const e = document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[0].voices[0][i]; return e.pitches?.map((p) => p.step + p.octave).join("+") ?? e.kind; }, [bar, i]);
  await page.click("[data-act=select]");
  if ((await state()).mode !== "select") throw new Error("not in select");
  // bar 1 has n4 n4 n4 n4 (B4 C5 D5 E5); lasso the first two heads
  const a = await point({ bar: 0, staff: 0, ticks: 0, step: 4 }), b = await point({ bar: 0, staff: 0, ticks: PPQ, step: 5 });
  const x0 = a.x - 0.4 * S, x1 = b.x + 1.8 * S, yTop = Math.min(a.y, b.y) - 1.2 * S, yBot = Math.max(a.y, b.y) + 1.2 * S;
  await pen("pointerdown", { clientX: x0, clientY: yTop });
  await pen("pointermove", { clientX: x0 + 2, clientY: yTop + 1 }); // under the lasso threshold: nothing yet
  if ((await state()).lassoing) throw new Error("lasso started too early");
  for (const [x, y] of [[x1, yTop], [x1, yBot], [x0, yBot], [x0, yTop + 4]]) await pen("pointermove", { clientX: x, clientY: y });
  if (!(await state()).lassoing) throw new Error("lasso did not start");
  if (await page.evaluate(() => document.querySelector(".cp-lasso").hasAttribute("hidden"))) throw new Error("lasso path not drawn");
  await pen("pointerup", { clientX: x0, clientY: yTop + 4 });
  let s = await state();
  if (s.selection.length !== 2) throw new Error("lasso selected " + JSON.stringify(s.selection));
  if (!(await page.evaluate(() => document.querySelector(".cp-lasso").hasAttribute("hidden")))) throw new Error("lasso path still shown");
  // cluster drag: pen down on the first selected head, up two steps → both move
  const h = { x: a.x + 0.6 * S, y: a.y };
  await pen("pointerdown", { clientX: h.x, clientY: h.y });
  await pen("pointermove", { clientX: h.x, clientY: h.y - S });
  await pen("pointerup", { clientX: h.x, clientY: h.y - S });
  if ((await pitchAt(0, 0)) !== "D5" || (await pitchAt(0, 1)) !== "E5") throw new Error("cluster drag " + (await pitchAt(0, 0)) + " " + (await pitchAt(0, 1)));
  s = await state();
  if (s.selection.length !== 2 || s.mode !== "select") throw new Error("after cluster drag " + JSON.stringify(s));
  await page.click("[data-act=undo]");
  if ((await pitchAt(0, 0)) !== "B4" || (await pitchAt(0, 1)) !== "C5") throw new Error("undo cluster drag");
  // retype the two selected quarters to halves: the third quarter is in the way → flash, nothing changes, still in Select
  await page.click(".cp-dur[data-base='2']");
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("too long"), null, { timeout: 3000 });
  if ((await kinds(0)) !== "n4 n4 n4 n4") throw new Error("all-or-nothing broke: " + (await kinds(0)));
  s = await state();
  if (s.mode !== "select" || s.selection.length !== 2) throw new Error("state after a refused retype " + JSON.stringify(s));
  // retype to eighths fits: both morph, the eighth is armed, Place mode
  await page.click(".cp-dur[data-base='8']");
  if ((await kinds(0)) !== "n8 r8 n8 r8 n4 n4") throw new Error("retype: " + (await kinds(0)));
  s = await state();
  if (s.mode !== "place" || s.armed.base !== 8 || s.selection.length !== 2) throw new Error("state after retype " + JSON.stringify(s));
  // Delete with the two selected → rests of the same length (the Rest toggle left in v99: Delete is the way to a rest)
  await page.click("[data-act=delete]");
  if ((await kinds(0)) !== "r2 n4 n4") throw new Error("to rests: " + (await kinds(0)));
  await page.click("[data-act=undo]"); await page.click("[data-act=undo]");
  if ((await kinds(0)) !== "n4 n4 n4 n4") throw new Error("undo chain " + (await kinds(0)));
  // a mixed lasso (a note + a rest in bar 2: n4 r4 r2) → palette refuses with a toast, nothing changes
  await page.click("[data-act=select]");
  const c = await point({ bar: 1, staff: 0, ticks: 0, step: 6 }), r = await point({ bar: 1, staff: 0, ticks: PPQ, step: 4 });
  const lx0 = c.x - 0.4 * S, lx1 = r.x + 2.2 * S, ly0 = c.y - 2.5 * S, ly1 = r.y + 2.5 * S;
  await pen("pointerdown", { clientX: lx0, clientY: ly0 });
  for (const [x, y] of [[lx1, ly0], [lx1, ly1], [lx0, ly1], [lx0, ly0 + 4]]) await pen("pointermove", { clientX: x, clientY: y });
  await pen("pointerup", { clientX: lx0, clientY: ly0 + 4 });
  s = await state();
  if (s.selection.length < 2 || s.selection.every((k) => k.includes(":"))) throw new Error("mixed lasso " + JSON.stringify(s.selection));
  await page.click(".cp-dur[data-base='2']");
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("pick notes"), null, { timeout: 3000 });
  if ((await kinds(1)) !== "n4 r4 r2") throw new Error("mixed retype changed the bar");
  // a plain tap on empty staff in Select clears; back to Place with the quarter
  await pen("pointerdown", { clientX: lx0, clientY: ly0 }); await pen("pointerup", { clientX: lx0, clientY: ly0 });
  if ((await state()).selection.length !== 0) throw new Error("tap did not clear");
  await page.click(".cp-dur[data-base='4']");
  if ((await state()).mode !== "place") throw new Error("not back in place");
});

await step("clipboard: lasso two notes → copy → paste arms a cursor with a phrase ghost → tap drops it (selected, overwriting) → cut empties the source → a barline straddle is refused and the cursor stays armed → Escape disarms", async () => {
  const S = (await state()).S;
  const pen = (type, o) => synth(type, { pointerType: "pen", pointerId: 91, width: 1, height: 1, pressure: 0.5, ...o });
  // bar 1 = n4 n4 n4 n4 (B4 C5 D5 E5): lasso the first two
  await page.click("[data-act=select]");
  const a = await point({ bar: 0, staff: 0, ticks: 0, step: 4 }), b = await point({ bar: 0, staff: 0, ticks: PPQ, step: 5 });
  const x0 = a.x - 0.4 * S, x1 = b.x + 1.8 * S, yTop = Math.min(a.y, b.y) - 1.2 * S, yBot = Math.max(a.y, b.y) + 1.2 * S;
  await pen("pointerdown", { clientX: x0, clientY: yTop });
  for (const [x, y] of [[x1, yTop], [x1, yBot], [x0, yBot], [x0, yTop + 4]]) await pen("pointermove", { clientX: x, clientY: y });
  await pen("pointerup", { clientX: x0, clientY: yTop + 4 });
  if ((await state()).selection.length !== 2) throw new Error("lasso");
  if (!(await page.evaluate(() => document.querySelector("[data-act=paste]").disabled))) throw new Error("paste enabled with an empty clipboard");
  await page.click("[data-act=copy]");
  let s = await state();
  if (!s.hasClip || s.pasting) throw new Error("copy " + JSON.stringify(s));
  await page.click("[data-act=paste]");
  s = await state();
  if (!s.pasting) throw new Error("paste did not arm");
  // hover: the phrase ghost follows the pen (two heads)
  const t = await point({ bar: 3, staff: 0, ticks: 100, step: 4 });
  await pen("pointermove", { clientX: t.x, clientY: t.y });
  const ghostHeads = await page.evaluate(() => document.querySelector(".cp-ghost").hasAttribute("hidden") ? 0 : document.querySelectorAll(".cp-ghost .head").length);
  if (ghostHeads !== 2) throw new Error("phrase ghost heads " + ghostHeads);
  // drop at bar 4 beat 1 (a tap, via touch — the same tap rule as placing)
  await page.touchscreen.tap(Math.round(t.x), Math.round(t.y)); await page.waitForTimeout(80);
  if ((await kinds(3)) !== "n4 n4 r2") throw new Error("drop: " + (await kinds(3)));
  s = await state();
  if (s.pasting || s.selection.length !== 2) throw new Error("after drop " + JSON.stringify(s));
  const pitches = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.measures[3].staves[0].voices[0].filter((e) => e.kind === "note").map((e) => e.pitches[0].step + e.pitches[0].octave).join(" "));
  if (pitches !== "B4 C5") throw new Error("pasted pitches " + pitches);
  // cut the pasted pair: the bar empties, the clipboard holds the pair
  await page.click("[data-act=cut]");
  if ((await kinds(3)) !== "r1") throw new Error("cut: " + (await kinds(3)));
  if (!(await state()).hasClip) throw new Error("clip lost on cut");
  // paste again onto the bass staff of bar 5 — the phrase lands there, the treble is untouched
  await page.click("[data-act=paste]");
  const u = await point({ bar: 4, staff: 1, ticks: 100, step: 4 });
  await page.touchscreen.tap(Math.round(u.x), Math.round(u.y)); await page.waitForTimeout(80);
  if ((await kinds(4, 1)) !== "n4 n4 r2" || (await kinds(4, 0)) !== "r1") throw new Error("bass paste: " + (await kinds(4, 1)) + " / " + (await kinds(4, 0)));
  // a barline straddle: make bar 2's quarter a half (lasso it, palette half), copy it, drop it on beat 4 of bar 6 → toast, nothing changes, still armed; Escape disarms
  const c = await point({ bar: 1, staff: 0, ticks: 0, step: 6 });
  const cx0 = c.x - 0.4 * S, cx1 = c.x + 1.8 * S, cy0 = c.y - 1.2 * S, cy1 = c.y + 1.2 * S;
  await pen("pointerdown", { clientX: cx0, clientY: cy0 });
  for (const [x, y] of [[cx1, cy0], [cx1, cy1], [cx0, cy1], [cx0, cy0 + 4]]) await pen("pointermove", { clientX: x, clientY: y });
  await pen("pointerup", { clientX: cx0, clientY: cy0 + 4 });
  if ((await state()).selection.length !== 1) throw new Error("lasso one");
  await page.click(".cp-dur[data-base='2']");
  if ((await kinds(1)) !== "n2 r2") throw new Error("half: " + (await kinds(1)));
  await page.click("[data-act=copy]");
  await page.click("[data-act=paste]");
  const v = await point({ bar: 5, staff: 0, ticks: 3 * PPQ + 100, step: 4 });
  await page.touchscreen.tap(Math.round(v.x), Math.round(v.y)); await page.waitForTimeout(80);
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("barline"), null, { timeout: 3000 });
  if ((await kinds(5)) !== "r1") throw new Error("straddle changed the bar");
  if (!(await state()).pasting) throw new Error("cursor disarmed on a refusal");
  await page.keyboard.press("Escape");
  if ((await state()).pasting) throw new Error("Escape did not disarm");
  // tidy: undo the retype and the bass paste; back to Place with the quarter
  await page.click("[data-act=undo]"); await page.click("[data-act=undo]");
  if ((await kinds(1)) !== "n4 r4 r2" || (await kinds(4, 1)) !== "r1") throw new Error("undo chain " + (await kinds(1)) + " / " + (await kinds(4, 1)));
  await page.keyboard.press("Escape");
  await page.click(".cp-dur[data-base='4']");
  if ((await state()).mode !== "place") throw new Error("not back in place");
});

await step("transport: play moves the playhead and the rail's readout, pause holds it, a bar forward / back and stop seek, the slider seeks, tempo − / + and Space work", async () => {
  const st = () => page.evaluate(() => { const s = document.querySelector(".cp-editor").__editor.state; return { playing: s.playing, position: s.position, tempo: s.tempo }; });
  if ((await page.locator(".cp-transport .cp-btn").count()) < 6) throw new Error("transport rail missing");
  await page.click("[data-act=play]");
  await page.waitForTimeout(400);
  let s = await st();
  if (!s.playing || !(s.position > 0)) throw new Error("not playing " + JSON.stringify(s));
  if (await page.locator(".cp-playhead[hidden]").count()) throw new Error("playhead hidden while playing");
  if ((await page.locator("[data-act=play]").getAttribute("aria-pressed")) !== "true") throw new Error("play button not pressed");
  await page.screenshot({ path: `${S}/cp-13-playing.png` });
  await page.click("[data-act=play]");
  const paused = await st();
  await page.waitForTimeout(150);
  s = await st();
  if (s.playing || s.position !== paused.position || !(s.position > 0)) throw new Error("pause " + JSON.stringify([paused, s]));
  await page.click("[data-act=ff]");
  s = await st();
  if (s.position % (4 * PPQ) !== 0 || !(s.position > paused.position)) throw new Error("ff " + JSON.stringify(s));
  const read = await page.locator("#cp-pos-read").textContent();
  if (!/^bar \d+ of \d+$/.test(read)) throw new Error("readout " + read);
  await page.click("[data-act=rew]");
  if ((await st()).position !== s.position - 4 * PPQ) throw new Error("rew");
  await page.click("[data-act=stop]");
  if ((await st()).position !== 0) throw new Error("stop");
  if (!(await page.locator(".cp-playhead[hidden]").count())) throw new Error("playhead shown at rest on bar 1");
  await page.evaluate(() => { const r = document.querySelector("#cp-pos"); r.value = String(3 * 4 * 6720); r.dispatchEvent(new Event("input", { bubbles: true })); });
  if ((await st()).position !== 3 * 4 * PPQ) throw new Error("slider seek");
  if ((await page.locator("#cp-pos-read").textContent()) !== `bar 4 of ${(await state()).bars}`) throw new Error("readout after seek " + (await page.locator("#cp-pos-read").textContent()));
  const t0 = (await st()).tempo;
  await page.click("[data-act=tempo-up]"); await page.click("[data-act=tempo-up]"); await page.click("[data-act=tempo-down]");
  s = await st();
  if (s.tempo !== t0 + 1 || (await page.locator("#cp-bpm").textContent()) !== String(t0 + 1)) throw new Error("tempo " + JSON.stringify(s));
  await page.keyboard.press("Space"); await page.waitForTimeout(120);
  if (!(await st()).playing) throw new Error("Space did not play");
  await page.keyboard.press("Space");
  if ((await st()).playing) throw new Error("Space did not pause");
  await page.click("[data-act=stop]");
});

await step("notation: dot a chord (both heads, one event), tie two same-pitch notes (a curve appears), an armed triplet opens a group that taps fill (bracket + 3), three lassoed eighths become a triplet, ♭ on a selected head, an armed ♯ carries once", async () => {
  const Z = (await state()).S; // the zoom (S is the screenshot dir)
  const full = (bar, staff = 0) => page.evaluate(([b, st]) => document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[st].voices[0].map((e) => `${e.kind === "rest" ? "r" : "n"}${e.dur.base}${".".repeat(e.dur.dots)}${e.dur.tuplet ? `/${e.dur.tuplet.n}` : ""}`).join(" "), [bar, staff]);
  const pitches = (bar, i) => page.evaluate(([b, i]) => document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[0].voices[0][i].pitches.map((p) => `${p.step}${p.alter > 0 ? "#".repeat(p.alter) : "b".repeat(-p.alter)}${p.octave}${p.tie ? ":" + p.tie : ""}`).join("+"), [bar, i]);
  const scrollTo = (bar) => page.evaluate((b) => { const ed = document.querySelector(".cp-editor").__editor; const v = document.querySelector("#cp-view"); const p = ed.pointFor({ bar: b, staff: 0, ticks: 0, step: 4 }); v.scrollTop += p.y - v.getBoundingClientRect().top - v.clientHeight * 0.4; }, bar);
  const pen = (type, o) => synth(type, { pointerType: "pen", pointerId: 91, width: 1, height: 1, pressure: 0.5, ...o });
  const armed = async () => (await state()).armed;
  await page.keyboard.press("Escape"); if ((await state()).selection.length) await page.keyboard.press("Escape");
  if ((await state()).mode !== "place") await page.keyboard.press("v");
  if ((await armed()).base !== 4) await page.keyboard.press("5"); // quarter (pressing the armed one again would un-arm it)
  await scrollTo(5);
  if ((await full(5)) !== "r1") throw new Error("bar 6 not empty: " + (await full(5)));
  // dot: a chord on beat 1, select a head, dot → the whole event is dotted
  await tapAt({ bar: 5, staff: 0, ticks: 0, step: 4 }); await tapAt({ bar: 5, staff: 0, ticks: 0, step: 6 });
  if ((await pitches(5, 0)) !== "B4+D5") throw new Error("chord " + (await pitches(5, 0)));
  await tapAt({ bar: 5, staff: 0, ticks: 0, step: 4 }); // select the B4 head (tap on the head)
  if ((await state()).selection.length !== 1) throw new Error("head not selected " + JSON.stringify(await state()));
  await page.click("[data-act=dot]");
  if ((await full(5)) !== "n4. r8 r2") throw new Error("dot: " + (await full(5)));
  if ((await pitches(5, 0)) !== "B4+D5") throw new Error("dot lost a pitch");
  await page.click("[data-act=dot]"); // again → undot
  if ((await full(5)) !== "n4 r4 r2") throw new Error("undot: " + (await full(5)));
  await page.keyboard.press("Escape"); // clear the selection
  // tie: B4 on beats 3 and 4, select beat 3, tie
  await tapAt({ bar: 5, staff: 0, ticks: 2 * PPQ + 300, step: 4 }); await tapAt({ bar: 5, staff: 0, ticks: 3 * PPQ + 300, step: 4 }); // a hair right of the onset: a tap dead on a note's column reads as that note
  if ((await full(5)) !== "n4 r4 n4 n4") throw new Error("before tie: " + (await full(5)));
  await tapAt({ bar: 5, staff: 0, ticks: 2 * PPQ, step: 4 });
  await page.click("[data-act=tie]");
  if ((await pitches(5, 2)) !== "B4:start" || (await pitches(5, 3)) !== "B4:stop") throw new Error("tie: " + (await pitches(5, 2)) + " " + (await pitches(5, 3)));
  if ((await page.locator(".cp-tie").count()) !== 1) throw new Error("tie not drawn");
  await page.keyboard.press("Escape");
  // armed triplet: eighth + tuplet on → the first tap opens the group in a quarter's room, two more fill it
  await page.keyboard.press("4"); // eighth
  await page.click("[data-act=tuplet]");
  if ((await armed()).tuplet !== 3) throw new Error("tuplet not armed " + JSON.stringify(await armed()));
  await scrollTo(6);
  await tapAt({ bar: 6, staff: 0, ticks: 0, step: 4 });
  if ((await full(6)) !== "n8/3 r4/3 r4 r2") throw new Error("triplet open: " + (await full(6)));
  await tapAt({ bar: 6, staff: 0, ticks: 2240 + 300, step: 5 }); await tapAt({ bar: 6, staff: 0, ticks: 4480 + 300, step: 6 });
  if ((await full(6)) !== "n8/3 n8/3 n8/3 r4 r2") throw new Error("triplet fill: " + (await full(6)));
  if ((await page.locator(".cp-svg .cp-tuplet").count()) !== 1) throw new Error("tuplet digit drawn " + (await page.locator(".cp-svg .cp-tuplet").count()));
  await page.click("[data-act=tuplet]"); // off
  if ((await armed()).tuplet !== null) throw new Error("tuplet still armed");
  // selection tuplet: three plain eighths on beats 3–4, lasso them, tuplet → triplet + freed eighth rest
  for (const t of [2 * PPQ + 300, 2.5 * PPQ + 300, 3 * PPQ + 300]) await tapAt({ bar: 6, staff: 0, ticks: t, step: 4 });
  if ((await full(6)) !== "n8/3 n8/3 n8/3 r4 n8 n8 n8 r8") throw new Error("three eighths: " + (await full(6)));
  await page.click("[data-act=select]");
  const a = await point({ bar: 6, staff: 0, ticks: 2 * PPQ, step: 4 }), b = await point({ bar: 6, staff: 0, ticks: 3 * PPQ, step: 4 });
  const x0 = a.x - 0.5 * Z, x1 = b.x + 1.8 * Z, yTop = a.y - 1.2 * Z, yBot = a.y + 1.2 * Z;
  await pen("pointerdown", { clientX: x0, clientY: yTop });
  for (const [x, y] of [[x1, yTop], [x1, yBot], [x0, yBot], [x0, yTop + 4]]) await pen("pointermove", { clientX: x, clientY: y });
  await pen("pointerup", { clientX: x0, clientY: yTop + 4 });
  if ((await state()).selection.length !== 3) throw new Error("lasso got " + JSON.stringify((await state()).selection));
  await page.click("[data-act=tuplet]");
  if ((await full(6)) !== "n8/3 n8/3 n8/3 r4 n8/3 n8/3 n8/3 r4") throw new Error("selection triplet: " + (await full(6))); // the freed eighth and the trailing eighth rest merge into beat 4
  if ((await page.locator(".cp-svg .cp-tuplet").count()) !== 2) throw new Error("tuplet digits " + (await page.locator(".cp-svg .cp-tuplet").count()));
  await page.keyboard.press("Escape"); await page.keyboard.press("v"); // back to Place
  // accidentals: ♭ on a selected head; an armed ♯ carries once
  await tapAt({ bar: 6, staff: 0, ticks: 0, step: 4 }); // select the first triplet head (B4)
  await page.click(".cp-acc[data-alter='-1']");
  if ((await pitches(6, 0)) !== "Bb4") throw new Error("flat: " + (await pitches(6, 0)));
  const flats = await page.evaluate(() => [...document.querySelectorAll(".cp-svg .head-part")].filter((t) => t.textContent === "\ue260").length);
  if (flats < 1) throw new Error("flat glyph not drawn");
  await page.keyboard.press("Escape");
  await page.keyboard.press("5"); // quarter (the eighth is armed)
  await page.click(".cp-acc[data-alter='1']");
  if ((await armed()).alter !== 1) throw new Error("sharp not armed");
  await scrollTo(7);
  await tapAt({ bar: 7, staff: 0, ticks: 0, step: 3 }); // A4 → A#4
  if ((await pitches(7, 0)) !== "A#4") throw new Error("armed sharp: " + (await pitches(7, 0)));
  if ((await armed()).alter !== null) throw new Error("sharp did not clear");
  await tapAt({ bar: 7, staff: 0, ticks: PPQ + 300, step: 3 });
  if ((await pitches(7, 1)) !== "A4") throw new Error("sharp carried twice: " + (await pitches(7, 1)));
  await scrollTo(5);
  await page.screenshot({ path: `${S}/cp-14-notation.png` });
  await scrollTo(0); await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
});

await step("utility rail: Key → G then tap bar 3; Time → 3/4 then tap bar 3 (asks before spilling, re-flows); tenor clef then tap beat 3 of bar 5 on the lower staff (holds from there); more clefs behind ▾; Esc cancels an armed change; staccato on a selection; gliss between two notes", async () => {
  const st = () => page.evaluate(() => { const s = document.querySelector(".cp-editor").__editor.state; return { pending: s.pending, open: s.rails.utility, bars: s.bars, sel: s.selection.length }; });
  const meta = (bar) => page.evaluate((b) => { const m = document.querySelector(".cp-editor").__editor.state.doc.measures[b]; return { key: m.key?.fifths ?? null, time: m.time ? `${m.time.beats}/${m.time.unit}` : null, clefs: m.clefs ?? null, changes: m.clefChanges ?? null }; }, bar);
  await page.keyboard.press("Escape"); if ((await state()).selection.length) await page.keyboard.press("Escape");
  if ((await state()).mode !== "place") await page.keyboard.press("v");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
  // the header's Rails ▾ menu shows and hides lanes; the File ▾ menu is a placeholder for export
  if (!(await page.locator(".cp-header [data-act=back]").count()) || !(await page.locator(".cp-header #cp-title").count())) throw new Error("back / title not on the header rail");
  await page.click("[data-pop=cp-file-more]");
  if ((await page.locator("#cp-file-more .cp-menu-row:disabled").count()) !== 1 || (await page.locator("#cp-file-more .cp-menu-row:not(:disabled)").count()) !== 3) throw new Error("file menu: two PDF rows and MusicXML live, MIDI a placeholder");
  await page.click("[data-pop=cp-file-more]");
  await page.click("[data-pop=cp-rails-more]");
  if ((await page.locator("#cp-rails-more .cp-rail-row").count()) !== 8) throw new Error("rail rows"); // controls · transport · notes · utility · expression · form · piano · notes2
  await page.click(".cp-rail-row[data-rail=transport]");
  if (!(await page.locator(".cp-transport").isHidden()) || (await page.locator("#cp-rails-more").isHidden())) throw new Error("transport should hide and the menu stay open");
  await page.click(".cp-rail-row[data-rail=transport]");
  if (await page.locator(".cp-transport").isHidden()) throw new Error("transport should show again");
  await page.click(".cp-rail-row[data-rail=utility]"); await page.click("[data-pop=cp-rails-more]");
  if (!(await st()).open || (await page.locator("#cp-utility").isHidden())) throw new Error("utility rail did not open");
  if (await page.locator("[data-act=bar-prev], [data-act=bar-next], #cp-at-read").count()) throw new Error("the bar selector is still there");
  // key: pick G major → the cursor is armed (picker shows it); tap bar 3 → the change lands there and the cursor clears
  await page.click("[data-pop=cp-key-more]");
  await page.click(".cp-key[data-fifths='1']");
  if ((await st()).pending?.kind !== "key" || (await st()).pending.value !== 1) throw new Error("key not armed " + JSON.stringify(await st()));
  if ((await page.locator("#cp-key-val").textContent()) !== "G / Em") throw new Error("key readout " + (await page.locator("#cp-key-val").textContent()));
  if ((await page.locator("[data-pop=cp-key-more]").getAttribute("aria-pressed")) !== "true") throw new Error("key picker not lit while armed");
  if ((await meta(2)).key !== null) throw new Error("key changed before the tap");
  await tapAt({ bar: 2, staff: 0, ticks: PPQ + 300, step: 6 });
  if ((await meta(2)).key !== 1) throw new Error("key not set by the tap " + JSON.stringify(await meta(2)));
  if ((await st()).pending !== null) throw new Error("cursor still armed after the tap");
  if ((await page.locator("#cp-key-val").textContent()) !== "") throw new Error("key readout should clear");
  // the F line in bar 3 now spells F♯ (spelling follows the key in force)
  await page.keyboard.press("5"); await page.keyboard.press("5"); // quarter (press twice: the first may un-arm)
  if ((await state()).armed.base !== 4 || (await state()).mode !== "place") { await page.keyboard.press("5"); }
  await tapAt({ bar: 2, staff: 0, ticks: PPQ + 300, step: 1 });
  const f = await page.evaluate(() => { const v = document.querySelector(".cp-editor").__editor.state.doc.measures[2].staves[0].voices[0]; return v.filter((e) => e.kind === "note").map((e) => e.pitches.map((p) => p.step + p.alter).join()).join(" "); });
  if (!f.includes("F1")) throw new Error("spelling in G major: " + f);
  // time: 3/4 armed, tap bar 3 — the piece has content past bar 3, so it asks; accepted → bars re-flow
  const barsBefore = (await st()).bars;
  await page.click("[data-pop=cp-time-more]");
  await page.click(".cp-time[data-beats='3'][data-unit='4']");
  if ((await st()).pending?.kind !== "time") throw new Error("time not armed");
  if ((await page.locator("#cp-time-val").textContent()) !== "3/4") throw new Error("time readout");
  await tapAt({ bar: 2, staff: 1, ticks: 2 * PPQ + 300, step: 4 });
  await page.waitForTimeout(150);
  if ((await meta(2)).time !== "3/4") throw new Error("time not set " + JSON.stringify(await meta(2)));
  if (!((await st()).bars > barsBefore)) throw new Error(`bars did not spill: ${barsBefore} → ${(await st()).bars}`);
  const sums = await page.evaluate(() => { const d = document.querySelector(".cp-editor").__editor.state.doc; const T = { 0: 6720 * 4, 2: 6720 * 3 }; return d.measures.map((m, i) => m.staves.map((s) => s.voices[0].reduce((n, e) => n + (26880 / e.dur.base) * (e.dur.dots ? 1.5 : 1) * (e.dur.tuplet ? e.dur.tuplet.in / e.dur.tuplet.n : 1), 0)).join("/") + ":" + (i < 2 ? T[0] : T[2])); });
  if (sums.some((x) => { const [a, b] = x.split(":"); return a.split("/").some((v) => Number(v) !== Number(b)); })) throw new Error("bars do not add up after 3/4: " + sums.join(" "));
  await page.click("[data-act=undo]");
  if ((await st()).bars !== barsBefore || (await meta(2)).time !== null) throw new Error("undo of the time change");
  // clef: tenor armed → tap beat 3 of bar 5 on the lower staff; the small clef draws there and the lower staff stays in tenor after
  await page.click("[data-pop=cp-clef-more]"); await page.click(".cp-clef[data-clef='tenor']");
  if ((await st()).pending?.kind !== "clef" || (await st()).pending.value !== "tenor") throw new Error("clef not armed " + JSON.stringify(await st()));
  if ((await page.locator("[data-pop=cp-clef-more]").getAttribute("aria-pressed")) !== "true" || !(await page.locator("#cp-clef-val").textContent()).includes("tenor")) throw new Error("clef picker not lit while armed");
  await tapAt({ bar: 4, staff: 1, ticks: 2 * PPQ + 200, step: 4 });
  const m4 = await meta(4);
  if (JSON.stringify(m4.changes) !== JSON.stringify([{ staff: 1, at: 2 * PPQ, clef: "tenor" }])) throw new Error("clef change " + JSON.stringify(m4));
  if ((await st()).pending !== null) throw new Error("clef cursor still armed after the tap");
  if ((await page.locator(".cp-svg .cp-clef-change").count()) !== 1) throw new Error("inline clef not drawn");
  const later = await page.evaluate(async () => { const { clefAt } = await import("/js/lib/compose/model.js"); const d = document.querySelector(".cp-editor").__editor.state.doc; return [clefAt(d, 4, 1, 0), clefAt(d, 4, 1, 6720 * 2), clefAt(d, 6, 1), clefAt(d, 6, 0)]; });
  if (later.join() !== "bass,tenor,tenor,treble") throw new Error("clef in force after the change: " + later.join());
  // a note placed on that beat reads in tenor: the middle line is A3
  await tapAt({ bar: 4, staff: 1, ticks: 2 * PPQ + 300, step: 4 });
  const a3 = await page.evaluate(() => { const v = document.querySelector(".cp-editor").__editor.state.doc.measures[4].staves[1].voices[0]; return v.filter((e) => e.kind === "note").map((e) => e.pitches[0].step + e.pitches[0].octave).join(); });
  if (!a3.includes("A3")) throw new Error("middle line after the tenor clef: " + a3);
  // the armed clef picked again → off; all seven clefs sit in the menu; Esc cancels an armed one
  await page.click("[data-pop=cp-clef-more]"); await page.click(".cp-clef[data-clef='alto']"); await page.click("[data-pop=cp-clef-more]"); await page.click(".cp-clef[data-clef='alto']");
  if ((await st()).pending !== null) throw new Error("picking the armed clef again should disarm");
  if ((await page.locator("#cp-clef-more .cp-clef").count()) !== 7) throw new Error("clef menu size");
  await page.click("[data-pop=cp-clef-more]"); await page.click(".cp-clef[data-clef='soprano']");
  if ((await st()).pending?.value !== "soprano") throw new Error("soprano not armed");
  await page.keyboard.press("Escape");
  if ((await st()).pending !== null) throw new Error("Esc did not cancel the armed clef");
  // staccato on a selection; gliss from the first note of bar 1 to the next
  await page.click("[data-act=select]");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
  await tapAt({ bar: 0, staff: 0, ticks: 0, step: 4 });
  if ((await st()).sel !== 1) throw new Error("no selection for the mark");
  await page.click(".cp-art-btn[data-mark='staccato']");
  const art = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.measures[0].staves[0].voices[0][0].art);
  if (!art?.includes("staccato")) throw new Error("staccato " + JSON.stringify(art));
  if ((await page.locator(".cp-svg .cp-art").count()) < 1) throw new Error("mark not drawn");
  await page.click(".cp-art-btn[data-mark='lowerMordent']");
  const art2 = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.measures[0].staves[0].voices[0][0].art);
  if (!art2?.includes("lowerMordent")) throw new Error("lower mordent " + JSON.stringify(art2));
  if ((await page.locator(".cp-svg .cp-art").count()) < 2) throw new Error("lower mordent not drawn");
  // every mark's ink is centred on its head: x attribute = head centre − measured ink centre (no advance-box fallback once Bravura is in)
  const centred = await page.evaluate(() => {
    if (!document.fonts.check('1em "Bravura"')) return { font: false };
    const ed = document.querySelector(".cp-editor").__editor, S = ed.state.S, L = ed.layout;
    const ctx = document.createElement("canvas").getContext("2d"); ctx.font = '1000px "Bravura"';
    const out = [];
    document.querySelectorAll(".cp-svg .cp-art").forEach((t, i) => {
      const m = ctx.measureText(t.textContent), c = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2000;
      const inkCentre = Number(t.getAttribute("x")) + c * 4 * S, head = L.marks[i].x * S;
      out.push({ mark: L.marks[i].mark, off: Math.abs(inkCentre - head), anchored: t.hasAttribute("text-anchor"), width: (m.actualBoundingBoxRight + m.actualBoundingBoxLeft) / 1000 * 4 * S });
    });
    return { font: true, marks: out };
  });
  if (!centred.font || centred.marks.length < 2 || centred.marks.some((m) => m.off > 0.05 || m.anchored || m.width < 4)) throw new Error("marks not centred on ink: " + JSON.stringify(centred));
  const sq = await squares();
  if (sq.n < 30 || sq.bad.length || sq.header.length !== 1 || sq.lanes.length !== 1) throw new Error("square buttons: " + JSON.stringify(sq));
  await page.click("[data-act=gliss]");
  if ((await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.measures[0].staves[0].voices[0][0].gliss)) !== "start") throw new Error("gliss not set");
  if ((await page.locator(".cp-svg .cp-gliss").count()) !== 1) throw new Error("gliss not drawn");
  // slur: one selected note → a curve to the staff's next note; the same again clears it (the selection is still the first note)
  await page.click("[data-act=slur]");
  const slurred = await page.evaluate(() => { const v = document.querySelector(".cp-editor").__editor.state.doc.measures[0].staves[0].voices[0]; return { n: document.querySelectorAll(".cp-svg .cp-slur").length, marks: v.filter((e) => e.slurs).map((e) => e.slurs.map((x) => x.at).join()) }; });
  if (slurred.n !== 1 || slurred.marks.join("|") !== "start|stop") throw new Error("slur " + JSON.stringify(slurred));
  await page.click("[data-act=slur]");
  if ((await page.locator(".cp-svg .cp-slur").count()) !== 0) throw new Error("slur not cleared");
  await page.click("[data-act=slur]"); // leave one on for the screenshot
  // the rolled-chord picker next to gliss.: pick "rolled upward" → the sign stands left of the note; the same pick again clears it
  await page.click("[data-pop=cp-arp-more]"); await page.click(".cp-arp-row[data-kind=up]");
  if ((await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.measures[0].staves[0].voices[0][0].arp)) !== "up") throw new Error("roll not set");
  const arp = await page.evaluate(() => { const ed = document.querySelector(".cp-editor").__editor, a = ed.layout.arps[0], d = ed.layout.drawn.find((x) => x.id === ed.state.doc.measures[0].staves[0].voices[0][0].id); return { n: document.querySelectorAll(".cp-svg .cp-arp").length, left: a && a.x < d.x, spans: a && a.y1 > d.botY && a.y2 < d.topY }; });
  if (arp.n !== 1 || !arp.left || !arp.spans) throw new Error("roll sign " + JSON.stringify(arp));
  await page.screenshot({ path: `${S}/cp-15-utility.png` });
  await page.click("[data-pop=cp-arp-more]"); await page.click(".cp-arp-row[data-kind=up]");
  if ((await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.measures[0].staves[0].voices[0][0].arp)) !== undefined) throw new Error("roll not cleared");
  await page.click("[data-act=gliss]"); await page.click(".cp-art-btn[data-mark='staccato']"); await page.click(".cp-art-btn[data-mark='lowerMordent']");
  await page.keyboard.press("Escape"); await page.keyboard.press("v");
  await page.click("[data-pop=cp-rails-more]"); await page.click(".cp-rail-row[data-rail=utility]"); await page.click("[data-pop=cp-rails-more]");
  if ((await st()).open) throw new Error("utility rail did not close");
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

await step("expressions (WSHED-122, via Rails ▾): f arms and a tap puts it on beat 1; a crescendo takes three taps (button, beat 2, bar 2 beat 1); rit. from the text menu lands on the & of 3; in Select mode the dynamic selects, drags a slot right, ← nudges it back, Delete removes it and undo restores it; a selected hairpin shows two handles and drags up by whole staff steps (↓ nudges it back); typed text arms without firing shortcuts; Escape cancels a half-placed hairpin; the buttons stay squares", async () => {
  await page.click("[data-pop=cp-rails-more]"); await page.click(".cp-rail-row[data-rail=expression]"); await page.click("[data-pop=cp-rails-more]");
  if (await page.locator("#cp-expression").isHidden()) throw new Error("expression rail did not open");
  if ((await state()).mode !== "place") await page.keyboard.press("v");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
  const exprs = (b) => page.evaluate((b) => (document.querySelector(".cp-editor").__editor.state.doc.measures[b].expressions ?? []).map((x) => [x.kind, x.staff, x.at, x.value ?? x.dir, x.end ? `${x.end.bar}:${x.end.at}` : null]), b);
  const drawnExprs = () => page.evaluate(() => ({ dyn: document.querySelectorAll(".cp-svg .cp-expr[data-kind=dyn]").length, hp: document.querySelectorAll(".cp-svg .cp-expr[data-kind=hairpin]").length, text: [...document.querySelectorAll(".cp-svg .cp-expr[data-kind=text]")].map((t) => t.textContent) }));
  // f: the button arms, the tap on beat 1 places (a note sits there — the mark still lands on the slot)
  await page.click(".cp-dyn-btn[data-dyn=f]");
  if ((await state()).pending?.kind !== "dyn" || (await page.getAttribute(".cp-dyn-btn[data-dyn=f]", "aria-pressed")) !== "true") throw new Error("f did not arm");
  await tapAt({ bar: 0, staff: 0, ticks: 300, step: 4 });
  if (JSON.stringify(await exprs(0)) !== JSON.stringify([["dyn", 0, 0, "f", null]]) || (await state()).pending) throw new Error("f not placed: " + JSON.stringify(await exprs(0)));
  // crescendo: the button, where it starts (beat 2), where it ends (bar 2 beat 1)
  await page.click("[data-act=hairpin][data-kind=cresc]");
  await tapAt({ bar: 0, staff: 0, ticks: PPQ + 300, step: 4 });
  const half = (await state()).pending;
  if (half?.kind !== "hairpin" || !half.start || half.start.at !== PPQ) throw new Error("hairpin start not taken: " + JSON.stringify(half));
  await tapAt({ bar: 1, staff: 0, ticks: 300, step: 4 });
  if (!(await exprs(0)).some((x) => x[0] === "hairpin" && x[2] === PPQ && x[4] === "1:0") || (await state()).pending) throw new Error("hairpin not placed: " + JSON.stringify(await exprs(0)));
  // rit. from the text menu → the & of 3
  await page.click("[data-pop=cp-text-more]"); await page.click(".cp-chip[data-text='rit.']");
  if ((await state()).pending?.value !== "rit.") throw new Error("rit. did not arm");
  await tapAt({ bar: 0, staff: 0, ticks: 2.5 * PPQ + 200, step: 4 });
  if (!(await exprs(0)).some((x) => x[0] === "text" && x[2] === 2.5 * PPQ && x[3] === "rit.")) throw new Error("rit. not placed: " + JSON.stringify(await exprs(0)));
  const drawn = await drawnExprs();
  if (drawn.dyn !== 1 || drawn.hp !== 1 || drawn.text.join() !== "rit.") throw new Error("drawn " + JSON.stringify(drawn));
  await page.screenshot({ path: `${S}/cp-16-expression.png` });
  // Select mode: a mouse click on the dynamic selects it; dragging it a slot right moves it in time; ← nudges it back; Delete removes it; undo restores it
  await page.click("[data-act=select]");
  const at = (kind) => page.evaluate((kind) => { const ed = document.querySelector(".cp-editor").__editor, L = ed.layout, r = document.querySelector(".cp-svg").getBoundingClientRect(); const it = kind === "dyn" ? L.dynamics[0] : kind === "text" ? L.texts[0] : L.hairpins[0]; const x = kind === "hairpin" ? (it.x1 + it.x2) / 2 : kind === "text" ? it.x + 0.5 : it.x, y = kind === "dyn" ? it.y - 0.3 : kind === "text" ? it.y - 0.4 : it.y; return { x: r.left + x * L.S, y: r.top + y * L.S, id: it.id }; }, kind);
  const dyn = await at("dyn");
  await page.mouse.click(dyn.x, dyn.y);
  if ((await state()).selection.join() !== dyn.id) throw new Error("dynamic not selected: " + JSON.stringify(await state()));
  const slotW = (await point({ bar: 0, staff: 0, ticks: PPQ / 2, step: 4 })).x - (await point({ bar: 0, staff: 0, ticks: 0, step: 4 })).x;
  await page.mouse.move(dyn.x, dyn.y); await page.mouse.down(); await page.mouse.move(dyn.x + slotW, dyn.y, { steps: 6 }); await page.mouse.up();
  if ((await exprs(0)).find((x) => x[0] === "dyn")?.[2] !== PPQ / 2) throw new Error("drag did not move the dynamic: " + JSON.stringify(await exprs(0)));
  await page.keyboard.press("ArrowLeft");
  if ((await exprs(0)).find((x) => x[0] === "dyn")?.[2] !== 0) throw new Error("← did not nudge it back: " + JSON.stringify(await exprs(0)));
  await page.keyboard.press("Delete");
  if ((await exprs(0)).some((x) => x[0] === "dyn") || (await drawnExprs()).dyn !== 0) throw new Error("Delete left the dynamic");
  await page.keyboard.press("Control+z");
  if (!(await exprs(0)).some((x) => x[0] === "dyn") || (await drawnExprs()).dyn !== 1) throw new Error("undo did not bring the dynamic back");
  // a selected hairpin shows its two end handles
  const hp = await at("hairpin");
  await page.mouse.click(hp.x, hp.y);
  const handles = await page.evaluate(() => ({ sel: document.querySelector(".cp-editor").__editor.state.selection, n: document.querySelector(".cp-overlay .cp-handles").hidden ? 0 : document.querySelectorAll(".cp-overlay .cp-handle").length }));
  if (handles.sel.join() !== hp.id || handles.n !== 2) throw new Error("hairpin handles " + JSON.stringify(handles));
  // dragging the hairpin's body upward lifts it by whole staff steps (quantised to half a space); ↓ nudges one step back down
  const Spx = (await state()).S, hpY0 = await page.evaluate(() => document.querySelector(".cp-editor").__editor.layout.hairpins[0].y);
  await page.mouse.move(hp.x, hp.y); await page.mouse.down(); await page.mouse.move(hp.x, hp.y - 1.1 * Spx, { steps: 6 }); await page.mouse.up();
  const lifted = await page.evaluate(() => { const ed = document.querySelector(".cp-editor").__editor; return { dy: ed.state.doc.measures[0].expressions.find((x) => x.kind === "hairpin")?.dy, y: ed.layout.hairpins[0].y, at: ed.state.doc.measures[0].expressions.find((x) => x.kind === "hairpin")?.at }; });
  if (lifted.dy !== 2 || Math.abs(lifted.y - (hpY0 - 1)) > 1e-6 || lifted.at !== PPQ) throw new Error("hairpin lift " + JSON.stringify({ ...lifted, hpY0 }));
  await page.screenshot({ path: `${S}/cp-16c-expression-lift.png` });
  await page.keyboard.press("ArrowDown");
  if ((await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.measures[0].expressions.find((x) => x.kind === "hairpin")?.dy)) !== 1) throw new Error("↓ did not nudge the hairpin down a step");
  await page.screenshot({ path: `${S}/cp-16b-expression-select.png` });
  // typed text arms (Enter sets it); the typed letters must not fire shortcuts (r = rest); Escape disarms
  await page.keyboard.press("Escape");
  await page.click("[data-pop=cp-text-more]"); await page.fill("#cp-text-in", "con brio"); await page.press("#cp-text-in", "Enter");
  const typed = await state();
  if (typed.pending?.kind !== "text" || typed.pending.value !== "con brio") throw new Error("typed text " + JSON.stringify(typed.pending));
  if ((await page.textContent("#cp-text-lbl")) !== "con brio") throw new Error("the text button does not show the armed words");
  await page.keyboard.press("Escape");
  if ((await state()).pending) throw new Error("Escape did not disarm the text");
  // Escape after the first tap of a hairpin cancels it whole
  await page.click("[data-act=hairpin][data-kind=dim]"); await tapAt({ bar: 2, staff: 0, ticks: 300, step: 4 });
  if (!(await state()).pending?.start) throw new Error("dim start not taken");
  await page.keyboard.press("Escape");
  if ((await state()).pending || (await exprs(2)).length) throw new Error("Escape did not cancel the half-placed hairpin");
  const sq = await squares();
  if (sq.bad.length || sq.lanes.length !== 1) throw new Error("square buttons with the expression rail: " + JSON.stringify(sq));
  // tidy: select and delete each mark, so later steps see the bar as before
  if ((await state()).mode !== "select") await page.click("[data-act=select]");
  for (const kind of ["hairpin", "text", "dyn"]) { const p = await at(kind); await page.mouse.click(p.x, p.y); if (!(await state()).selection.length) throw new Error(`${kind} did not select for deletion`); await page.keyboard.press("Delete"); }
  if ((await page.evaluate(() => document.querySelectorAll(".cp-svg .cp-expr").length)) !== 0) throw new Error("expressions not cleared");
  await page.click("[data-pop=cp-rails-more]"); await page.click(".cp-rail-row[data-rail=expression]"); await page.click("[data-pop=cp-rails-more]");
  await page.keyboard.press("Escape"); if ((await state()).mode === "select") await page.keyboard.press("v");
});

await step("voices: the switcher writes into voice 2 (padded, tinted, stems down) beside voice 1; selecting a head makes its voice active; a move onto a sounding voice is refused, to a free one lands; Ctrl-N switches; the voice ▾ menu (swap, hide rest); Ctrl-Shift-↑ crosses a note to the upper staff; the Notes rail stays on one line", async () => {
  const pickVoice = async (v) => { await page.click(".cp-voice-pick"); await page.click(`.cp-voice-row[data-act='voice'][data-v='${v}']`); };
  const openVoices = async () => { if (await page.locator("#cp-voice-more").isHidden()) await page.click(".cp-voice-pick"); };
  const Z = (await state()).S;
  const vk = (bar, staff, vi) => page.evaluate(([b, st, v]) => { const x = document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[st].voices[v]; return x === undefined ? "none" : x === null ? "null" : x.map((e) => `${e.kind === "rest" ? "r" : "n"}${e.dur.base}`).join(" "); }, [bar, staff, vi]);
  const drawnOf = (id) => page.evaluate((i) => { const d = document.querySelector(".cp-editor").__editor.layout.drawn.find((x) => x.id === i); return d && { voice: d.voice, stem: d.stem, x: d.x, drawStaff: d.drawStaff, hidden: d.hidden, y: d.rest ? d.y : d.heads[0].y }; }, id);
  const headPt = (id) => page.evaluate((i) => { const ed = document.querySelector(".cp-editor").__editor, d = ed.layout.drawn.find((x) => x.id === i), r = document.querySelector(".cp-svg").getBoundingClientRect(), S = ed.state.S; const h = d.rest ? { x: d.x + 0.7, y: d.y } : { x: d.heads[0].x + d.headW / 2, y: d.heads[0].y }; return { x: r.left + h.x * S, y: r.top + h.y * S }; }, id);
  const pen = (type, o) => synth(type, { pointerType: "pen", pointerId: 97, width: 1, height: 1, pressure: 0.5, ...o });
  const penTap = async (pt) => { await pen("pointerdown", { clientX: pt.x, clientY: pt.y }); await pen("pointerup", { clientX: pt.x, clientY: pt.y }); await page.waitForTimeout(40); };
  const idOf = (bar, staff, vi, index) => page.evaluate(([b, st, v, i]) => document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[st].voices[v][i].id, [bar, staff, vi, index]);
  await page.keyboard.press("Escape"); if ((await state()).selection.length) await page.keyboard.press("Escape");
  if ((await state()).mode !== "place") await page.keyboard.press("v");
  if ((await state()).armed.base !== 4) await page.keyboard.press("5");
  // a bar (not the last) whose bass staff is still empty
  const B = await page.evaluate(() => { const d = document.querySelector(".cp-editor").__editor.state.doc; return d.measures.findIndex((m, i) => i > 0 && i < d.measures.length - 1 && m.staves[1].voices.length === 1 && m.staves[1].voices[0].every((e) => e.kind === "rest")); });
  if (B < 1) throw new Error("no empty bass bar to write in");
  // the voice picker: one ▾ button at the left of the Notes rail showing the active voice; the menu's rows: voice 1 lit, the others dim until used
  if ((await page.locator(".cp-palette .cp-voice-pick").count()) !== 1 || (await page.textContent(".cp-voice-pick .cp-voice-n")) !== "1") throw new Error("voice picker");
  if ((await page.locator(".cp-voice-row[data-act='voice'][data-v='0'][aria-pressed='true']").count()) !== 1 || (await page.locator(".cp-voice-row.cp-unused").count()) !== 3) throw new Error("voice 1 should be the only lit voice");
  if ((await page.locator(".cp-palette .cp-btn").first().getAttribute("data-pop")) !== "cp-voice-more") throw new Error("the picker is not first on the rail");
  { const rail = await page.locator(".cp-palette").boundingBox(), btn = await page.locator(".cp-palette .cp-sq").first().boundingBox(); if (rail.height > btn.height * 1.6) throw new Error(`the Notes rail wraps at iPad width: ${rail.height} vs ${btn.height}`); }
  // voice 2 → a tap on the empty empty bass staff creates voice 2 there, padded with rests, drawn tinted with its stem down
  await pickVoice(1);
  if ((await state()).voice !== 1) throw new Error("voice 2 not active");
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("voice 2"), null, { timeout: 3000 });
  if ((await vk(B, 1, 0)) !== "r1") throw new Error("bass staff of the empty bar not empty: " + (await vk(B, 1, 0)));
  await tapAt({ bar: B, staff: 1, ticks: 100, step: 4 });
  if ((await vk(B, 1, 1)) !== "n4 r4 r2" || (await vk(B, 1, 0)) !== "r1") throw new Error("voice 2: " + (await vk(B, 1, 1)) + " / " + (await vk(B, 1, 0)));
  if ((await vk(B - 1, 1, 1)) !== "none") throw new Error("voice 2 leaked into the bar before");
  const v2 = await idOf(B, 1, 1, 0);
  let dv = await drawnOf(v2);
  if (dv.voice !== 1 || dv.stem !== "down") throw new Error("voice 2 drawing " + JSON.stringify(dv));
  if ((await page.locator(`.cp-svg .cp-ev.cp-v2[data-ev='${v2}']`).count()) !== 1) throw new Error("voice 2 not tinted");
  if ((await page.locator(".cp-svg .cp-ev.cp-v2 .rest").count()) < 2) throw new Error("voice 2's padding rests not tinted");
  const fill = await page.evaluate((i) => getComputedStyle(document.querySelector(`.cp-ev[data-ev='${i}'] .cp-head`)).fill, v2);
  const fill1 = await page.evaluate(() => getComputedStyle(document.querySelector(".cp-ev[data-voice='0'] .cp-head")).fill);
  if (fill === fill1) throw new Error("voice 2 heads are not a different colour: " + fill);
  if ((await page.locator(".cp-voice-row[data-v='1'].cp-unused").count()) !== 0) throw new Error("voice 2 should be full ink now");
  // voice 1 again → a note at the same onset lands beside it: two voices at one onset, stems opposite, one x
  await pickVoice(0);
  await tapAt({ bar: B, staff: 1, ticks: 100, step: 8 });
  if ((await vk(B, 1, 0)) !== "n4 r4 r2" || (await vk(B, 1, 1)) !== "n4 r4 r2") throw new Error("both voices: " + (await vk(B, 1, 0)) + " / " + (await vk(B, 1, 1)));
  const v1 = await idOf(B, 1, 0, 0);
  const d1 = await drawnOf(v1); dv = await drawnOf(v2);
  if (d1.stem !== "up" || dv.stem !== "down" || Math.abs(d1.x - dv.x) > 1e-6) throw new Error("stems / x " + JSON.stringify([d1, dv]));
  // the voice follows the pen: a tap on the voice-2 head selects it and the switcher moves to 2
  await penTap(await headPt(v2));
  let s = await state();
  if (s.selection.length !== 1 || !s.selection[0].startsWith(v2) || s.voice !== 1) throw new Error("auto-follow " + JSON.stringify(s));
  if ((await page.locator(".cp-voice-pick[data-v='1']").count()) !== 1 || (await page.textContent(".cp-voice-pick .cp-voice-n")) !== "2") throw new Error("picker did not move");
  // move to voice 1 → refused (voice 1 sounds there), selection kept; move to voice 3 → lands, voice 2 leaves the bar
  await pickVoice(0);
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("already sounds"), null, { timeout: 3000 });
  s = await state();
  if ((await vk(B, 1, 1)) !== "n4 r4 r2" || s.selection.length !== 1 || s.voice !== 1) throw new Error("refused move changed something " + JSON.stringify(s));
  await pickVoice(2);
  if ((await vk(B, 1, 2)) !== "n4 r4 r2" || (await vk(B, 1, 1)) !== "null") throw new Error("move to voice 3: " + (await vk(B, 1, 2)) + " / " + (await vk(B, 1, 1)));
  s = await state();
  if (s.voice !== 2 || s.selection.length !== 1 || !s.selection[0].startsWith(v2)) throw new Error("after the move " + JSON.stringify(s));
  if ((await drawnOf(v2)).voice !== 2 || (await page.locator(`.cp-svg .cp-ev.cp-v3[data-ev='${v2}']`).count()) !== 1) throw new Error("voice 3 tint");
  // Ctrl-2 with nothing selected switches the active voice
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+2");
  if ((await state()).voice !== 1) throw new Error("Ctrl-2");
  await page.keyboard.press("Control+1");
  if ((await state()).voice !== 0) throw new Error("Ctrl-1");
  // the picker opens the voice menu; the rows for rests are off without a rest selected
  await page.click(".cp-voice-pick");
  if (await page.locator("#cp-voice-more").isHidden()) throw new Error("the picker did not open the voice menu");
  if ((await page.locator("#cp-voice-more .cp-voice-row").count()) !== 8) throw new Error("voice menu rows");
  if (!(await page.locator(".cp-voice-row[data-act='hide-rest']").isDisabled()) || !(await page.locator(".cp-voice-row[data-act='voice-swap']").isDisabled())) throw new Error("rows should be off with nothing selected");
  await page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  if (!(await page.locator("#cp-voice-more").isHidden())) throw new Error("menu did not close");
  // swap 1 ↔ 2 in the bar of the selection: voice 1's note becomes voice 2, voice 1 is rests; voice 3 stays
  await penTap(await headPt(v1));
  if ((await state()).voice !== 0) throw new Error("selecting the voice-1 head should make voice 1 active");
  await openVoices();
  await page.click(".cp-voice-row[data-act='voice-swap']");
  if ((await vk(B, 1, 0)) !== "r1" || (await vk(B, 1, 1)) !== "n4 r4 r2" || (await vk(B, 1, 2)) !== "n4 r4 r2") throw new Error("swap: " + [await vk(B, 1, 0), await vk(B, 1, 1), await vk(B, 1, 2)].join(" / "));
  if ((await drawnOf(v1)).voice !== 1 || (await drawnOf(v1)).stem !== "down") throw new Error("the swapped note draws as voice 2");
  // hide rest: select a padding rest of voice 2 (Select mode), menu → hide rest → it draws faint and still counts
  await page.click("[data-act=select]");
  const rest = await idOf(B, 1, 1, 1);
  await penTap(await headPt(rest));
  s = await state();
  if (s.selection.length !== 1 || s.selection[0] !== rest || s.voice !== 1) throw new Error("rest selection " + JSON.stringify(s));
  await openVoices();
  if (await page.locator(".cp-voice-row[data-act='hide-rest']").isDisabled()) throw new Error("hide rest should be on with a rest selected");
  await page.click(".cp-voice-row[data-act='hide-rest']");
  if ((await drawnOf(rest)).hidden !== true || (await page.locator(`.cp-svg .cp-ev.cp-hidden[data-ev='${rest}']`).count()) !== 1) throw new Error("rest not hidden");
  if ((await vk(B, 1, 1)) !== "n4 r4 r2") throw new Error("a hidden rest still counts");
  // cross-staff: the voice-2 note (a high one on the bass staff) crosses to the upper staff with Ctrl-Shift-↑ and draws there; ↓ brings it home
  await penTap(await headPt(v1));
  const before = await drawnOf(v1);
  await page.keyboard.press("Control+Shift+ArrowUp");
  const crossed = await drawnOf(v1);
  const staffTops = await page.evaluate(() => document.querySelector(".cp-editor").__editor.layout.systems.map((x) => x.staffTop));
  if (crossed.drawStaff !== 0 || !(crossed.y < before.y) || !staffTops.some((t) => crossed.y < t[1] - 1)) throw new Error("cross-staff " + JSON.stringify([before, crossed]));
  if ((await page.evaluate(([i, b]) => document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[1].voices[1][0].cross, [v1, B])) !== -1) throw new Error("cross not stored");
  const th = await page.evaluate((i) => { const ed = document.querySelector(".cp-editor").__editor; const d = ed.layout.drawn.find((x) => x.id === i); return (async () => (await import("/js/lib/compose/hit.js")).thingAt(ed.layout, d.heads[0].x + d.headW / 2, d.heads[0].y))(); }, v1);
  if (th?.ev !== v1 || th.staff !== 1) throw new Error("crossed note not found where drawn " + JSON.stringify(th));
  await page.keyboard.press("Control+Shift+ArrowDown");
  if ((await drawnOf(v1)).drawStaff !== 1) throw new Error("did not come home");
  await page.keyboard.press("Control+Shift+ArrowUp");
  await page.screenshot({ path: `${S}/cp-17-voices.png` });
  const sq = await squares();
  if (sq.bad.length || sq.lanes.length !== 1) throw new Error("square buttons with the switcher: " + JSON.stringify(sq));
  // tidy: undo the eight voice edits → the bar is empty again and only voice 1 remains anywhere
  await page.keyboard.press("Escape");
  for (let i = 0; i < 8; i++) await page.click("[data-act=undo]");
  if ((await vk(B, 1, 0)) !== "r1" || (await vk(B, 1, 1)) !== "none") throw new Error("undo chain: " + (await vk(B, 1, 0)) + " / " + (await vk(B, 1, 1)));
  await pickVoice(0);
  if ((await page.locator(".cp-voice-row.cp-unused").count()) !== 3) throw new Error("voices 2–4 should be dim again");
  await page.keyboard.press("v"); if ((await state()).mode !== "place") await page.keyboard.press("v");
  void Z;
});

await step("rest drag (Select mode): pen down on a rest takes it, dragging down two steps moves the glyph (restY −2, the bar unchanged), release commits one undo step; ↑ nudges a selected rest; Place mode still places over a rest", async () => {
  if ((await state()).mode !== "select") await page.click("[data-act=select]");
  const S = (await state()).S;
  // the last bar's lower staff holds a whole-bar rest — nothing else nearby to grab by mistake
  const last = (await state()).bars - 1;
  const restId = await page.evaluate((b) => document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[1].voices[0][0].id, last);
  const restY = () => page.evaluate((id) => { const s = document.querySelector(".cp-editor").__editor.state.doc; for (const m of s.measures) for (const st of m.staves) for (const v of st.voices) { const e = v?.find((x) => x.id === id); if (e) return e.restY ?? 0; } return null; }, restId);
  const box = async () => { const r = await page.evaluate((id) => { const el = document.querySelector(`.cp-ev[data-ev="${id}"] .rest`); el.scrollIntoView({ block: "center" }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, restId); await page.waitForTimeout(50); return r; };
  const b0 = await box();
  const before = await kinds(last, 1);
  const pen = (type, o) => synth(type, { pointerType: "pen", pointerId: 77, width: 1, height: 1, pressure: 0.5, ...o });
  await pen("pointerdown", { clientX: b0.x, clientY: b0.y });
  let s = await state();
  if (!s.dragging || s.selection.length !== 1 || s.selection[0] !== restId) throw new Error("pen down on a rest did not grab it " + JSON.stringify(s));
  await pen("pointermove", { clientX: b0.x, clientY: b0.y + S / 2 });
  await pen("pointermove", { clientX: b0.x, clientY: b0.y + S });
  if ((await restY()) !== -2) throw new Error("mid-drag restY " + (await restY()));
  const b1 = await box();
  if (Math.abs((b1.y - b0.y) - S) > 1.5) throw new Error(`the glyph did not follow: moved ${b1.y - b0.y}px, expected ${S}`);
  await pen("pointerup", { clientX: b0.x, clientY: b0.y + S });
  s = await state();
  if (s.dragging || (await restY()) !== -2 || s.selection.length !== 1) throw new Error("after the rest drag " + JSON.stringify(s));
  if ((await kinds(last, 1)) !== before) throw new Error("the bar changed: " + (await kinds(last, 1)));
  await page.click("[data-act=undo]");
  if ((await restY()) !== 0) throw new Error("undo of a rest drag " + (await restY()));
  await page.click("[data-act=redo]");
  if ((await restY()) !== -2) throw new Error("redo of a rest drag " + (await restY()));
  // ↑ nudges the selected rest one step (the note keys stay untouched: no note is selected)
  await page.keyboard.press("ArrowUp");
  if ((await restY()) !== -1) throw new Error("ArrowUp nudge " + (await restY()));
  await page.click("[data-act=undo]"); await page.click("[data-act=undo]");
  if ((await restY()) !== 0) throw new Error("two undos " + (await restY()));
  // in Place mode a press on a rest is still a placement, not a grab
  await page.click("[data-act=select]"); // toggles back to Place
  if ((await state()).mode !== "place") throw new Error("not back in Place mode");
  const b2 = await box();
  await pen("pointerdown", { clientX: b2.x, clientY: b2.y });
  if ((await state()).dragging) throw new Error("a rest grabbed in Place mode");
  await pen("pointerup", { clientX: b2.x, clientY: b2.y });
  await page.waitForTimeout(80);
  if ((await kinds(last, 1)) === before) throw new Error("the tap over the rest placed nothing: " + (await kinds(last, 1)));
  await page.click("[data-act=undo]");
  if ((await kinds(last, 1)) !== before) throw new Error("undo of the placement");
});

await step("Pan scrolls and places nothing; leaving Pan pins the score again; zoom buttons change S", async () => {
  await page.click("[data-act=zoom-in]"); await page.click("[data-act=zoom-in]");
  if ((await state()).S !== 16) throw new Error("zoom " + (await state()).S);
  await page.click("[data-act=pan]");
  if ((await state()).mode !== "pan") throw new Error("not pan");
  if ((await page.locator("[data-act=pan] .cp-word").textContent()) !== "Pan") throw new Error("the mode is called Pan");
  const before = await page.evaluate(() => document.querySelector("#cp-view").scrollTop);
  const r = await page.evaluate(() => { const b = document.querySelector("#cp-view").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await synth("pointerdown", { clientX: r.x, clientY: r.y, pointerType: "touch", pointerId: 51, width: 2, height: 2 });
  for (let i = 1; i <= 8; i++) await synth("pointermove", { clientX: r.x, clientY: r.y - i * 20, pointerType: "touch", pointerId: 51, width: 2, height: 2 });
  await synth("pointerup", { clientX: r.x, clientY: r.y - 160, pointerType: "touch", pointerId: 51, width: 2, height: 2 });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.querySelector("#cp-view").scrollTop);
  if (!(after > before)) throw new Error(`did not pan: ${before} → ${after}`);
  const notes = await page.evaluate(() => document.querySelectorAll(".cp-svg .cp-head").length);
  await page.click("[data-act=pan]");
  if ((await state()).mode !== "place") throw new Error("not back to place");
  if ((await page.evaluate(() => document.querySelectorAll(".cp-svg .cp-head").length)) !== notes) throw new Error("pan placed something");
  await page.screenshot({ path: `${S}/cp-04-zoomed.png` });
});

await step("export: File ▾ → Export PDF opens the sheet with a page-1 preview; − / + step the staff size (readout + page count), page / margins / header re-plan; Save PDF downloads a real vector PDF; Add to Scores puts it in the library, the reader shows ink; a re-send after a change replaces the file in place", async () => {
  const cid = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.id);
  await page.click("[data-pop=cp-file-more]");
  await page.click("#cp-file-more [data-act=export-pdf]");
  await page.waitForSelector(".cp-export-wrap .cp-paper .cp-page");
  const readout = () => page.textContent("#cp-x-size");
  const pagesOf = async () => Number((await readout()).match(/(\d+) pages?/)[1]);
  if (!/^staff 7\.2 mm · \d+ pages?$/.test(await readout())) throw new Error("readout " + (await readout()));
  const ink = await page.locator(".cp-paper .cp-svg .cp-ev").count();
  if (ink < 4) throw new Error("the preview shows no notes: " + ink);
  if ((await page.locator(".cp-paper .cp-page-text").count()) < 1) throw new Error("no title on the preview");
  const p0 = await pagesOf();
  await page.click("#cp-x-larger"); await page.click("#cp-x-larger"); await page.click("#cp-x-larger"); // 1.8 → 2.0 → 2.2 → 2.5 mm
  if (!(await readout()).startsWith("staff 10.0 mm")) throw new Error("larger: " + (await readout()));
  if ((await pagesOf()) < p0) throw new Error("a bigger staff never needs fewer pages");
  if (!(await page.getAttribute("#cp-x-larger", "disabled") !== null)) throw new Error("+ should be at its end");
  await page.click("[data-margins=wide]");
  if ((await page.getAttribute("[data-margins=wide]", "aria-pressed")) !== "true") throw new Error("margins not pressed");
  await page.click("[data-page=a4]");
  if (!/A4 · wide margins/.test(await page.textContent("#cp-x-fine"))) throw new Error("fine print " + (await page.textContent("#cp-x-fine")));
  await page.click("#cp-x-header");
  if ((await page.locator(".cp-paper .cp-page-text").count()) !== 0) throw new Error("header off still shows a title");
  await page.click("#cp-x-header");
  // the choices persist
  if (JSON.parse(await page.evaluate(() => localStorage.getItem("ws.compose.export"))).page !== "a4") throw new Error("export choices not remembered");
  // Save PDF → a download of a real PDF (no share sheet in Chromium headless)
  const box = await page.locator("#cp-x-save").boundingBox();
  if (!box || box.y + box.height > page.viewportSize().height) throw new Error("Save PDF sits below the fold at iPad-landscape height: " + JSON.stringify(box));
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#cp-x-save")]);
  if (!/\.pdf$/.test(dl.suggestedFilename())) throw new Error("download name " + dl.suggestedFilename());
  const pdf = readFileSync(await dl.path());
  const txt = pdf.toString("latin1");
  if (!txt.startsWith("%PDF-")) throw new Error("not a PDF");
  const nPages = (txt.match(/\/Type \/Page(?!s)/g) ?? []).length;
  if (nPages !== (await pagesOf())) throw new Error(`the PDF has ${nPages} pages, the sheet promised ${await pagesOf()}`);
  if (!/\/BaseFont \/Fraunces-Regular/.test(txt) || !/\/Subtype \/Form/.test(txt) || /\/Subtype \/Image/.test(txt)) throw new Error("not the vector PDF we make");
  await page.screenshot({ path: `${S}/cp-19-export.png` });
  // where a share sheet exists (an iPad), Save PDF asks first: Save to device → the download; Share… → navigator.share with the file
  await page.evaluate(() => { navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = d.files?.[0]?.name ?? null; }; });
  await page.click("#cp-x-save");
  await page.waitForSelector(".cp-saveway-wrap #cp-x-way-share", { timeout: 20000 });
  await page.click("#cp-x-way-share");
  await page.waitForFunction(() => document.querySelector("#cp-x-save-hint")?.textContent === "shared", null, { timeout: 10000 });
  if (!/\.pdf$/.test(await page.evaluate(() => window.__shared))) throw new Error("share did not get the file: " + (await page.evaluate(() => window.__shared)));
  await page.waitForFunction(() => !document.querySelector(".cp-saveway-wrap"), null, { timeout: 3000 });
  const [dl2] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), (async () => { await page.click("#cp-x-save"); await page.waitForSelector(".cp-saveway-wrap #cp-x-way-device", { timeout: 20000 }); await page.click("#cp-x-way-device"); })()]);
  if (!/\.pdf$/.test(dl2.suggestedFilename())) throw new Error("save to device: " + dl2.suggestedFilename());
  await page.waitForFunction(() => !document.querySelector(".cp-saveway-wrap"), null, { timeout: 3000 });
  await page.evaluate(() => { delete navigator.canShare; delete navigator.share; });
  // Add to Scores
  await page.click("#cp-x-scores");
  await page.waitForFunction(() => document.querySelector("#cp-x-scores-label")?.textContent === "Open in Scores", null, { timeout: 20000 });
  const scoreId = await page.getAttribute("#cp-x-scores", "data-open");
  const lb = async () => page.evaluate(async ([sid, cid]) => { const { logbook } = await import("/js/lib/logbook.js"); const s = logbook.score(sid), c = logbook.composition(cid); return { n: logbook.scores().length, title: s?.title, tags: s?.tags, pages: s?.pages, sha: s?.sha256, linked: c?.scoreId }; }, [scoreId, cid]);
  let r = await lb();
  if (r.linked !== scoreId || !r.tags?.includes("compose") || r.pages !== nPages) throw new Error("score record " + JSON.stringify(r));
  const nScores = r.n, sha1 = r.sha;
  await page.click("#cp-x-scores"); // the row is now the way there
  await page.waitForSelector(".sc-reader", { timeout: 15000 });
  await page.waitForFunction(() => { const c = document.querySelector("#sc-page"); return c && c.width > 2; }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const dark = await page.evaluate(() => { const c = document.querySelector("#sc-page"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 128) k++; return k / (d.length / 16); });
  if (!(dark > 0.002)) throw new Error("the reader shows a blank page: " + dark);
  await page.screenshot({ path: `${S}/cp-20-export-in-scores.png` });
  // back in the editor: the sheet knows the linked score; a change + re-send replaces the file in place (same score, new bytes)
  await page.goto(`${BASE}/?app=1&t=9#/compose/${cid}`);
  await page.waitForSelector(".cp-editor .cp-svg");
  await page.click("[data-pop=cp-file-more]"); await page.click("#cp-file-more [data-act=save-pdf]");
  await page.waitForSelector(".cp-export-wrap .cp-paper .cp-page");
  if ((await page.textContent("#cp-x-scores-label")) !== "Update in Scores") throw new Error("the sheet forgot the linked score");
  await page.click("#cp-x-smaller"); // different bytes
  await page.click("#cp-x-scores");
  await page.waitForFunction(() => document.querySelector("#cp-x-scores-label")?.textContent === "Open in Scores", null, { timeout: 20000 });
  r = await lb();
  if (r.n !== nScores || r.sha === sha1 || r.linked !== scoreId) throw new Error("re-send did not replace in place " + JSON.stringify(r));
  await page.keyboard.press("Escape"); await page.waitForTimeout(350);
  if (await page.locator(".cp-export-wrap:not(.closing)").count()) await page.click(".cp-export-wrap .lb-close");
  await page.waitForFunction(() => !document.querySelector(".cp-export-wrap"), null, { timeout: 3000 });
});

await step("form rail: Rails ▾ → Form; a repeat end on bar 4 draws dots on both staves; endings 1. and 2.; D.C. al Fine, Fine, a segno, a rehearsal letter and Adagio ♩ = 60 land by tap; the same tap removes; the form unrolls; export → import keeps it", async () => {
  await page.keyboard.press("Escape"); if ((await state()).selection.length) await page.keyboard.press("Escape");
  if ((await state()).mode !== "place") await page.keyboard.press("v");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
  await page.click("[data-pop=cp-rails-more]"); await page.click(".cp-rail-row[data-rail=form]"); await page.click("[data-pop=cp-rails-more]");
  if (await page.locator("#cp-form").isHidden()) throw new Error("the Form rail did not open");
  const barTap = (bar) => tapAt({ bar, staff: 0, ticks: PPQ + 300, step: 4 });
  const form = () => page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.measures.map((m, b) => `${b + 1}:${m.barline ? JSON.stringify(m.barline) : ""}${m.ending ? `E${m.ending.n}-${m.ending.end + 1}` : ""}${m.form ? m.form.map((f) => f.kind + (f.bpm ? `=${f.bpm}${f.text ? ` ${f.text}` : ""}` : "")).join(",") : ""}`).filter((x) => x.length > 2).join(" "));
  await page.click("[data-pop=cp-bar-more]"); await page.click(".cp-bar[data-kind=repeat]");
  if ((await state()).pending?.kind !== "barline") throw new Error("barline not armed");
  await barTap(3);
  if ((await page.locator(".cp-svg .cp-repeat-dots").count()) !== 2) throw new Error("repeat dots " + (await page.locator(".cp-svg .cp-repeat-dots").count()));
  await page.click("[data-pop=cp-ending-more]"); await page.click(".cp-ending[data-n='1']"); await barTap(3); await barTap(3);
  await page.click("[data-pop=cp-ending-more]"); await page.click(".cp-ending[data-n='2']"); await barTap(4); await barTap(4);
  await page.click("[data-pop=cp-jump-more]"); await page.click(".cp-jump-row[data-kind=dcAlFine]"); await barTap(5);
  await page.click("[data-pop=cp-jump-more]"); await page.click(".cp-jump-row[data-kind=fine]"); await barTap(1);
  await page.click(".cp-sign-btn[data-kind=segno]"); await barTap(0);
  await page.click(".cp-rehearsal-btn"); await barTap(0);
  await page.evaluate(() => { window.__prompt = window.prompt; window.prompt = () => "Adagio 60"; });
  await page.click(".cp-tempo-mark-btn");
  if ((await state()).pending?.value?.bpm !== 60) throw new Error("tempo mark not armed: " + JSON.stringify((await state()).pending));
  await barTap(4);
  await page.evaluate(() => { window.prompt = window.__prompt; });
  const want = '1:rehearsal,segno 2:fine 4:{"end":"repeat"}E1-4 5:E2-5tempo=60 Adagio 6:dcAlFine';
  if ((await form()) !== want) throw new Error(`form ${await form()} ≠ ${want}`);
  if ((await page.locator(".cp-svg .cp-form").count()) !== 5 || (await page.locator(".cp-svg .cp-ending").count()) !== 2) throw new Error("drawn form " + (await page.locator(".cp-svg .cp-form").count()) + " / " + (await page.locator(".cp-svg .cp-ending").count()));
  await page.screenshot({ path: `${S}/cp-22-form.png` });
  // the same tap again removes; undo brings it back
  await page.click(".cp-rehearsal-btn"); await barTap(0);
  if (!(await form()).startsWith("1:segno ")) throw new Error("rehearsal mark not removed: " + (await form()));
  await page.click("[data-act=undo]");
  if ((await form()) !== want) throw new Error("undo: " + (await form()));
  // the form plays: |: 1 2 3 4 :| with ending 1 on bar 4 and 2 on bar 5, D.C. al Fine at 6, Fine at 2
  const passes = await page.evaluate(async () => { const E = await import("/js/lib/compose/engine.js"); return E.unroll(document.querySelector(".cp-editor").__editor.state.doc).map((p) => `${p.bar + 1}${p.pass > 1 ? "'" : ""}`).join(" "); });
  if (passes !== "1 2 3 4 1' 2' 3' 5' 6 1 2") throw new Error("unroll " + passes);
  // MusicXML keeps it
  await page.click("[data-pop=cp-file-more]");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#cp-file-more [data-act=export-xml]")]);
  const xml = readFileSync(await dl.path(), "utf8");
  if (!/<repeat direction="backward"\/>/.test(xml) || !/<ending number="2" type="discontinue"\/>/.test(xml) || !/<words>D\.C\. al Fine<\/words>/.test(xml) || !/<rehearsal>A<\/rehearsal>/.test(xml)) throw new Error("form missing from the MusicXML");
  const cid = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.id);
  await page.click("[data-act=back]");
  await page.waitForSelector("#cp-import-file", { state: "attached" });
  await page.setInputFiles("#cp-import-file", await dl.path());
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("imported"), null, { timeout: 10000 });
  await page.waitForSelector(".cp-editor .cp-svg");
  if ((await form()) !== want) throw new Error(`imported form ${await form()} ≠ ${want}`);
  const imp = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.id);
  await page.evaluate(async (id) => { const { logbook } = await import("/js/lib/logbook.js"); document.querySelector(".cp-editor").__editor.close({ silent: true }); logbook.removeComposition(id); }, imp);
  await page.goto(`${BASE}/?app=1&t=9#/compose/${cid}`);
  await page.waitForSelector(".cp-editor .cp-svg");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
});

await step("piano rail (WSHED-125, via Rails ▾): a pedal by three taps draws Ped. + line on the lower staff; 8va over two beats draws those heads an octave lower and leaves the pitches; a finger stamps a selected head, an armed digit stamps by tap and the same digit clears; export → import keeps all three", async () => {
  await page.keyboard.press("Escape"); if ((await state()).selection.length) await page.keyboard.press("Escape");
  if ((await state()).mode !== "place") await page.keyboard.press("v");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
  await page.click("[data-pop=cp-rails-more]"); await page.click(".cp-rail-row[data-rail=piano]"); await page.click("[data-pop=cp-rails-more]");
  if (await page.locator("#cp-piano").isHidden()) throw new Error("the Piano rail did not open");
  const ed = () => document.querySelector(".cp-editor").__editor;
  const b = await page.evaluate(() => { const d = document.querySelector(".cp-editor").__editor.state.doc; return d.measures.findIndex((m) => m.staves[0].voices[0].some((e) => e.kind === "note" && !e.dur.tuplet)); }); // a bar with an untied plain note on the upper staff
  const headOf = () => page.evaluate((b) => { const L = document.querySelector(".cp-editor").__editor.layout; const d = L.drawn.find((x) => !x.rest && x.staff === 0 && x.bar === b && x.ticks === 0); return d && { id: d.id, y: d.heads[0].y, step: d.heads[0].step, pi: d.heads[0].pi, pitch: JSON.stringify(d.pitches[d.heads[0].pi]) }; }, b);
  const lines = () => page.evaluate(() => { const d = document.querySelector(".cp-editor").__editor.state.doc; const out = []; d.measures.forEach((m, bi) => { for (const x of m.expressions ?? []) if (x.kind === "pedal" || x.kind === "ottava") out.push(`${x.kind}${x.dir ?? ""}:${x.staff}@${bi}:${x.at}-${x.end.bar}:${x.end.at}`); }); return out.join(" "); });
  const fingersOf = () => page.evaluate(() => { const d = document.querySelector(".cp-editor").__editor.state.doc; const out = []; d.measures.forEach((m, bi) => m.staves.forEach((s, si) => s.voices.forEach((v) => v && v.forEach((e) => e.pitches?.forEach((p, pi) => { if (p.finger) out.push(`${bi}:${si}:${p.step}${p.octave}:${p.finger}`); }))))); return out.join(" "); });
  const before = await headOf();
  if (!before) throw new Error("no head to work with in bar " + (b + 1));
  // a pedal: the button, where it goes down (beat 1, lower staff), where it lifts (beat 4)
  await page.click(".cp-pedal-btn");
  if ((await state()).pending?.kind !== "pedal" || (await page.getAttribute(".cp-pedal-btn", "aria-pressed")) !== "true") throw new Error("pedal did not arm");
  await tapAt({ bar: b, staff: 1, ticks: 300, step: 4 });
  if (!(await state()).pending?.start) throw new Error("the first tap did not start the pedal: " + JSON.stringify((await state()).pending));
  await tapAt({ bar: b, staff: 1, ticks: 3 * PPQ + 300, step: 4 });
  if ((await lines()) !== `pedal:1@${b}:0-${b}:${3 * PPQ}` || (await state()).pending) throw new Error("pedal not placed: " + (await lines()));
  if ((await page.locator(".cp-svg .cp-expr[data-kind=pedal]").count()) < 1 || (await page.locator(".cp-svg .cp-pedal-line").count()) < 1) throw new Error("pedal not drawn");
  // 8va over beats 1–3 of the upper staff: the heads draw seven steps (3.5 S) lower, the pitch is the same
  await page.click(".cp-ottava-btn[data-dir='1']");
  await tapAt({ bar: b, staff: 0, ticks: 300, step: 4 }); await tapAt({ bar: b, staff: 0, ticks: 2 * PPQ + 300, step: 4 });
  const after = await headOf();
  if (!(await lines()).includes(`ottava1:0@${b}:0-${b}:${2 * PPQ}`)) throw new Error("8va not placed: " + (await lines()));
  if (Math.abs(after.y - before.y - 3.5) > 1e-6 || after.pitch !== before.pitch) throw new Error(`8va: head y ${before.y} → ${after.y}, pitch ${before.pitch} → ${after.pitch}`);
  if ((await page.locator(".cp-svg .cp-expr[data-kind=ottava] .cp-ottava-line").count()) !== 1) throw new Error("8va line not drawn");
  // fingering: tap the head (it selects), digit 3 stamps it; Escape; digit 2 armed, a tap on the head stamps 2 (and stays armed), the same tap again clears
  const head = await point({ bar: b, staff: 0, ticks: 0, step: after.step });
  await page.mouse.click(head.x, head.y);
  if ((await state()).selection.join() !== `${after.id}:${after.pi}`) throw new Error("head not selected: " + JSON.stringify((await state()).selection));
  await page.click(".cp-finger-btn[data-n='3']");
  if (!(await fingersOf()).endsWith(":3") || (await page.locator(".cp-svg .cp-finger").count()) !== 1) throw new Error("finger 3 not stamped: " + (await fingersOf()));
  await page.keyboard.press("Escape");
  await page.click(".cp-finger-btn[data-n='2']");
  if ((await state()).pending?.kind !== "finger" || (await state()).pending.value !== 2) throw new Error("finger 2 did not arm");
  await page.mouse.click(head.x, head.y);
  if (!(await fingersOf()).endsWith(":2") || (await state()).pending?.kind !== "finger") throw new Error("armed finger did not stamp / stay armed: " + (await fingersOf()) + " " + JSON.stringify((await state()).pending));
  await page.mouse.click(head.x, head.y);
  if ((await fingersOf()) !== "" || (await page.locator(".cp-svg .cp-finger").count()) !== 0) throw new Error("the same digit did not clear: " + (await fingersOf()));
  await page.mouse.click(head.x, head.y); // stamped again for the round trip
  await page.keyboard.press("Escape");
  if ((await state()).pending) throw new Error("Escape did not disarm the finger");
  await page.screenshot({ path: `${S}/cp-23-piano.png` });
  // MusicXML keeps the three
  const want = { lines: await lines(), fingers: await fingersOf() };
  await page.click("[data-pop=cp-file-more]");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#cp-file-more [data-act=export-xml]")]);
  const xml = readFileSync(await dl.path(), "utf8");
  if (!/<pedal type="start" line="yes"\/>/.test(xml) || !/<octave-shift type="down" size="8"/.test(xml) || !/<fingering>2<\/fingering>/.test(xml)) throw new Error("pedal / 8va / fingering missing from the MusicXML");
  const cid = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.id);
  await page.click("[data-act=back]");
  await page.waitForSelector("#cp-import-file", { state: "attached" });
  await page.setInputFiles("#cp-import-file", await dl.path());
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("imported"), null, { timeout: 10000 });
  await page.waitForSelector(".cp-editor .cp-svg");
  const got = { lines: await lines(), fingers: await fingersOf() };
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`imported ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
  const imp = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.id);
  await page.evaluate(async (id) => { const { logbook } = await import("/js/lib/logbook.js"); document.querySelector(".cp-editor").__editor.close({ silent: true }); logbook.removeComposition(id); }, imp);
  await page.goto(`${BASE}/?app=1&t=9#/compose/${cid}`);
  await page.waitForSelector(".cp-editor .cp-svg");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
});

await step("extended Notes rail (WSHED-126, via Rails ▾): Grace on, a tap before a note adds a small slashed grace (the palette's value), the same tap removes it; Trem ▾ 2 on a selected note draws two bars; marcato on the selection; export → import keeps all three", async () => {
  await page.keyboard.press("Escape"); if ((await state()).selection.length) await page.keyboard.press("Escape");
  if ((await state()).mode !== "place") await page.keyboard.press("v");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
  await page.click("[data-pop=cp-rails-more]"); await page.click(".cp-rail-row[data-rail=notes2]"); await page.click("[data-pop=cp-rails-more]");
  if (await page.locator("#cp-notes2").isHidden()) throw new Error("the Notes + rail did not open");
  const b = await page.evaluate(() => { const d = document.querySelector(".cp-editor").__editor.state.doc; return d.measures.findIndex((m) => m.staves[0].voices[0].some((e) => e.kind === "note" && !e.dur.tuplet)); });
  const noteAt0 = () => page.evaluate((b) => { const d = document.querySelector(".cp-editor").__editor.state.doc; const v = d.measures[b].staves[0].voices[0]; let t = 0; for (const e of v) { if (t === 0 && e.kind === "note") return { id: e.id, graces: e.graces ?? null, trem: e.trem ?? null, art: e.art ?? null }; t += 1; } return null; }, b);
  const before = await noteAt0();
  if (!before) throw new Error("no note on beat 1 of bar " + (b + 1));
  // Grace on: the button lights; a tap on the bar's start at a high step adds a grace to the beat-1 note with the armed (eighth) value
  await page.click(".cp-dur[data-base='8']");
  await page.click(".cp-grace-btn");
  if ((await state()).pending?.kind !== "grace" || (await page.getAttribute(".cp-grace-btn", "aria-pressed")) !== "true") throw new Error("grace did not arm: " + JSON.stringify((await state()).pending));
  await tapAt({ bar: b, staff: 0, ticks: 0, step: 9 });
  let now = await noteAt0();
  if (!now.graces || now.graces.length !== 1 || now.graces[0].base !== 8 || !now.graces[0].slash) throw new Error("grace not added: " + JSON.stringify(now));
  if ((await page.locator(".cp-svg .cp-grace").count()) !== 1 || (await page.locator(".cp-svg .cp-grace-slur").count()) !== 1) throw new Error("grace not drawn");
  if ((await state()).pending?.kind !== "grace") throw new Error("grace did not stay on");
  await tapAt({ bar: b, staff: 0, ticks: 0, step: 9 });
  now = await noteAt0();
  if (now.graces) throw new Error("the same tap did not remove the grace: " + JSON.stringify(now));
  await tapAt({ bar: b, staff: 0, ticks: 0, step: 9 }); // back on for the round trip
  await page.keyboard.press("Escape");
  if ((await state()).pending) throw new Error("Escape did not turn grace off");
  // tremolo and marcato on a selection
  const head = await page.evaluate((id) => { const ed = document.querySelector(".cp-editor").__editor, d = ed.layout.drawn.find((x) => x.id === id), r = document.querySelector(".cp-svg").getBoundingClientRect(); return { x: r.left + (d.x + d.headW / 2) * ed.layout.S, y: r.top + d.heads[0].y * ed.layout.S }; }, before.id);
  await page.mouse.click(head.x, head.y);
  if (!(await state()).selection.length) throw new Error("head not selected");
  await page.click("[data-pop=cp-trem-more]"); await page.click(".cp-trem-row[data-n='2']");
  now = await noteAt0();
  if (now.trem !== 2 || (await page.locator(".cp-svg .cp-trem").count()) !== 2) throw new Error("tremolo: " + JSON.stringify(now) + " bars " + (await page.locator(".cp-svg .cp-trem").count()));
  await page.click(".cp-notes2 .cp-art-btn[data-mark=marcato]");
  now = await noteAt0();
  if (!now.art?.includes("marcato")) throw new Error("marcato: " + JSON.stringify(now));
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${S}/cp-24-notes2.png` });
  // MusicXML keeps the three
  const want = JSON.stringify(await noteAt0());
  await page.click("[data-pop=cp-file-more]");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#cp-file-more [data-act=export-xml]")]);
  const xml = readFileSync(await dl.path(), "utf8");
  if (!/<grace slash="yes"\/>/.test(xml) || !/<tremolo type="single">2<\/tremolo>/.test(xml) || !/<strong-accent\/>/.test(xml)) throw new Error("grace / tremolo / marcato missing from the MusicXML");
  const cid = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.id);
  await page.click("[data-act=back]");
  await page.waitForSelector("#cp-import-file", { state: "attached" });
  await page.setInputFiles("#cp-import-file", await dl.path());
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("imported"), null, { timeout: 10000 });
  await page.waitForSelector(".cp-editor .cp-svg");
  const got = await noteAt0();
  const canon = (a) => JSON.stringify({ graces: a.graces?.map((g) => ({ base: g.base, slash: !!g.slash, pitches: g.pitches.map((p) => `${p.step}${p.alter ?? 0}${p.octave}`) })), trem: a.trem, art: a.art });
  const same = (a, c) => canon(a) === canon(c);
  if (!same(JSON.parse(want), got)) throw new Error(`imported ${JSON.stringify(got)} ≠ ${want}`);
  const imp = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.id);
  await page.evaluate(async (id) => { const { logbook } = await import("/js/lib/logbook.js"); document.querySelector(".cp-editor").__editor.close({ silent: true }); logbook.removeComposition(id); }, imp);
  await page.goto(`${BASE}/?app=1&t=9#/compose/${cid}`);
  await page.waitForSelector(".cp-editor .cp-svg");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
  await page.click(".cp-dur[data-base='4']");
});

await step("the rails filled out (WSHED-127, v98): sf ▾ → sfz on a beat; hold < → a cresc. text line by two taps; Barline ▾ ×3; % on an empty bar draws the sign on both staves; hold ♩= → ♪ then a tempo mark; hold Ped. → Ped. ✱ by two taps; Orn ▾ → a trill with a line, flip stem and a breath on a selection; export → import keeps them", async () => {
  await page.keyboard.press("Escape"); if ((await state()).selection.length) await page.keyboard.press("Escape");
  if ((await state()).mode !== "place") await page.keyboard.press("v");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
  for (const rail of ["expression", "form", "piano", "notes2"]) if (await page.locator(`#cp-${rail}`).isHidden()) { await page.click("[data-pop=cp-rails-more]"); await page.click(`.cp-rail-row[data-rail=${rail}]`); await page.click("[data-pop=cp-rails-more]"); }
  const hold = async (sel) => { const bb = await page.locator(sel).first().boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up(); await page.waitForTimeout(120); };
  const docOf = () => page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc);
  const empty = (m) => m.staves.every((st) => st.voices.every((v) => !v || v.every((e) => e.kind === "rest")));
  const d0 = await docOf();
  const b = d0.measures.findIndex((m) => m.staves[0].voices[0].some((e) => e.kind === "note" && !e.dur.tuplet));
  const sb = d0.measures.findIndex((m, i) => i > 0 && empty(m) && !empty(d0.measures[i - 1]));
  if (b < 0 || sb < 0) throw new Error(`no bar to use: ${b} ${sb}`);
  const barTap2 = (bar) => tapAt({ bar, staff: 0, ticks: PPQ, step: 15 });
  const facts = async () => { const d = await docOf(); const m = d.measures[b], x = (m.expressions ?? []); const n = m.staves[0].voices[0].find((e) => e.kind === "note"); return { sfz: x.filter((e) => e.kind === "dyn" && e.value === "sfz").map((e) => e.at), lines: x.filter((e) => e.kind === "textline").map((e) => `${e.text}@${e.at}-${e.end.bar}:${e.end.at}`), pedals: x.filter((e) => e.kind === "pedal").map((e) => `${e.style ?? "line"}@${e.at}`), barline: m.barline ?? null, simile: d.measures[sb].simile ?? null, tempo: (d.measures[sb].form ?? []).find((f) => f.kind === "tempo") ?? null, art: n.art ?? null, trill: n.trill ?? null, stem: n.stem ?? null }; };
  // dynamics: sfz from the sudden picker on beat 3; a cresc. text line from the hairpin's hold menu over beats 1–4
  await page.click("[data-pop=cp-sf-more]"); await page.click("#cp-sf-more .cp-dyn-btn[data-dyn=sfz]");
  if ((await state()).pending?.value !== "sfz") throw new Error("sfz did not arm");
  await tapAt({ bar: b, staff: 0, ticks: 2 * PPQ, step: 12 });
  await hold(".cp-hairpin-btn[data-kind=cresc]"); await page.click("#cp-cresc-more .cp-textline-row");
  if ((await state()).pending?.kind !== "textline") throw new Error("the text line did not arm: " + JSON.stringify((await state()).pending));
  await tapAt({ bar: b, staff: 0, ticks: 0, step: 12 }); await tapAt({ bar: b, staff: 0, ticks: 3 * PPQ, step: 12 });
  let f = await facts();
  if (f.sfz.join() !== String(2 * PPQ) || f.lines.join() !== `cresc.@0-${b}:${3 * PPQ}`) throw new Error("dynamics rail: " + JSON.stringify(f));
  if ((await page.locator(".cp-svg .cp-expr[data-kind=textline] .cp-textline").count()) !== 1) throw new Error("text line not drawn");
  // form: a repeat ×3 on the bar, a bar repeat on the empty bar after a full one, ♪ = tempo
  await page.click("[data-pop=cp-bar-more]"); await page.click(".cp-bar[data-kind=repeat3]"); await barTap2(b);
  await page.click(".cp-simile-btn"); await barTap2(sb);
  await hold(".cp-tempo-mark-btn"); await page.click(".cp-tempo-unit-row[data-base='8']");
  await page.click(".cp-tempo-mark-btn"); await barTap2(sb);
  f = await facts();
  if (JSON.stringify(f.barline) !== '{"end":"repeat","times":3}' || f.simile !== 1 || f.tempo?.unit?.base !== 8) throw new Error("form rail: " + JSON.stringify(f));
  if ((await page.locator(".cp-svg .cp-simile-sign").count()) !== 2) throw new Error("the % sign is not on both staves");
  await hold(".cp-tempo-mark-btn"); await page.click(".cp-tempo-unit-row[data-base='4'][data-dots='0']"); // back to ♩ for the next steps
  // piano: Ped. ✱ over the lower staff's beats 1–4
  await hold(".cp-pedal-btn"); await page.click(".cp-pedal-row[data-style=sign]");
  if ((await state()).pending?.kind !== "pedal" || (await state()).pending.value !== "sign") throw new Error("the sign pedal did not arm");
  await tapAt({ bar: b, staff: 1, ticks: 0, step: -4 }); await tapAt({ bar: b, staff: 1, ticks: 3 * PPQ, step: -4 });
  f = await facts();
  if (f.pedals.join() !== "sign@0") throw new Error("pedal style: " + JSON.stringify(f));
  if ((await page.locator(".cp-svg .cp-expr[data-kind=pedal] .cp-pedal-sign").count()) !== 2 || (await page.locator(".cp-svg .cp-expr[data-kind=pedal] .cp-pedal-line").count()) !== 0) throw new Error("Ped. ✱ should be two signs and no line");
  await hold(".cp-pedal-btn"); await page.click(".cp-pedal-row[data-style=line]"); await page.keyboard.press("Escape");
  // notes: select the bar's first head → Orn ▾ trill with a line, flip stem, a breath mark
  const headOf = () => page.evaluate((b) => { const ed = document.querySelector(".cp-editor").__editor, d = ed.layout.drawn.find((x) => !x.rest && x.bar === b && x.staff === 0), r = document.querySelector(".cp-svg").getBoundingClientRect(); return { x: r.left + (d.x + d.headW / 2) * ed.layout.S, y: r.top + d.heads[0].y * ed.layout.S, stem: d.stem }; }, b);
  let first = await headOf();
  { const vr = await page.evaluate(() => { const r = document.querySelector("#cp-view").getBoundingClientRect(); return [r.top, r.bottom]; }); if (first.y < vr[0] + 12 || first.y > vr[1] - 24) { await page.evaluate((y) => { const v = document.querySelector("#cp-view"); v.scrollTop += y - v.getBoundingClientRect().top - v.clientHeight * 0.5; }, first.y); first = await headOf(); } } // under the rails: scroll it into the view first
  await page.mouse.click(first.x, first.y);
  if (!(await state()).selection.length) throw new Error("head not selected");
  await page.click("[data-pop=cp-orn-more]"); await page.click(".cp-orn-row[data-i='0']");
  await page.click(".cp-stem-btn"); await page.click(".cp-art-btn[data-mark=breath]");
  f = await facts();
  if (!f.art?.includes("trill") || !f.art.includes("breath") || !f.trill?.line || f.stem !== (first.stem === "up" ? "down" : "up")) throw new Error("notes rail: " + JSON.stringify(f) + " was " + first.stem);
  if ((await page.locator(".cp-svg .cp-trill-line").count()) !== 1) throw new Error("trill line not drawn");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${S}/cp-25-rails2.png` });
  writeFileSync(`${S}/cp-25-rails2.json`, JSON.stringify(await docOf())); // the piece as it stands, for a pixel check by hand
  // MusicXML keeps them (stems are written, not read back; the rest round-trips)
  const want = await facts();
  await page.click("[data-pop=cp-file-more]");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#cp-file-more [data-act=export-xml]")]);
  const xml = readFileSync(await dl.path(), "utf8");
  for (const re of [/<sfz\/>/, /<dashes type="start"/, /times="3"/, /<measure-repeat type="start" slashes="1">1<\/measure-repeat>/, /<beat-unit>eighth<\/beat-unit>/, /line="no" sign="yes"/, /<wavy-line type="start"\/>/, /<breath-mark\/>/, /<stem>/]) if (!re.test(xml)) throw new Error("missing from the MusicXML: " + re);
  const cid = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.id);
  await page.click("[data-act=back]");
  await page.waitForSelector("#cp-import-file", { state: "attached" });
  await page.setInputFiles("#cp-import-file", await dl.path());
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("imported"), null, { timeout: 10000 });
  await page.waitForSelector(".cp-editor .cp-svg");
  const got = await facts();
  const canon = (x) => JSON.stringify({ ...x, stem: null, art: [...(x.art ?? [])].sort() });
  if (canon(got) !== canon(want)) throw new Error(`imported ${canon(got)} ≠ ${canon(want)}`);
  const imp = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.id);
  await page.evaluate(async (id) => { const { logbook } = await import("/js/lib/logbook.js"); document.querySelector(".cp-editor").__editor.close({ silent: true }); logbook.removeComposition(id); }, imp);
  await page.goto(`${BASE}/?app=1&t=10#/compose/${cid}`);
  await page.waitForSelector(".cp-editor .cp-svg");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 0; });
  await page.click(".cp-dur[data-base='4']");
});

await step("MusicXML: File ▾ → Export MusicXML downloads a part-wise 4.0 file; import on the list (plain and .mxl) makes new compositions with the same bars; the file menu's Share… path hands over the file", async () => {
  const cid = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.id);
  const before = await kinds(0);
  await page.click("[data-pop=cp-file-more]");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#cp-file-more [data-act=export-xml]")]);
  if (!/\.musicxml$/.test(dl.suggestedFilename())) throw new Error("download name " + dl.suggestedFilename());
  const xmlPath = await dl.path();
  const xml = readFileSync(xmlPath, "utf8");
  if (!xml.startsWith("<?xml") || !/<score-partwise version="4.0">/.test(xml) || !/<divisions>6720<\/divisions>/.test(xml) || !/<work-title>/.test(xml)) throw new Error("not the MusicXML we make: " + xml.slice(0, 200));
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("saved as"), null, { timeout: 5000 });
  // where a share sheet exists the same choice as the PDF: Share… hands over the file
  await page.evaluate(() => { navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = d.files?.[0]?.name ?? null; }; });
  await page.click("[data-pop=cp-file-more]"); await page.click("#cp-file-more [data-act=export-xml]");
  await page.waitForSelector(".cp-saveway-wrap #cp-x-way-share", { timeout: 10000 });
  await page.click("#cp-x-way-share");
  await page.waitForFunction(() => /\.musicxml$/.test(window.__shared ?? ""), null, { timeout: 5000 });
  await page.waitForFunction(() => !document.querySelector(".cp-saveway-wrap"), null, { timeout: 3000 });
  await page.evaluate(() => { delete navigator.canShare; delete navigator.share; });
  // import the download on the list → a new composition opens with the same bars, tagged imported
  await page.click("[data-act=back]");
  await page.waitForSelector("#cp-import-file", { state: "attached" });
  const rows = await page.locator(".sc-row").count();
  await page.setInputFiles("#cp-import-file", xmlPath);
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("imported"), null, { timeout: 10000 });
  await page.waitForSelector(".cp-editor .cp-svg");
  const imp = await page.evaluate(() => { const d = document.querySelector(".cp-editor").__editor.state.doc; return { id: d.id, title: d.title, tags: d.tags }; });
  if (imp.id === cid || !imp.tags.includes("imported")) throw new Error("import did not make a new tagged piece: " + JSON.stringify(imp));
  if ((await kinds(0)) !== before) throw new Error(`imported bar 1 ${await kinds(0)} ≠ ${before}`);
  await page.screenshot({ path: `${S}/cp-21-imported.png` });
  // a compressed .mxl (the zip other programs write) imports too
  const { deflateRawSync } = await import("node:zlib");
  const enc = new TextEncoder(), raw = enc.encode(xml), data = deflateRawSync(raw), nm = enc.encode("score.musicxml");
  const le16 = (n) => [n & 255, (n >> 8) & 255], le32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const local = Uint8Array.from([...le32(0x04034b50), ...le16(20), ...le16(0), ...le16(8), ...le16(0), ...le16(0), ...le32(0), ...le32(data.length), ...le32(raw.length), ...le16(nm.length), ...le16(0), ...nm]);
  const central = Uint8Array.from([...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0), ...le16(8), ...le16(0), ...le16(0), ...le32(0), ...le32(data.length), ...le32(raw.length), ...le16(nm.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(0), ...nm]);
  const eocd = Uint8Array.from([...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(1), ...le16(1), ...le32(central.length), ...le32(local.length + data.length), ...le16(0)]);
  const mxl = Buffer.concat([local, data, central, eocd]);
  await page.click("[data-act=back]");
  await page.waitForSelector("#cp-import-file", { state: "attached" });
  await page.setInputFiles("#cp-import-file", { name: "Zipped.mxl", mimeType: "application/vnd.recordare.musicxml", buffer: mxl });
  await page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("imported"), null, { timeout: 10000 });
  await page.waitForSelector(".cp-editor .cp-svg");
  const imp2 = await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.id);
  if ((await kinds(0)) !== before) throw new Error(`mxl bar 1 ${await kinds(0)} ≠ ${before}`);
  // a file that is not MusicXML says so and adds nothing
  await page.click("[data-act=back]");
  await page.waitForSelector("#cp-import-file", { state: "attached" });
  if ((await page.locator(".sc-row").count()) !== rows + 2) throw new Error("rows after two imports: " + (await page.locator(".sc-row").count()));
  const refused = () => page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("not a MusicXML score"), null, { timeout: 8000 });
  await page.setInputFiles("#cp-import-file", { name: "notes.xml", mimeType: "text/xml", buffer: Buffer.from("<html><body>hi</body></html>") });
  try { await refused(); } catch { console.log("  (the refused import's toast did not show — the list re-rendered under the file input; sending it once more)"); await page.setInputFiles("#cp-import-file", { name: "notes.xml", mimeType: "text/xml", buffer: Buffer.from("<html><body>hi</body></html>") }); await refused(); } // deterministic in isolation (10 / 10); flaky only late in a long run
  if ((await page.locator(".sc-row").count()) !== rows + 2) throw new Error("a refused file added a row");
  // the imports leave, so the list below holds one piece
  await page.evaluate(async (ids) => { const { logbook } = await import("/js/lib/logbook.js"); for (const id of ids) logbook.removeComposition(id); }, [imp.id, imp2]);
  await page.goto(`${BASE}/?app=1&t=9#/compose/${cid}`);
  await page.waitForSelector(".cp-editor .cp-svg");
});

await step("reload restores the composition, the zoom and the armed duration; opening is not an edit (updatedAt and the pending count stay)", async () => {
  const before = await page.evaluate(async () => { const m = await import("/js/lib/logbook.js"); const c = m.logbook.composition(document.querySelector(".cp-editor").__editor.id); return { updatedAt: c.updatedAt, pending: m.logbook.pendingCount() }; });
  await page.reload();
  await page.waitForSelector(".cp-editor .cp-svg");
  const s = await state();
  if (!(s.bars === 9 && s.S === 16 && s.armed.base === 4)) throw new Error(JSON.stringify(s));
  if ((await kinds(0)) !== "n4 n4 n4 n4") throw new Error("lost: " + (await kinds(0)));
  if ((await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.tempo)) !== 101) throw new Error("tempo not restored");
  const after = await page.evaluate(async () => { const m = await import("/js/lib/logbook.js"); const c = m.logbook.composition(document.querySelector(".cp-editor").__editor.id); return { updatedAt: c.updatedAt, pending: m.logbook.pendingCount() }; });
  if (after.updatedAt !== before.updatedAt || after.pending !== before.pending) throw new Error("opening touched the piece: " + JSON.stringify({ before, after }));
});

await step("an older (v2) piece with marks on its notes opens with them as expressions, and opening it neither bumps updatedAt nor persists the upgrade — the first real edit does (v93: a stale copy must never outrank another device's work)", async () => {
  const orig = await page.evaluate(() => document.querySelector(".cp-editor").__editor.id);
  const seeded = await page.evaluate(async () => {
    const [{ logbook }, M, E] = await Promise.all([import("/js/lib/logbook.js"), import("/js/lib/compose/model.js"), import("/js/lib/compose/engine.js")]);
    let d = M.newComposition({ id: "e2e-v2-" + Date.now().toString(36), title: "Old marks", composer: "E2E", now: Date.now() - 3600e3 });
    d = E.place(d, { bar: 0, staff: 0, ticks: 0, step: 4 }, { base: 4, dots: 0, rest: false }).doc;
    d = E.place(d, { bar: 0, staff: 0, ticks: 6720, step: 4 }, { base: 4, dots: 0, rest: false }).doc;
    const v = d.measures[0].staves[0].voices[0]; v[0].dyn = "f"; v[0].hairpin = "cresc-start"; v[1].hairpin = "cresc-stop"; v[1].text = "dolce"; d.v = 2;
    logbook.addComposition(d);
    const c = logbook.composition(d.id); c.updatedAt = Date.now() - 3600e3; // as if edited an hour ago on another device
    logbook.updateComposition(d.id, { openedAt: c.openedAt }); // save() without touching
    return { id: d.id, updatedAt: logbook.composition(d.id).updatedAt, v: logbook.composition(d.id).v };
  });
  if (seeded.v !== 2) throw new Error("seed is not v2: " + JSON.stringify(seeded));
  await page.goto(`${BASE}/?app=1&t=1#/compose/${seeded.id}`);
  await page.waitForSelector(".cp-editor .cp-svg");
  const opened = await page.evaluate(async () => { const { logbook } = await import("/js/lib/logbook.js"); const ed = document.querySelector(".cp-editor").__editor, c = logbook.composition(ed.id); return { memV: ed.state.doc.v, exprs: (ed.state.doc.measures[0].expressions ?? []).map((x) => x.kind), storedV: c.v, updatedAt: c.updatedAt, drawn: document.querySelectorAll(".cp-svg .cp-expr").length }; });
  if (opened.memV !== 3 || opened.exprs.join() !== "dyn,hairpin,text" || opened.drawn !== 3) throw new Error("upgrade in memory: " + JSON.stringify(opened));
  if (opened.storedV !== 2 || opened.updatedAt !== seeded.updatedAt) throw new Error("opening persisted or touched the piece: " + JSON.stringify({ seeded, opened }));
  await tapAt({ bar: 1, staff: 0, ticks: 300, step: 4 }); // a real edit persists the upgraded piece with a fresh clock
  await page.waitForTimeout(500);
  const edited = await page.evaluate(async () => { const { logbook } = await import("/js/lib/logbook.js"); const c = logbook.composition(document.querySelector(".cp-editor").__editor.id); return { storedV: c.v, updatedAt: c.updatedAt, exprs: (c.measures[0].expressions ?? []).length }; });
  if (edited.storedV !== 3 || !(edited.updatedAt > seeded.updatedAt) || edited.exprs !== 3) throw new Error("the edit did not persist the upgrade: " + JSON.stringify(edited));
  await page.evaluate(async (id) => { const { logbook } = await import("/js/lib/logbook.js"); document.querySelector(".cp-editor").__editor.close({ silent: true }); logbook.removeComposition(id); }, seeded.id); // the seed leaves with its editor, so the list below holds one piece
  await page.goto(`${BASE}/?app=1&t=1#/compose/${orig}`);
  await page.waitForSelector(".cp-editor .cp-svg");
});

await step("the header title opens the details modal: title, composer and tags save; the header follows the rename", async () => {
  await page.click("#cp-title");
  await page.waitForSelector("#cp-d-title");
  if ((await page.inputValue("#cp-d-title")) !== "Untitled") throw new Error("modal did not load the title");
  await page.fill("#cp-d-title", "Study in C"); await page.fill("#cp-d-composer", "Leif"); await page.fill("#cp-d-tags", "study, exercise");
  if ((await page.locator("#cp-d-tagrow .sc-tag.on").count()) !== 2) throw new Error("tag rail should show the two picked tags");
  await page.click("#cp-d-save");
  await page.waitForSelector("#cp-d-title", { state: "detached" });
  if ((await page.locator("#cp-title").textContent()) !== "Leif – Study in C") throw new Error("header reads composer – title: " + (await page.locator("#cp-title").textContent()));
  const meta = await page.evaluate(() => { const c = document.querySelector(".cp-editor").__editor.state.doc; return { title: c.title, composer: c.composer, tags: c.tags }; });
  if (meta.title !== "Study in C" || meta.composer !== "Leif" || meta.tags.join() !== "study,exercise") throw new Error("saved " + JSON.stringify(meta));
});

await step("back → the list shows the composition with composer, bars and tags; search, tag chips and sort work like the Scores library; sight singing still renders", async () => {
  await page.click("[data-act=back]");
  await page.waitForSelector(".sc-row");
  const sub = await page.locator(".sc-sub").first().textContent();
  if (!/8 bars/.test(sub) || !sub.includes("Leif") || !sub.includes("study")) throw new Error("sub " + sub);
  if (!(await page.locator(".sc-tools .sc-tag[data-tag=study]").count())) throw new Error("tag rail missing");
  await page.click(".sc-tools .sc-tag[data-tag=study]");
  if ((await page.locator(".sc-row").count()) !== 1 || !(await page.locator(".sc-tools .sc-tag.on[data-tag=study]").count())) throw new Error("tag filter");
  await page.fill("#cp-q", "nothing here"); await page.waitForTimeout(250);
  if (!(await page.locator(".sc-empty").textContent()).includes("nothing matches")) throw new Error("search should empty the list");
  await page.click("#cp-clear");
  if ((await page.locator(".sc-row").count()) !== 1 || (await page.locator("#cp-q").inputValue()) !== "") throw new Error("clear");
  await page.click("[data-sort=composer]"); await page.click("#cp-group");
  if (!(await page.locator(".sc-groupname").textContent()).includes("Leif")) throw new Error("group by composer");
  await page.click("#cp-group");
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

await step("v100: a rail never wraps — one line at every width, slides under a finger, menus stay on screen", async () => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`${BASE}/?app=1&t=3#/compose`);
  await page.waitForSelector(".sc-row");
  await page.click(".sc-open");
  await page.waitForSelector(".cp-editor .cp-svg");
  for (const rail of ["utility", "expression", "form", "piano", "notes2"]) if (await page.locator(`#cp-${rail}`).isHidden()) { await page.click("[data-pop=cp-rails-more]"); await page.click(`.cp-rail-row[data-rail=${rail}]`); await page.click("[data-pop=cp-rails-more]"); }
  const lines = () => page.evaluate(() => {
    const rails = [];
    for (const r of document.querySelectorAll(".cp-rail")) {
      const rr = r.getBoundingClientRect(); if (!rr.height) continue;
      const tallest = Math.max(...[...r.querySelectorAll(".cp-btn, .cp-group")].map((b) => b.getBoundingClientRect().height));
      const cap = r.querySelector(".cp-cap");
      rails.push({ rail: r.dataset.rail ?? "header", h: Math.round(rr.height), tallest: Math.round(tallest), over: r.scrollWidth > r.clientWidth + 1, fade: r.parentElement.dataset.over ?? "", cap: !!cap && getComputedStyle(cap).display !== "none" && cap.getBoundingClientRect().width > 0 });
    }
    return { rails, stack: Math.round(document.querySelector("#cp-rails").getBoundingClientRect().height), seps: document.querySelectorAll(".cp-sep").length, groups: document.querySelectorAll(".cp-group").length, holds: document.querySelectorAll(".cp-hold").length, chev: document.querySelectorAll(".cp-rail .cp-chev").length, tri: [...document.querySelectorAll(".cp-rail .cp-btn")].filter((b) => /▾/.test(b.textContent)).length };
  });
  const heights = {};
  for (const [w, h] of [[1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250);
    await noWiden();
    const L = await lines();
    const wrapped = L.rails.filter((r) => r.h > r.tallest + 4);
    if (wrapped.length) throw new Error(`${w}×${h}: a rail wrapped: ${JSON.stringify(wrapped)}`);
    if (L.seps || L.tri) throw new Error(`${w}×${h}: separators ${L.seps}, text triangles ${L.tri}`);
    if (L.groups < 20 || L.holds < 13 || L.chev < 12) throw new Error(`${w}×${h}: groups ${L.groups}, hold dots ${L.holds}, chevrons ${L.chev}`);
    const capped = L.rails.filter((r) => r.cap).length;
    if (w > 480 ? capped !== 6 : capped !== 0) throw new Error(`${w}×${h}: captions ${capped}`);
    for (const r of L.rails) if (r.over !== /right|left/.test(r.fade)) throw new Error(`${w}×${h}: fade ${JSON.stringify(r)}`);
    if (w === 390 && !L.rails.some((r) => r.over)) throw new Error("390: nothing overflows — the rails did not need to scroll?");
    heights[`${w}×${h}`] = L.stack;
  }
  console.log("  rails stack with every rail on:", JSON.stringify(heights));
  // a finger slides an overflowing rail (CDP touch: Playwright's mouse cannot scroll a touch surface)
  const railSel = await page.evaluate(() => { const r = [...document.querySelectorAll(".cp-rail[data-rail]")].find((x) => x.scrollWidth > x.clientWidth + 1 && x.getBoundingClientRect().height); return r ? `.cp-rail[data-rail="${r.dataset.rail}"]` : null; });
  const bb = await page.locator(railSel).boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const y = bb.y + bb.height / 2, x0 = bb.x + bb.width - 30;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 - i * 30, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(350);
  const slid = await page.evaluate((sel) => { const r = document.querySelector(sel); return { left: r.scrollLeft, fade: r.parentElement.dataset.over ?? "" }; }, railSel);
  if (slid.left < 40 || !/left/.test(slid.fade)) throw new Error("finger drag did not slide the rail: " + JSON.stringify(slid));
  // menus are fixed on the screen: a hold menu at the left and the Rails menu at the right both stay inside the viewport
  const hold = async (sel) => { const b = await page.locator(sel).first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up(); await page.waitForTimeout(160); };
  await page.evaluate(() => { document.querySelector('.cp-rail[data-rail="expression"]').scrollLeft = 0; });
  await hold(".cp-hold-pp");
  for (const [sel, name] of [["#cp-pp-more", "pp hold menu"]]) { const m = await page.locator(sel).boundingBox(); if (!m || m.x < 0 || m.x + m.width > 390 || m.y < 0 || m.y + m.height > 844) throw new Error(`${name} off screen: ${JSON.stringify(m)}`); }
  await page.keyboard.press("Escape"); await page.mouse.click(200, 800);
  await page.click("[data-pop=cp-rails-more]");
  { const m = await page.locator("#cp-rails-more").boundingBox(); if (!m || m.x < 0 || m.x + m.width > 390) throw new Error("rails menu off screen: " + JSON.stringify(m)); }
  await page.click("[data-pop=cp-rails-more]");
  // no picker is a bare chevron at phone width
  const bare = await page.evaluate(() => [...document.querySelectorAll(".cp-rail:not(.cp-header) .cp-pick")].filter((b) => b.getBoundingClientRect().width && ![...b.children].some((c) => !c.classList.contains("cp-chev") && c.getBoundingClientRect().width > 0)).map((b) => b.getAttribute("aria-label")));
  if (bare.length) throw new Error("bare chevrons at phone width: " + JSON.stringify(bare));
  await page.screenshot({ path: `${S}/cp-26-phone-rails.png` });
  await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(200);
  await page.screenshot({ path: `${S}/cp-26-facelift.png` });
});

await step("v101: Pen | Touch — a wide finger rests in Pen and draws in Touch; Select-mode targets are fingertip-sized (grab, lasso); hold-and-slide aims above the finger; a fresh device starts in Touch and the first pen flips it once; no switch on a mouse-only device", async () => {
  // a fresh piece so the bars are known
  await page.goto(`${BASE}/?app=1&t=4#/compose`);
  await page.waitForSelector("#cp-new");
  await page.click("#cp-new"); await page.waitForSelector("#cp-d-title"); await page.fill("#cp-d-title", "Touch"); await page.click("#cp-d-save");
  await page.waitForSelector(".cp-editor .cp-svg");
  const SS = (await state()).S;
  const pressed = () => page.evaluate(() => [...document.querySelectorAll(".cp-inp")].map((b) => `${b.dataset.input}=${b.getAttribute("aria-pressed")}`).join(","));
  const pitchAt = (bar, i) => page.evaluate(([b, i]) => { const e = document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[0].voices[0][i]; return e.pitches?.map((p) => p.step + p.octave).join("+") ?? e.kind; }, [bar, i]);
  const fat = (type, o) => synth(type, { pointerType: "touch", pointerId: 130, width: 50, height: 50, ...o }); // an iPad fingertip, wider than the palm guard
  // this context saw a pen long ago → the switch stands on Pen and is visible on an iPad
  if (!(await page.locator(".cp-input").isVisible())) throw new Error("no switch on an iPad");
  if ((await state()).input !== "pen" || (await pressed()) !== "pen=true,touch=false") throw new Error("after a pen this device should rest fingers: " + (await state()).input + " " + (await pressed()));
  // Pen: a wide finger tap places nothing
  let p = await point({ bar: 0, staff: 0, ticks: 0, step: 4 });
  await fat("pointerdown", { clientX: p.x, clientY: p.y }); await fat("pointerup", { clientX: p.x, clientY: p.y });
  if ((await kinds(0)) !== "r1") throw new Error("Pen mode let a wide finger place: " + (await kinds(0)));
  // Touch: the same tap places B4; a slow lift still lands under the finger
  await page.click(".cp-inp[data-input=touch]");
  if ((await state()).input !== "touch" || (await pressed()) !== "pen=false,touch=true") throw new Error("switch to Touch: " + (await pressed()));
  await fat("pointerdown", { clientX: p.x, clientY: p.y }); await fat("pointerup", { clientX: p.x, clientY: p.y });
  if ((await kinds(0)) !== "n4 r4 r2" || (await pitchAt(0, 0)) !== "B4") throw new Error("Touch tap: " + (await kinds(0)) + " " + (await pitchAt(0, 0)));
  p = await point({ bar: 0, staff: 0, ticks: PPQ, step: 6 });
  await fat("pointerdown", { clientX: p.x, clientY: p.y }); await page.waitForTimeout(400); await fat("pointerup", { clientX: p.x, clientY: p.y });
  if ((await kinds(0)) !== "n4 n4 r2" || (await pitchAt(0, 1)) !== "D5") throw new Error("a slow Touch tap: " + (await kinds(0)) + " " + (await pitchAt(0, 1)));
  // Select mode: a wide finger landing 15 px under the first head still grabs it; a drag of one S re-pitches by two steps
  await page.click("[data-act=select]");
  const h = await point({ bar: 0, staff: 0, ticks: 0, step: 4 }); h.x += 0.6 * SS;
  await fat("pointerdown", { clientX: h.x, clientY: h.y + 15 });
  const sg = await state();
  if (!sg.dragging || sg.selection.length !== 1) throw new Error("a fat finger near a head did not grab: " + JSON.stringify(sg));
  await fat("pointermove", { clientX: h.x, clientY: h.y + 15 + SS }); await fat("pointerup", { clientX: h.x, clientY: h.y + 15 + SS });
  if ((await pitchAt(0, 0)) !== "G4") throw new Error("finger drag: " + (await pitchAt(0, 0)));
  // a wide finger stroke around both heads lassoes them
  const a = await point({ bar: 0, staff: 0, ticks: 0, step: 2 }), b = await point({ bar: 0, staff: 0, ticks: PPQ, step: 6 });
  const x0 = a.x - SS, x1 = b.x + 2 * SS, y0 = b.y - 2 * SS, y1 = a.y + 2 * SS;
  await fat("pointerdown", { clientX: x0, clientY: y0 });
  for (const [x, y] of [[x1, y0], [x1, y1], [x0, y1], [x0, y0]]) await fat("pointermove", { clientX: x, clientY: y });
  await fat("pointerup", { clientX: x0, clientY: y0 });
  if ((await state()).selection.length !== 2) throw new Error("finger lasso: " + JSON.stringify((await state()).selection));
  // a fat tap on empty staff clears; a fat tap 12 px under a head selects it
  await fat("pointerdown", { clientX: x1, clientY: y1 }); await fat("pointerup", { clientX: x1, clientY: y1 });
  if ((await state()).selection.length !== 0) throw new Error("tap on empty staff should clear");
  await fat("pointerdown", { clientX: b.x + 0.6 * SS, clientY: b.y + 12 }); await fat("pointerup", { clientX: b.x + 0.6 * SS, clientY: b.y + 12 });
  if ((await state()).selection.length !== 1) throw new Error("fat tap near a head should select it");
  // Place mode: hold → the ghost lifts 40 px above the finger; slide; lift → the note lands where the ghost was (bar 2 beat 1, B4), not under the finger (step 0)
  await page.click("[data-act=select]");
  const t = await point({ bar: 1, staff: 0, ticks: 0, step: 4 }); // the aim point; the finger is 40 px below it — two staff steps down at S ≈ 12 is step 0, an E4
  await fat("pointerdown", { clientX: t.x, clientY: t.y + AIM });
  await page.waitForTimeout(650);
  const ghost = await page.evaluate(() => !document.querySelector(".cp-ghost").hasAttribute("hidden"));
  if (!ghost) throw new Error("a held finger did not lift a ghost");
  await fat("pointermove", { clientX: t.x + 4, clientY: t.y + AIM + 3 }); await fat("pointermove", { clientX: t.x, clientY: t.y + AIM });
  await fat("pointerup", { clientX: t.x, clientY: t.y + AIM });
  if ((await kinds(1)) !== "n4 r4 r2" || (await pitchAt(1, 0)) !== "B4") throw new Error("aimed placement: " + (await kinds(1)) + " " + (await pitchAt(1, 0)));
  // a slide (no hold) aims too: down at step 0 of bar 3, slide up 40 px → the ghost sits at step 4 + 40 px... place by the ghost
  const u = await point({ bar: 2, staff: 0, ticks: 0, step: 4 });
  await fat("pointerdown", { clientX: u.x, clientY: u.y + AIM + 30 });
  await fat("pointermove", { clientX: u.x, clientY: u.y + AIM + 15 }); await fat("pointermove", { clientX: u.x, clientY: u.y + AIM });
  await fat("pointerup", { clientX: u.x, clientY: u.y + AIM });
  if ((await kinds(2)) !== "n4 r4 r2" || (await pitchAt(2, 0)) !== "B4") throw new Error("slid placement: " + (await kinds(2)) + " " + (await pitchAt(2, 0)));
  // a second finger cancels an aim
  const v = await point({ bar: 3, staff: 0, ticks: 0, step: 4 });
  await fat("pointerdown", { clientX: v.x, clientY: v.y + AIM }); await page.waitForTimeout(650);
  await synth("pointerdown", { pointerType: "touch", pointerId: 131, width: 50, height: 50, clientX: v.x + 200, clientY: v.y });
  await synth("pointerup", { pointerType: "touch", pointerId: 131, width: 50, height: 50, clientX: v.x + 200, clientY: v.y });
  await fat("pointerup", { clientX: v.x, clientY: v.y + AIM });
  if ((await kinds(3)) !== "r1") throw new Error("a second finger should cancel the aim: " + (await kinds(3)));
  // the pen leaves a deliberate Touch alone
  await synth("pointerdown", { pointerType: "pen", pointerId: 132, width: 1, height: 1, pressure: 0.5, clientX: v.x, clientY: v.y }); await synth("pointerup", { pointerType: "pen", pointerId: 132, width: 1, height: 1, clientX: v.x, clientY: v.y });
  if ((await state()).input !== "touch") throw new Error("a later pen must not undo a deliberate Touch");
  await page.screenshot({ path: `${S}/cp-27-touch.png`, clip: { x: 0, y: 0, width: 1024, height: 200 } });
  await noWiden();
  // a fresh device: Touch by default; the first pen flips it to Pen once with a toast; the setting survives a reload
  const fresh = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA });
  const pg = await fresh.newPage();
  await pg.goto(`${BASE}/?app=1`);
  await pg.evaluate(() => { localStorage.setItem("ws.shell.seen", "true"); });
  await pg.goto(`${BASE}/?app=1&t=1#/compose`);
  await pg.waitForSelector("#cp-new"); await pg.click("#cp-new"); await pg.waitForSelector("#cp-d-title"); await pg.fill("#cp-d-title", "Fresh"); await pg.click("#cp-d-save");
  await pg.waitForSelector(".cp-editor .cp-svg");
  const st = () => pg.evaluate(() => { const s = document.querySelector(".cp-editor").__editor.state; return { input: s.input, penSeen: s.penSeen, pressed: [...document.querySelectorAll(".cp-inp")].map((b) => `${b.dataset.input}=${b.getAttribute("aria-pressed")}`).join(",") }; });
  let f = await st();
  if (f.input !== "touch" || f.penSeen || f.pressed !== "pen=false,touch=true") throw new Error("a fresh device should start in Touch: " + JSON.stringify(f));
  const fp = await pg.evaluate(() => document.querySelector(".cp-editor").__editor.pointFor({ bar: 0, staff: 0, ticks: 0, step: 4 }));
  const synthOn = (type, o) => pg.evaluate(([type, o]) => { document.querySelector("#cp-view").dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, isPrimary: true, ...o })); }, [type, o]);
  await synthOn("pointerdown", { pointerType: "pen", pointerId: 140, width: 1, height: 1, pressure: 0.5, clientX: fp.x, clientY: fp.y }); await synthOn("pointerup", { pointerType: "pen", pointerId: 140, width: 1, height: 1, clientX: fp.x, clientY: fp.y });
  f = await st();
  if (f.input !== "pen" || !f.penSeen || f.pressed !== "pen=true,touch=false") throw new Error("the first pen should flip to Pen: " + JSON.stringify(f));
  if (!(await pg.locator(".lb-toast").textContent()).includes("Pencil")) throw new Error("no toast on the flip: " + (await pg.locator(".lb-toast").textContent()));
  await pg.click(".cp-inp[data-input=touch]");
  await pg.reload(); await pg.waitForSelector(".cp-editor .cp-svg");
  f = await st();
  if (f.input !== "touch" || !f.penSeen) throw new Error("the setting should survive a reload: " + JSON.stringify(f));
  await fresh.close();
  // a mouse-only device has no switch
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = await desk.newPage();
  await dp.goto(`${BASE}/?app=1`);
  await dp.evaluate(() => { localStorage.setItem("ws.shell.seen", "true"); });
  await dp.goto(`${BASE}/?app=1&t=1#/compose`);
  await dp.waitForSelector("#cp-new"); await dp.click("#cp-new"); await dp.waitForSelector("#cp-d-title"); await dp.fill("#cp-d-title", "Desk"); await dp.click("#cp-d-save");
  await dp.waitForSelector(".cp-editor .cp-svg");
  const d = await dp.evaluate(() => ({ touch: navigator.maxTouchPoints, hidden: document.querySelector(".cp-input").hidden, seen: getComputedStyle(document.querySelector(".cp-input")).display }));
  if (d.touch !== 0 || !d.hidden || d.seen !== "none") throw new Error("a mouse-only device should have no switch: " + JSON.stringify(d));
  await desk.close();
});

await step("v102: gesture mode — off, a Place-mode drag does nothing; on, a pen stroke lassoes (and an empty one clears), a plain tap still places, a line through selected heads strikes them out (undo restores), a line over unselected heads does nothing, a selected dynamic strikes out; Touch: slide at once lassoes, hold first aims; remembered across a reload", async () => {
  // still on the "Touch" piece from the v101 step, Place mode, Touch input; bars 5–8 are free
  const SS = (await state()).S;
  const pen = (type, o) => synth(type, { pointerType: "pen", pointerId: 150, width: 1, height: 1, pressure: 0.5, ...o });
  const fat = (type, o) => synth(type, { pointerType: "touch", pointerId: 151, width: 50, height: 50, ...o });
  const stroke = async (who, pts) => { await who("pointerdown", { clientX: pts[0].x, clientY: pts[0].y }); for (const q of pts.slice(1)) await who("pointermove", { clientX: q.x, clientY: q.y }); const l = pts[pts.length - 1]; await who("pointerup", { clientX: l.x, clientY: l.y }); };
  const tap = async (who, q) => { await who("pointerdown", { clientX: q.x, clientY: q.y }); await who("pointerup", { clientX: q.x, clientY: q.y }); };
  const pitchAt = (bar, i) => page.evaluate(([b, i]) => { const e = document.querySelector(".cp-editor").__editor.state.doc.measures[b].staves[0].voices[0][i]; return e.pitches?.map((p) => p.step + p.octave).join("+") ?? e.kind; }, [bar, i]);
  const exprs = (b) => page.evaluate((b) => (document.querySelector(".cp-editor").__editor.state.doc.measures[b].expressions ?? []).map((x) => x.kind + ":" + (x.value ?? "")), b);
  const pressed = () => page.locator(".cp-gest").getAttribute("aria-pressed");
  if ((await state()).gesture || (await pressed()) !== "false") throw new Error("gesture should start off");
  // two quarters in bar 5 by pen taps (gesture off)
  await tap(pen, await point({ bar: 4, staff: 0, ticks: 0, step: 4 })); // the bar re-spaces after each placement: take each point fresh
  await tap(pen, await point({ bar: 4, staff: 0, ticks: PPQ, step: 4 }));
  if ((await kinds(4)) !== "n4 n4 r2") throw new Error("pen taps: " + (await kinds(4)));
  // every placement re-spaces the system, so the geometry around bar 5's two heads is taken fresh each time it is used
  const geom = async () => { const a = await point({ bar: 4, staff: 0, ticks: 0, step: 4 }), b = await point({ bar: 4, staff: 0, ticks: PPQ, step: 4 }); return { a, b, box: [{ x: a.x - SS, y: a.y - 3 * SS }, { x: b.x + 2 * SS, y: a.y - 3 * SS }, { x: b.x + 2 * SS, y: a.y + 3 * SS }, { x: a.x - SS, y: a.y + 3 * SS }, { x: a.x - SS, y: a.y - 3 * SS }], line: [{ x: a.x - SS, y: a.y }, { x: (a.x + b.x) / 2, y: a.y + 2 }, { x: b.x + 2 * SS, y: a.y }] }; };
  let g = await geom();
  // off: a pen drag on empty staff in Place mode changes nothing — the selection the v101 step left (one head) stays as it is
  const sel0 = JSON.stringify((await state()).selection);
  await stroke(pen, g.box);
  let s = await state();
  if (JSON.stringify(s.selection) !== sel0 || (await kinds(4)) !== "n4 n4 r2" || s.mode !== "place") throw new Error("gesture off: a drag did something: " + JSON.stringify(s.selection) + " vs " + sel0 + " " + (await kinds(4)));
  // on: the same drag lassoes both; the mode stays Place and the quarter stays armed
  await page.click("[data-act=gesture]");
  if (!(await state()).gesture || (await pressed()) !== "true") throw new Error("toggle did not turn on");
  await stroke(pen, g.box);
  s = await state();
  if (s.selection.length !== 2 || s.mode !== "place" || s.armed.base !== 4) throw new Error("Place-mode lasso: " + JSON.stringify({ sel: s.selection, mode: s.mode, armed: s.armed }));
  // an empty lasso (over bar 7's empty staff) clears the selection
  const e7 = await point({ bar: 6, staff: 0, ticks: PPQ, step: 4 });
  await stroke(pen, [{ x: e7.x - SS, y: e7.y - 2 * SS }, { x: e7.x + SS, y: e7.y - 2 * SS }, { x: e7.x + SS, y: e7.y + 2 * SS }, { x: e7.x - SS, y: e7.y + 2 * SS }, { x: e7.x - SS, y: e7.y - 2 * SS }]);
  if ((await state()).selection.length !== 0 || (await kinds(6)) !== "r1") throw new Error("empty lasso should clear and place nothing: " + JSON.stringify((await state()).selection) + " " + (await kinds(6)));
  // a plain pen tap still places (bar 7 beat 1)
  const c = await point({ bar: 6, staff: 0, ticks: 0, step: 2 });
  await tap(pen, c);
  if ((await kinds(6)) !== "n4 r4 r2" || (await pitchAt(6, 0)) !== "G4") throw new Error("a plain tap with gestures on: " + (await kinds(6)));
  // a line through unselected heads strikes nothing and encloses nothing
  g = await geom(); // bar 7's quarter re-spaced the system
  await stroke(pen, g.line);
  if ((await state()).selection.length !== 0 || (await kinds(4)) !== "n4 n4 r2") throw new Error("a line over unselected heads changed something: " + (await kinds(4)));
  // lasso both, strike through both → rests come back; one undo restores
  await stroke(pen, g.box);
  if ((await state()).selection.length !== 2) throw new Error("re-lasso: " + JSON.stringify((await state()).selection) + " " + (await kinds(4)));
  await stroke(pen, g.line);
  if ((await kinds(4)) !== "r1" || (await state()).selection.length !== 0) throw new Error("strike: " + (await kinds(4)) + " " + JSON.stringify((await state()).selection));
  await page.click("[data-act=undo]");
  if ((await kinds(4)) !== "n4 n4 r2") throw new Error("undo of a strike: " + (await kinds(4)));
  // a dynamic: f on bar 5 beat 1, lasso it, strike it out
  if (await page.locator("#cp-expression").isHidden()) { await page.click("[data-pop=cp-rails-more]"); await page.click(".cp-rail-row[data-rail=expression]"); await page.click("[data-pop=cp-rails-more]"); }
  g = await geom(); // undo re-laid the system out
  await page.click(".cp-dyn-btn[data-dyn=f]");
  await tap(pen, g.a);
  if ((await exprs(4)).join() !== "dyn:f") throw new Error("f did not land: " + (await exprs(4)));
  const d = await page.evaluate(() => { const ed = document.querySelector(".cp-editor").__editor, dy = ed.layout.dynamics.find((x) => x.bar === 4), r = document.querySelector(".cp-svg").getBoundingClientRect(), S = ed.layout.S; return { x: r.left + dy.x * S, y: r.top + (dy.y - 0.3) * S }; });
  await stroke(pen, [{ x: d.x - 1.5 * SS, y: d.y - 1.4 * SS }, { x: d.x + 1.5 * SS, y: d.y - 1.4 * SS }, { x: d.x + 1.5 * SS, y: d.y + 1.2 * SS }, { x: d.x - 1.5 * SS, y: d.y + 1.2 * SS }, { x: d.x - 1.5 * SS, y: d.y - 1.4 * SS }]);
  s = await state();
  if (s.selection.length !== 1 || s.selection[0].includes(":")) throw new Error("lasso around the dynamic: " + JSON.stringify(s.selection));
  await stroke(pen, [{ x: d.x - 1.5 * SS, y: d.y }, { x: d.x + 1.5 * SS, y: d.y }]);
  if ((await exprs(4)).length !== 0 || (await state()).selection.length !== 0) throw new Error("strike through the dynamic: " + (await exprs(4)));
  if ((await kinds(4)) !== "n4 n4 r2") throw new Error("the strike touched the notes: " + (await kinds(4)));
  // Touch: a 50 px finger that slides at once lassoes the two heads; one held first aims and places (bar 6 beat 1, B4)
  g = await geom(); // the dynamic came and went
  await stroke(fat, g.box);
  if ((await state()).selection.length !== 2) throw new Error("finger lasso in Place mode: " + JSON.stringify((await state()).selection));
  const t = await point({ bar: 5, staff: 0, ticks: 0, step: 4 });
  await fat("pointerdown", { clientX: t.x, clientY: t.y + AIM }); await page.waitForTimeout(650);
  await fat("pointermove", { clientX: t.x + 3, clientY: t.y + AIM + 2 }); await fat("pointermove", { clientX: t.x, clientY: t.y + AIM });
  await fat("pointerup", { clientX: t.x, clientY: t.y + AIM });
  if ((await kinds(5)) !== "n4 r4 r2" || (await pitchAt(5, 0)) !== "B4") throw new Error("hold-then-slide should still aim: " + (await kinds(5)) + " " + (await pitchAt(5, 0)));
  await page.screenshot({ path: `${S}/cp-28-gesture.png`, clip: { x: 0, y: 0, width: 1024, height: 200 } });
  // remembered across a reload; off again → a drag does nothing
  await page.reload(); await page.waitForSelector(".cp-editor .cp-svg");
  if (!(await state()).gesture || (await pressed()) !== "true") throw new Error("gesture should survive a reload");
  await page.click("[data-act=gesture]");
  if ((await state()).gesture) throw new Error("toggle did not turn off");
  const a2 = await point({ bar: 4, staff: 0, ticks: 0, step: 4 }), b2 = await point({ bar: 4, staff: 0, ticks: PPQ, step: 4 });
  await stroke(pen, [{ x: a2.x - SS, y: a2.y - 3 * SS }, { x: b2.x + 2 * SS, y: a2.y - 3 * SS }, { x: b2.x + 2 * SS, y: a2.y + 3 * SS }, { x: a2.x - SS, y: a2.y + 3 * SS }]);
  if ((await state()).selection.length !== 0 || (await kinds(4)) !== "n4 n4 r2") throw new Error("gesture off after reload: a drag did something");
  await noWiden();
});

await step("v103: the chevrons — ∧ arms the next shorter value, ∨ the next longer, to both ends; a selection is retyped; a line, a loop and a lopsided stroke are not chevrons; a Touch finger draws one; Gesture off draws nothing", async () => {
  // still on the "Touch" piece: Place mode, quarter armed, Gesture off (the v102 step turned it off), bar 5 = n4 n4 r2
  const SS = (await state()).S;
  const pen = (type, o) => synth(type, { pointerType: "pen", pointerId: 160, width: 1, height: 1, pressure: 0.5, ...o });
  const fat = (type, o) => synth(type, { pointerType: "touch", pointerId: 161, width: 50, height: 50, ...o });
  const stroke = async (who, pts) => { await who("pointerdown", { clientX: pts[0].x, clientY: pts[0].y }); for (const q of pts.slice(1)) await who("pointermove", { clientX: q.x, clientY: q.y }); const l = pts[pts.length - 1]; await who("pointerup", { clientX: l.x, clientY: l.y }); };
  const chev = (c, dir, w = 3 * SS, h = 2.5 * SS) => { const sgn = dir === "up" ? 1 : -1; return [{ x: c.x - w, y: c.y + sgn * h }, { x: c.x - w / 2, y: c.y }, { x: c.x, y: c.y - sgn * h }, { x: c.x + w / 2, y: c.y }, { x: c.x + w, y: c.y + sgn * h }]; };
  const armed = async () => (await state()).armed.base;
  // a spot on empty staff: bar 8, the space above the upper staff (no rest to grab there in Select mode)
  const spot = async () => { const p = await point({ bar: 7, staff: 0, ticks: PPQ, step: 12 }); return { x: p.x, y: p.y }; };
  // off: an ∧ changes nothing
  await stroke(pen, chev(await spot(), "up"));
  if ((await armed()) !== 4) throw new Error("Gesture off: a chevron armed " + (await armed()));
  await page.click("[data-act=gesture]");
  if (!(await state()).gesture) throw new Error("toggle");
  // up the ladder to the end, and one past it
  for (const want of [8, 16, 32, 64, 64]) { await stroke(pen, chev(await spot(), "up")); if ((await armed()) !== want) throw new Error(`∧ should arm ${want}, armed ${await armed()}`); }
  if (!(await page.locator(".lb-toast").textContent()).includes("shortest")) throw new Error("no toast at the top: " + (await page.locator(".lb-toast").textContent()));
  // back down, drawn the other way round (right to left), to the end and one past it
  for (const want of [32, 16, 8, 4, 2, 1, 0, 0]) { await stroke(pen, chev(await spot(), "down").reverse()); if ((await armed()) !== want) throw new Error(`∨ should arm ${want}, armed ${await armed()}`); }
  if (!(await page.locator(".lb-toast").textContent()).includes("longest")) throw new Error("no toast at the bottom");
  if ((await state()).mode !== "place") throw new Error("mode after chevrons: " + (await state()).mode);
  // a selection is retyped: back to the quarter, lasso bar 5's two quarters, ∧ → two eighths, eighth armed, Place mode
  for (let i = 0; i < 3; i++) await stroke(pen, chev(await spot(), "up"));
  if ((await armed()) !== 4) throw new Error("should be back on the quarter: " + (await armed()));
  const a = await point({ bar: 4, staff: 0, ticks: 0, step: 4 }), b = await point({ bar: 4, staff: 0, ticks: PPQ, step: 4 });
  await stroke(pen, [{ x: a.x - SS, y: a.y - 3 * SS }, { x: b.x + 2 * SS, y: a.y - 3 * SS }, { x: b.x + 2 * SS, y: a.y + 3 * SS }, { x: a.x - SS, y: a.y + 3 * SS }, { x: a.x - SS, y: a.y - 3 * SS }]);
  if ((await state()).selection.length !== 2) throw new Error("lasso for the retype: " + JSON.stringify((await state()).selection));
  await stroke(pen, chev(await spot(), "up"));
  if ((await kinds(4)) !== "n8 r8 n8 r8 r2" || (await armed()) !== 8 || (await state()).mode !== "place") throw new Error("a chevron on a selection: " + (await kinds(4)) + " armed " + (await armed())); // a retype keeps each note at its onset; the gap after it is a rest
  await page.click("[data-act=undo]");
  if ((await kinds(4)) !== "n4 n4 r2") throw new Error("undo of the retype: " + (await kinds(4)));
  // not chevrons: a line, a loop (a lasso around nothing), a lopsided stroke — the armed value stays
  const c = await spot();
  await stroke(pen, [{ x: c.x - 3 * SS, y: c.y }, { x: c.x, y: c.y + 2 }, { x: c.x + 3 * SS, y: c.y }]);
  await stroke(pen, [{ x: c.x - 2 * SS, y: c.y - SS }, { x: c.x + 2 * SS, y: c.y - SS }, { x: c.x + 2 * SS, y: c.y + SS }, { x: c.x - 2 * SS, y: c.y + SS }, { x: c.x - 2 * SS, y: c.y - SS }]);
  await stroke(pen, [{ x: c.x - 3 * SS, y: c.y + 2.5 * SS }, { x: c.x, y: c.y - 2.5 * SS }, { x: c.x + 0.4 * SS, y: c.y - 1.8 * SS }]);
  if ((await armed()) !== 8) throw new Error("a non-chevron changed the armed value: " + (await armed()));
  // a Touch finger that slides at once draws one too (input is Touch on this device)
  await stroke(fat, chev(await spot(), "down"));
  if ((await armed()) !== 4) throw new Error("a finger ∨ should arm the quarter: " + (await armed()));
  await page.screenshot({ path: `${S}/cp-29-chevron.png`, clip: { x: 0, y: 0, width: 1024, height: 420 } });
  await page.click("[data-act=gesture]"); // leave it off for the phone step
  await noWiden();
});

await step("v104: bars — Insert puts an empty bar before the tapped one, Delete takes a bar (the stray last one too), undo / redo; the export preview is the plan's page: only that page's systems, ink above and below the staves kept, page 2 steps into view, the PDF has the plan's pages (WSHED-132 / 133)", async () => {
  await page.keyboard.press("Escape"); if ((await state()).selection.length) await page.keyboard.press("Escape");
  if ((await state()).mode !== "place") await page.keyboard.press("v");
  if (await page.locator("#cp-form").isHidden()) { await page.click("[data-pop=cp-rails-more]"); await page.click(".cp-rail-row[data-rail=form]"); await page.click("[data-pop=cp-rails-more]"); }
  if (await page.locator("#cp-form").isHidden()) throw new Error("the Form rail did not open");
  const barsN = async () => (await state()).bars;
  const sig = () => page.evaluate(() => document.querySelector(".cp-editor").__editor.state.doc.measures.map((m) => m.staves.reduce((n, s) => n + s.voices.reduce((k, v) => k + (v ? v.filter((e) => e.kind === "note").length : 0), 0), 0)).join("."));
  const before = await sig(), n0 = await barsN();
  await page.evaluate(() => { document.querySelector("#cp-form").scrollLeft = 9999; });
  await page.click(".cp-bar-insert");
  if ((await state()).pending?.kind !== "bar-insert") throw new Error("insert not armed: " + JSON.stringify((await state()).pending));
  if ((await page.getAttribute(".cp-bar-insert", "aria-pressed")) !== "true") throw new Error("insert button not lit");
  await tapAt({ bar: 2, staff: 0, ticks: PPQ + 300, step: 4 });
  const parts = before.split(".");
  const wantIns = [...parts.slice(0, 2), "0", ...parts.slice(2)].join(".");
  if ((await barsN()) !== n0 + 1 || (await sig()) !== wantIns) throw new Error(`insert: ${n0} → ${await barsN()} bars, ${before} → ${await sig()}`);
  if ((await state()).pending) throw new Error("insert stayed armed");
  await page.screenshot({ path: `${S}/cp-30-bar-inserted.png`, clip: { x: 0, y: 0, width: 1024, height: 620 } });
  await page.click(".cp-bar-delete");
  if ((await state()).pending?.kind !== "bar-delete") throw new Error("delete not armed");
  await tapAt({ bar: 2, staff: 0, ticks: PPQ + 300, step: 4 });
  if ((await barsN()) !== n0 || (await sig()) !== before) throw new Error(`delete: ${await barsN()} bars, ${await sig()}`);
  await page.keyboard.press("Control+z");
  if ((await sig()) !== wantIns) throw new Error("undo did not bring the bar back: " + (await sig()));
  await page.keyboard.press("Control+z");
  if ((await sig()) !== before) throw new Error("undo did not take the inserted bar away: " + (await sig()));
  await page.keyboard.press("Control+Shift+z"); await page.keyboard.press("Control+Shift+z");
  if ((await sig()) !== before || (await barsN()) !== n0) throw new Error("redo: " + (await sig()));
  // the stray empty last bar goes too (Leif's case): delete the last bar, then undo
  const lastEmpty = await page.evaluate(() => { const d = document.querySelector(".cp-editor").__editor.state.doc; const m = d.measures[d.measures.length - 1]; return m.staves.every((s) => s.voices.every((v) => !v || v.every((e) => e.kind === "rest"))); });
  if (!lastEmpty) throw new Error("the piece should end with an empty bar to write into");
  await page.click(".cp-bar-delete");
  await tapAt({ bar: n0 - 1, staff: 0, ticks: PPQ + 300, step: 4 });
  if ((await barsN()) !== n0 - 1) throw new Error("the last bar did not go: " + (await barsN()));
  await page.keyboard.press("Control+z");
  if ((await barsN()) !== n0) throw new Error("undo after deleting the last bar: " + (await barsN()));
  // fourteen empty bars before bar 1 (insert before the first bar hands the signatures on) so the piece needs more than one page at 10 mm
  const sigBefore = await page.evaluate(() => { const m = document.querySelector(".cp-editor").__editor.state.doc.measures[0]; return JSON.stringify([m.key, m.time, m.clefs]); });
  for (let i = 0; i < 14; i++) { await page.click(".cp-bar-insert"); await tapAt({ bar: 0, staff: 0, ticks: PPQ + 300, step: 4 }); }
  if ((await barsN()) !== n0 + 14) throw new Error("fourteen bars before bar 1: " + (await barsN()));
  const sigNow = await page.evaluate(() => { const d = document.querySelector(".cp-editor").__editor.state.doc; const m = d.measures[0], m8 = d.measures[8]; return JSON.stringify([[m.key, m.time, m.clefs], [m8.key, m8.time, m8.clefs]]); });
  if (sigNow !== JSON.stringify([JSON.parse(sigBefore), [undefined, undefined, undefined]]).replace(/null/g, "null")) { const [a, b] = JSON.parse(sigNow); if (JSON.stringify(a) !== sigBefore || b.some((x) => x != null)) throw new Error("the signatures did not move to the new bar 1: " + sigNow); }
  // --- the export preview is the plan's page (WSHED-133) ---
  await page.click("[data-pop=cp-file-more]");
  await page.click("#cp-file-more [data-act=export-pdf]");
  await page.waitForSelector(".cp-export-wrap .cp-paper .cp-page");
  if (!(await page.isChecked("#cp-x-header"))) await page.click("#cp-x-header");
  await page.click("[data-page=letter]"); await page.click("[data-margins=normal]");
  for (let i = 0; i < 8 && (await page.getAttribute("#cp-x-larger", "disabled")) === null; i++) await page.click("#cp-x-larger");
  const readout = () => page.textContent("#cp-x-size");
  const pagesOf = async () => Number((await readout()).match(/(\d+) pages?/)[1]);
  const plan = () => page.evaluate(() => { const p = document.querySelector("#cp-x-paper").__plan; return { pages: p.pages.map((q) => ({ first: q.first, last: q.last, top: q.top, dy: q.dy })), n: p.L.systems.length, S: p.S, h: p.page.h, m: p.margin, height: p.height, ink: p.ink }; });
  const sysOnPage = () => page.evaluate(() => [...document.querySelectorAll(".cp-paper .cp-sys")].filter((g) => g.querySelector("line")).length);
  /** The preview's geometric ink (lines, rects, curves — text boxes lie) in page points. */
  const inkBox = () => page.evaluate(() => { const inner = document.querySelector(".cp-paper .cp-svg"); const y0 = Number(inner.getAttribute("y")), x0 = Number(inner.getAttribute("x")); let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity; for (const el of inner.querySelectorAll("line, rect, polyline, polygon, path")) { const b = el.getBBox(); top = Math.min(top, y0 + b.y); bottom = Math.max(bottom, y0 + b.y + b.height); left = Math.min(left, x0 + b.x); right = Math.max(right, x0 + b.x + b.width); } return { top, bottom, left, right }; });
  const checkPage = async (k) => {
    const P = await plan(), pg = P.pages[k];
    const shown = await sysOnPage();
    if (shown !== pg.last - pg.first + 1) throw new Error(`page ${k + 1} shows ${shown} systems, the plan puts ${pg.last - pg.first + 1} there (${JSON.stringify(pg)})`);
    const box = await inkBox();
    const headPt = P.m + (k ? 22 : 66);
    if (box.top < headPt - 1 || box.bottom > P.h - P.m + 1) throw new Error(`page ${k + 1}: ink from ${box.top.toFixed(1)} to ${box.bottom.toFixed(1)} pt is not inside the box ${headPt}–${(P.h - P.m).toFixed(1)}`);
    if (!/of \d+$/.test(await page.getAttribute(".cp-paper .cp-page", "aria-label"))) throw new Error("page label");
    return P;
  };
  let P = await checkPage(0);
  if ((await pagesOf()) !== P.pages.length) throw new Error(`readout ${await readout()} vs plan ${P.pages.length}`);
  if (P.pages.length < 2) throw new Error("the E2E piece at 10 mm should need more than one page: " + JSON.stringify(P.pages));
  if (await page.locator("#cp-x-pager").isHidden()) throw new Error("no pager for a multi-page plan");
  if ((await page.getAttribute("#cp-x-prev", "disabled")) === null) throw new Error("‹ should be disabled on page 1");
  await page.screenshot({ path: `${S}/cp-31-preview-p1.png` });
  await page.click("#cp-x-next");
  await checkPage(1);
  if (!/page 2 of/.test(await page.textContent("#cp-x-pageno"))) throw new Error("page number " + (await page.textContent("#cp-x-pageno")));
  const run = await page.evaluate(() => [...document.querySelectorAll(".cp-paper .cp-page-text")].map((t) => t.textContent));
  if (!run.includes("2")) throw new Error("page 2 shows no running page number: " + JSON.stringify(run));
  const total = await page.evaluate(() => document.querySelectorAll(".cp-paper .cp-sys").length);
  if (total !== P.n) throw new Error("the page SVG should hold every system's group, ink only on its own page");
  await page.screenshot({ path: `${S}/cp-32-preview-p2.png` });
  await page.click("#cp-x-prev");
  await checkPage(0);
  // the same piece with narrow margins: the plan re-routes and the preview follows (Leif's 2026-09-15 case)
  await page.click("[data-margins=narrow]");
  const N = await checkPage(0);
  if (N.pages.length > P.pages.length) throw new Error("narrow margins never need more pages");
  await page.click("[data-margins=normal]");
  P = await checkPage(0);
  // the PDF carries the plan's pages
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#cp-x-save")]);
  const txt = readFileSync(await dl.path()).toString("latin1");
  const nPages = (txt.match(/\/Type \/Page(?!s)/g) ?? []).length;
  if (nPages !== P.pages.length || nPages !== (await pagesOf())) throw new Error(`the PDF has ${nPages} pages, the plan ${P.pages.length}, the readout ${await pagesOf()}`);
  // the file ends at the music: the plan's bar count is the last used bar, not the editor's trailing empty one
  const editorBars = await barsN();
  const planBars = await page.evaluate(() => document.querySelector("#cp-x-paper").__plan.doc.measures.length);
  if (planBars !== editorBars - 1) throw new Error(`the file holds ${planBars} bars, the editor ${editorBars} (one to write into)`);
  await page.click("[data-margins=wide]"); await page.click("#cp-x-smaller"); await page.click("#cp-x-smaller"); await page.click("#cp-x-smaller"); // back to 7.2 mm
  await page.click(".cp-export-wrap .lb-close");
  await page.waitForFunction(() => !document.querySelector(".cp-export-wrap"), null, { timeout: 5000 });
  await noWiden();
});

await step("phone width: the rails scroll, nothing widens, the editor still places", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/?app=1&t=3#/compose`);
  await page.waitForSelector(".sc-row");
  await page.click(".sc-open");
  await page.waitForSelector(".cp-editor .cp-svg");
  await noWiden();
  const sqp = await squares();
  if (sqp.n < 20 || sqp.bad.length || sqp.header.length !== 1 || sqp.lanes.length !== 1) throw new Error("square buttons at phone width: " + JSON.stringify(sqp));
  // the voice picker is the one voice control at phone width too
  if (!(await page.evaluate(() => document.querySelector(".cp-voice-pick").getBoundingClientRect().width > 0))) throw new Error("phone: no voice picker");
  await page.click(".cp-voice-pick");
  if (await page.locator("#cp-voice-more").isHidden()) throw new Error("▾ did not open the voice menu");
  await page.click(".cp-voice-row[data-act='voice'][data-v='2']");
  if ((await state()).voice !== 2 || (await page.textContent(".cp-voice-pick .cp-voice-n")) !== "3") throw new Error("voice 3 from the menu");
  await page.click(".cp-voice-pick"); await page.click(".cp-voice-row[data-act='voice'][data-v='0']");
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 320; }); // bar 2 sits on the second system at this zoom; bring it into the viewport under the three rails
  await tapAt({ bar: 1, staff: 0, ticks: 2 * PPQ + 100, step: 2 });
  if ((await kinds(1)) !== "n4 r4 n4 r4") throw new Error("phone tap: " + (await kinds(1)));
  await page.screenshot({ path: `${S}/cp-05-phone.png` });
});

if (errors.length) { console.log("page errors:", errors); process.exit(1); }
await browser.close();
console.log("compose e2e: all green");
