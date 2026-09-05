// The account button + sheet (docs/ACCOUNTS_DESIGN.md §6.1–6.2, WSHED-53).
// Signed out: email → six-digit code → signed in (the first sync uploads
// everything on this device). Signed in: the sync line, sync now, download,
// sign out (keeps local data) / sign out & clear this device, delete account.
import { openSheet, toast, esc } from "../tools/logbook/util.js";
import { haptic, stamp } from "../tools/logbook/motion.js";
import { icon } from "../lib/icons.js";
import { account } from "../lib/account.js";
import { sync } from "../lib/sync.js";

/** "just now", "4 min ago", "2 h ago", "yesterday", or a date. */
function relTime(ts, now = Date.now()) {
  const d = Math.max(0, now - ts), m = Math.round(d / 60000), h = Math.round(d / 3600000);
  if (d < 45000) return "just now";
  if (m < 60) return `${m} min ago`;
  if (h < 24) return `${h} h ago`;
  if (h < 48) return "yesterday";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** One sentence for the sync line. */
export function statusLine(s) {
  if (!s.user) return "not signed in";
  if (s.status === "syncing") return "syncing…";
  if (s.status === "offline") return s.pending ? `offline — ${s.pending} change${s.pending === 1 ? "" : "s"} will sync when you're back` : "offline — up to date";
  if (s.status === "error") return `couldn't sync — ${s.error ?? "try again"}`;
  if (s.pending) return `${s.pending} change${s.pending === 1 ? "" : "s"} waiting`;
  if (s.lastSyncAt) return `synced ${relTime(s.lastSyncAt)}`;
  return "up to date";
}

let wasSignedIn = null;
/** Paint the navbar button from a sync snapshot. */
export function renderAccountButton(btn, s) {
  const signedIn = !!s.user;
  btn.classList.toggle("in", signedIn);
  btn.querySelector(".account-glyph").hidden = signedIn;
  const initial = btn.querySelector(".account-initial");
  initial.hidden = !signedIn;
  initial.textContent = signedIn ? s.user.email[0] : "";
  const dot = btn.querySelector(".account-dot");
  dot.hidden = !signedIn;
  dot.className = `account-dot ${s.status === "error" || (s.status === "offline" && s.pending) ? "error" : s.status === "syncing" || s.pending ? "pending" : "synced"}`;
  btn.setAttribute("aria-label", signedIn ? `account · ${s.user.email} · ${statusLine(s)}` : "account — sign in to back up your practice");
  btn.title = signedIn ? statusLine(s) : "sign in to back up your practice";
  if (wasSignedIn === false && signedIn) stamp(btn);
  wasSignedIn = signedIn;
}

export function openAccount() {
  return sync.signedIn() ? openSignedIn() : openSignIn();
}

function openSignIn() {
  const sheet = openSheet({
    title: "your account",
    cls: "lb-acct-wrap",
    html: `
      <p class="lb-acct-copy">Back up your practice and pick it up on any device. Free.</p>
      <form class="lb-acct-form" id="acct-email-form" novalidate>
        <label class="lb-acct-label" for="acct-email">email</label>
        <input class="lb-input" id="acct-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" required>
        <p class="lb-err" id="acct-err" role="alert"></p>
        <div class="lb-modal-acts"><button type="submit" class="lb-modal-save" id="acct-send">send code</button></div>
      </form>
      <form class="lb-acct-form" id="acct-code-form" hidden novalidate>
        <p class="lb-acct-copy" id="acct-sent"></p>
        <label class="lb-acct-label" for="acct-code">six-digit code</label>
        <input class="lb-input lb-acct-code" id="acct-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7" placeholder="000 000" required>
        <p class="lb-err" id="acct-err2" role="alert"></p>
        <div class="lb-modal-acts">
          <button type="button" class="lb-modal-cancel" id="acct-again">send again</button>
          <button type="submit" class="lb-modal-save" id="acct-verify">sign in</button>
        </div>
      </form>`,
  });
  const { body, close, closed } = sheet;
  const emailForm = body.querySelector("#acct-email-form"), codeForm = body.querySelector("#acct-code-form");
  const emailEl = body.querySelector("#acct-email"), codeEl = body.querySelector("#acct-code");
  const err = body.querySelector("#acct-err"), err2 = body.querySelector("#acct-err2");
  const busy = (btn, on) => { btn.disabled = on; btn.classList.toggle("lb-busy", on); };
  let email = "";

  async function send(e) {
    e?.preventDefault();
    err.textContent = ""; err2.textContent = "";
    const raw = emailEl.value.trim();
    if (!raw || !emailEl.checkValidity()) { err.textContent = "that doesn't look like an email address"; emailEl.focus(); return; }
    const btn = body.querySelector("#acct-send");
    busy(btn, true);
    try {
      const r = await account.requestCode(raw);
      email = raw.toLowerCase();
      body.querySelector("#acct-sent").textContent = `we sent a code to ${email}`;
      emailForm.hidden = true; codeForm.hidden = false;
      haptic(12);
      if (r.devCode) codeEl.value = r.devCode; // local dev only
      setTimeout(() => codeEl.focus(), 60);
    } catch (ex) { err.textContent = ex.message; }
    finally { busy(btn, false); }
  }
  async function verify(e) {
    e.preventDefault();
    err2.textContent = "";
    const code = codeEl.value.replace(/\D/g, "");
    if (code.length !== 6) { err2.textContent = "the code is six digits"; codeEl.focus(); return; }
    const btn = body.querySelector("#acct-verify");
    busy(btn, true);
    try {
      const r = await account.verify(email, code);
      haptic([18, 40, 24]);
      btn.classList.add("lb-saved");
      toast(r.created ? "welcome — backing up this device" : "signed in");
      sync.signIn(r.user); // uploads everything here, then pulls; runs on after the sheet closes
      setTimeout(close, 120);
    } catch (ex) { err2.textContent = ex.message; codeEl.select(); busy(btn, false); }
  }
  emailForm.addEventListener("submit", send);
  codeForm.addEventListener("submit", verify);
  body.querySelector("#acct-again").addEventListener("click", async () => {
    const btn = body.querySelector("#acct-again");
    busy(btn, true);
    try { const r = await account.requestCode(email); toast("sent again"); if (r.devCode) codeEl.value = r.devCode; codeEl.focus(); }
    catch (ex) { err2.textContent = ex.message; }
    finally { busy(btn, false); }
  });
  codeEl.addEventListener("input", () => { const d = codeEl.value.replace(/\D/g, "").slice(0, 6); codeEl.value = d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d; if (d.length === 6) codeForm.requestSubmit(); });
  setTimeout(() => emailEl.focus(), 60);
  return closed;
}

function openSignedIn() {
  const s0 = sync.snapshot();
  const sheet = openSheet({
    title: "your account",
    cls: "lb-acct-wrap",
    html: `
      <p class="lb-acct-email">${icon("user")}<span>${esc(s0.user.email)}</span></p>
      <p class="lb-acct-status" id="acct-status" aria-live="polite">${esc(statusLine(s0))}</p>
      <div class="lb-acct-acts">
        <button type="button" class="tap" id="acct-sync">sync now</button>
        <a class="tap" id="acct-export" href="${account.exportUrl}" download>download my data</a>
        <button type="button" class="tap" id="acct-signout">sign out</button>
        <button type="button" class="tap" id="acct-signout-clear">sign out &amp; clear this device</button>
      </div>
      <p class="lb-err" id="acct-err" role="alert"></p>
      <p class="lb-acct-fine">Signing out keeps what's on this device. Clearing wipes it here — your account still has everything.</p>
      <button type="button" class="lb-link lb-danger" id="acct-delete">delete account</button>`,
  });
  const { body, close, closed } = sheet;
  const status = body.querySelector("#acct-status"), err = body.querySelector("#acct-err");
  const off = sync.on((s) => { if (!s.user) { close(); return; } status.textContent = statusLine(s); });
  closed.then(off);
  body.querySelector("#acct-sync").addEventListener("click", async () => { err.textContent = ""; await sync.now(); const s = sync.snapshot(); if (s.status === "synced") { haptic(10); toast("synced"); } });
  body.querySelector("#acct-signout").addEventListener("click", async () => { await sync.signOut(); toast("signed out — your practice is still here"); close(); });
  body.querySelector("#acct-signout-clear").addEventListener("click", async () => {
    if (!confirm("Sign out and remove the practice data stored on this device? Your account keeps everything.")) return;
    await sync.signOut({ clearDevice: true });
  });
  body.querySelector("#acct-delete").addEventListener("click", async () => {
    if (!confirm("Delete your Chopinly account and everything backed up in it? This device keeps its local copy.")) return;
    try { await sync.deleteAccount(); toast("account deleted"); close(); } catch (ex) { err.textContent = ex.message; }
  });
  return closed;
}
