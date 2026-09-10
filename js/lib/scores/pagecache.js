// The page cache (docs/SCORES_DESIGN.md §5), two tiers:
//   memory — a ring of rendered ImageBitmaps around the current page, so a turn
//            is a drawImage and the renderer works ahead in idle time;
//   pages  — for big scans, every rendered page is also encoded (WebP where the
//            browser can, else JPEG) into the `pages` store, so the second open
//            of a 30 MB score is a decode, not a render. Keyed by score, page
//            and a width bucket so one device's renders never poison another's.
// Bound to one open document at one CSS width; the reader makes a new one when
// the fit changes.
import { scoreStore } from "./store.js";

// The page and the next one, nothing else (WSHED-109): a page bitmap on an
// iPad is ~24 MB of canvas memory and Safari caps a page's total canvas
// memory hard (renders start failing past it — "couldn't draw page"). A
// turn back re-decodes from the pages store or re-renders, both well under
// a page turn's budget.
const AHEAD = 1, BEHIND = 0;
/** iOS / iPadOS: the tightest canvas budget of any browser we run on. */
export const IOS = typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent ?? "") || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
/** Rendered device pixels are capped here (width); an iPad in portrait is 2048. Past it the scan gains nothing and each bitmap costs 40 MB+. */
export const MAX_RENDER_PX = IOS ? 2048 : 2560;
/** Release a canvas's backing store now instead of at the next GC (WebKit keeps it until then). */
export const releaseCanvas = (c) => { try { c.width = 0; c.height = 0; } catch { /* already gone */ } };
/** Files over this render into the persistent tier … */
export const PERSIST_BYTES = 8 * 1024 * 1024;
/** … and so does any file whose first render takes longer than this. */
export const PERSIST_SLOW_MS = 150;
/** Rendered pages kept on the device, all scores together. */
export const PAGES_BUDGET = 300 * 1024 * 1024;
export const bucketOf = (width, dpr = 1) => Math.round((width * dpr) / 100);
const idle = (fn) => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 32));

let encodeType = null;
/** "image/webp" where the canvas can encode it (Chrome, Android, recent Safari), else JPEG. */
async function pickEncoding() {
  if (encodeType) return encodeType;
  try {
    const c = new OffscreenCanvas(2, 2);
    c.getContext("2d").fillRect(0, 0, 2, 2);
    const b = await c.convertToBlob({ type: "image/webp", quality: 0.8 });
    encodeType = b.type === "image/webp" ? "image/webp" : "image/jpeg";
  } catch { encodeType = "image/jpeg"; }
  return encodeType;
}
let encoding = Promise.resolve(), encoder = null;
/**
 * Encode one bitmap at a time on one reused canvas that is emptied after each
 * blob (WSHED-109): a fresh full-size canvas per page left a 24 MB backing
 * store behind until GC, and a reading session's worth of those is what ran
 * Safari out of canvas memory.
 */
function encode(bmp) {
  const run = encoding.then(async () => {
    const type = await pickEncoding();
    encoder ??= new OffscreenCanvas(1, 1);
    encoder.width = bmp.width; encoder.height = bmp.height;
    const cx = encoder.getContext("2d", { alpha: false });
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, bmp.width, bmp.height);
    cx.drawImage(bmp, 0, 0);
    try { return await encoder.convertToBlob({ type, quality: 0.86 }); }
    finally { releaseCanvas(encoder); }
  });
  encoding = run.catch(() => {});
  return run;
}
const canPersist = () => typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function";

/**
 * @param {{ pages: number, render(n, width, dpr): Promise<ImageBitmap> }} doc
 * @param {{ width: number, dpr?: number, scoreId?: string, persist?: boolean|"auto", size?: number }} opts
 *   persist: true / false, or "auto" (decide by file size, then by the first render's time).
 */
