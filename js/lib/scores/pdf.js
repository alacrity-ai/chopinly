// The renderer (docs/SCORES_DESIGN.md §5). pdf.js is vendored under
// /vendor/pdfjs/ and loaded with a dynamic import the first time a score is
// opened, so the app's first paint owes it nothing. `open(blob)` gives a
// document that renders any page to an ImageBitmap at a CSS width and device
// pixel ratio; the reader and the page cache never touch pdf.js directly.
const BASE = "/vendor/pdfjs/";
let libP = null;

/** Load pdf.js once (idempotent). */
export function load() {
  if (!libP) {
    libP = import(`${BASE}pdf.mjs`).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.mjs`;
      return lib;
    }).catch((e) => { libP = null; throw e; });
  }
  return libP;
}

const explain = (e) => {
  const name = e?.name ?? "";
  if (name === "PasswordException") return "this score is password-protected — Chopinly can't open it";
  if (name === "InvalidPDFException" || name === "FormatError") return "this file isn't a PDF Chopinly can read";
  if (name === "MissingPDFException") return "the file couldn't be read";
  return e?.message ? `couldn't open this PDF (${e.message})` : "couldn't open this PDF";
};

/**
 * Open a PDF blob. Resolves to
 *   { pages, info: { title, author }, size(n), render(n, cssWidth, dpr), close() }
 * Page numbers are 1-based. `render` resolves to an ImageBitmap of the page at
 * exactly cssWidth × dpr device pixels wide, white background, rotation honoured.
 */
export async function open(blob) {
  const lib = await load();
  const data = new Uint8Array(await blob.arrayBuffer());
  let doc;
  try {
    doc = await lib.getDocument({
      data,
      standardFontDataUrl: `${BASE}standard_fonts/`,
      wasmUrl: `${BASE}wasm/`,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
  } catch (e) {
    throw new Error(explain(e));
  }
  let info = { title: "", author: "" };
  try {
    const m = await doc.getMetadata();
    const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    info = { title: clean(m?.info?.Title), author: clean(m?.info?.Author) };
  } catch { /* metadata is optional */ }
  const pageP = new Map();
  const page = (n) => { if (!pageP.has(n)) pageP.set(n, doc.getPage(n)); return pageP.get(n); };
  let closed = false;
  return {
    pages: doc.numPages,
    info,
    /** { w, h } of a page in PDF points at scale 1 (rotation applied). */
    async size(n) {
      const v = (await page(n)).getViewport({ scale: 1 });
      return { w: v.width, h: v.height };
    },
    async render(n, cssWidth, dpr = 1) {
      const p = await page(n);
      const base = p.getViewport({ scale: 1 });
      const vp = p.getViewport({ scale: (cssWidth * dpr) / base.width });
      const w = Math.max(1, Math.round(vp.width)), h = Math.max(1, Math.round(vp.height));
      const off = typeof OffscreenCanvas !== "undefined";
      const canvas = off ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      await p.render({ canvasContext: ctx, viewport: vp, background: "#ffffff" }).promise;
      // WSHED-109: a scanned page is one big decoded image that pdf.js keeps on
      // the page proxy after rendering; 30 turns of a 300-dpi scan held ~1 GB
      // and iOS killed the page. We keep the bitmap we made — pdf.js can let go.
      try { p.cleanup(); } catch { /* a render still in flight keeps it a little longer */ }
      if (closed) { if (!off) { canvas.width = 0; canvas.height = 0; } throw new Error("closed"); }
      if (off) return canvas.transferToImageBitmap(); // the backing store moves into the bitmap; the canvas is empty
      const bmp = await createImageBitmap(canvas);
      canvas.width = 0; canvas.height = 0; // release the copy now, not at the next GC
      return bmp;
    },
    close() { closed = true; try { doc.destroy(); } catch { /* already gone */ } },
  };
}
