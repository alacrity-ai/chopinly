// The help articles' screenshots (docs/COMPOSE_HELP_DESIGN.md §5.2). Playwright
// drives the real app on an iPad-landscape viewport, seeds one fixed composition
// through the engine so every run is identical, and clips each shot to the element
// it is about. Shots are committed; npm test only checks that the paths an article
// references exist.
//
//   npm run dev                                   (a local server on 8789)
//   node dev/shoot-help.mjs [name …]              all of them, or just the named ones
//
// A CHANGED shot gets a NEW FILENAME. /img/* carries a 7-day edge cache the deploy
// token cannot purge (WSHED-97), so an overwrite serves the old bytes for days.
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "img", "help");
const BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const want = (name) => !only.length || only.includes(name);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

const PPQ = 6720, Q = PPQ;
/** The seed piece: two bars of real music, so a rail shot has something to act on. */
const SEED = {
  title: "Prelude in C",
  composer: "J. S. Bach",
  // [bar, staff, ticks, step, base] — `step` counts diatonic steps up from the clef's bottom line
  notes: [
    [0, 0, 0 * Q, 2, 4], [0, 0, 1 * Q, 4, 4], [0, 0, 2 * Q, 3, 4], [0, 0, 3 * Q, 5, 4],
    [1, 0, 0 * Q, 7, 2], [1, 0, 2 * Q, 4, 2],
    [0, 1, 0 * Q, 0, 2], [0, 1, 2 * Q, 4, 2],
    [1, 1, 0 * Q, 2, 1],
  ],
};

async function seed() {
  const id = await page.evaluate(async (SEED) => {
    const [model, engine, lb] = await Promise.all([import("/js/lib/compose/model.js"), import("/js/lib/compose/engine.js"), import("/js/lib/logbook.js")]);
    let doc = model.newComposition({ id: "help-seed", title: SEED.title, composer: SEED.composer });
    for (const [bar, staff, ticks, step, base] of SEED.notes) {
      doc = engine.place(doc, { bar, staff, ticks, step, voice: 0 }, { base, dots: 0, rest: false, alter: null }).doc;
    }
    lb.logbook.addComposition(doc);
    return doc.id;
  }, SEED);
  return id;
}

const shots = [];
const shoot = async (name, target, { pad = 0, full = false } = {}) => {
  if (!want(name)) return;
  const path = join(OUT, `${name}.png`);
  if (full) await page.screenshot({ path });
  else {
    const el = page.locator(target).first();
    await el.waitFor({ state: "visible" });
    const b = await el.boundingBox();
    if (!b) throw new Error(`${name}: ${target} has no box`);
    const clip = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(1194, b.width + pad * 2), height: Math.min(834, b.height + pad * 2) };
    await page.screenshot({ path, clip });
  }
  shots.push(name);
  console.log("shot", name);
};

/** Open the Options panel, click something in it, leave the panel as asked. */
const options = async (sel, { close = true } = {}) => {
  if ((await page.getAttribute("[data-pop=cp-options-more]", "aria-expanded")) !== "true") await page.click("[data-pop=cp-options-more]");
  if (sel) await page.click(sel);
  if (close) await page.click("[data-pop=cp-options-more]");
};
const railOn = async (key, on = true) => {
  const checked = (await page.getAttribute(`.cp-rail-row[data-rail="${key}"]`, "aria-checked")) === "true";
  if (checked !== on) await options(`.cp-rail-row[data-rail="${key}"]`, { close: false });
};
const settle = (ms = 420) => page.waitForTimeout(ms);

// ---- the app, seeded ------------------------------------------------------
await page.goto(`${BASE}/?app=1`);
await page.evaluate(() => { localStorage.setItem("ws.shell.seen", "true"); localStorage.removeItem("ws.logbook.data"); for (const k of Object.keys(localStorage)) if (k.startsWith("ws.compose.")) localStorage.removeItem(k); });
const id = await seed();
await page.goto(`${BASE}/?app=1#/compose`);
await page.waitForSelector(".compose");
await settle();
await shoot("compositions-list", ".compose", { pad: 6 });

await page.goto(`${BASE}/?app=1#/compose/${id}`);
await page.waitForSelector(".cp-editor .cp-svg");
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => !document.querySelector(".lb-toast"), null, { timeout: 8000 }).catch(() => {}); // the greeting toast is not part of the picture
await settle(700);
await shoot("editor", ".cp-editor");

