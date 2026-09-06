// Metronome (WSHED-85): looped-bar engine, media sink, lock-screen session.
// BASE=… SHOTS=… node tests/e2e/metronome.mjs   (Playwright can't lock a screen:
// the on-device check is Leif's; this proves the engine, the sink and the swaps.)
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") errors.push(m.text()); });
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); await page.screenshot({ path: `${S}/met-fail.png` }).catch(() => {}); process.exit(1); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowDot = () => page.evaluate(() => [...document.querySelectorAll("#dots .dot")].findIndex((d) => d.classList.contains("now")));
const distinctDots = async (ms) => { const seen = new Set(); const t0 = Date.now(); while (Date.now() - t0 < ms) { seen.add(await nowDot()); await sleep(60); } return seen; };

await page.goto(`${BASE}/?app=1`);
await page.evaluate(() => { localStorage.setItem("ws.shell.seen", "true"); localStorage.removeItem("ws.metronome.bpm"); localStorage.removeItem("ws.metronome.beats"); localStorage.removeItem("ws.metronome.beatStates"); });

await step("a rendered bar has a click at every beat, silence between, and the seam carries the tail", async () => {
  await page.goto(`${BASE}/?app=1&e=1#/metronome`);
  await page.waitForSelector("#start");
  const r = await page.evaluate(async () => {
    const { renderBar } = await import("/js/tools/metronome/engine.js");
    const { barPlan } = await import("/js/tools/metronome/bar.js");
    const sr = 48000, ctx = new OfflineAudioContext(1, 1, sr);
    const out = {};
    for (const voice of ["wood", "clave", "beep", "tick"]) {
      const plan = barPlan({ bpm: 60, beats: 4, beatStates: [2, 1, 0, 1], subdivision: 1 }, sr);
      const buf = await renderBar(plan, voice, ctx);
      const d = buf.getChannelData(0);
      const peak = (t0, t1) => { let m = 0; for (let i = Math.max(0, Math.floor(t0 * sr)); i < Math.min(d.length, Math.floor(t1 * sr)); i++) m = Math.max(m, Math.abs(d[i])); return m; };
      out[voice] = { len: d.length, beats: [0, 1, 2, 3].map((b) => +peak(b, b + 0.03).toFixed(3)), between: +peak(0.5, 0.9).toFixed(4), seamTail: +peak(3.9995, 4).toFixed(4) };
    }
    // a fast bar: the last sub's tail must fold onto the start rather than be cut
    const plan = barPlan({ bpm: 300, beats: 1, beatStates: [2], subdivision: 4 }, sr);
    const buf = await renderBar(plan, "beep", ctx);
    const d = buf.getChannelData(0);
    let head = 0; for (let i = 0; i < Math.floor(0.004 * sr); i++) head = Math.max(head, Math.abs(d[i]));
    out.fast = { len: d.length, head: +head.toFixed(4) };
    return out;
  });
  for (const v of ["wood", "clave", "beep", "tick"]) {
    const x = r[v];
    if (x.len !== 4 * 48000) throw new Error(`${v} length ${x.len}`);
    if (!(x.beats[0] > 0.05 && x.beats[1] > 0.02 && x.beats[3] > 0.02)) throw new Error(`${v} beats ${JSON.stringify(x.beats)}`);
    if (x.beats[2] > 0.001) throw new Error(`${v} muted beat 3 clicked ${x.beats[2]}`);
    if (x.between > 0.001) throw new Error(`${v} noise between beats ${x.between}`);
  }
  if (r.fast.len !== Math.round(48000 * 60 / 300)) throw new Error("fast bar length " + r.fast.len);
  if (!(r.fast.head > 0.01)) throw new Error("the folded tail should be audible at the bar start: " + r.fast.head);
});

await step("start: the loop runs through a playing media sink; dots advance off the audio clock; media session says playing", async () => {
  await page.click("#start");
  await page.waitForSelector('#start[aria-label="stop"]');
  await page.waitForFunction(() => { const el = document.querySelector('audio[data-role="metronome-sink"]'); return el && !el.paused; }, null, { timeout: 5000 });
  const seen = await distinctDots(1500); // 96 bpm → 625 ms a beat
  if (seen.size < 2 || seen.has(-1) && seen.size < 3) throw new Error("dots did not advance: " + [...seen]);
  const ms = await page.evaluate(() => navigator.mediaSession?.playbackState);
  if (ms !== "playing") throw new Error("media session " + ms);
  const meta = await page.evaluate(() => navigator.mediaSession?.metadata?.title);
  if (!/^Metronome · 96 bpm$/.test(meta ?? "")) throw new Error("metadata " + meta);
  await page.screenshot({ path: `${S}/met-01-running.png` });
});

await step("a tempo change swaps on the beat: still advancing, faster, no errors; muting a beat and changing voice too", async () => {
  await page.evaluate(() => { const s = document.querySelector("#bpm-slider"); s.value = 240; s.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector("#bpm")?.textContent === "240");
  await sleep(600);
  const seen = await distinctDots(1100); // 240 bpm → 250 ms a beat → ≥ 4 dots in 1.1 s
  if (seen.size < 3) throw new Error("dots after swap: " + [...seen]);
  await page.click("#dots .dot:nth-child(3)"); // normal → muted
  await page.click('#voice button:has-text("Tick")');
  await sleep(700);
  const meta = await page.evaluate(() => navigator.mediaSession?.metadata?.title);
  if (meta !== "Metronome · 240 bpm") throw new Error("metadata " + meta);
  if (errors.length) throw new Error(errors.join("; "));
});

await step("stop: button back to start, sink paused, media session paused; start again resumes", async () => {
  await page.click("#start");
  await page.waitForSelector('#start[aria-label="start"]');
  const st = await page.evaluate(() => ({ paused: document.querySelector('audio[data-role="metronome-sink"]').paused, ms: navigator.mediaSession?.playbackState }));
  if (!st.paused || st.ms !== "paused") throw new Error(JSON.stringify(st));
  await page.click("#start");
  await page.waitForSelector('#start[aria-label="stop"]');
  await sleep(400);
  const seen = await distinctDots(800);
  if (seen.size < 2) throw new Error("no beat after restart: " + [...seen]);
  await page.click("#start");
  if (errors.length) throw new Error(errors.join("; "));
});

await browser.close();
console.log("METRONOME ALL GREEN");
