// Scores P3 — cloud files E2E (WSHED-102). Two contexts = two devices on one
// account: import on A → "upload scores" checklist → select all → upload →
// B sees "in the cloud — tap to download" → opens (downloads) → ink both ways →
// quota refusal (test-only header) → delete on A removes the cloud file for B.
// Usage: E2E_SECRET=… BASE=http://127.0.0.1:8789 SHOTS=<dir> node tests/e2e/scores-cloud.mjs
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789", SECRET = process.env.E2E_SECRET;
if (!SECRET) throw new Error("E2E_SECRET missing");
const FIXTURE = new URL("../fixtures/score-12p.pdf", import.meta.url).pathname;
const EMAIL = `cloud-${Date.now().toString(36)}@e2e.chopinly.com`;
const browser = await chromium.launch();
const errors = [];
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); throw e; } };
const mkPage = async (label) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`${label} console: ${m.text()}`); });
  await page.goto(`${BASE}/?app=1#/scores`);
  await page.waitForSelector(".scores");
  return { ctx, page, label };
};
const mods = `const lb = (await import("/js/lib/logbook.js")).logbook; const sync = (await import("/js/lib/sync.js")).sync; const cloud = (await import("/js/lib/scores/cloud.js")).cloud; const scoreStore = (await import("/js/lib/scores/store.js")).scoreStore;`;
const run = async (page, src, ...args) => { const r = await page.evaluate(new Function("a", `return (async () => { try { ${mods} ${src} } catch (e) { return { __err: (e && e.stack) || String(e) }; } })()`), args); if (r && r.__err) throw new Error("in page: " + r.__err); return r; };
const signIn = (page) => run(page, `const r = await fetch("/api/auth/verify", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "X-Chopinly": "1" }, body: JSON.stringify({ email: a[0], e2eSecret: a[1] }) }).then((r) => r.json()); await sync.signIn(r.user); await cloud.refresh(); return { ...sync.snapshot(), plan: r.user.plan, quota: r.user.storage.quota };`, EMAIL, SECRET);
const files = (page) => run(page, `return await fetch("/api/scores/files", { credentials: "same-origin" }).then((r) => r.json());`);
const text = async (page, sel) => (await page.locator(sel).first().textContent())?.trim();
const noWiden = async (page) => { const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth })); if (w.doc > w.vw) throw new Error("page widened " + JSON.stringify(w)); };
const closeSheet = async (page) => { await page.click(".lb-sheet-wrap .lb-close"); await page.waitForFunction(() => !document.querySelector(".lb-sheet-wrap:not(.closing)")); };

const A = await mkPage("A"), B = await mkPage("B");
let scoreId = null;

await step("A: import the fixture, sign in → the plan is free with the promotional 100 MB; the head grows an upload button", async () => {
  await A.page.setInputFiles("#sc-file", FIXTURE);
  await A.page.waitForSelector(".sc-row", { timeout: 15000 });
  await A.page.waitForFunction(() => !document.querySelector(".sc-add.busy"));
  scoreId = await run(A.page, `return lb.scores()[0].id;`);
  if (await A.page.locator("#sc-upload").count()) throw new Error("upload button before sign-in");
  const snap = await signIn(A.page);
  if (snap.status !== "synced" || snap.plan !== "free" || snap.quota !== 100 * 1048576) throw new Error(JSON.stringify(snap));
  await A.page.waitForSelector("#sc-upload", { timeout: 8000 });
  if ((await A.page.locator(".sc-row .sc-cloud").count()) !== 0) throw new Error("row claims a cloud copy before any upload");
  await noWiden(A.page);
});

await step("A: upload scores → checklist; select all → 1 of 1; upload → toast, cloud glyph on the row, the bucket holds it", async () => {
  await A.page.click("#sc-upload");
  await A.page.waitForSelector("#sc-selbar");
  if (!(await text(A.page, ".sc-sel-text b")).includes("1 score to back up")) throw new Error("selbar copy " + (await text(A.page, ".sc-sel-text b")));
  if (!(await text(A.page, ".sc-sel-quota")).includes("of 100 MB used (promotional)")) throw new Error("quota line " + (await text(A.page, ".sc-sel-quota")));
  if (!(await A.page.locator("#sc-sel-go").isDisabled())) throw new Error("upload enabled with nothing picked");
  await A.page.click("#sc-sel-all");
  await A.page.waitForFunction(() => document.querySelector(".sc-pick.sc-on"));
  if (!(await text(A.page, ".sc-sel-text b")).startsWith("1 of 1")) throw new Error("count " + (await text(A.page, ".sc-sel-text b")));
  await noWiden(A.page);
  await A.page.screenshot({ path: `${S}/cloud-01-A-checklist.png` });
  // tapping the row toggles it off and on again
  await A.page.click(".sc-pick .sc-open");
  await A.page.waitForFunction(() => !document.querySelector(".sc-pick.sc-on"));
  await A.page.click(".sc-pick .sc-open");
  await A.page.waitForFunction(() => document.querySelector(".sc-pick.sc-on"));
  await A.page.click("#sc-sel-go");
  await A.page.waitForFunction(() => document.querySelector(".lb-toast.show")?.textContent.includes("backed up"), null, { timeout: 20000 });
  await A.page.waitForSelector(".sc-row .sc-cloud", { timeout: 8000 });
  if (await A.page.locator("#sc-selbar").count()) throw new Error("still in selection mode");
  const f = await files(A.page);
  if (f.files.length !== 1 || f.files[0].id !== scoreId || !(f.used > 1000) || f.used !== f.files[0].size) throw new Error("bucket " + JSON.stringify(f));
  const local = await run(A.page, `return (await scoreStore.row(a[0])).sha256;`, scoreId);
  if (local !== f.files[0].sha256) throw new Error("sha mismatch");
  await A.page.waitForTimeout(400);
  await A.page.screenshot({ path: `${S}/cloud-02-A-uploaded.png` });
});

