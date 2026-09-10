// The memory tier of the page cache (docs/SCORES_DESIGN.md §5): a ring of
// rendered ImageBitmaps around the current page, so a turn is a drawImage and
// the renderer works ahead in idle time. Bound to one open document at one
// CSS width; the reader makes a new one when the fit changes. The persistent
// (WebP) tier for big scans arrives in P1 behind the same `get`.
const AHEAD = 2, BEHIND = 2;
const idle = (fn) => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 32));

/**
 * @param {{ pages: number, render(n, width, dpr): Promise<ImageBitmap> }} doc
 * @param {{ width: number, dpr?: number }} opts
 */
export function createPageCache(doc, { width, dpr = 1 }) {
  const ring = new Map();   // n → { bmp | null, p: Promise<bmp> }
  let current = 1, closed = false, inflight = 0;
  const wanted = (n) => n >= current - BEHIND && n <= current + AHEAD;

  function evict() {
    for (const [n, e] of ring) if (!wanted(n) && e.bmp) { e.bmp.close?.(); ring.delete(n); }
  }
  function renderInto(n) {
    if (ring.has(n)) return ring.get(n).p;
    inflight++;
    const entry = { bmp: null, p: null };
    entry.p = doc.render(n, width, dpr).then((bmp) => {
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
      if (order.length && inflight < 2) renderInto(order[0]).catch(() => {}).finally(warm);
    });
  }
  return {
    /** The bitmap for page n (rendering it if needed); makes n the centre of the ring. */
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
    close() {
      closed = true;
      for (const e of ring.values()) e.bmp?.close?.();
      ring.clear();
    },
  };
}
