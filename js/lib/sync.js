// The sync engine (docs/ACCOUNTS_DESIGN.md §4.4). One module-level instance
// bound to the app-wide logbook. Status drives the navbar dot and the
// account sheet; `on(fn)` for both.
//
//   status: "signed-out" | "idle" | "syncing" | "synced" | "offline" | "error"
import { logbook } from "./logbook.js";
import { makeStore } from "./store.js";
import { account } from "./account.js";
import { takeStore } from "./takes/store.js";

const store = makeStore("sync"); // ws.sync.state
const DEBOUNCE_MS = 1500;
const RUNNING_INTERVAL_MS = 60_000;

const state = { user: null, cursor: 0, status: "signed-out", lastSyncAt: null, error: null, ...store.get("state", {}) };
if (state.user) state.status = "idle"; else state.status = "signed-out";
const listeners = new Set();
let timer = 0, interval = 0, inflight = null, queued = false, applying = false, started = false;

const persist = () => store.set("state", { user: state.user, cursor: state.cursor, lastSyncAt: state.lastSyncAt });
const emit = () => { for (const fn of listeners) { try { fn(snapshot()); } catch (e) { console.error(e); } } };
const set = (patch) => { Object.assign(state, patch); persist(); emit(); };

export function snapshot() {
  return { user: state.user, status: state.status, cursor: state.cursor, lastSyncAt: state.lastSyncAt, error: state.error, pending: logbook.pendingCount(), online: navigator.onLine !== false };
}
export const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const signedIn = () => !!state.user;

function schedule(ms = DEBOUNCE_MS) {
  // Only a local change needs a push. Our own bookkeeping (clearing the
  // pending set, applying remote rows) also fires the logbook listener —
  // `applying` covers that, and an empty pending set is the belt to its braces
  // (WSHED-57: without both, every sync scheduled the next one forever).
  if (!state.user || applying || !logbook.pendingCount()) return;
  clearTimeout(timer);
  timer = setTimeout(() => now(), ms);
}

/** Push pending, pull since cursor, apply. Coalesces concurrent calls. */
export async function now() {
  if (!state.user) return null;
  if (inflight) { queued = true; return inflight; }
  clearTimeout(timer);
  inflight = (async () => {
    set({ status: "syncing", error: null });
    try {
      let res, sent;
      do {
        sent = logbook.pendingEnvelopes();
        res = await account.sync(state.cursor, sent);
        applying = true;
        try { logbook.clearPending(sent); logbook.applyRemote(res.changes); } finally { applying = false; }
        state.cursor = res.cursor;
      } while (res.more);
      set({ status: "synced", lastSyncAt: Date.now(), error: null });
    } catch (e) {
      if (e.status === 401) { set({ user: null, cursor: 0, status: "signed-out", error: null }); }
      else if (e.status === 429) set({ status: "error", error: "syncing too often — paused for a minute" });
      else if (e.offline || navigator.onLine === false) set({ status: "offline", error: null });
      else set({ status: "error", error: e.message });
    } finally {
      inflight = null;
      if (queued) { queued = false; schedule(300); }
    }
  })();
  return inflight;
}

/** After a successful verify: everything on this device goes up, then we pull. */
export async function signIn(user) {
  set({ user: { id: user.id, email: user.email }, cursor: 0, status: "idle", error: null });
  applying = true;
  try { logbook.markAllPending(); } finally { applying = false; }
  syncInterval();
  return now();
}

/** Sign out. `clearDevice` also wipes the local Logbook (shared computers). */
export async function signOut({ clearDevice = false } = {}) {
  try { await account.signOut(); } catch { /* the cookie is gone either way */ }
  set({ user: null, cursor: 0, status: "signed-out", error: null, lastSyncAt: null });
  clearInterval(interval);
  if (clearDevice) {
    try { localStorage.removeItem("ws.logbook.data"); localStorage.removeItem("ws.sync.state"); } catch { /* storage unavailable */ }
    try { await takeStore.clear(); } catch { /* nothing stored */ }
    location.reload();
  }
}

export async function deleteAccount() {
  await account.deleteAccount();
  set({ user: null, cursor: 0, status: "signed-out", error: null, lastSyncAt: null });
  clearInterval(interval);
}

function syncInterval() {
  clearInterval(interval);
  interval = setInterval(() => { if (state.user && logbook.running() && document.visibilityState === "visible") now(); }, RUNNING_INTERVAL_MS);
}

/** Wire triggers once, confirm the session, sync. Safe to call on every boot. */
export async function start() {
  if (started) return;
  started = true;
  logbook.on(() => schedule());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(200); });
  window.addEventListener("online", () => schedule(200));
  window.addEventListener("focus", () => schedule(500));
  syncInterval();
  if (!state.user) return;
  try {
    const { user } = await account.me();
    if (user.email !== state.user.email) set({ user: { id: user.id, email: user.email } });
    await now();
  } catch (e) {
    if (e.status === 401) set({ user: null, cursor: 0, status: "signed-out" });
    else set({ status: e.offline ? "offline" : "error", error: e.offline ? null : e.message });
  }
}

export const sync = { start, now, signIn, signOut, deleteAccount, on, snapshot, signedIn };
