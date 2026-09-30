// The chord box (WSHED-160): one voicing drawn as an SVG string. Strings run
// top to bottom, the nut (or "5fr") at the top, × and ○ above it. Root tones
// wear the accent so the shape teaches where the root lives. Colors are skin
// tokens set in app.css (.cd-*), so every skin draws it.
import { spellChord, nameInChord, prettyDegree, degreeSemis } from "./theory.js";
import { absFrets, barreSpans, midis } from "./voicings.js";

const S = 10;   // string spacing
const H = 12;   // fret row height
const R = 4.2;  // dot radius

const SEMI_DEGREE = ["1", "♭9", "9", "♭3", "3", "11", "♭5", "5", "♯5", "6", "♭7", "7"];

/**
 * What each sounding string is, musically: [{ pc, name, degree, root }] or null (muted).
 * `rootName` is the spelled root ("E♭"), `bass` the slash bass ({ pc, name }) if any.
 */
export function stringTones(v, inst, rootName, q, bass = null) {
  const spelled = spellChord(rootName, q);
  const rootPc = spelled[0].pc;
  return midis(v, inst).map((m) => {
    if (m === null) return null;
    const pc = m % 12;
    const hit = spelled.find((n) => n.pc === pc);
    const also = !hit && q.also.find((d) => (rootPc + degreeSemis(d)) % 12 === pc);
    const name = hit ? hit.name : bass && bass.pc === pc ? bass.name : nameInChord(pc, spelled);
    const degree = hit ? prettyDegree(hit.degree) : also ? also : SEMI_DEGREE[(pc - rootPc + 12) % 12];
    return { pc, midi: m, name, degree, root: pc === rootPc };
  });
}

/**
 * The SVG. opts: { labels: "fingers" | "notes" | "degrees", lefty, strings (names under the box),
 * title (aria-label) }.
 */
export function chordSVG(v, inst, rootName, q, bass = null, opts = {}) {
  const { labels = "fingers", lefty = false, strings = false, title = "" } = opts;
  const n = inst.tuning.length;
  const rows = Math.max(4, ...v.frets);
  const left = 21, top = 13, right = 5; // the left margin holds "10fr" clear of a barre on the low string
  const width = left + S * (n - 1) + right;
  const bottom = top + H * rows + (strings ? 11 : 4);
  const x = (i) => left + S * (lefty ? n - 1 - i : i);
  const y = (f) => top + H * (f - 0.5);
  const tones = stringTones(v, inst, rootName, q, bass);
  const label = (i) => {
    const t = tones[i];
    if (!t) return "";
    if (labels === "notes") return t.name;
    if (labels === "degrees") return t.degree;
    const f = v.fingers[i];
    return f && f !== 0 ? String(f) : "";
  };
  const txt = (cx, cy, s, cls) => s ? `<text class="${cls}" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${s}</text>` : "";
  const fit = (s) => (s.length > 2 ? " small" : "");
  const out = [];
  // frets + strings
  for (let r = 0; r <= rows; r++) out.push(`<line class="cd-fret" x1="${left}" x2="${left + S * (n - 1)}" y1="${top + H * r}" y2="${top + H * r}"/>`);
  for (let i = 0; i < n; i++) out.push(`<line class="cd-string" x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${top + H * rows}"/>`);
  if (v.baseFret === 1) out.push(`<rect class="cd-nut" x="${left - 0.6}" y="${top - 2.6}" width="${S * (n - 1) + 1.2}" height="2.8" rx="0.6"/>`);
  else out.push(`<text class="cd-base" x="${left - R - 1.6}" y="${y(1)}" text-anchor="end" dominant-baseline="central">${v.baseFret}fr</text>`);
  // above the nut: × muted, ○ open (or its label when labelling notes / degrees)
  for (let i = 0; i < n; i++) {
    const f = v.frets[i], cx = x(i), cy = top - 6.5;
    if (f < 0) out.push(`<path class="cd-mute" d="M${cx - 2.3} ${cy - 2.3}l4.6 4.6M${cx + 2.3} ${cy - 2.3}l-4.6 4.6"/>`);
    else if (f === 0) {
      if (labels === "fingers") out.push(`<circle class="cd-open${tones[i].root ? " root" : ""}" cx="${cx}" cy="${cy}" r="2.6"/>`);
      else out.push(txt(cx, cy, label(i), `cd-open-label${tones[i].root ? " root" : ""}${fit(label(i))}`));
    }
  }
  // barres under the dots
  const spans = barreSpans(v);
  for (const b of spans) {
    const x1 = Math.min(x(b.from), x(b.to)), x2 = Math.max(x(b.from), x(b.to));
    out.push(`<rect class="cd-barre" x="${x1 - R}" y="${y(b.fret) - R}" width="${x2 - x1 + 2 * R}" height="${2 * R}" rx="${R}"/>`);
  }
  // dots (a barred string gets a dot too — it carries the root color and the label)
  for (let i = 0; i < n; i++) {
    const f = v.frets[i];
    if (f <= 0) continue;
    const barre = spans.find((b) => b.fret === f && i >= b.from && i <= b.to && v.fingers[i] === b.finger);
    const cx = x(i), cy = y(f), t = tones[i];
    out.push(`<circle class="cd-dot${t.root ? " root" : ""}" cx="${cx}" cy="${cy}" r="${R}"/>`);
    // a barre's finger is written once, on its leftmost string as drawn
    const s = labels === "fingers" && barre && i !== (lefty ? barre.to : barre.from) ? "" : label(i);
    out.push(txt(cx, cy + 0.2, s, `cd-label${t.root ? " root" : ""}${fit(s)}`));
  }
  if (strings) for (let i = 0; i < n; i++) out.push(`<text class="cd-sname" x="${x(i)}" y="${top + H * rows + 7}" text-anchor="middle" dominant-baseline="central">${inst.strings[i]}</text>`);
  const aria = title || `${rootName}${q.sym}: ${absFrets(v).map((f) => (f < 0 ? "x" : f)).join(" ")}`;
  return `<svg class="cd-svg" viewBox="0 0 ${width} ${bottom}" role="img" aria-label="${aria}">${out.join("")}</svg>`;
}
