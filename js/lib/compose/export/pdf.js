// Composition → vector PDF (docs/COMPOSE_DESIGN.md §10.1). `planPages` re-runs the engraver at
// the print staff space for the printable width and pages the systems (a system never splits);
// `renderPdf` paints those pages through pdf-lib. The ink is described once in paint.js — this
// file's PdfPainter is the paper counterpart of the SVG painter: Bravura glyphs are drawn from
// baked outlines (bravura.js) as one form XObject per glyph, words are set in Fraunces (embedded
// subsets), hidden rests and halos are left out, every voice is ink. Pure given the libraries, so
// node tests render real PDFs.
import { layoutComposition, SYS_H, TOP_PAD, BLOCK_H, SYS_GAP } from "../layout.js";
import { paintScore } from "../paint.js";
import { trimBars } from "../engine.js";
import { BRAVURA } from "./bravura.js";

export const PAGES = { letter: { w: 612, h: 792, label: "Letter" }, a4: { w: 595.28, h: 841.89, label: "A4" } };
/** Staff spaces on offer, in mm (1.8 = a 7.2 mm staff, the piano rastral). */
export const STAFF_MM = [1.4, 1.5, 1.6, 1.7, 1.8, 2.0, 2.2, 2.5];
export const MARGINS = { narrow: 10, normal: 15, wide: 20 }; // mm
export const DEFAULTS = { page: "letter", staffMm: 1.8, margins: "normal", header: true };
const PT = 72 / 25.4;
const TITLE_PT = 20, COMPOSER_PT = 12, RUN_PT = 9;
const HEADER_PT = 66, RUN_HEAD_PT = 22; // the room the title block / running head take at the top
const AIR = 3;                          // S of air above a page's first staff (slurs, marks, the 8va of a high note)
// paper line weights in S (Bravura's engraving defaults are of this order; the screen uses fixed CSS px)
const W = { sline: 0.1, "cp-tuplet-line": 0.12, "cp-gliss-line": 0.13, "cp-hairpin": 0.12, "cp-pedal-line": 0.12, "cp-ottava-line": 0.11, "cp-grace-slash": 0.12, "cp-textline": 0.11, "cp-niente": 0.11 };

/** Normalise the sheet's choices. */
export function exportOptions(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!PAGES[o.page]) o.page = DEFAULTS.page;
  if (!STAFF_MM.includes(o.staffMm)) o.staffMm = DEFAULTS.staffMm;
  if (!MARGINS[o.margins]) o.margins = DEFAULTS.margins;
  o.header = !!o.header;
  return o;
}

/**
 * Lay the piece out for paper: { doc, L, S, pages: [{ first, last, top, dy }], page, margin, width, height, opts }.
 * S is the staff space in pt; L is the engraver's layout at that S (coordinates in S); a page's
 * `dy` (S) added to a layout y gives the y on that page, measured from the printable box's top.
 */
export function planPages(doc, opts = {}) {
  const o = exportOptions(opts);
  const pg = PAGES[o.page], margin = MARGINS[o.margins] * PT, S = o.staffMm * PT;
  const width = pg.w - 2 * margin, height = pg.h - 2 * margin;
  const d = trimBars(doc);
  const L = layoutComposition(d, { unit: S, width });
  const n = L.systems.length, availS = height / S;
  const pages = [];
  for (let i = 0; i < n;) {
    const top = (o.header ? (pages.length ? RUN_HEAD_PT : HEADER_PT) : 0) / S + AIR;
    const room = availS - top;
    const k = Math.max(1, 1 + Math.floor((room - BLOCK_H - AIR) / SYS_H)); // systems that fit: the last needs only its block + air
    const last = Math.min(n - 1, i + k - 1);
    pages.push({ first: i, last, top, dy: top - (TOP_PAD + i * SYS_H) });
    i = last + 1;
  }
  return { doc: d, L, S, pages, page: pg, margin, width, height, opts: o };
}

/** Paint a plan into a PDF; resolves to the bytes (Uint8Array). `libs` = { PDFLib, fontkit, fonts: { regular, italic } }. */
export async function renderPdf(plan, { PDFLib, fontkit, fonts }, { title = "", composer = "", now = new Date() } = {}) {
  const { PDFDocument } = PDFLib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(title || "Untitled"); if (composer) pdf.setAuthor(composer);
  pdf.setCreator("Chopinly Compose"); pdf.setProducer("Chopinly (pdf-lib)"); pdf.setCreationDate(now); pdf.setModificationDate(now);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const italic = await pdf.embedFont(fonts.italic, { subset: true });
  const pages = plan.pages.map(() => pdf.addPage([plan.page.w, plan.page.h]));
  const { rgb } = PDFLib, ink = rgb(0, 0, 0);
  const { w: pw, h: ph } = plan.page, m = plan.margin;
  if (plan.opts.header) {
    const t = title || "Untitled";
    pages[0].drawText(t, { x: pw / 2 - regular.widthOfTextAtSize(t, TITLE_PT) / 2, y: ph - m - TITLE_PT, size: TITLE_PT, font: regular, color: ink });
    if (composer) pages[0].drawText(composer, { x: pw - m - italic.widthOfTextAtSize(composer, COMPOSER_PT), y: ph - m - TITLE_PT - COMPOSER_PT - 8, size: COMPOSER_PT, font: italic, color: ink });
    pages.forEach((p, i) => {
      if (i === 0) return;
      p.drawText(t, { x: m, y: ph - m - RUN_PT, size: RUN_PT, font: italic, color: ink });
      const num = String(i + 1);
      p.drawText(num, { x: pw - m - regular.widthOfTextAtSize(num, RUN_PT), y: ph - m - RUN_PT, size: RUN_PT, font: regular, color: ink });
    });
  }
  paintScore(plan.L, new PdfPainter(plan, pdf, pages, { PDFLib, italic, ink }));
  return pdf.save({ useObjectStreams: false }); // plain objects: every viewer, and a byte-level test, can read the page tree
}

