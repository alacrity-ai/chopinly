// Ear training E2E (WSHED-81). Runs are reproducible from (setup, seed), so the
// test computes the expected answers with the same pure module the app uses.
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on("dialog", (d) => d.accept());
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); await page.screenshot({ path: `${S}/fail-et.png` }); throw e; } };
const lb = (fn, ...args) => page.evaluate(async ([src, a]) => { const m = await import("/js/lib/logbook.js"); return (new Function("m", "a", src))(m, a); }, [`return (${fn})(m, a)`, args]);
const text = async (sel) => (await page.locator(sel).first().textContent())?.trim();
const noWiden = async () => { const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth })); if (w.doc > w.vw) throw new Error("page widened " + JSON.stringify(w)); };
const pressKey = async (midi) => { const b = await page.locator(`.kb-key[data-midi="${midi}"]`).boundingBox(); if (!b) throw new Error("no key " + midi); await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.82); };
/** The questions the running drill was dealt (same module, same seed, same setup). */
const dealt = () => page.evaluate(async () => {
  const { generate, cleanSetup, LEVELS } = await import("/js/lib/eartraining/pitch.js");
  const q = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const setup = q.get("setup") ? LEVELS[q.get("setup")] : cleanSetup(JSON.parse(localStorage.getItem("ws.eartraining.pitch-setup") ?? "null"));
  return { setup, ...generate(setup, Number(q.get("seed"))) };
});
const answerPhase = () => page.waitForSelector('#et-run[data-phase="answer"]', { timeout: 15000 });
/** Play a whole drill: every question right except the ones in `wrongAt` (question indices). */
async function playRun({ wrongAt = new Set() } = {}) {
  const d = await dealt();
  for (let i = 0; i < d.questions.length; i++) {
    await answerPhase();
    if ((await text("#et-title")) !== `question ${i + 1} of ${d.questions.length}`) throw new Error("title " + await text("#et-title"));
    const notes = d.questions[i].notes;
    if (wrongAt.has(i)) { const wrong = notes.includes(60) ? 62 : 60; await pressKey(wrong); await page.waitForSelector(".kb-key[data-light=\"wrong\"]"); }
    else for (const n of notes) { await pressKey(n); await page.waitForFunction((m) => document.querySelector(`.kb-key[data-midi="${m}"][data-light="correct"]`), n); }
    await page.waitForFunction((i) => document.querySelector("#et-run").dataset.phase === "done" || document.querySelector("#et-title")?.textContent.startsWith(`question ${i + 2} `), i, { timeout: 15000 });
  }
  await page.waitForSelector("#et-score");
  return d;
}

await page.goto(`${BASE}/?app=1`);
await page.evaluate(() => { localStorage.setItem("ws.shell.seen", "true"); localStorage.removeItem("ws.shell.skin"); localStorage.removeItem("ws.logbook.data"); localStorage.removeItem("ws.eartraining.runs"); localStorage.removeItem("ws.eartraining.pitch-setup"); });

await step("home: two cards; the setup card reads as a sentence, presets and chips agree, custom on touch, remembered", async () => {
  await page.goto(`${BASE}/?app=1&e=1#/eartraining`);
  await page.waitForSelector("#et-go-pitch");
  if ((await text("#et-go-pitch .ss-mode-sub")) !== "no drills yet") throw new Error("home sub");
  await page.click("#et-go-pitch");
  await page.waitForSelector("#et-begin");
  if ((await page.getAttribute('#et-levels [data-level="beginner"]', "aria-pressed")) !== "true") throw new Error("beginner not selected");
  if (!(await text("#et-sentence")).startsWith("C major, one octave around middle C, single notes, a reference before each question, 10 questions.")) throw new Error("sentence " + await text("#et-sentence"));
  if (!(await page.locator('.et-row[data-key="mode"].off').count())) throw new Error("played should be greyed at 1 note");
  if (await page.locator('.et-row[data-key="range"] .et-chip[data-v="8"]').count()) throw new Error("whole piano should be hidden on a phone");
  await page.click('.et-row[data-key="questions"] .et-chip[data-v="20"]');
  if ((await page.getAttribute('#et-levels [data-level="custom"]', "aria-pressed")) !== "true") throw new Error("touching a row should flip to custom");
  if (!(await text("#et-sentence")).includes("20 questions")) throw new Error("sentence not updated");
  await page.click('.et-row[data-key="count"] .et-chip[data-v="3"]');
  if (await page.locator('.et-row[data-key="mode"].off').count()) throw new Error("played should wake at 3 notes");
  await page.click('.et-row[data-key="mode"] .et-chip[data-v="harmonic"]');
  if (!(await text("#et-sentence")).includes("3 notes together")) throw new Error("harmonic sentence");
  await page.screenshot({ path: `${S}/et-01-setup-custom.png` });
  await page.reload(); await page.waitForSelector("#et-begin");
  if (!(await text("#et-sentence")).includes("3 notes together") || !(await text("#et-sentence")).includes("20 questions")) throw new Error("setup not remembered");
  await page.click('#et-levels [data-level="beginner"]');
  if (!(await text("#et-sentence")).includes("single notes")) throw new Error("preset did not reset the rows");
  await noWiden();
  await page.screenshot({ path: `${S}/et-02-setup-beginner.png` });
});