await step("A: upload again → the row reads 'already in the cloud' and cannot be picked; cancel leaves the list as it was", async () => {
  await A.page.click("#sc-upload");
  await A.page.waitForSelector("#sc-selbar");
  await A.page.waitForFunction(() => document.querySelector(".sc-pick .sc-sub")?.textContent.includes("already in the cloud"));
  if (!(await A.page.locator(".sc-pick.sc-nopick").count())) throw new Error("row still pickable");
  if (!(await text(A.page, ".sc-sel-text b")).includes("everything here is in the cloud")) throw new Error("copy " + (await text(A.page, ".sc-sel-text b")));
  await A.page.click("#sc-sel-cancel");
  await A.page.waitForFunction(() => !document.querySelector("#sc-selbar") && document.querySelector(".sc-row .sc-open[aria-label^='open']"));
});

await step("B: sign in → the row says 'in the cloud'; tapping downloads it and the reader opens on page 1", async () => {
  const snap = await signIn(B.page);
  if (snap.status !== "synced") throw new Error(JSON.stringify(snap));
  await B.page.waitForSelector(".sc-row.remote .sc-remote-cloud", { timeout: 10000 });
  if (!(await text(B.page, ".sc-remote-cloud")).includes("in the cloud")) throw new Error("copy");
  await noWiden(B.page);
  await B.page.screenshot({ path: `${S}/cloud-03-B-in-cloud.png` });
  await B.page.click(".sc-row .sc-open");
  await B.page.waitForFunction(() => document.querySelector("#sc-pageno")?.textContent.trim().startsWith("1 /"), null, { timeout: 20000 });
  await B.page.waitForFunction(() => document.querySelector("#sc-spin")?.hidden, null, { timeout: 15000 });
  const dark = await B.page.evaluate(() => { const c = document.querySelector("#sc-page"); if (!c || c.width < 2) return -1; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 128) n++; return n / (d.length / 16); });
  if (!(dark > 0.005)) throw new Error("page 1 did not render: " + dark);
  const here = await run(B.page, `return { has: scoreStore.has(a[0]), sha: (await scoreStore.row(a[0])).sha256 };`, scoreId);
  const f = await files(B.page);
  if (!here.has || here.sha !== f.files[0].sha256) throw new Error("download " + JSON.stringify(here));
  await B.page.screenshot({ path: `${S}/cloud-04-B-reader.png` });
  await B.page.click("#sc-back");
  await B.page.waitForSelector(".scores");
  await B.page.waitForFunction(() => !document.querySelector(".sc-row.remote"));
  if (!(await B.page.locator(".sc-row .sc-cloud").count())) throw new Error("B's row should carry the cloud glyph now");
});

await step("B: ink on page 2 + a bookmark → A gets both; A's account sheet shows the cloud line", async () => {
  await run(B.page, `const { encode } = await import("/js/lib/scores/ink.js"); lb.setInk(a[0], 2, encode([{ t: "pen", c: 0, w: 57, pts: [{ x: 0.2, y: 0.2, p: 0.5 }, { x: 0.6, y: 0.4, p: 0.5 }] }])); lb.addMark({ scoreId: a[0], page: 5, label: "coda" }); await sync.now();`, scoreId);
  let got = null;
  for (let i = 0; i < 10; i++) { got = await run(A.page, `await sync.now(); return { ink: lb.inkFor(a[0], 2)?.s.length ?? 0, marks: lb.marks(a[0]).map((m) => m.label) };`, scoreId); if (got.ink === 1 && got.marks[0] === "coda") break; await A.page.waitForTimeout(800); }
  if (got.ink !== 1 || got.marks[0] !== "coda") throw new Error(JSON.stringify(got));
  await A.page.click("#account-btn");
  await A.page.waitForSelector("#acct-scores-sub");
  await A.page.waitForFunction(() => /of 100 MB in the cloud/.test(document.querySelector("#acct-scores-sub").textContent), null, { timeout: 8000 });
  await A.page.click("#acct-scores");
  await A.page.waitForSelector("#sc-cloud-line");
  await A.page.waitForFunction(() => /1 score in the cloud/.test(document.querySelector("#sc-cloud-line").textContent), null, { timeout: 8000 });
  if (!(await A.page.locator('[data-act="stale"]').count())) throw new Error("no stale-purge row");
  await A.page.screenshot({ path: `${S}/cloud-05-A-storage.png` });
  await closeSheet(A.page);
});