// ---- one shot per rail ----------------------------------------------------
const RAILS = ["control", "transport", "palette", "utility", "expression", "form", "piano", "notes2", "chords", "lyrics"];
const RAIL_SHOT = { control: "rail-controls", transport: "rail-transport", palette: "rail-notes", utility: "rail-keys", expression: "rail-dynamics", form: "rail-form", piano: "rail-piano", notes2: "rail-marks", chords: "rail-chords", lyrics: "rail-lyrics" };
for (const key of RAILS) {
  if (!want(RAIL_SHOT[key])) continue;
  await railOn(key, true);
  await options(null, { close: true });
  if (key === "lyrics") { // the Lyrics rail is shot live (WSHED-177): the field focused, the cursor on bar 1's first note with "Glo" under it
    await page.evaluate(() => { const ed = document.querySelector(".cp-editor").__editor; const f = ed.state.doc.measures[0].staves[0].voices[0].find((e) => e.kind === "note"); return f.id; });
    await page.click("#cp-lyric-in");
    const pt = await page.evaluate(() => document.querySelector(".cp-editor").__editor.pointFor({ bar: 0, staff: 0, ticks: 0, step: 2 }));
    await page.mouse.click(pt.x, pt.y);
    await page.keyboard.type("Glo");
    await page.keyboard.press("-");
    await page.keyboard.type("ry");
  }
  await settle();
  await shoot(RAIL_SHOT[key], `.cp-rail[data-rail="${key}"]`, { pad: 2 });
  if (key === "lyrics") { await page.keyboard.press("Escape"); await page.evaluate(() => { for (let i = 0; i < 3; i++) document.querySelector(".cp-editor").__editor && document.querySelector("[data-act=undo]").click(); }); }
  if (!["control", "transport", "palette"].includes(key)) await railOn(key, false), await options(null, { close: true });
}

// ---- the panels -----------------------------------------------------------
if (want("options-panel")) {
  await options(null, { close: false });
  await settle();
  await shoot("options-panel", "#cp-options-more", { pad: 4 });
  await page.click("[data-pop=cp-options-more]");
}

if (want("favorites-panel")) {
  await options(".cp-favbtn", { close: true });
  await page.waitForSelector(".cp-fav");
  await settle();
  await shoot("favorites-panel", ".cp-fav", { pad: 6 });
  await options(".cp-favbtn", { close: true });
}

// ---- export + layout ------------------------------------------------------
if (want("export-sheet") || want("layout-view")) {
  await page.click("[data-pop=cp-file-more]");
  await page.click('[data-act="export-pdf"]');
  await page.waitForSelector(".cp-export-grid");
  await page.waitForFunction(() => document.querySelector("#cp-x-paper svg"));
  await settle(900);
  await shoot("export-sheet", ".cp-export-wrap", { pad: 4 });

  if (want("layout-view")) {
    await page.click("#cp-x-layout");
    await page.waitForSelector(".cp-lay .cp-page");
    await settle(900);
    await shoot("layout-view", ".cp-lay");
    await page.click(".cp-lay-done");
  }
  await page.keyboard.press("Escape");
}

// ---- instruments (WSHED-182): a seeded string quartet — the score with its bracket and names, and the Instruments sheet ----
if (want("instruments-score") || want("instruments-sheet")) {
  const qid = await page.evaluate(async () => {
    const [model, engine, ins, lb] = await Promise.all([import("/js/lib/compose/model.js"), import("/js/lib/compose/engine.js"), import("/js/lib/compose/instruments.js"), import("/js/lib/logbook.js")]);
    const PPQ = 6720, Q = { base: 4, dots: 0, rest: false, alter: null }, E = { base: 8, dots: 0, rest: false, alter: null }, H = { base: 2, dots: 0, rest: false, alter: null };
    let doc = model.newComposition({ id: "help-quartet", title: "Quartet in D", composer: "Claude", parts: ins.templateParts("quartet") });
    const lines = [[8, 7, 6, 5, 4, 5, 6, 7], [4, 4, 5, 5, 4, 4, 2, 2], [4, 2, 4, 2, 4, 2, 4, 2], [2, 2, 0, 0, 2, 2, 4, 4]];
    for (let bar = 0; bar < 2; bar++) for (let st = 0; st < 4; st++) {
      if (st === 0) for (let k = 0; k < 8; k++) doc = engine.place(doc, { bar, staff: st, ticks: (k * PPQ) / 2, step: lines[0][(k + bar) % 8], voice: 0 }, E).doc;
      else if (st === 3) for (let k = 0; k < 2; k++) doc = engine.place(doc, { bar, staff: st, ticks: k * 2 * PPQ, step: lines[3][(k + bar) % 8], voice: 0 }, H).doc;
      else for (let k = 0; k < 4; k++) doc = engine.place(doc, { bar, staff: st, ticks: k * PPQ, step: lines[st][(k + bar) % 8], voice: 0 }, Q).doc;
    }
    doc = engine.addExpression(doc, { kind: "dyn", staff: 0, bar: 0, at: 0, value: "p" }).doc;
    lb.logbook.addComposition(doc);
    return doc.id;
  });
  await page.goto(`${BASE}/?app=1#/compose/${qid}`);
  await page.waitForSelector(".cp-editor .cp-svg");
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { const ed = document.querySelector(".cp-editor").__editor; while (ed.state.S > 10) document.querySelector("[data-act=zoom-out]")?.click(); });
  await settle(3200); // the armed toast fades
  await shoot("instruments-score", "#cp-view", { pad: 0 });
  await page.click("[data-pop=cp-file-more]"); await page.click('[data-act="instruments"]');
  await page.waitForSelector(".cp-ins-list .cp-ins-row");
  await settle(400);
  await shoot("instruments-sheet", ".cp-ins-wrap .lb-sheet", { pad: 4 });
  await page.keyboard.press("Escape");
}

await browser.close();
console.log(`\n${shots.length} shot${shots.length === 1 ? "" : "s"} → img/help/`);
