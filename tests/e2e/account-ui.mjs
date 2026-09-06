// Account sheet UI E2E (WSHED-53). Local: the dev server echoes the code
// (DEV_ECHO_CODE=1) so the real UI flow runs. Prod: signs in through the
// allowlist API, then exercises the signed-in sheet + sign-out UI.
import { chromium } from "/home/leif/lets-get-rich/claude_ops/.claude/skills/tcw-quote/node_modules/playwright/index.mjs";
const S = process.env.SHOTS ?? ".", BASE = process.env.BASE ?? "http://127.0.0.1:8789", SECRET = process.env.E2E_SECRET, LOCAL = /127\.0\.0\.1|localhost/.test(BASE);
const EMAIL = `ui-${Date.now().toString(36)}@e2e.chopinly.com`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on("dialog", (d) => d.accept());
const step = async (name, f) => { try { await f(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "—", e.message); await page.screenshot({ path: `${S}/fail-ui.png` }); throw e; } };
const text = async (sel) => (await page.locator(sel).first().textContent())?.trim();
const noWiden = async () => { const w = await page.evaluate(() => ({ vw: innerWidth, doc: document.documentElement.scrollWidth })); if (w.doc > w.vw) throw new Error("page widened " + JSON.stringify(w)); };

await page.goto(`${BASE}/?app=1#/logbook`);
await page.waitForSelector("#lb-play");

await step("signed-out button: person glyph, no dot, opens the sign-in sheet", async () => {
  if (await page.locator("#account-btn.in").count()) throw new Error("should be signed out");
  if (!(await page.locator("#account-btn .account-glyph svg").count())) throw new Error("no glyph");
  await noWiden();
  await page.click("#account-btn");
  await page.waitForSelector(".lb-acct-wrap.open #acct-email");
  if (!/^Chopinly v\d+$/.test(await text("#acct-version"))) throw new Error("version line " + await text("#acct-version"));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${S}/ui-01-signin-sheet.png` });
});

await step("appearance (WSHED-71): Green Piano applies instantly, survives a reload, Ebony restores", async () => {
  const state = () => page.evaluate(() => ({ skin: document.documentElement.dataset.skin ?? "ebony", stored: localStorage.getItem("ws.shell.skin"), bg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme, theme: document.querySelector('meta[name="theme-color"]').content }));
  const before = await state();
  if (before.skin !== "ebony" || before.bg !== "rgb(25, 20, 16)") throw new Error("default " + JSON.stringify(before));
  await page.click("#acct-appearance");
  await page.waitForSelector(".lb-skins-wrap.open .lb-skin");
  if ((await page.locator('.lb-skin[aria-checked="true"]').getAttribute("data-skin")) !== "ebony") throw new Error("ebony not checked");
  await page.click('.lb-skin[data-skin="green-piano"]');
  await page.waitForTimeout(150);
  const green = await state();
  if (green.skin !== "green-piano" || green.stored !== '"green-piano"' || green.bg !== "rgb(246, 243, 236)" || green.scheme !== "light" || green.theme !== "#f6f3ec") throw new Error("green " + JSON.stringify(green));
  await noWiden();
  await page.screenshot({ path: `${S}/ui-01b-appearance.png` });
  // WSHED-72: every skin in the list applies, and no two share a body color
  const ids = await page.$$eval(".lb-skin", (els) => els.map((e) => e.dataset.skin));
  if (ids.length < 5) throw new Error("skins listed: " + ids.join());
  const seen = new Set();
  for (const id of ids) {
    await page.click(`.lb-skin[data-skin="${id}"]`); await page.waitForTimeout(80);
    const st = await state();
    if (st.skin !== id || seen.has(st.bg)) throw new Error(`skin ${id}: ${JSON.stringify(st)}`);
    seen.add(st.bg);
  }
  await page.click('.lb-skin[data-skin="green-piano"]'); await page.waitForTimeout(80);
  await page.reload(); await page.waitForSelector("#lb-play");
  const kept = await state();
  if (kept.skin !== "green-piano" || kept.bg !== "rgb(246, 243, 236)") throw new Error("not kept " + JSON.stringify(kept));
  await page.click("#account-btn"); await page.waitForSelector(".lb-acct-wrap.open #acct-appearance");
  if (!(await text("#acct-appearance small")).includes("Green Piano")) throw new Error("row hint");
  await page.click("#acct-appearance"); await page.waitForSelector(".lb-skins-wrap.open .lb-skin");
  await page.click('.lb-skin[data-skin="ebony"]'); await page.waitForTimeout(150);
  const back = await state();
  if (back.skin !== "ebony" || back.bg !== "rgb(25, 20, 16)" || back.stored !== '"ebony"') throw new Error("back " + JSON.stringify(back));
  await page.keyboard.press("Escape"); await page.waitForSelector(".lb-skins-wrap", { state: "detached" });
  await page.click("#account-btn"); await page.waitForSelector(".lb-acct-wrap.open #acct-email");
});

await step("bad email → sentence; good email → code form", async () => {
  await page.fill("#acct-email", "nope");
  await page.click("#acct-send");
  await page.waitForFunction(() => document.querySelector("#acct-err")?.textContent.includes("email address"));
  await page.fill("#acct-email", EMAIL);
  await page.click("#acct-send");
  await page.waitForSelector("#acct-code-form:not([hidden])");
  if (!(await text("#acct-sent")).includes(EMAIL)) throw new Error("sent line");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${S}/ui-02-code-form.png` });
});