await step("quota: a PUT over the (test-shrunk) quota is a 413 with a sentence naming the promotional limit; a stranger's GET is 401; another id is 404", async () => {
  // a pooled keep-alive connection the dev server already closed makes the first attempt "Failed to fetch" now and then; a browser retries GETs itself, not PUTs
  const r = await run(A.page, `const blob = await scoreStore.get(a[0]); let last; for (let i = 0; i < 3; i++) { try { const res = await fetch("/api/scores/other-id/file", { method: "PUT", credentials: "same-origin", headers: { "X-Chopinly": "1", "x-chopinly-sha256": "0".repeat(64), "content-type": "application/pdf", "x-chopinly-e2e-quota": "1000", "x-chopinly-e2e-secret": a[1] }, body: blob }); return { status: res.status, body: await res.json(), attempt: i + 1 }; } catch (e) { last = e; await new Promise((r) => setTimeout(r, 300)); } } return { status: 0, body: { error: last?.message }, attempt: 3 };`, scoreId, SECRET);
  if (r.attempt > 1) console.log("     (PUT needed", r.attempt, "attempts)");
  if (r.status !== 413 || !/not enough cloud space/.test(r.body.error) || !/promotional/.test(r.body.error)) throw new Error(JSON.stringify(r));
  const r404 = await run(A.page, `return (await fetch("/api/scores/nope/file", { credentials: "same-origin" })).status;`);
  if (r404 !== 404) throw new Error("404 " + r404);
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${BASE}/api/health`); // a same-origin document, no session
  const r401 = await anon.evaluate(async (id) => (await fetch(`/api/scores/${id}/file`)).status, scoreId);
  if (r401 !== 401) throw new Error("anonymous GET " + r401);
  await anon.context().close();
});

await step("A: details → remove from the cloud → B's row goes back to 'on another device'; upload again from the details sheet", async () => {
  await run(A.page, `await cloud.remove(a[0]);`, scoreId);
  if ((await files(A.page)).files.length !== 0) throw new Error("still in the bucket");
  await run(B.page, `await cloud.refresh();`);
  await B.page.reload(); await B.page.waitForSelector(".sc-row");
  // B downloaded it, so B's row is local now — the glyph just disappears
  await B.page.waitForFunction(() => !document.querySelector(".sc-row .sc-cloud"));
  await run(A.page, `const r = await cloud.upload([a[0]]); if (r.done.length !== 1) throw new Error(JSON.stringify(r));`, scoreId);
  if ((await files(A.page)).files.length !== 1) throw new Error("re-upload");
});

await step("A deletes the score → the tombstone removes the cloud file; B's row disappears; delete account empties the prefix", async () => {
  await run(A.page, `const { deleteScore } = await import("/js/tools/scores/library.js"); await deleteScore(a[0]); await sync.now();`, scoreId);
  let f = null;
  for (let i = 0; i < 8; i++) { f = await files(A.page); if (f.files.length === 0) break; await A.page.waitForTimeout(600); }
  if (f.files.length !== 0 || f.used !== 0) throw new Error("cloud file survived the tombstone " + JSON.stringify(f));
  let rows = 1;
  for (let i = 0; i < 10; i++) { rows = await run(B.page, `await sync.now(); return lb.scores().length;`); if (rows === 0) break; await B.page.waitForTimeout(800); }
  if (rows !== 0) throw new Error("B still lists the score");
  // put one back, then delete the account: the prefix must be empty afterwards
  await B.page.setInputFiles("#sc-file", FIXTURE);
  await B.page.waitForSelector(".sc-row", { timeout: 15000 });
  await B.page.waitForFunction(() => !document.querySelector(".sc-add.busy"));
  const id2 = await run(B.page, `const id = lb.scores()[0].id; await cloud.upload([id]); return id;`);
  if ((await files(B.page)).files.length !== 1) throw new Error("B upload");
  await run(A.page, `await sync.deleteAccount();`);
  const again = await run(B.page, `const r = await fetch("/api/auth/verify", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "X-Chopinly": "1" }, body: JSON.stringify({ email: a[0], e2eSecret: a[1] }) }).then((r) => r.json()); const f = await fetch("/api/scores/files", { credentials: "same-origin" }).then((r) => r.json()); await fetch("/api/me", { method: "DELETE", credentials: "same-origin", headers: { "X-Chopinly": "1" } }); return { created: r.created, files: f.files.length, used: f.used, here: scoreStore.has(a[2]) };`, EMAIL, SECRET, id2);
  if (!again.created || again.files !== 0 || again.used !== 0 || !again.here) throw new Error("prefix not wiped / device copy lost " + JSON.stringify(again));
});

await browser.close();
if (errors.length) { console.log("PAGE ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("SCORES CLOUD ALL GREEN");
