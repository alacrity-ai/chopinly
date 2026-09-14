// Compose E2E (WSHED-114 / P0). Start a composition, arm durations, tap the
// staff, select, delete, undo / redo, nudge on overflow, palm safety, Pan,
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
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); try { console.log("  toast:", await page.evaluate(() => document.querySelector(".lb-toast")?.textContent), "state:", JSON.stringify(await state())); } catch { /* no editor */ } await page.screenshot({ path: `${S}/fail-compose.png` }); throw e; } };
const lb = (fn, ...args) => page.evaluate(async ([src, a]) => { const m = await import("/js/lib/logbook.js"); return (new Function("m", "a", src))(m, a); }, [`return (${fn})(m, a)`, args]);
const state = () => page.evaluate(() => { const s = document.querySelector(".cp-editor").__editor.state; return { mode: s.mode, armed: s.armed, S: s.S, selection: s.selection, bars: s.bars, dragging: s.dragging, lassoing: s.lassoing, pasting: s.pasting, hasClip: s.hasClip }; });
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
  await page.click("#cp-new"); // the details modal: title · composer · tags, then start composing
  await page.waitForSelector("#cp-d-title");
  await page.fill("#cp-d-title", "Untitled");
  await page.click("#cp-d-save");
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
  // Rest with the two selected → rests of the same length; the rest toggle stays off
  await page.click("[data-act=rest]");
  if ((await kinds(0)) !== "r2 n4 n4") throw new Error("to rests: " + (await kinds(0)));
  if ((await state()).armed.rest) throw new Error("the toggle flipped");
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
  if ((await page.locator("#cp-file-more .cp-menu-row:disabled").count()) < 4) throw new Error("file menu placeholders");
  await page.click("[data-pop=cp-file-more]");
  await page.click("[data-pop=cp-rails-more]");
  if ((await page.locator("#cp-rails-more .cp-rail-row").count()) !== 4) throw new Error("rail rows");
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
  await page.screenshot({ path: `${S}/cp-15-utility.png` });
  await page.click("[data-act=gliss]"); await page.click(".cp-art-btn[data-mark='staccato']"); await page.click(".cp-art-btn[data-mark='lowerMordent']");
  await page.keyboard.press("Escape"); await page.keyboard.press("v");
  await page.click("[data-pop=cp-rails-more]"); await page.click(".cp-rail-row[data-rail=utility]"); await page.click("[data-pop=cp-rails-more]");
  if ((await st()).open) throw new Error("utility rail did not close");
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

await step("reload restores the composition, the zoom and the armed duration", async () => {
  await page.reload();
  await page.waitForSelector(".cp-editor .cp-svg");
  const s = await state();
  if (!(s.bars === 9 && s.S === 16 && s.armed.base === 4)) throw new Error(JSON.stringify(s));
  if ((await kinds(0)) !== "n4 n4 n4 n4") throw new Error("lost: " + (await kinds(0)));
  if ((await page.evaluate(() => document.querySelector(".cp-editor").__editor.state.tempo)) !== 101) throw new Error("tempo not restored");
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

await step("phone width: the rails wrap, nothing widens, the editor still places", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/?app=1&t=3#/compose`);
  await page.waitForSelector(".sc-row");
  await page.click(".sc-open");
  await page.waitForSelector(".cp-editor .cp-svg");
  await noWiden();
  const sqp = await squares();
  if (sqp.n < 20 || sqp.bad.length || sqp.header.length !== 1 || sqp.lanes.length !== 1) throw new Error("square buttons at phone width: " + JSON.stringify(sqp));
  await page.evaluate(() => { document.querySelector("#cp-view").scrollTop = 320; }); // bar 2 sits on the second system at this zoom; bring it into the viewport under the three rails
  await tapAt({ bar: 1, staff: 0, ticks: 2 * PPQ + 100, step: 2 });
  if ((await kinds(1)) !== "n4 r4 n4 r4") throw new Error("phone tap: " + (await kinds(1)));
  await page.screenshot({ path: `${S}/cp-05-phone.png` });
});

if (errors.length) { console.log("page errors:", errors); process.exit(1); }
await browser.close();
console.log("compose e2e: all green");
