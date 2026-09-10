// Accounts + sync E2E (WSHED-52/55). Two browser contexts = two devices.
// Usage: E2E_SECRET=… BASE=http://127.0.0.1:8788 SHOTS=<dir> node e2e-accounts.mjs
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789", SECRET = process.env.E2E_SECRET;
if (!SECRET) throw new Error("E2E_SECRET missing");
const EMAIL = `bot-${Date.now().toString(36)}@e2e.chopinly.com`;
const browser = await chromium.launch();
const errors = [];
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); throw e; } };
const mkPage = async (label) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`${label} console: ${m.text()}`); });
  await page.goto(`${BASE}/?app=1#/logbook`);
  await page.waitForSelector("#lb-play");
  return { ctx, page };
};
// modules reachable from the page: the live logbook + sync instances
const mods = `const lb = (await import("/js/lib/logbook.js")).logbook; const sync = (await import("/js/lib/sync.js")).sync; const account = (await import("/js/lib/account.js")).account;`;
const run = (page, src, ...args) => page.evaluate(new Function("a", `return (async () => { ${mods} ${src} })()`), args);
const signIn = (page) => run(page, `const r = await account.verify ? await fetch("/api/auth/verify", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "X-Chopinly": "1" }, body: JSON.stringify({ email: a[0], e2eSecret: a[1] }) }).then((r) => r.json()) : null; await sync.signIn(r.user); return sync.snapshot();`, EMAIL, SECRET);

const A = await mkPage("A"), B = await mkPage("B");

await step("A: anonymous data, then sign in → everything uploads", async () => {
  await run(A.page, `const g = lb.addGoal({ name: "Nocturne Op. 9/2", type: "piece" }); lb.addNote(g.id, "voicing in the LH"); const s = lb.addTime({ goalId: g.id, minutes: 25 }); lb.start(g.id);`);
  const snap = await signIn(A.page);
  if (snap.status !== "synced" || snap.pending !== 0) throw new Error(JSON.stringify(snap));
  if (!(snap.cursor >= 4)) throw new Error("cursor " + snap.cursor);
});

await step("B: sign in with the same account → sees A's goal, note, time and the running clock", async () => {
  const snap = await signIn(B.page);
  if (snap.status !== "synced") throw new Error(JSON.stringify(snap));
  const got = await run(B.page, `const g = lb.goals({ status: "all" }).find((x) => x.name.startsWith("Nocturne")); return { goal: !!g, notes: g ? lb.notes(g.id).length : 0, running: lb.running()?.goal.name ?? null, minutes: g ? lb.metrics.goalStats(g.id).minutes : 0 };`);
  if (!got.goal || got.notes !== 1 || got.running !== "Nocturne Op. 9/2" || got.minutes < 25) throw new Error(JSON.stringify(got));
  await B.page.waitForSelector(".lb-hero.running", { timeout: 5000 });
  await B.page.screenshot({ path: `${S}/acc-01-B-sees-A.png` });
});

await step("B stops the clock → A's next sync shows idle (closed beats open)", async () => {
  await run(B.page, `const s = lb.running().segment; s.startedAt -= 5 * 60000; lb.save(); lb.stop(); await sync.now();`);
  const a = await run(A.page, `await sync.now(); return { running: lb.running(), segs: lb.doc.segments.length, pending: lb.pendingCount() };`);
  if (a.running !== null || a.segs !== 2) throw new Error(JSON.stringify(a));
  await A.page.waitForSelector(".lb-hero.idle", { timeout: 5000 });
});

await step("A renames + B adds a note offline → both converge after reconnect", async () => {
  await B.ctx.setOffline(true);
  const b = await run(B.page, `const g = lb.goals({ status: "all" })[0]; lb.addNote(g.id, "offline note"); await sync.now(); return sync.snapshot();`);
  if (b.status !== "offline" || b.pending !== 1) throw new Error("B offline " + JSON.stringify(b));
  await run(A.page, `const g = lb.goals({ status: "all" })[0]; lb.renameGoal(g.id, "Nocturne in E-flat"); await sync.now();`);
  await B.ctx.setOffline(false);
  const b2 = await run(B.page, `await sync.now(); const g = lb.goals({ status: "all" })[0]; return { status: sync.snapshot().status, name: g.name, notes: lb.notes(g.id).length };`);
  if (b2.status !== "synced" || b2.name !== "Nocturne in E-flat" || b2.notes !== 2) throw new Error(JSON.stringify(b2));
  const a2 = await run(A.page, `await sync.now(); const g = lb.goals({ status: "all" })[0]; return lb.notes(g.id).length;`);
  if (a2 !== 2) throw new Error("A notes " + a2);
});

