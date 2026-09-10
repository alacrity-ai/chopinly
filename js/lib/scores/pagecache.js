// The page cache (docs/SCORES_DESIGN.md §5), stripped to what displaying a
// PDF needs (WSHED-109): the page on screen and the next one, rendered one at
// a time, nothing stored. A page turn is one render (a few hundred ms for a
// 300-dpi scan, less for engraved music) and the look-ahead makes the common
// turn — forward — instant. Nothing else is kept: no ring of bitmaps, no
// encoded copies, no persistent raster tier. Every bitmap this hands out is
// the caller's to close after drawing.
//
// Why so little: a page bitmap at iPad size is ~24 MB of canvas memory, and
// Safari kills a page or fails renders when a page's canvases and bitmaps
// pass a hard budget. Two of them plus one render in flight fits everywhere.

/** iOS / iPadOS: the tightest canvas budget of any browser we run on. */
export const IOS = typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent ?? "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
/** Rendered device pixels are capped here (width); an iPad in portrait is 2048. Past it a scan gains nothing and each bitmap costs 40 MB+. */
export const MAX_RENDER_PX = IOS ? 2048 : 2560;
/** Release a canvas's backing store now instead of at the next GC (WebKit keeps it until then). */
export const releaseCanvas = (c) => { try { c.width = 0; c.height = 0; } catch { /* already gone */ } };

/**
 * @param {{ pages: number, render(n, width, dpr): Promise<ImageBitmap> }} doc
 * @param {{ width: number, dpr?: number }} opts — one CSS width; the reader makes a new cache when the fit changes.
 */
export function createPageCache(doc, { width, dpr = 1 }) {
  let closed = false, chain = Promise.resolve(), next = null; // next: { n, p: Promise<ImageBitmap> }
  const stats = { rendered: 0 };
  /** Renders are serial: each one is a decoded page plus a page-sized canvas in flight, and one of those at a time is the budget. */
  const render = (n) => {
    const run = chain.then(() => { if (closed) throw new Error("closed"); return doc.render(n, width, dpr); }).then((bmp) => { stats.rendered++; return bmp; });
    chain = run.catch(() => {});
    return run;
  };
  const drop = (entry) => { entry?.p.then((b) => b.close?.(), () => {}); };
  return {
    /**
     * The bitmap for page n — the look-ahead if it is that page, else a fresh
     * render. Then the next page starts rendering. The caller owns the bitmap
     * returned: draw it and close it.
     */
    async get(n) {
      if (closed) throw new Error("closed");
      let p;
      if (next?.n === n) { p = next.p; next = null; }
      else { drop(next); next = null; p = render(n); }
      const bmp = await p;
      if (closed) { bmp.close?.(); throw new Error("closed"); }
      if (n + 1 <= doc.pages && !next) { const entry = { n: n + 1, p: render(n + 1) }; next = entry; entry.p.catch(() => { if (next === entry) next = null; }); }
      return bmp;
    },
    stats,
    close() { closed = true; drop(next); next = null; },
  };
}
