// Cloud score files, the client side (docs/SCORES_DESIGN.md §10.2, WSHED-102).
// One module-level engine, like sync.js. It knows what the account's cloud
// space holds (refreshed after every successful sync and on demand), uploads
// the scores the musician picked one at a time with progress, downloads a
// score when it is opened on a device that lacks the file, and removes files.
//
// Uploads are deliberate, never automatic: cloud space costs money and the
// free plan's 100 MB is promotional, so the library's "upload scores" mode
// is the only way bytes go up. Downloads of your own files are automatic.
import { account } from "../account.js";
import { sync } from "../sync.js";
import { scoreStore } from "./store.js";
import { logbook } from "../logbook.js";
import { quotaBytes, planLabel, fmtQuota, MAX_FILE_BYTES } from "./plans.js";

const state = {
  files: new Map(),      // score id → { size, sha256, uploaded }
  used: 0, quota: quotaBytes("free"), plan: "free", label: planLabel("free"),
  known: false,          // the list has been fetched at least once this session
  upload: null,          // { id, sent, total, index, count } while a batch runs
  downloads: new Map(),  // score id → { got, total }
  error: null,           // the last sentence worth showing in the account sheet
  refreshedAt: 0,
};
const listeners = new Set();
const emit = () => { for (const fn of listeners) { try { fn(snapshot()); } catch (e) { console.error(e); } } };
let refreshing = null, aborter = null;

export function snapshot() {
  return { files: state.files, used: state.used, quota: state.quota, plan: state.plan, label: state.label, known: state.known, upload: state.upload, downloads: state.downloads, error: state.error, signedIn: sync.signedIn() };
}
export const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** True when the account's cloud space holds this score's file. */
export const has = (id) => state.files.has(id);
/** True when the cloud copy matches the row's bytes (nothing to upload). */
export function uploaded(id) {
  const f = state.files.get(id); if (!f) return false;
  const s = logbook.score(id);
  return !s?.sha256 || !f.sha256 || f.sha256 === s.sha256;
}
/** Local files that are not (or not identically) in the cloud — what "select all" picks. */
export const uploadable = () => logbook.scores().filter((s) => scoreStore.has(s.id) && !uploaded(s.id) && (s.size ?? 0) <= MAX_FILE_BYTES).map((s) => s.id);

function applyList(data) {
  state.files = new Map(data.files.map((f) => [f.id, { size: f.size, sha256: f.sha256, uploaded: f.uploaded }]));
  state.used = data.used; state.quota = data.quota; state.plan = data.plan; state.label = data.label ?? planLabel(data.plan);
  state.known = true; state.refreshedAt = Date.now();
}

/** Fetch the list from the server (coalesced). Resolves to the snapshot; offline keeps the last list. */
export function refresh() {
  if (!sync.signedIn()) { state.files = new Map(); state.used = 0; state.known = false; emit(); return Promise.resolve(snapshot()); }
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try { applyList(await account.files()); state.error = null; }
    catch (e) { if (e.status === 401) { state.files = new Map(); state.known = false; } else if (!e.offline && e.status !== 429) state.error = e.message; }
    finally { refreshing = null; }
    emit();
    return snapshot();
  })();
  return refreshing;
}

/**
 * Upload the given scores one at a time (order as given). Progress lands in
 * `snapshot().upload` and on `onProgress({ id, index, count, sent, total })`.
 * Stops at the first quota (413), rate-limit (429) or offline error with the
 * sentence in `error`; skips files already in the cloud. Resolves to
 * { done: [ids], skipped: [ids], failed: [{ id, message }], stopped: bool }.
 */