await step("A adds a score row + a bookmark → B sees both; the file is on another device (WSHED-98 P1)", async () => {
  const ids = await run(A.page, `const sc = lb.addScore({ title: "Nocturne Op. 9 No. 2", composer: "Chopin", pages: 6, sha256: "e2e-hash", tags: ["romantic"] }); const m = lb.addMark({ scoreId: sc.id, page: 4, label: "coda" }); await sync.now(); return { sc: sc.id, m: m.id };`);
  const got = await run(B.page, `await sync.now(); const sc = lb.score(a[0]); return { title: sc?.title, tags: sc?.tags, marks: lb.marks(a[0]).map((m) => m.label) };`, ids.sc);
  if (got.title !== "Nocturne Op. 9 No. 2" || got.tags?.[0] !== "romantic" || got.marks?.[0] !== "coda") throw new Error(JSON.stringify(got));
  await B.page.goto(`${BASE}/?app=1#/scores`);
  await B.page.waitForSelector(".sc-row.remote", { timeout: 8000 });
  if (!(await B.page.locator(".sc-row.remote .sc-remote").first().textContent()).includes("on another device")) throw new Error("remote row copy");
  await B.page.screenshot({ path: `${S}/acc-05-B-score-remote.png` });
  await run(B.page, `lb.updateScore(a[0], { title: "Nocturne in E-flat" }); lb.removeMark(a[1]); await sync.now();`, ids.sc, ids.m);
  // sync.now() coalesces onto a sync already in flight, so poll like a device does (it syncs on a timer)
  let back = null;
  for (let i = 0; i < 8; i++) {
    back = await run(A.page, `await sync.now(); return { title: lb.score(a[0])?.title, marks: lb.marks(a[0]).length };`, ids.sc);
    if (back.title === "Nocturne in E-flat" && back.marks === 0) break;
    await A.page.waitForTimeout(800);
  }
  if (back.title !== "Nocturne in E-flat" || back.marks !== 0) throw new Error("B's edit did not come back " + JSON.stringify(back));
  // ink (P2): a page over the 8 KB default cap rides the ink cap through the real Function
  const inkN = await run(A.page, `const { encode } = await import("/js/lib/scores/ink.js"); const strokes = Array.from({ length: 40 }, (_, i) => ({ t: "pen", c: i % 3, w: 57, pts: Array.from({ length: 60 }, (_, j) => ({ x: 0.05 + j * 0.014, y: 0.1 + i * 0.02 + (j % 3) * 0.002, p: 0.5 })) })); const body = encode(strokes); const k = lb.setInk(a[0], 2, body); await sync.now(); return { n: k.s.length, bytes: JSON.stringify(body).length };`, ids.sc);
  if (!(inkN.bytes > 8192)) throw new Error("the ink fixture should exceed the default cap: " + inkN.bytes);
  let inkB = null;
  for (let i = 0; i < 8; i++) { inkB = await run(B.page, `await sync.now(); return lb.inkFor(a[0], 2)?.s.length ?? 0;`, ids.sc); if (inkB === inkN.n) break; await B.page.waitForTimeout(800); }
  if (inkB !== inkN.n) throw new Error(`ink did not arrive on B: ${inkB} of ${inkN.n}`);
  await B.page.goto(`${BASE}/?app=1#/logbook`);
  await B.page.waitForSelector("#lb-play, .lb-hero");
});

await step("delete on A tombstones on B; both press play apart → one clock survives", async () => {
  await run(A.page, `const g = lb.goals({ status: "all" })[0]; const n = lb.notes(g.id).find((x) => x.body === "offline note"); lb.deleteNote(n.id); await sync.now();`);
  const b = await run(B.page, `await sync.now(); const g = lb.goals({ status: "all" })[0]; return lb.notes(g.id).length;`);
  if (b !== 1) throw new Error("B notes after delete " + b);
  await A.ctx.setOffline(true); await B.ctx.setOffline(true);
  await run(A.page, `const g = lb.goals({ status: "all" })[0]; lb.start(g.id);`);
  await new Promise((r) => setTimeout(r, 50));
  await run(B.page, `const g = lb.addGoal({ name: "Hanon 1", type: "technique" }); lb.start(g.id);`);
  await A.ctx.setOffline(false); await B.ctx.setOffline(false);
  await run(A.page, `await sync.now();`); await run(B.page, `await sync.now();`); await run(A.page, `await sync.now();`);
  const a = await run(A.page, `return { running: lb.running()?.goal.name ?? null, open: lb.doc.segments.filter((s) => s.endedAt === null).length };`);
  const bb = await run(B.page, `return { running: lb.running()?.goal.name ?? null, open: lb.doc.segments.filter((s) => s.endedAt === null).length };`);
  if (a.open !== 1 || bb.open !== 1 || a.running !== "Hanon 1" || bb.running !== "Hanon 1") throw new Error(JSON.stringify({ a, bb }));
  await run(A.page, `lb.stop(); await sync.now();`);
});

await step("export matches; sign out keeps local data; delete wipes the account", async () => {
  const exp = await run(A.page, `const r = await fetch("/api/me/export", { credentials: "same-origin" }); return await r.json();`);
  if (exp.goals.length !== 2 || exp.email !== EMAIL) throw new Error("export " + JSON.stringify({ g: exp.goals.length, e: exp.email }));
  const out = await run(B.page, `await sync.signOut(); return { status: sync.snapshot().status, goals: lb.goals({ status: "all" }).length, me: (await fetch("/api/me", { credentials: "same-origin" })).status };`);
  if (out.status !== "signed-out" || out.goals !== 2 || out.me !== 401) throw new Error(JSON.stringify(out));
  const del = await run(A.page, `await sync.deleteAccount(); return (await fetch("/api/me", { credentials: "same-origin" })).status;`);
  if (del !== 401) throw new Error("delete " + del);
  const again = await run(A.page, `const r = await fetch("/api/auth/verify", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "X-Chopinly": "1" }, body: JSON.stringify({ email: a[0], e2eSecret: a[1] }) }).then((r) => r.json()); const s = await fetch("/api/sync", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "X-Chopinly": "1" }, body: JSON.stringify({ cursor: 0, changes: [] }) }).then((r) => r.json()); await fetch("/api/me", { method: "DELETE", credentials: "same-origin", headers: { "X-Chopinly": "1" } }); return { created: r.created, rows: s.changes.length };`, EMAIL, SECRET);
  if (!again.created || again.rows !== 0) throw new Error("account not wiped " + JSON.stringify(again));
});

await browser.close();
if (errors.length) { console.log("PAGE ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("ACCOUNTS ALL GREEN");
