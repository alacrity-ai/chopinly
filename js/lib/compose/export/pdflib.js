// The PDF export's runtime pieces, loaded only when the export sheet opens (docs/COMPOSE_DESIGN.md
// §10.1): pdf-lib + fontkit are vendored UMD bundles (vendor/pdflib/, see dev/vendor-pdflib.mjs) —
// they set window.PDFLib / window.fontkit — and the two static Fraunces faces the words are set in.
// The service worker precaches all four, so the export works offline once the app has been seen.
const BASE = "/vendor/pdflib/";
let libP = null;
const script = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
  const s = document.createElement("script");
  s.src = src; s.async = true;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error(`could not load ${src}`));
  document.head.append(s);
});
const bytes = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`could not load ${url}`); return new Uint8Array(await r.arrayBuffer()); };
/** { PDFLib, fontkit, fonts: { regular, italic } } — cached after the first load; a failed load can be retried. */
export function loadPdfLib() {
  libP ??= (async () => {
    const [, , regular, italic] = await Promise.all([script(`${BASE}pdf-lib.min.js`), script(`${BASE}fontkit.umd.min.js`), bytes("/fonts/Fraunces-Regular.ttf"), bytes("/fonts/Fraunces-Italic.ttf")]);
    if (!window.PDFLib || !window.fontkit) throw new Error("the PDF library did not load");
    return { PDFLib: window.PDFLib, fontkit: window.fontkit, fonts: { regular, italic } };
  })().catch((e) => { libP = null; throw e; });
  return libP;
}
