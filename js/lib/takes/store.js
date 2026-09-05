// The audio store (WSHED-75): take blobs in IndexedDB on this device, keyed by
// take id. Nothing here ever goes to the network. `localIds` is a synchronous
// mirror of what is stored, so screens can tell "here" from "on another
// device" while rendering. Falls back to memory when IndexedDB is unavailable.
const DB = "chopinly-takes", STORE = "blobs";

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
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { mem = new Map(); resolve(null); };
  });
  return dbp;
}
const tx = (db, mode) => db.transaction(STORE, mode).objectStore(STORE);
const done = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

let readyP = null;
/** Open the store and load the id list. Idempotent. */
function ready() {
  if (readyP) return readyP;
  readyP = (async () => {
    const db = await open();
    if (!db) return;
    const rows = await done(tx(db, "readonly").getAll());
    for (const r of rows) { localIds.add(r.id); sizes.set(r.id, r.size ?? r.blob?.size ?? 0); }
    emit(); // screens that rendered before the ids loaded repaint "here" vs "on another device"
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

export const takeStore = {
  ready, persist, localIds,
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  has: (id) => localIds.has(id),
  size: (id) => sizes.get(id) ?? 0,
  async put(id, blob, mime = blob.type) {
    await ready();
    const row = { id, blob, mime, size: blob.size, at: Date.now() };
    const db = await open();
    if (db) await done(tx(db, "readwrite").put(row)); else mem.set(id, row);
    localIds.add(id); sizes.set(id, blob.size); emit();
    persist();
  },
  async get(id) {
    await ready();
    const db = await open();
    const row = db ? await done(tx(db, "readonly").get(id)) : mem.get(id);
    return row?.blob ?? null;
  },
  async del(id) {
    await ready();
    const db = await open();
    if (db) await done(tx(db, "readwrite").delete(id)); else mem?.delete(id);
    if (localIds.delete(id)) { sizes.delete(id); emit(); }
  },
  async clear() {
    await ready();
    const db = await open();
    if (db) await done(tx(db, "readwrite").clear()); else mem?.clear();
    localIds.clear(); sizes.clear(); emit();
  },
  /** { count, bytes } of what this device holds. */
  async usage() { await ready(); let bytes = 0; for (const b of sizes.values()) bytes += b; return { count: localIds.size, bytes }; },
  /**
   * Follow a logbook: a take deleted anywhere (or with its goal) frees its
   * audio here; a stale blob with no take is garbage.
   */
  attach(logbook) {
    const gc = async () => {
      await ready();
      const live = new Set(logbook.doc.takes.map((t) => t.id));
      for (const id of [...localIds]) if (!live.has(id)) await takeStore.del(id);
    };
    logbook.on(gc);
    gc();
  },
};