export async function upload(ids, { onProgress = null } = {}) {
  if (!sync.signedIn()) throw new Error("sign in to upload scores");
  if (state.upload) throw new Error("an upload is already running");
  await sync.now(); // the score rows go up first so every device knows what the file belongs to
  if (!state.known) await refresh();
  const done = [], skipped = [], failed = [];
  let stopped = false;
  aborter = new AbortController();
  state.error = null;
  try {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const s = logbook.score(id);
      if (!s || !scoreStore.has(id)) { skipped.push(id); continue; }
      if (uploaded(id)) { skipped.push(id); continue; }
      const row = await scoreStore.row(id);
      const blob = row?.blob;
      if (!blob) { skipped.push(id); continue; }
      const sha256 = row.sha256 || s.sha256;
      if (state.known && state.used + blob.size - (state.files.get(id)?.size ?? 0) > state.quota) {
        // refuse here, before a single byte goes up — the server would say the same
        failed.push({ id, message: `not enough cloud space — ${fmtQuota(state.used)} of ${fmtQuota(state.quota)} used (${state.label} limit); ${s.title} needs ${fmtQuota(blob.size)}` });
        state.error = failed[failed.length - 1].message; stopped = true; break;
      }
      state.upload = { id, sent: 0, total: blob.size, index: i, count: ids.length };
      emit(); onProgress?.({ ...state.upload });
      try {
        const send = () => account.uploadFile(id, blob, sha256, { signal: aborter.signal, onProgress: (sent, total) => { state.upload = { ...state.upload, sent, total }; emit(); onProgress?.({ ...state.upload }); } });
        let r;
        try { r = await send(); }
        catch (e) {
          // a stale pooled connection fails the first attempt as a network error before any byte went up; one retry tells that apart from being offline
          if (!e.offline || navigator.onLine === false || state.upload.sent > 0) throw e;
          await new Promise((res) => setTimeout(res, 400));
          r = await send();
        }
        state.files.set(id, { size: r.size, sha256, uploaded: Date.now() });
        state.used = r.used; state.quota = r.quota; state.plan = r.plan; state.label = r.label ?? state.label;
        done.push(id);
      } catch (e) {
        failed.push({ id, message: e.message });
        if (e.aborted) { stopped = true; break; }
        if (e.status === 413) { state.error = e.message; stopped = true; break; }
        if (e.status === 429) { state.error = "uploading too fast — wait a minute and try again"; stopped = true; break; }
        if (e.offline) { state.error = "you went offline — the rest will upload when you try again"; stopped = true; break; }
        if (e.status === 401) { state.error = "sign in again to keep uploading"; stopped = true; break; }
      }
    }
  } finally { state.upload = null; aborter = null; emit(); }
  refresh(); // the server's total is the truth (an interrupted PUT may have landed)
  return { done, skipped, failed, stopped };
}
/** Stop after the file in flight. */
export const cancelUpload = () => aborter?.abort();

/**
 * Fetch a score's file into this device's store. Resolves to the Blob (or
 * null when the cloud has no such file). Progress lands in
 * `snapshot().downloads` and on `onProgress(got, total)`.
 */
export async function download(id, { onProgress = null } = {}) {
  if (!sync.signedIn()) return null;
  if (state.downloads.has(id)) return null;
  state.downloads.set(id, { got: 0, total: state.files.get(id)?.size ?? 0 }); emit();
  try {
    const blob = await account.downloadFile(id, { onProgress: (got, total) => { state.downloads.set(id, { got, total }); emit(); onProgress?.(got, total); } });
    const s = logbook.score(id);
    await scoreStore.put(id, blob, { sha256: s?.sha256 ?? state.files.get(id)?.sha256 ?? "" });
    if (!state.files.has(id)) refresh();
    return blob;
  } catch (e) {
    if (e.status === 404) { state.files.delete(id); return null; }
    if (!e.offline) state.error = e.message;
    throw e;
  } finally { state.downloads.delete(id); emit(); }
}

/** Remove the file from the cloud (the row and this device's copy stay). */
export async function remove(id) {
  const r = await account.deleteFile(id);
  state.files.delete(id); state.used = r.used; state.quota = r.quota; emit();
  return r;
}

/** Drop what we know about a score (it was deleted here; the tombstone removes the cloud file). */
export function forget(id) { if (state.files.delete(id)) { emit(); } }

// Keep the list fresh: after every successful sync (throttled), and when the account changes.
sync.on((s) => {
  if (!s.user) { if (state.files.size || state.known) { state.files = new Map(); state.used = 0; state.known = false; state.error = null; emit(); } return; }
  if (s.status === "synced" && Date.now() - state.refreshedAt > 10_000 && !state.upload) refresh();
});
if (sync.signedIn()) refresh();

export const cloud = { snapshot, on, has, uploaded, uploadable, refresh, upload, cancelUpload, download, remove, forget };