await step("a seeded beginner drill: reference lit → listen → answer; 9 right + 1 wrong → 90 %, 3 stars, miss sentence, run stored, auto segment on Ear training", async () => {
  await page.goto(`${BASE}/?app=1&e=2#/eartraining/pitch/run?seed=7&setup=beginner`);
  await page.waitForSelector("#et-run");
  await page.waitForSelector('#et-run[data-phase="reference"]', { timeout: 5000 });
  if (!(await page.locator('.kb-key[data-midi="60"][data-light="target"]').count())) throw new Error("reference C4 should be lit");
  if (!(await text("#et-ref")).includes("C4")) throw new Error("reference line " + await text("#et-ref"));
  await page.waitForSelector('#et-run[data-phase="listen"]', { timeout: 5000 });
  const inert = await page.$eval(".et-kb .kb", (e) => getComputedStyle(e).pointerEvents);
  if (inert !== "none") throw new Error("keyboard should be inert while listening");
  await answerPhase();
  await page.screenshot({ path: `${S}/et-03-answer.png` });
  const d = await playRun({ wrongAt: new Set([9]) });
  if ((await text("#et-score")) !== "90%") throw new Error("score " + await text("#et-score"));
  if ((await page.locator("#et-stars .star.earned").count()) !== 3) throw new Error("stars");
  if (!(await text(".et-result-line")).includes("9 of 10 questions")) throw new Error("result line " + await text(".et-result-line"));
  if (!/^one slip: you heard the .+ as a .+$|^one slip: the right interval/.test(await text(".et-miss"))) throw new Error("miss line " + await text(".et-miss"));
  await page.screenshot({ path: `${S}/et-04-results.png` });
  const runs = await page.evaluate(() => JSON.parse(localStorage.getItem("ws.eartraining.runs")));
  if (runs.length !== 1 || runs[0].points !== 9 || runs[0].max !== 10 || runs[0].seed !== 7) throw new Error("run " + JSON.stringify(runs[0]));
  const g = await lb((m) => { const g = m.logbook.goal("eartraining"); return g && { name: g.name, kind: g.kind, segs: m.logbook.doc.segments.filter((s) => s.goalId === "eartraining").map((s) => s.auto?.label) }; });
  if (!g || g.name !== "Ear training" || g.kind !== "builtin" || !/pitch · 9\/10 · ★★★/.test(g.segs[0] ?? "")) throw new Error("logbook " + JSON.stringify(g));
  if (d.tonic !== 60) throw new Error("beginner tonic");
});

await step("again → a new seed; home shows the last run; drills lists it", async () => {
  await page.click("#et-again");
  await page.waitForSelector('#et-run[data-phase="reference"]', { timeout: 5000 });
  const seed = new URLSearchParams((await page.evaluate(() => location.hash)).split("?")[1]).get("seed");
  if (!seed || seed === "7") throw new Error("seed " + seed);
  await page.click("#et-quit");
  await page.waitForSelector("#et-go-pitch");
  if (!(await text("#et-go-pitch .ss-mode-sub")).includes("9/10 · ★★★")) throw new Error("home sub " + await text("#et-go-pitch .ss-mode-sub"));
  await page.click("#et-go-history");
  await page.waitForSelector(".et-runrow");
  if (!(await text(".et-runrow .et-run-score")).startsWith("9/10")) throw new Error("history row");
  await page.screenshot({ path: `${S}/et-05-history.png` });
});

await step("with a goal running, a finished drill becomes a note on that goal; harmonic questions accept any order", async () => {
  const gid = await lb((m) => { const g = m.logbook.addGoal({ name: "Intervals" , type: "technique" }); m.logbook.start(g.id); return g.id; });
  await page.goto(`${BASE}/?app=1&e=3#/eartraining/pitch`);
  await page.waitForSelector("#et-begin");
  await page.click('.et-row[data-key="count"] .et-chip[data-v="3"]');
  await page.click('.et-row[data-key="mode"] .et-chip[data-v="harmonic"]');
  await page.click('.et-row[data-key="reference"] .et-chip[data-v="start"]');
  await page.click("#et-begin");
  await page.waitForSelector("#et-run");
  const d = await dealt();
  if (d.setup.mode !== "harmonic" || d.setup.count !== 3) throw new Error("setup " + JSON.stringify(d.setup));
  // first question: press the chord's notes in reverse order
  await answerPhase();
  for (const n of [...d.questions[0].notes].reverse()) { await pressKey(n); await page.waitForFunction((m) => document.querySelector(`.kb-key[data-midi="${m}"][data-light="correct"]`), n); }
  await page.waitForFunction(() => document.querySelector("#et-title")?.textContent.startsWith("question 2 "), null, { timeout: 15000 });
  if (await page.locator('#et-run[data-phase="reference"]').count()) throw new Error("reference should play once at the start only");
  // the rest right
  for (let i = 1; i < d.questions.length; i++) {
    await answerPhase();
    for (const n of d.questions[i].notes) { await pressKey(n); await page.waitForFunction((m) => document.querySelector(`.kb-key[data-midi="${m}"][data-light="correct"]`), n); }
    await page.waitForFunction((i) => document.querySelector("#et-run").dataset.phase === "done" || document.querySelector("#et-title")?.textContent.startsWith(`question ${i + 2} `), i, { timeout: 15000 });
  }
  await page.waitForSelector("#et-score");
  if ((await text("#et-score")) !== "100%") throw new Error("score " + await text("#et-score"));
  const note = await lb((m, [gid]) => m.logbook.notes(gid)[0]?.body, gid);
  if (!/Ear training · pitch · 30\/30 · ★★★ · in the key · 1 oct · 3 together/.test(note ?? "")) throw new Error("note " + note);
  await lb((m) => m.logbook.stop());
});

await browser.close();
if (errors.length) { console.log("PAGE ERRORS", errors); process.exit(1); }
console.log("EAR TRAINING ALL GREEN");
