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
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${S}/ui-01-signin-sheet.png` });
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