/** SVG path data (M L C Q Z, absolute, as fontkit emits) → PDF path operators, y up, in font units × k. */
export function outlineOps(d, k) {
  const t = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const out = []; let i = 0, cmd = null, cx = 0, cy = 0;
  const f = (v) => (v * k).toFixed(3);
  while (i < t.length) {
    if (/[A-Za-z]/.test(t[i])) { cmd = t[i++]; if (cmd === "Z") { out.push("h"); continue; } }
    const n = (j) => Number(t[i + j]);
    if (cmd === "M") { cx = n(0); cy = n(1); out.push(`${f(cx)} ${f(cy)} m`); i += 2; }
    else if (cmd === "L") { cx = n(0); cy = n(1); out.push(`${f(cx)} ${f(cy)} l`); i += 2; }
    else if (cmd === "C") { out.push(`${f(n(0))} ${f(n(1))} ${f(n(2))} ${f(n(3))} ${f(n(4))} ${f(n(5))} c`); cx = n(4); cy = n(5); i += 6; }
    else if (cmd === "Q") { const qx = n(0), qy = n(1), x = n(2), y = n(3); out.push(`${f(cx + (2 / 3) * (qx - cx))} ${f(cy + (2 / 3) * (qy - cy))} ${f(x + (2 / 3) * (qx - x))} ${f(y + (2 / 3) * (qy - y))} ${f(x)} ${f(y)} c`); cx = x; cy = y; i += 4; }
    else throw new Error(`outline: unexpected token ${t[i]}`);
  }
  out.push("f");
  return out.join("\n");
}