await step(LOCAL ? "typing the echoed code signs in (auto-submit at 6 digits)" : "wrong code → sentence; allowlist sign-in behind the sheet", async () => {
  if (LOCAL) {
    const code = await page.inputValue("#acct-code");
    if (code.replace(/\D/g, "").length !== 6) throw new Error("dev code not echoed: " + code);
    await page.fill("#acct-code", "");
    await page.type("#acct-code", code.replace(/\D/g, ""), { delay: 30 });
  } else {
    await page.fill("#acct-code", "000000");
    await page.waitForFunction(() => document.querySelector("#acct-err2")?.textContent.includes("didn't match"));
    await page.evaluate(async ([email, secret]) => {
      const r = await fetch("/api/auth/verify", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "X-Chopinly": "1" }, body: JSON.stringify({ email, e2eSecret: secret }) }).then((x) => x.json());
      const { sync } = await import("/js/lib/sync.js");
      document.querySelector(".lb-close").click();
      await sync.signIn(r.user);
    }, [EMAIL, SECRET]);
  }
  await page.waitForFunction(() => !document.querySelector(".lb-sheet-wrap"), null, { timeout: 8000 });
  await page.waitForSelector("#account-btn.in", { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector("#account-btn .account-dot")?.classList.contains("synced"), null, { timeout: 10000 });
  const initial = await text("#account-btn .account-initial");
  if (initial !== EMAIL[0]) throw new Error("initial " + initial);
  await noWiden();
  await page.screenshot({ path: `${S}/ui-03-signed-in-navbar.png` });
});

await step("a change flips the dot to pending, then back to synced", async () => {
  await page.evaluate(async () => { const { logbook } = await import("/js/lib/logbook.js"); logbook.addGoal({ name: "Czerny 299", type: "technique" }); });
  await page.waitForFunction(() => document.querySelector("#account-btn .account-dot")?.classList.contains("pending"), null, { timeout: 3000 });
  await page.waitForFunction(() => document.querySelector("#account-btn .account-dot")?.classList.contains("synced"), null, { timeout: 10000 });
});

await step("no sync loop: at most 2 sync calls in 8 s while idle (WSHED-57)", async () => {
  let calls = 0;
  const onReq = (r) => { if (r.url().endsWith("/api/sync")) calls++; };
  page.on("request", onReq);
  await page.waitForTimeout(8000);
  page.off("request", onReq);
  if (calls > 2) throw new Error(`${calls} sync calls in 8 s`);
});
await step("signed-in sheet: email, sync line, actions; sign out keeps local data", async () => {
  await page.click("#account-btn");
  await page.waitForSelector(".lb-acct-wrap.open #acct-status");
  if (!(await text(".lb-acct-email")).includes(EMAIL)) throw new Error("email");
  if (!/synced/.test(await text("#acct-status"))) throw new Error("status " + await text("#acct-status"));
  const href = await page.getAttribute("#acct-export", "href");
  if (href !== "/api/me/export") throw new Error("export href");
  // WSHED-62: settings-style list — equal-height full-width rows, icons, the homepage link
  if ((await page.getAttribute("#acct-home", "href")) !== "/?home") throw new Error("homepage href");
  const rows = await page.$$eval(".lb-acct-row", (els) => els.map((e) => ({ h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width), icon: !!e.querySelector("svg") })));
  if (rows.length !== 8 || rows.some((r) => !r.icon) || Math.max(...rows.map((r) => r.h)) - Math.min(...rows.map((r) => r.h)) > 1 || new Set(rows.map((r) => r.w)).size !== 1) throw new Error("rows " + JSON.stringify(rows));
  if (!/^Chopinly v\d+$/.test(await text("#acct-version"))) throw new Error("version line " + await text("#acct-version"));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${S}/ui-04-signed-in-sheet.png` });
  await page.click("#acct-signout");
  await page.waitForFunction(() => !document.querySelector(".lb-sheet-wrap"));
  await page.waitForFunction(() => !document.querySelector("#account-btn").classList.contains("in"));
  const goals = await page.evaluate(async () => (await import("/js/lib/logbook.js")).logbook.goals({ status: "all" }).length);
  if (goals < 1) throw new Error("local data lost on sign out");
});

await step("cleanup: allowlist sign-in + delete account via API", async () => {
  const st = await page.evaluate(async ([email, secret]) => {
    await fetch("/api/auth/verify", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "X-Chopinly": "1" }, body: JSON.stringify({ email, e2eSecret: secret }) });
    return (await fetch("/api/me", { method: "DELETE", credentials: "same-origin", headers: { "X-Chopinly": "1" } })).status;
  }, [EMAIL, SECRET]);
  if (st !== 200) throw new Error("delete " + st);
});

await browser.close();
if (errors.length) { console.log("PAGE ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("ACCOUNT UI ALL GREEN");