export function createPageCache(doc, { width, dpr = 1, scoreId = null, persist = "auto", size = 0 }) {
  const ring = new Map();   // n → { bmp | null, p: Promise<bmp> }
  let current = 1, closed = false, inflight = 0;
  let persisting = persist === true || (persist === "auto" && size >= PERSIST_BYTES);
  const usePages = () => persisting && scoreId && canPersist();
  const bucket = bucketOf(width, dpr);
  const wanted = (n) => n >= current - BEHIND && n <= current + AHEAD;
  const stats = { rendered: 0, decoded: 0, stored: 0 };

  function evict() {
    for (const [n, e] of ring) if (!wanted(n) && e.bmp) { e.bmp.close?.(); ring.delete(n); }
  }
  async function produce(n) {
    if (usePages()) {
      const row = await scoreStore.getPage(scoreStore.pageKey(scoreId, n, bucket)).catch(() => null);
      if (row?.blob) { try { const bmp = await createImageBitmap(row.blob); stats.decoded++; return bmp; } catch { /* re-render */ } }
    }
    const t0 = performance.now();
    const bmp = await doc.render(n, width, dpr); // a failure here is a failure — no lower-resolution retry that would hide a leak
    const ms = performance.now() - t0;
    stats.rendered++;
    if (persist === "auto" && !persisting && ms > PERSIST_SLOW_MS) persisting = true;
    if (usePages()) {
      // store in the background; the reader never waits for the encoder
      idle(() => { if (closed || !ring.get(n)?.bmp) return; encode(bmp).then((blob) => scoreStore.putPage(scoreStore.pageKey(scoreId, n, bucket), blob, { scoreId, w: bmp.width, h: bmp.height })).then(() => { stats.stored++; }).catch(() => {}); });
    }
    return bmp;
  }
  function renderInto(n) {
    if (ring.has(n)) return ring.get(n).p;
    inflight++;
    const entry = { bmp: null, p: null };
    entry.p = produce(n).then((bmp) => {
      inflight--;
      if (closed || !ring.has(n)) { bmp.close?.(); throw new Error("evicted"); }
      entry.bmp = bmp;
      return bmp;
    }, (e) => { inflight--; ring.delete(n); throw e; });
    ring.set(n, entry);
    return entry.p;
  }
  let warming = false;
  function warm() {
    if (warming || closed) return;
    warming = true;
    idle(() => {
      warming = false;
      if (closed) return;
      const order = [current + 1, current - 1, current + 2, current - 2].filter((n) => n >= 1 && n <= doc.pages && !ring.has(n));
      if (order.length && inflight < 1) renderInto(order[0]).catch(() => {}).finally(warm); // one render at a time: each is a decoded scan plus a page canvas in flight
    });
  }
  return {
    /** The bitmap for page n (rendering or decoding it if needed); makes n the centre of the ring. */
    get(n) {
      if (closed) return Promise.reject(new Error("closed"));
      current = n;
      evict();
      const p = renderInto(n);
      p.then(warm, () => {});
      return p;
    },
    /** Already rendered and resident? (No work started.) */
    has: (n) => !!ring.get(n)?.bmp,
    /** Does this cache write to the persistent tier? (Known after the first render when "auto".) */
    get persisting() { return !!usePages(); },
    stats,
    close() {
      closed = true;
      for (const e of ring.values()) e.bmp?.close?.();
      ring.clear();
    },
  };
}

/**
 * Warm the persistent tier for a big score just imported: the first `count`
 * pages at `width`, in idle time, without holding the bitmaps. Resolves when done.
 */
export async function warmPages(doc, { scoreId, width, dpr = 1, count = 10 }) {
  if (!canPersist()) return 0;
  const bucket = bucketOf(width, dpr);
  let n = 0;
  for (let p = 1; p <= Math.min(count, doc.pages); p++) {
    const key = scoreStore.pageKey(scoreId, p, bucket);
    if (await scoreStore.getPage(key).catch(() => null)) continue;
    await new Promise((r) => idle(r));
    let bmp;
    try { bmp = await doc.render(p, width, dpr); } catch { break; } // out of memory now: the reader renders on demand
    const blob = await encode(bmp);
    bmp.close?.();
    await scoreStore.putPage(key, blob, { scoreId, w: 0, h: 0 });
    n++;
  }
  return n;
}

/** Keep the pages store under budget; `order` = score ids least recently opened first. */
export const trimPages = (order, budget = PAGES_BUDGET) => scoreStore.evictPages(budget, order);