class PdfPainter {
  constructor(plan, pdf, pages, { PDFLib, italic, ink }) {
    this.plan = plan; this.S = plan.S; this.pdf = pdf; this.pages = pages; this.P = PDFLib; this.italic = italic; this.ink = ink;
    this.pageOf = []; plan.pages.forEach((p, k) => { for (let i = p.first; i <= p.last; i++) this.pageOf[i] = k; });
    this.skip = 0;          // > 0 inside a hidden group (a hidden rest): nothing is drawn
    this.forms = new Map(); // codepoint → XObject ref (one outline per glyph per document)
    this.names = new Map(); // "page:codepoint" → resource name on that page
  }
  /** Which page a layout y lands on: the system whose band holds it. */
  pageAt(y) { const n = this.pageOf.length; const si = Math.max(0, Math.min(n - 1, Math.floor((y - TOP_PAD + SYS_GAP / 2) / SYS_H))); return this.pageOf[si]; }
  /** Layout (x, y) in S → page space (pt, y up) on page k. */
  pt(x, y, k) { const p = this.plan.pages[k]; return { x: this.plan.margin + x * this.S, y: this.plan.page.h - this.plan.margin - (y + p.dy) * this.S }; }
  /** Layout (x, y) → SVG-space (pt, y down from the page's top-left) for drawSvgPath. */
  sv(x, y, k) { const p = this.plan.pages[k]; return [this.plan.margin + x * this.S, this.plan.margin + (y + p.dy) * this.S]; }
  width(cls) { for (const c of cls.split(" ")) if (W[c]) return W[c] * this.S; return 0.1 * this.S; }
  group(cls) { if (this.skip || /\bcp-hidden\b/.test(cls)) this.skip++; }
  end() { if (this.skip) this.skip--; }
  line(x1, y1, x2, y2, cls) {
    if (this.skip) return;
    const k = this.pageAt(y1);
    this.pages[k].drawLine({ start: this.pt(x1, y1, k), end: this.pt(x2, y2, k), thickness: this.width(cls), color: this.ink, lineCap: this.P.LineCapStyle.Butt });
  }
  rect(x, y, w, h, cls) {
    if (this.skip) return;
    const k = this.pageAt(y);
    const o = this.pt(x, y + h, k); // pdf-lib's rectangle origin is its bottom-left
    this.pages[k].drawRectangle({ x: o.x, y: o.y, width: w * this.S, height: h * this.S, color: this.ink });
  }
  svgPath(segs, k) { return segs.map(([c, ...n]) => c + (n.length ? " " + n.map((v, i) => (i % 2 ? this.sv(0, v, k)[1] : this.sv(v, 0, k)[0]).toFixed(2)).join(" ") : "")).join(" "); }
  polygon(points, cls) {
    if (this.skip) return;
    const k = this.pageAt(points[0][1]);
    const segs = points.map((p, i) => [i ? "L" : "M", ...p]); segs.push(["Z"]);
    this.pages[k].drawSvgPath(this.svgPath(segs, k), { x: 0, y: this.plan.page.h, color: this.ink });
  }
  polyline(points, cls) {
    if (this.skip) return;
    const k = this.pageAt(points[0][1]);
    const dashed = /\bcp-(ottava-line|textline)\b/.test(cls); // the octave line and a text line's dashes are dashed on paper as on screen
    this.pages[k].drawSvgPath(this.svgPath(points.map((p, i) => [i ? "L" : "M", ...p]), k), { x: 0, y: this.plan.page.h, borderColor: this.ink, borderWidth: this.width(cls), borderLineCap: this.P.LineCapStyle.Projecting, ...(dashed ? { borderDashArray: [0.4 * this.S, 0.3 * this.S] } : {}) });
  }
  path(segs, cls) {
    if (this.skip) return;
    const k = this.pageAt(segs[0][2]);
    const stroked = /\bcp-hairpin\b/.test(cls);
    const opts = stroked ? { borderColor: this.ink, borderWidth: this.width(cls), borderLineCap: this.P.LineCapStyle.Round } : { color: this.ink };
    this.pages[k].drawSvgPath(this.svgPath(segs, k), { x: 0, y: this.plan.page.h, ...opts });
  }
  circle() { /* the selection halo: screen only */ }
  /** A glyph's outline as a form XObject, made once per document; named once per page. */
  form(cp, k) {
    const key = `${k}:${cp}`;
    if (this.names.has(key)) return this.names.get(key);
    const g = BRAVURA.glyphs[cp.toString(16)];
    if (!g) throw new Error(`no baked outline for U+${cp.toString(16).toUpperCase()} — run dev/bake-bravura.mjs`);
    let ref = this.forms.get(cp);
    if (!ref) {
      const { PDFName } = this.P;
      const stream = this.pdf.context.flateStream(outlineOps(g.d, 1), { Type: PDFName.of("XObject"), Subtype: PDFName.of("Form"), BBox: g.b });
      ref = this.pdf.context.register(stream); this.forms.set(cp, ref);
    }
    const name = this.pages[k].node.newXObject("Bv", ref);
    this.names.set(key, name);
    return name;
  }
  glyph(x, y, ch, cls, { scale = 1, anchor, rotate, centre } = {}) {
    if (this.skip) return;
    const { pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = this.P;
    const k = this.pageAt(y), kk = (4 * this.S * scale) / BRAVURA.upm; // pt per font unit: an em is 4 S
    const cps = [...ch].map((c) => c.codePointAt(0));
    const glyphs = cps.map((cp) => BRAVURA.glyphs[cp.toString(16)] ?? (() => { throw new Error(`no baked outline for U+${cp.toString(16).toUpperCase()}`); })());
    const advance = glyphs.reduce((n, g) => n + g.a, 0);
    let dx = 0; // shift along the baseline, in font units
    if (centre) dx = -(glyphs[0].b[0] + glyphs[0].b[2]) / 2; // ink-centred on x (the screen measures the same box with canvas)
    else if (anchor === "middle") dx = -advance / 2;
    else if (anchor === "end") dx = -advance;
    const o = this.pt(x, y, k);
    const a = rotate ? (-rotate[0] * Math.PI) / 180 : 0, cos = Math.cos(a), sin = Math.sin(a); // SVG rotates clockwise on screen; page space is y-up
    let pen = dx;
    for (let i = 0; i < cps.length; i++) {
      const ox = o.x + pen * kk * cos, oy = o.y + pen * kk * sin;
      this.pages[k].pushOperators(pushGraphicsState(), concatTransformationMatrix(kk * cos, kk * sin, -kk * sin, kk * cos, ox, oy), drawObject(this.form(cps[i], k)), popGraphicsState());
      pen += glyphs[i].a;
    }
  }
  text(x, y, str, cls, { size, anchor, rotate } = {}) {
    if (this.skip) return;
    const k = this.pageAt(y), pt = size * this.S;
    const o = this.pt(x, y, k);
    const w = this.italic.widthOfTextAtSize(str, pt);
    const dx = anchor === "middle" ? -w / 2 : anchor === "end" ? -w : 0;
    const a = rotate ? (-rotate[0] * Math.PI) / 180 : 0;
    this.pages[k].drawText(str, { x: o.x + dx * Math.cos(a), y: o.y + dx * Math.sin(a), size: pt, font: this.italic, color: this.ink, ...(rotate ? { rotate: this.P.degrees(-rotate[0]) } : {}) });
  }
}
