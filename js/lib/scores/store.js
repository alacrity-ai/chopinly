// The score stores (docs/SCORES_DESIGN.md §4.2) in IndexedDB on this device:
//   files  — the PDF blob per score id
//   pages  — rendered page bitmaps (the persistent tier of the page cache, P1)
//   meta   — running byte totals so the account sheet never scans
// Mirrors js/lib/takes/store.js on purpose and is a separate module on
// purpose — takes never leave the device, scores may (P3), and the two have
// their own eviction stories. `localIds` is a synchronous mirror so rows can
// say "here" vs "on another device" while rendering. Falls back to memory
// when IndexedDB is unavailable.
const DB = "chopinly-scores", FILES = "files", PAGES = "pages", META = "meta";
const VERSION = 2;

let dbp = null, mem = null, memPages = null;
const localIds = new Set();
const sizes = new Map();
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(); };

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (!globalThis.indexedDB) { mem = new Map(); memPages = new Map(); resolve(null); return; }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
      if (!db.objectStoreNames.contains(PAGES)) db.createObjectStore(PAGES, { keyPath: "key" }).createIndex("scoreId", "scoreId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { mem = new Map(); memPages = new Map(); resolve(null); };
    req.onblocked = () => { mem = new Map(); memPages = new Map(); resolve(null); };
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

// --- pages: running totals live in meta so usage() is O(1) -----------------------
let pagesMeta = null; // { bytes, count }
async function loadPagesMeta(db) {
  if (pagesMeta) return pagesMeta;
  pagesMeta = (db ? await done(tx(db, META, "readonly").get("pages")).catch(() => null) : null) ?? { key: "pages", bytes: 0, count: 0 };
  return pagesMeta;
}
async function savePagesMeta(db) { if (db) await done(tx(db, META, "readwrite").put(pagesMeta)); }

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
  /** Remove the file and its rendered pages. */
  async del(id) {
    await ready();
    const db = await open();
    if (db) await done(tx(db, FILES, "readwrite").delete(id)); else mem?.delete(id);
    await this.delPages(id);
    if (localIds.delete(id)) { sizes.delete(id); emit(); }
  },
  /** Remove every file (keeps nothing; the list rows go grey). */
  async clear() {
    await ready();
    const db = await open();
    if (db) await done(tx(db, FILES, "readwrite").clear()); else mem?.clear();
    await this.clearPages();
    localIds.clear(); sizes.clear(); emit();
  },
  /** { count, bytes } of the files this device holds. */
  async usage() {
    await ready();
    let bytes = 0;
    for (const v of sizes.values()) bytes += v;
    return { count: localIds.size, bytes };
  },

  // --- rendered pages ---------------------------------------------------------
  pageKey: (scoreId, page, bucket) => `${scoreId}:${page}:${bucket}`,
  async putPage(key, blob, { scoreId, w, h }) {
    const db = await open();
    const meta = await loadPagesMeta(db);
    const row = { key, scoreId, blob, size: blob.size, w, h, at: Date.now() };
    if (db) {
      const prev = await done(tx(db, PAGES, "readonly").get(key));
      if (prev) { meta.bytes -= prev.size; meta.count--; }
      await done(tx(db, PAGES, "readwrite").put(row));
    } else { const prev = memPages.get(key); if (prev) { meta.bytes -= prev.size; meta.count--; } memPages.set(key, row); }
    meta.bytes += blob.size; meta.count++;
    await savePagesMeta(db);
  },
  async getPage(key) {
    const db = await open();
    return (db ? await done(tx(db, PAGES, "readonly").get(key)) : memPages.get(key)) ?? null;
  },
  /** Drop every rendered page of one score. */
  async delPages(scoreId) {
    const db = await open();
    const meta = await loadPagesMeta(db);
    if (db) {
      const rows = await done(tx(db, PAGES, "readonly").index("scoreId").getAll(scoreId));
      if (!rows.length) return;
      const st = tx(db, PAGES, "readwrite");
      for (const r of rows) { st.delete(r.key); meta.bytes -= r.size; meta.count--; }
      await new Promise((res, rej) => { st.transaction.oncomplete = res; st.transaction.onerror = () => rej(st.transaction.error); });
    } else for (const [k, r] of memPages) if (r.scoreId === scoreId) { memPages.delete(k); meta.bytes -= r.size; meta.count--; }
    meta.bytes = Math.max(0, meta.bytes); meta.count = Math.max(0, meta.count);
    await savePagesMeta(db);
  },
  async clearPages() {
    const db = await open();
    if (db) await done(tx(db, PAGES, "readwrite").clear()); else memPages?.clear();
    pagesMeta = { key: "pages", bytes: 0, count: 0 };
    await savePagesMeta(db);
  },
  /** { count, bytes } of rendered pages on this device. */
  async pagesUsage() {
    const db = await open();
    const m = await loadPagesMeta(db);
    return { count: m.count, bytes: m.bytes };
  },
  /**
   * Keep rendered pages under `budget` bytes: drop whole scores in the order
   * given (least recently opened first) until under budget. Resolves to the
   * score ids evicted.
   */
  async evictPages(budget, order) {
    const evicted = [];
    let { bytes } = await this.pagesUsage();
    for (const id of order) {
      if (bytes <= budget) break;
      await this.delPages(id);
      const after = await this.pagesUsage();
      if (after.bytes < bytes) evicted.push(id);
      bytes = after.bytes;
    }
    return evicted;
  },
};
