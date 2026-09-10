// Writes tests/fixtures/score-12p.pdf: a valid, dependency-free, twelve-page
// PDF for the Scores E2E. Each page says which page it is in Helvetica (not
// embedded — pdf.js serves it from standard_fonts/, which is exactly the path
// a scanned or engraved score without embedded fonts takes) and carries five
// staff lines and a bar of noteheads, so a rendered page has plenty of dark
// pixels to assert on. Title / Author metadata are set so the import prefill
// can be checked.
//   node dev/make-fixture-pdf.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = Number(process.argv[2] ?? 12);
const OUT = join(ROOT, "tests", "fixtures", process.argv[3] ?? "score-12p.pdf");
const W = 595, H = 842; // A4 points

function content(n) {
  const lines = [];
  lines.push("BT /F1 28 Tf 60 770 Td (Fixture Sonata) Tj ET");
  lines.push(`BT /F1 16 Tf 60 745 Td (page ${n} of ${PAGES}) Tj ET`);
  lines.push("0.6 w 0 0 0 RG");
  for (let sys = 0; sys < 6; sys++) {
    const top = 680 - sys * 100;
    for (let i = 0; i < 5; i++) { const y = top - i * 9; lines.push(`60 ${y} m 535 ${y} l S`); }
    lines.push(`60 ${top} m 60 ${top - 36} l S`, `535 ${top} m 535 ${top - 36} l S`);
    for (let b = 1; b < 4; b++) { const x = 60 + b * 118.75; lines.push(`${x} ${top} m ${x} ${top - 36} l S`); }
    for (let k = 0; k < 16; k++) {
      const x = 80 + k * 28, y = top - 4.5 * ((k * 7 + n * 3 + sys) % 9);
      lines.push(`${x - 4} ${y} m ${x - 4} ${y + 2.5} ${x + 4} ${y + 2.5} ${x + 4} ${y} c ${x + 4} ${y - 2.5} ${x - 4} ${y - 2.5} ${x - 4} ${y} c f`);
    }
  }
  return lines.join("\n");
}

const objects = []; // 1-based
const add = (body) => { objects.push(body); return objects.length; };
const catalog = add(null), pagesObj = add(null);
const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const pageIds = [];
for (let n = 1; n <= PAGES; n++) {
  const stream = content(n);
  const c = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`));
}
const info = add(`<< /Title (Fixture Sonata) /Author (Fixtura Testovna) /Producer (Chopinly fixture) >>`);
objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${PAGES} >>`;

let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
const offsets = [];
objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
const xref = Buffer.byteLength(out, "latin1");
out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(out, "latin1"));
console.log(`wrote ${OUT} (${PAGES} pages, ${Buffer.byteLength(out, "latin1")} bytes)`);
