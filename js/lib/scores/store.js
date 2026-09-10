// The score file store (docs/SCORES_DESIGN.md §4.2): PDF blobs in IndexedDB
// on this device, keyed by score id. Mirrors js/lib/takes/store.js on purpose
// and is a separate module on purpose — takes never leave the device, scores
// may (P3), and the two have their own eviction stories. `localIds` is a
// synchronous mirror so rows can say "here" vs "on another device" while
// rendering. Falls back to memory when IndexedDB is unavailable.
const DB = "chopinly-scores", FILES = "files", META = "meta";

let dbp = null, mem = null;
const localIds = new Set();
const sizes = new Map();
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(); };

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (!globalThis.indexedDB) { mem = new Map(); resolve(null); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { mem = new Map(); resolve(null); };
  });
  return dbp;
}
const tx = (db, store, mode) => db.transaction(store, mode).objectStore(store);
const done = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

let readyP = null;
/** Open the store and load the id list. Idempotent. */
function ready() {
  if (readyP) return readyP;
  readyP = (async () => {
    const db = await open();
    if (!db) return;
    const rows = await done(tx(db, FILES, "readonly").getAll());
    for (const r of rows) { localIds.add(r.id); sizes.set(r.id, r.size ?? r.blob?.size ?? 0); }
    emit();
  })();
  return readyP;
}

let persisted = null;
/** Ask the browser not to evict us (Safari otherwise drops idle sites' storage). */
async function persist() {
  if (persisted !== null) return persisted;
  try { persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false; } catch { persisted = false; }
  return persisted;
}

export const scoreStore = {
  ready, persist, localIds,
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  has: (id) => localIds.has(id),
  size: (id) => sizes.get(id) ?? 0,
  /** Store a score's PDF. `extra` rides along ({ sha256, uploaded … }). */
  async put(id, blob, extra = {}) {
    await ready();
    const row = { id, blob, size: blob.size, at: Date.now(), ...extra };
    const db = await open();
    if (db) await done(tx(db, FILES, "readwrite").put(row)); else mem.set(id, row);
    localIds.add(id); sizes.set(id, blob.size); emit();
    persist();
  },
  async get(id) {
    await ready();
    const db = await open();
    const row = db ? await done(tx(db, FILES, "readonly").get(id)) : mem.get(id);
    return row?.blob ?? null;
  },
  async row(id) {
    await ready();
    const db = await open();
    return (db ? await done(tx(db, FILES, "readonly").get(id)) : mem.get(id)) ?? null;
  },
  async del(id) {
    await ready();
    const db = await open();
    if (db) await done(tx(db, FILES, "readwrite").delete(id)); else mem?.delete(id);
    if (localIds.delete(id)) { sizes.delete(id); emit(); }
  },
  async clear() {
    await ready();
    const db = await open();
    if (db) await done(tx(db, FILES, "readwrite").clear()); else mem?.clear();
    localIds.clear(); sizes.clear(); emit();
  },
  /** { count, bytes } of the files this device holds. */
  async usage() {
    await ready();
    let bytes = 0;
    for (const v of sizes.values()) bytes += v;
    return { count: localIds.size, bytes };
  },
};
