// MusicXML 4.0 both ways (docs/COMPOSE_MUSICXML_DESIGN.md, WSHED-119): `toMusicXml` serialises a
// composition part-wise — the model was shaped after MusicXML, so every field has a home — and
// `fromMusicXml` reads a part-wise or time-wise score back into a document that passes `validate`,
// keeping what Compose can hold and refusing, with the bar number, anything that would corrupt a
// bar. Pure — node-testable; the .mxl container is `mxl.js`.
import { PPQ, ticks, capacity, fromTicks, splitRest, groupSize, exprGrid } from "./ticks.js";
import { newComposition, newMeasure, noteEvent, restEvent, barRests, timeAt, shortMetre, keyAt, clefAt, evTicks, voicesOf, tempoOf, validate, eid, DYNAMICS, DYN_VALUES, HAIRPINS, SPAN_KINDS, FINGER_MAX, GRACE_BASES, TREM_MAX, TEXT_MAX, EXPR_Y_MAX, REST_Y_MAX, MAX_VOICES, MIN_TEMPO, MAX_TEMPO, DEFAULT_BARS, LYRIC_MAX, LYRIC_VERSES_MAX, SYLLABICS, nStavesOf, partStart, partOfStaff, partGroup, PART_STAVES_MAX, STAVES_MAX, PARTS_MAX, PART_NAME_MAX, PART_ABBR_MAX } from "./model.js";
import { INSTRUMENTS, partFor, instrumentOf } from "./instruments.js";
import { groupsOf } from "./layout.js";
import { onsets, normalizeBar, cleanTies, cleanExpressions, trimBars, decompose, diatonicOf, MARKS, formMarksOf, quarterBpm, simileTail } from "./engine.js";
import { keyAlterations, CLEFS, parsePitch } from "../music.js";
import { parseXml, child, children, textOf, numOf, esc } from "./xml.js";
import { VERSION } from "../../version.js";
import { xmlKind, qualityFromXml } from "./chordsym.js";

// --- the shared vocabulary ------------------------------------------------------------------
const CLEF_XML = { treble: ["G", 2], soprano: ["C", 1], mezzo: ["C", 2], alto: ["C", 3], tenor: ["C", 4], baritone: ["F", 3], bass: ["F", 4] };
const CLEF_OF = Object.fromEntries(Object.entries(CLEF_XML).map(([k, [s, l]]) => [`${s}${l}`, k]));
const TYPE_OF_BASE = { 0: "breve", 1: "whole", 2: "half", 4: "quarter", 8: "eighth", 16: "16th", 32: "32nd", 64: "64th" };
const BASE_OF_TYPE = Object.fromEntries(Object.entries(TYPE_OF_BASE).map(([b, t]) => [t, Number(b)]));
const ACC_NAME = { "-2": "flat-flat", "-1": "flat", 0: "natural", 1: "sharp", 2: "double-sharp" };
/** Our marks → where they live in <notations> and what they are called. */
const ART_XML = { staccato: ["articulations", "staccato"], accent: ["articulations", "accent"], tenuto: ["articulations", "tenuto"], fermata: ["fermata", null], trill: ["ornaments", "trill-mark"], mordent: ["ornaments", "inverted-mordent"], lowerMordent: ["ornaments", "mordent"], turn: ["ornaments", "turn"], marcato: ["articulations", "strong-accent"], staccatissimo: ["articulations", "staccatissimo"], portato: ["articulations", "detached-legato"], breath: ["articulations", "breath-mark"], caesura: ["articulations", "caesura"], invertedTurn: ["ornaments", "inverted-turn"], delayedTurn: ["ornaments", "delayed-turn"] };
const ART_OF = { staccato: "staccato", staccatissimo: "staccatissimo", accent: "accent", "strong-accent": "marcato", tenuto: "tenuto", "detached-legato": "portato", "breath-mark": "breath", caesura: "caesura", "trill-mark": "trill", "inverted-mordent": "mordent", mordent: "lowerMordent", turn: "turn", "delayed-turn": "delayedTurn", "inverted-turn": "invertedTurn" };
const ACC_MARK = { sharp: 1, flat: -1, natural: 0 }, ACC_MARK_OF = { 1: "sharp", "-1": "flat", 0: "natural" };
/** MusicXML dynamics → ours: the ten levels and five sudden ones as they are, the rest folded in (docs/COMPOSE_RAILS2_DESIGN.md §6). */
const DYN_IN = { ...Object.fromEntries(DYN_VALUES.map((d) => [d, d])), ppppp: "pppp", pppppp: "pppp", fffff: "ffff", ffffff: "ffff", fz: "sfz", rf: "rfz", sffz: "sfz", sfpp: "sfp", pf: "f" };
const UNIT_OF_TYPE = { half: 2, quarter: 4, eighth: 8 }, TYPE_OF_UNIT = { 2: "half", 4: "quarter", 8: "eighth" };
const WEDGE_OF = { cresc: "crescendo", dim: "diminuendo" }, WEDGE_IN = { crescendo: "cresc", diminuendo: "dim" };
const REST_STEP = [2, -2, 4, -4]; // layout.js: where each voice's rests sit when a staff holds several
const TENTHS_PER_STEP = 5; // a staff space is ten tenths; a step is half a space
/** Form (docs/COMPOSE_FORM_DESIGN.md §6): the words of the end marks and the <sound> attribute each carries. */
const JUMP_WORDS = { dc: "D.C.", ds: "D.S.", dcAlFine: "D.C. al Fine", dsAlFine: "D.S. al Fine", dcAlCoda: "D.C. al Coda", dsAlCoda: "D.S. al Coda", fine: "Fine", toCoda: "To Coda" };
const JUMP_SOUND = { dc: 'dacapo="yes"', dcAlFine: 'dacapo="yes"', dcAlCoda: 'dacapo="yes"', ds: 'dalsegno="segno"', dsAlFine: 'dalsegno="segno"', dsAlCoda: 'dalsegno="segno"', fine: 'fine="yes"', toCoda: 'tocoda="coda"' };
const BAR_STYLE = { double: "light-light", final: "light-heavy", repeat: "light-heavy" };
/** The form mark a direction's words name, or null. */
function jumpOfWords(text) {
  const t = String(text).replace(/\./g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const m = /^d ?([cs])( al (fine|coda))?$/.exec(t);
  if (m) return `d${m[1]}${m[3] ? `Al${m[3][0].toUpperCase()}${m[3].slice(1)}` : ""}`;
  if (t === "fine") return "fine";
  if (/^(to|al) coda$/.test(t)) return "toCoda";
  return null;
}
/** The staff step a rest sits on by itself: the middle line (a whole / whole-bar rest hangs from the fourth), shifted per voice when voices share the staff. */
const restAutoStep = (base, wholeBar, nV, vi) => (wholeBar || base <= 1 ? 6 : 4) + (nV > 1 ? REST_STEP[vi] ?? 0 : 0);
/** The letter + octave on a staff step of a clef. */
function pitchOnStep(step, clef) {
  const dia = step + parsePitch(CLEFS[clef].bottom).diatonic;
  return { step: "CDEFGAB"[((dia % 7) + 7) % 7], octave: Math.floor(dia / 7) };
}
const stepOfPitch = (p, clef) => diatonicOf(p) - parsePitch(CLEFS[clef].bottom).diatonic;

// --- export -----------------------------------------------------------------------------------
/** "Composer – Title.musicxml" with nothing a file system minds. */
export const musicXmlFileName = (c) => {
  const raw = [c.composer, c.title].filter(Boolean).join(" – ");
  const clean = raw.replace(/[\\/:*?"<>|]+/g, "-").replace(/[^\P{Cc}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return `${clean || "composition"}.musicxml`;
};
export const MUSICXML_TYPE = "application/vnd.recordare.musicxml+xml";

/** A chord symbol as <harmony> (WSHED-166): root, kind (with the engraved quality as text=), bass. */
const harmonyXml = (x) => `<harmony placement="above"${x.dy ? ` relative-y="${x.dy * TENTHS_PER_STEP}"` : ""}><root><root-step>${x.root.step}</root-step>${x.root.alter ? `<root-alter>${x.root.alter}</root-alter>` : ""}</root><kind text="${esc(x.q)}">${xmlKind(x.q)}</kind>${x.bass ? `<bass><bass-step>${x.bass.step}</bass-step>${x.bass.alter ? `<bass-alter>${x.bass.alter}</bass-alter>` : ""}</bass>` : ""}<staff>${x.staff + 1}</staff></harmony>`;
/**
 * The document as MusicXML 4.0 part-wise text (docs/COMPOSE_MUSICXML_DESIGN.md §1). Trailing
 * empty bars are trimmed like the PDF's. `now` and `software` are injectable for the golden file.
 */
export function toMusicXml(doc, { title = doc.title, subtitle = doc.subtitle ?? "", composer = doc.composer ?? "", now = new Date(), software = `Chopinly ${VERSION}` } = {}) {
  const d = trimBars(doc);
  const out = [];
  const w = (s) => out.push(s);
  const date = now.toISOString().slice(0, 10);
  w('<?xml version="1.0" encoding="UTF-8"?>');
  w('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  w('<score-partwise version="4.0">');
  w(`  <work><work-title>${esc(title || "Untitled")}</work-title></work>`);
  w("  <identification>");
  if (composer) w(`    <creator type="composer">${esc(composer)}</creator>`);
  w(`    <encoding><software>${esc(software)}</software><encoding-date>${date}</encoding-date><supports element="accidental" type="yes"/><supports element="beam" type="no"/><supports element="stem" type="no"/></encoding>`);
  w("  </identification>");
  if (subtitle) w(`  <credit page="1"><credit-type>subtitle</credit-type><credit-words justify="center" valign="top">${esc(subtitle)}</credit-words></credit>`); // WSHED-169
  // the parts (docs/COMPOSE_PARTS_DESIGN.md §4.1): a solo piano writes the part-list it always wrote (the golden file); an ensemble lists every
  // instrument with its abbreviation and sound, bracket groups (§2.2) as <part-group>s — a brace needs none, the part's <staves> does it
  const pid = (p) => `P${p.id.slice(1)}`;
  const solo = d.parts.length === 1 && d.parts[0].instrument === "piano" && !d.parts[0].abbr && d.parts[0].name === "Piano";
  if (solo) w('  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>');
  else {
    const { groups } = groupsOf(d, d.parts.flatMap((p) => Array.from({ length: p.staves }, () => 0)));
    const brackets = groups.filter((g) => g.kind === "bracket" && g.parts.length > 1);
    w("  <part-list>");
    d.parts.forEach((p, pi) => {
      const gi = brackets.findIndex((g) => g.parts[0] === pi);
      if (gi >= 0) w(`    <part-group type="start" number="${gi + 1}"><group-symbol>bracket</group-symbol><group-barline>yes</group-barline></part-group>`);
      const ins = INSTRUMENTS[p.instrument] ?? INSTRUMENTS.other;
      w(`    <score-part id="${pid(p)}"><part-name>${esc(p.name)}</part-name>${p.abbr ? `<part-abbreviation>${esc(p.abbr)}</part-abbreviation>` : ""}<score-instrument id="${pid(p)}-I1"><instrument-name>${esc(ins.name)}</instrument-name>${ins.xml ? `<instrument-sound>${ins.xml}</instrument-sound>` : ""}</score-instrument></score-part>`);
      const ge = brackets.findIndex((g) => g.parts[g.parts.length - 1] === pi);
      if (ge >= 0) w(`    <part-group type="stop" number="${ge + 1}"/>`);
    });
    w("  </part-list>");
  }
  // span stops (hairpins, pedals, octave lines) by the bar they land in
  const stops = d.measures.map(() => []);
  d.measures.forEach((m, bar) => { for (const x of m.expressions ?? []) if (SPAN_KINDS.includes(x.kind)) stops[x.end.bar].push({ at: x.end.at, staff: x.staff, x, from: bar }); });
  // every <staff>, voice and span number is written within the part at hand: `loc(k)` is a flat staff's 1-based number inside its part (set per part below)
  let k0 = 0, nStaves = nStavesOf(d), firstPart = true;
  const loc = (k) => k - k0 + 1, inPart = (k) => k >= k0 && k < k0 + nStaves;
  const ottavaXml = (x, type) => `<direction placement="${x.dir > 0 ? "above" : "below"}"><direction-type><octave-shift type="${type}" size="${x.size ?? 8}" number="1"${type === "stop" ? "" : ry(x)}/></direction-type><staff>${loc(x.staff)}</staff></direction>`; // MusicXML's "down" = written below sounding = 8va
  const pedalXml = (x, type) => `<direction placement="below"><direction-type><pedal type="${type === "start" && x.style === "sost" ? "sostenuto" : type}" ${x.style === "sign" ? 'line="no" sign="yes"' : 'line="yes"'}${type === "stop" ? "" : ry(x)}/></direction-type><staff>${loc(x.staff)}</staff></direction>`; // docs/COMPOSE_RAILS2_DESIGN.md §6
  const textLineXml = (x, type) => (type === "start" ? `<direction placement="below"><direction-type><words${ry(x)}>${esc(x.text)}</words></direction-type><direction-type><dashes type="start" number="${loc(x.staff)}"/></direction-type><staff>${loc(x.staff)}</staff></direction>` : `<direction placement="below"><direction-type><dashes type="stop" number="${loc(x.staff)}"/></direction-type>${x.endText ? `<direction-type><words>${esc(x.endText)}</words></direction-type>` : ""}<staff>${loc(x.staff)}</staff></direction>`);
  // bar repeats (docs/COMPOSE_RAILS2_DESIGN.md §6): a region of % bars opens with measure-repeat start on its first bar and closes on the bar after it
  const simileAttr = d.measures.map(() => "");
  { let open = null; // the n of the open region
    d.measures.forEach((m, b) => {
      const n = m.simile ?? (simileTail(d, b) ? 2 : null);
      if (open !== null && (n === null || (n !== open) || (n === 2 && m.simile === 2 && open === 2 && !simileTail(d, b) && false))) { simileAttr[b] += '<measure-style><measure-repeat type="stop"/></measure-style>'; open = null; }
      if (n !== null && open === null && m.simile !== undefined) { simileAttr[b] += `<measure-style><measure-repeat type="start" slashes="${n}">${n}</measure-repeat></measure-style>`; open = n; }
    });
  }
  const endingEnd = d.measures.map(() => null); // bar → the ending that closes on it
  d.measures.forEach((m) => { if (m.ending) endingEnd[Math.min(m.ending.end, d.measures.length - 1)] = m.ending; });
  const letters = new Map(formMarksOf(d).filter((f) => f.letter).map((f) => [f.x, f.letter]));
  const slurNo = new Map(); // slur id → its number while open
  const freeNo = () => { for (let n = 1; n <= 16; n++) if (![...slurNo.values()].includes(n)) return n; return null; };
  const glissOpen = new Set(); // "staff:voice" whose previous note slid
  const ry = (x) => (x.dy ? ` relative-y="${x.dy * TENTHS_PER_STEP}"` : "");
  const n0 = d.measures[0].short?.from === "end" ? 0 : 1; // a pickup is measure 0, implicit (docs/COMPOSE_DESIGN.md §8.5p); the first full bar is 1
  // one <part> per instrument over its slice of the flat staff array (docs/COMPOSE_PARTS_DESIGN.md §4.1); directions that belong to the score
  // (tempo, rehearsal, signs, jumps) are written on the first part only, as readers apply them score-wide; barlines, repeats, endings and bar
  // repeats are written on every part (every part has its own barline in MusicXML)
  d.parts.forEach((part, pi) => {
  k0 = partStart(d, pi); nStaves = part.staves; firstPart = pi === 0;
  slurNo.clear(); glissOpen.clear();
  w(`  <part id="${pid(part)}">`);
  d.measures.forEach((m, bar) => {
    const time = timeAt(d, bar), cap = capacity(time), key = keyAt(d, bar), keyAlt = keyAlterations(key.fifths);
    w(`    <measure number="${bar + n0}"${m.short?.from === "end" ? ' implicit="yes"' : ""}>`);
    const attrs = [];
    if (bar === 0) attrs.push(`<divisions>${PPQ}</divisions>`);
    if (m.key) attrs.push(`<key><fifths>${m.key.fifths}</fifths></key>`);
    if (m.time) attrs.push(`<time><beats>${m.time.beats}</beats><beat-type>${m.time.unit}</beat-type></time>`);
    if (bar === 0) attrs.push(`<staves>${nStaves}</staves>`); // this part's count
    if (m.clefs) for (let si = k0; si < k0 + nStaves; si++) if (m.clefs[si]) { const [sign, line] = CLEF_XML[m.clefs[si]]; attrs.push(`<clef number="${loc(si)}"><sign>${sign}</sign><line>${line}</line></clef>`); }
    if (simileAttr[bar]) attrs.push(simileAttr[bar]);
    if (attrs.length) w(`      <attributes>${attrs.join("")}</attributes>`);
    const marks = firstPart ? m.form ?? [] : [];
    if (bar === 0 && firstPart && !marks.some((f) => f.kind === "tempo")) { const t = tempoOf(d); w(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${t}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${t}"/></direction>`); }
    // the form (docs/COMPOSE_FORM_DESIGN.md §6): a repeat opening the bar / an ending starting here on the left barline; signs, the rehearsal letter and the tempo at the start; the end marks and the closing barline at the end
    const endingHere = m.ending ? { n: m.ending.n } : null, endingEnds = endingEnd[bar];
    if (m.barline?.start || endingHere) w(`      <barline location="left">${m.barline?.start ? "<bar-style>heavy-light</bar-style>" : ""}${endingHere ? `<ending number="${endingHere.n}" type="start"/>` : ""}${m.barline?.start ? '<repeat direction="forward"/>' : ""}</barline>`);
    for (const f of marks) {
      const dt = (inner) => `<direction placement="above"><direction-type>${inner}</direction-type><staff>1</staff>`;
      if (f.kind === "rehearsal") w(`      ${dt(`<rehearsal>${letters.get(f)}</rehearsal>`)}</direction>`);
      else if (f.kind === "segno") w(`      ${dt("<segno/>")}<sound segno="segno"/></direction>`);
      else if (f.kind === "coda") w(`      ${dt("<coda/>")}<sound coda="coda"/></direction>`);
      else if (f.kind === "tempo") w(`      <direction placement="above">${f.text ? `<direction-type><words>${esc(f.text)}</words></direction-type>` : ""}<direction-type><metronome><beat-unit>${TYPE_OF_UNIT[f.unit?.base ?? 4]}</beat-unit>${f.unit?.dots ? "<beat-unit-dot/>" : ""}<per-minute>${f.bpm}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${Math.round(quarterBpm(f) * 100) / 100}"/></direction>`);
    }
    // accidentals as the engraver draws them: key alterations, then a memory per drawn staff that resets at the barline, in time order across voices
    const memory = m.staves.map(() => new Map());
    const accs = new Map();
    const timed = [];
    m.staves.forEach((s, si) => s.voices.forEach((v, vi) => { if (v) for (const o of onsets(v)) if (o.ev.kind === "note") timed.push({ ev: o.ev, start: o.start, vi, ds: si + (o.ev.cross ?? 0) }); }));
    timed.sort((a, b) => a.start - b.start || a.ds - b.ds || a.vi - b.vi);
    for (const t of timed) accs.set(t.ev, t.ev.pitches.map((p) => {
      const k = p.step + p.octave, mem = memory[t.ds];
      const eff = mem.has(k) ? mem.get(k) : (keyAlt.get(p.step) ?? 0);
      const tiedIn = p.tie === "stop" || p.tie === "both";
      const show = tiedIn ? false : p.acc === "show" ? true : p.acc === "hide" ? false : p.alter !== eff;
      if (show || tiedIn || p.acc === "show") mem.set(k, p.alter);
      return show;
    }));
    // the staff's inserts: clef changes, wedge stops, dynamics, words, wedge starts — in time order, in that order on a tick
    const inserts = m.staves.map(() => []);
    for (const c of m.clefChanges ?? []) { if (!inPart(c.staff)) continue; const [sign, line] = CLEF_XML[c.clef]; inserts[c.staff].push({ at: c.at, rank: 0, xml: `<attributes><clef number="${loc(c.staff)}"><sign>${sign}</sign><line>${line}</line></clef></attributes>` }); }
    for (const s of stops[bar]) if (inPart(s.staff)) inserts[s.staff].push({ at: s.at, rank: 1, xml: s.x.kind === "hairpin" ? `<direction placement="below"><direction-type><wedge type="stop" number="${loc(s.staff)}"/></direction-type><staff>${loc(s.staff)}</staff></direction>` : s.x.kind === "pedal" ? pedalXml(s.x, "stop") : s.x.kind === "textline" ? textLineXml(s.x, "stop") : ottavaXml(s.x, "stop") });
    for (const x of m.expressions ?? []) {
      if (!inPart(x.staff)) continue;
      const st = `<staff>${loc(x.staff)}</staff>`;
      if (x.kind === "dyn") inserts[x.staff].push({ at: x.at, rank: 2, xml: `<direction placement="below"><direction-type><dynamics${ry(x)}><${x.value}/></dynamics></direction-type>${st}</direction>` });
      else if (x.kind === "text") inserts[x.staff].push({ at: x.at, rank: 3, xml: `<direction placement="above"><direction-type><words${ry(x)}>${esc(x.value)}</words></direction-type>${st}</direction>` });
      else if (x.kind === "chord") inserts[x.staff].push({ at: x.at, rank: 3, xml: harmonyXml(x) }); // WSHED-166
      else if (x.kind === "hairpin") inserts[x.staff].push({ at: x.at, rank: 4, xml: `<direction placement="below"><direction-type><wedge type="${WEDGE_OF[x.dir]}" number="${loc(x.staff)}"${x.niente ? ' niente="yes"' : ""}${ry(x)}/></direction-type>${st}</direction>` });
      else if (x.kind === "pedal") inserts[x.staff].push({ at: x.at, rank: 4, xml: pedalXml(x, "start") });
      else if (x.kind === "textline") inserts[x.staff].push({ at: x.at, rank: 4, xml: textLineXml(x, "start") });
      else if (x.kind === "ottava") inserts[x.staff].push({ at: x.at, rank: 4, xml: ottavaXml(x, x.dir > 0 ? "down" : "up") });
    }
    for (const list of inserts) list.sort((a, b) => a.at - b.at || a.rank - b.rank);
    let cursor = 0;
    const move = (to) => { if (to > cursor) w(`      <forward><duration>${to - cursor}</duration></forward>`); else if (to < cursor) w(`      <backup><duration>${cursor - to}</duration></backup>`); cursor = to; };
    const insert = (x) => { const back = cursor; move(x.at); w(`      ${x.xml}`); move(back); };
    m.staves.forEach((s, si) => {
      if (!inPart(si)) return;
      const nV = s.voices.filter(Boolean).length;
      voicesOf(s).forEach(([vi, v], k) => {
        move(0);
        const ins = k === 0 ? inserts[si] : [];
        let ii = 0;
        const line = `${si}:${vi}`, voiceNo = vi + 1 + 4 * (si - k0);
        const wholeBar = v.length === 1 && v[0].kind === "rest";
        const groupEdges = new Map(); // tuplet id → { first, last } indices
        v.forEach((ev, i) => { const g = ev.dur.tuplet?.id; if (!g) return; const e = groupEdges.get(g) ?? { first: i, last: i }; e.last = i; groupEdges.set(g, e); });
        for (const o of onsets(v)) {
          while (ii < ins.length && ins[ii].at <= o.start) insert(ins[ii++]);
          const ev = o.ev, dur = ev.dur, i = v.indexOf(ev);
          const type = `<type>${TYPE_OF_BASE[dur.base]}</type>${"<dot/>".repeat(dur.dots ?? 0)}`;
          const tm = dur.tuplet ? `<time-modification><actual-notes>${dur.tuplet.n}</actual-notes><normal-notes>${dur.tuplet.in}</normal-notes></time-modification>` : "";
          const edge = dur.tuplet ? groupEdges.get(dur.tuplet.id) : null;
          const tupletNot = edge ? `${edge.first === i ? '<tuplet type="start" bracket="yes" show-number="actual"/>' : ""}${edge.last === i ? '<tuplet type="stop"/>' : ""}` : "";
          if (ev.kind === "rest") {
            let display = "";
            if (ev.restY) { const clef = clefAt(d, bar, si, o.start); const p = pitchOnStep(restAutoStep(dur.base, wholeBar, nV, vi) + ev.restY, clef); display = `<display-step>${p.step}</display-step><display-octave>${p.octave}</display-octave>`; }
            const rest = `<rest${wholeBar ? ' measure="yes"' : ""}${display ? `>${display}</rest>` : "/>"}`;
            w(`      <note${ev.hidden ? ' print-object="no"' : ""}>${rest}<duration>${o.len}</duration><voice>${voiceNo}</voice>${wholeBar ? "" : type}${tm}<staff>${loc(si)}</staff>${tupletNot ? `<notations>${tupletNot}</notations>` : ""}</note>`);
          } else {
            const shown = accs.get(ev) ?? [];
            const first = [];
            if (glissOpen.delete(line)) first.push('<glissando type="stop" line-type="wavy"/>');
            for (const x of ev.slurs ?? []) {
              if (x.at === "start") { const n = freeNo(); if (n === null) continue; slurNo.set(x.id, n); first.push(`<slur type="start" number="${n}"/>`); }
              else if (slurNo.has(x.id)) { first.push(`<slur type="stop" number="${slurNo.get(x.id)}"/>`); slurNo.delete(x.id); }
            }
            first.push(tupletNot);
            if (ev.gliss === "start") { first.push('<glissando type="start" line-type="wavy"/>'); glissOpen.add(line); }
            const groups = { articulations: [], ornaments: [] };
            if (ev.gliss === "up" || ev.gliss === "down") groups.articulations.push(ev.gliss === "up" ? "<doit/>" : "<falloff/>"); // an open gliss = MusicXML's indeterminate slide off the note (WSHED-167)
            let fermata = "";
            for (const a of ev.art ?? []) { const [where, name] = ART_XML[a] ?? []; if (!where) continue; if (where === "fermata") fermata = "<fermata/>"; else groups[where].push(`<${name}/>${a === "trill" && ev.trill ? `${ev.trill.alter !== undefined ? `<accidental-mark>${ACC_MARK_OF[ev.trill.alter]}</accidental-mark>` : ""}${ev.trill.line ? '<wavy-line type="start"/><wavy-line type="stop"/>' : ""}` : ""}`); } // a trill's accidental and wavy line ride in the ornaments (docs/COMPOSE_RAILS2_DESIGN.md §6)
            if (fermata) first.push(fermata);
            if (groups.articulations.length) first.push(`<articulations>${groups.articulations.join("")}</articulations>`);
            if (ev.trem) groups.ornaments.push(`<tremolo type="single">${ev.trem}</tremolo>`);
            if (groups.ornaments.length) first.push(`<ornaments>${groups.ornaments.join("")}</ornaments>`);
            for (const g of ev.graces ?? []) g.pitches.forEach((p, pi) => w(`      <note><grace${g.slash ? ' slash="yes"' : ""}/>${pi ? "<chord/>" : ""}<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ""}<octave>${p.octave}</octave></pitch><voice>${voiceNo}</voice><type>${TYPE_OF_BASE[g.base]}</type><staff>${loc(si) + (ev.cross ?? 0)}</staff></note>`)); // docs/COMPOSE_NOTES2_DESIGN.md §7
            const arp = ev.arp ? `<arpeggiate${ev.arp === "plain" ? "" : ` direction="${ev.arp}"`}/>` : "";
            ev.pitches.forEach((p, pi) => {
              const tie = `${p.tie === "stop" || p.tie === "both" ? '<tie type="stop"/>' : ""}${p.tie === "start" || p.tie === "both" ? '<tie type="start"/>' : ""}`;
              const tied = `${p.tie === "stop" || p.tie === "both" ? '<tied type="stop"/>' : ""}${p.tie === "start" || p.tie === "both" ? '<tied type="start"/>' : ""}`;
              const nots = [tied, ...(pi === 0 ? first : []), p.finger ? `<technical><fingering>${p.finger}</fingering></technical>` : "", arp].join("");
              const lyrics = pi === 0 ? (ev.lyrics ?? []).map((l) => `<lyric number="${l.n}"><syllabic>${l.syl ?? "single"}</syllabic><text>${esc(l.text)}</text>${l.ext ? '<extend type="start"/>' : ""}</lyric>`).join("") : ""; // on the chord's first note (docs/COMPOSE_LYRICS_DESIGN.md §1.4)
              w(`      <note>${pi ? "<chord/>" : ""}<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ""}<octave>${p.octave}</octave></pitch><duration>${o.len}</duration>${tie}<voice>${voiceNo}</voice>${type}${shown[pi] ? `<accidental>${ACC_NAME[p.alter]}</accidental>` : ""}${tm}${ev.stem ? `<stem>${ev.stem}</stem>` : ""}<staff>${loc(si) + (ev.cross ?? 0)}</staff>${nots ? `<notations>${nots}</notations>` : ""}${lyrics}</note>`);
            });
          }
          cursor = o.start + o.len;
        }
        while (ii < ins.length) insert(ins[ii++]);
      });
    });
    move(cap);
    for (const f of marks) if (JUMP_WORDS[f.kind]) w(`      <direction placement="above"><direction-type><words>${JUMP_WORDS[f.kind]}</words></direction-type><staff>1</staff><sound ${JUMP_SOUND[f.kind]}/></direction>`);
    if (m.barline?.end || endingEnds) w(`      <barline location="right">${m.barline?.end ? `<bar-style>${BAR_STYLE[m.barline.end]}</bar-style>` : ""}${endingEnds ? `<ending number="${endingEnds.n}" type="${m.barline?.end === "repeat" ? "stop" : "discontinue"}"/>` : ""}${m.barline?.end === "repeat" ? `<repeat direction="backward"${m.barline.times ? ` times="${m.barline.times}"` : ""}/>` : ""}</barline>`);
    w("    </measure>");
  });
  w("  </part>");
  });
  w("</score-partwise>");
  return out.join("\n") + "\n";
}

// --- import -----------------------------------------------------------------------------------
export class ImportError extends Error { constructor(msg) { super(msg); this.name = "ImportError"; } }
const refuse = (msg) => { throw new ImportError(msg); };
const TOL = PPQ / 64; // rounding slack on a file's own divisions

/** The parts of a score with their measures in order, part-wise or time-wise. */
function partsOf(root) {
  if (root.name === "score-partwise") return children(root, "part").map((p) => ({ id: p.attrs.id, measures: children(p, "measure") }));
  if (root.name === "score-timewise") {
    const map = new Map();
    for (const m of children(root, "measure")) for (const p of children(m, "part")) { if (!map.has(p.attrs.id)) map.set(p.attrs.id, { id: p.attrs.id, measures: [] }); map.get(p.attrs.id).measures.push({ ...p, attrs: { ...m.attrs, ...p.attrs } }); }
    return [...map.values()];
  }
  return refuse("not a MusicXML score");
}
const stavesOf = (part) => Math.max(1, ...part.measures.map((m) => numOf(child(m, "attributes"), "staves", 1)));

/**
 * MusicXML text → { doc, warnings } (docs/COMPOSE_MUSICXML_DESIGN.md §2). Throws an ImportError
 * with a sentence when the file cannot become a composition. `id`, `now` and `fileName` are the
 * new composition's; the title and composer come from the file when it has them.
 */
export function fromMusicXml(text, { id = eid(), now = Date.now(), fileName = "", tags = [] } = {}) {
  let root;
  try { root = parseXml(text); } catch (e) { refuse(`that is not readable XML (${e.message})`); }
  const listed = children(child(root, "part-list"), "score-part"); // the score order, with names and sounds
  const parts = partsOf(root).filter((p) => p.measures.length);
  if (!parts.length) refuse("the score has no parts");
  if (parts.length > PARTS_MAX) refuse(`the score has ${parts.length} parts; Compose holds ${PARTS_MAX}`);
  // every part becomes a part (docs/COMPOSE_PARTS_DESIGN.md §4.2), in part-list order; its staves land on the flat staff array in turn
  parts.sort((a, b) => { const ia = listed.findIndex((l) => l.attrs.id === a.id), ib = listed.findIndex((l) => l.attrs.id === b.id); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); });
  const first = new Map();
  const docParts = parts.map((part, pi) => {
    const sp = listed.find((l) => l.attrs.id === part.id), n = stavesOf(part);
    const name = (textOf(sp, "part-name") || `Instrument ${pi + 1}`).replace(/\s+/g, " ").trim().slice(0, PART_NAME_MAX) || `Instrument ${pi + 1}`;
    if (n > PART_STAVES_MAX) refuse(`${name} has ${n} staves; Compose holds ${PART_STAVES_MAX} per instrument`);
    const sound = textOf(child(sp, "score-instrument"), "instrument-sound");
    const key = instrumentOf(sound, name), abbr = (textOf(sp, "part-abbreviation") || "").replace(/\s+/g, " ").trim().slice(0, PART_ABBR_MAX);
    const rec = { ...partFor(key, pi + 1, { staves: n }), name, abbr };
    rec.staves = n; rec.clefs = Array.from({ length: n }, (_, k) => (INSTRUMENTS[key].clefs[k] ?? (k ? "bass" : "treble")));
    first.set(part, [...first.values()].reduce((a, b) => Math.max(a, b.end), 0));
    first.set(part, { start: first.get(part), end: first.get(part) + n });
    return rec;
  });
  const nStaves = [...first.values()].reduce((a, b) => Math.max(a, b.end), 0);
  if (nStaves > STAVES_MAX) refuse(`the score has ${nStaves} staves; Compose holds ${STAVES_MAX}`);
  const used = parts;
  const ourStaff = (part, xs) => { const f = first.get(part); return xs >= 1 && xs <= f.end - f.start ? f.start + xs - 1 : -1; };
  const nBars = Math.max(...used.map((p) => p.measures.length));
  if (!nBars) refuse("the score has no bars");
  const warnings = new Set();
  const title = textOf(child(root, "work"), "work-title") || textOf(root, "movement-title") || fileName.replace(/\.(musicxml|xml|mxl)$/i, "").trim() || "Untitled";
  const composer = children(child(root, "identification"), "creator").find((c) => c.attrs.type === "composer")?.text ?? "";
  const subtitle = (children(root, "credit").find((c) => textOf(c, "credit-type") === "subtitle") ? textOf(children(root, "credit").find((c) => textOf(c, "credit-type") === "subtitle"), "credit-words") : textOf(root, "movement-title") && textOf(child(root, "work"), "work-title") && textOf(root, "movement-title") !== textOf(child(root, "work"), "work-title") ? textOf(root, "movement-title") : "").replace(/\s+/g, " ").trim().slice(0, 80); // WSHED-169
  let tempo = null;
  const accSupported = children(child(child(root, "identification"), "encoding"), "supports").some((x) => x.attrs.element === "accidental" && x.attrs.type === "yes");

  // pass 1: every bar of every used part → records with tick positions
  const bars = Array.from({ length: nBars }, () => ({ key: null, time: null, clefs: {}, clefChanges: [], notes: [], dirs: [], len: 0, implicit: false, barline: {}, endingStart: null, endingStop: false, form: [], simileStart: null, simileStop: false }));
  const state = new Map(used.map((p) => [p, { div: 1 }]));
  // lyrics (docs/COMPOSE_LYRICS_DESIGN.md §1.4): a <lyric number="…"> names a verse; a numeric number is the verse, a word
  // ("verse1", Sibelius) takes the next free verse on that staff; verses past LYRIC_VERSES_MAX are dropped with one warning
  const verseNames = new Map(); // "staff:number" → verse
  const verseOf = (si, number) => {
    const key = `${si}:${number}`;
    if (verseNames.has(key)) return verseNames.get(key);
    const numeric = /^\d+$/.test(number) ? parseInt(number, 10) : null;
    let n = numeric;
    if (n === null) { const taken = [...verseNames].filter(([k]) => k.startsWith(`${si}:`)).map(([, v]) => v); n = 1; while (taken.includes(n)) n++; }
    verseNames.set(key, n);
    return n;
  };
  const lyricsOf = (el, si) => {
    const out = [];
    for (const ly of children(el, "lyric")) {
      const texts = children(ly, "text").map((t) => t.text.replace(/\s+/g, " ").trim()).filter(Boolean);
      if (!texts.length) continue;
      const n = verseOf(si, ly.attrs.number ?? "1");
      if (n > LYRIC_VERSES_MAX) { warnings.add(`verses past ${LYRIC_VERSES_MAX} were dropped`); continue; }
      if (out.some((l) => l.n === n)) continue;
      const elision = children(ly, "elision")[0]?.text?.trim() || " "; // two syllables on one note join with the file's elision mark (no elision model this round)
      const text = texts.join(elision).slice(0, LYRIC_MAX);
      const syl = textOf(ly, "syllabic", "single"), ext = children(ly, "extend").some((x) => !x.attrs.type || x.attrs.type === "start");
      out.push({ n, text, ...(SYLLABICS.includes(syl) && syl !== "single" ? { syl } : {}), ...(ext ? { ext: true } : {}) });
    }
    return out.sort((a, b) => a.n - b.n);
  };
  let time = null; // the time signature in force (the file's, persisted)
  const timeOf = (bi) => { for (let b = Math.min(bi, bars.length - 1); b >= 0; b--) if (bars[b].time) return bars[b].time; return { beats: 4, unit: 4 }; };
  for (const part of used) {
    const st = state.get(part), slurOpen = new Map();
    part.measures.forEach((mx, bi) => {
      const bar = bars[bi];
      if (mx.attrs.implicit === "yes") bar.implicit = true;
      let cursor = 0, last = null; // `last`: the previous note record, for <chord/>
      const pendingGraces = new Map(); // "voice:staff" → graces waiting for the next note of that voice (docs/COMPOSE_NOTES2_DESIGN.md §7)
      let lastGrace = null;
      const scale = (n) => (n * PPQ) / st.div;
      for (const el of mx.children) {
        if (el.name === "attributes") {
          const dv = numOf(el, "divisions"); if (dv > 0) st.div = dv;
          if (child(el, "transpose") && numOf(child(el, "transpose"), "chromatic", 0)) warnings.add("transposing parts were read at their written pitch"); // concert pitch only this round (docs/COMPOSE_PARTS_DESIGN.md §7)
          const k = child(el, "key"); if (k) { const f = numOf(k, "fifths"); if (f !== null && bar.key === null) bar.key = Math.max(-7, Math.min(7, Math.round(f))); }
          if (part === used[0]) for (const ms of children(el, "measure-style")) for (const mr of children(ms, "measure-repeat")) { if (mr.attrs.type === "stop") bar.simileStop = true; else { const n = parseInt(mr.text || mr.attrs.slashes || "1", 10); bar.simileStart = n === 2 ? 2 : 1; } } // docs/COMPOSE_RAILS2_DESIGN.md §6
          const t = child(el, "time"); if (t) { if (child(t, "senza-misura")) refuse(`bar ${bi + 1}: unmeasured time`); const beats = children(t, "beats").reduce((n, b) => n + b.text.split("+").reduce((s, x) => s + (Number(x) || 0), 0), 0); const unit = numOf(t, "beat-type", 4); if (!(beats > 0 && [1, 2, 4, 8, 16, 32].includes(unit))) refuse(`bar ${bi + 1}: time signature ${beats}/${unit}`); bar.time = { beats, unit }; time = bar.time; }
          for (const c of children(el, "clef")) {
            const si = ourStaff(part, Number(c.attrs.number ?? 1)); if (si < 0) continue;
            const sign = textOf(c, "sign"), line = numOf(c, "line", sign === "G" ? 2 : sign === "F" ? 4 : 3), clef = CLEF_OF[`${sign}${line}`];
            if (!clef) { if (sign === "percussion" || sign === "TAB") refuse(`bar ${bi + 1}: a ${sign} clef`); warnings.add(`an unknown clef read as treble`); }
            if (child(c, "clef-octave-change")) warnings.add("octave clefs read as plain clefs");
            const name = clef ?? "treble";
            if (cursor <= 0) bar.clefs[si] = name; else bar.clefChanges.push({ staff: si, at: Math.round(cursor), clef: name });
          }
        } else if (el.name === "note") {
          if (child(el, "grace")) {
            const gp = child(el, "pitch"), gsi = ourStaff(part, numOf(el, "staff", 1)), gbase = BASE_OF_TYPE[textOf(el, "type", "eighth")];
            if (!gp || gsi < 0 || !GRACE_BASES.includes(gbase) || child(el, "unpitched")) { warnings.add("some grace notes were skipped"); continue; }
            const pitch = { step: textOf(gp, "step"), alter: numOf(gp, "alter", 0), octave: numOf(gp, "octave", 4) };
            if (!/^[A-G]$/.test(pitch.step) || !Number.isInteger(pitch.alter) || Math.abs(pitch.alter) > 2 || !Number.isInteger(pitch.octave)) { warnings.add("some grace notes were skipped"); continue; }
            if (child(el, "chord") && lastGrace) { lastGrace.pitches.push(pitch); continue; }
            const key = `${numOf(el, "voice", 1)}:${gsi}`, g = { base: gbase, pitches: [pitch], ...(child(el, "grace").attrs.slash === "yes" ? { slash: true } : {}) };
            pendingGraces.set(key, [...(pendingGraces.get(key) ?? []), g]); lastGrace = g;
            continue;
          }
          lastGrace = null;
          const durX = numOf(el, "duration"); if (durX === null) refuse(`bar ${bi + 1}: a note without a duration`);
          const dur = scale(durX);
          const chord = !!child(el, "chord"), restEl = child(el, "rest");
          const si = ourStaff(part, numOf(el, "staff", 1));
          if (child(el, "unpitched")) { warnings.add("unpitched notes skipped"); if (!chord) cursor += dur; continue; }
          if (si < 0) { if (!chord) cursor += dur; continue; } // a staff we do not carry (an organ pedal)
          const pitchEl = child(el, "pitch");
          const pitch = pitchEl ? { step: textOf(pitchEl, "step"), alter: numOf(pitchEl, "alter", 0), octave: numOf(pitchEl, "octave", 4) } : null;
          if (pitch) { if (!/^[A-G]$/.test(pitch.step) || !Number.isInteger(pitch.alter) || Math.abs(pitch.alter) > 2 || !Number.isInteger(pitch.octave)) refuse(`bar ${bi + 1}: a pitch Compose cannot spell`); for (const t of children(el, "tie")) pitch.tie = pitch.tie && pitch.tie !== t.attrs.type ? "both" : t.attrs.type; if (child(el, "accidental")) pitch.accShown = true; }
          const not = child(el, "notations");
          if (pitch) for (const t of children(not, "tied")) if (t.attrs.type === "start" || t.attrs.type === "stop") pitch.tie = pitch.tie && pitch.tie !== t.attrs.type ? "both" : t.attrs.type;
          if (pitch) { const fg = parseInt(textOf(child(not, "technical"), "fingering"), 10); if (fg >= 1 && fg <= FINGER_MAX) pitch.finger = fg; } // docs/COMPOSE_PIANO_DESIGN.md §8
          if (chord && last && pitch) { last.pitches.push(pitch); if (children(not, "arpeggiate").length && !last.arp) last.arp = children(not, "arpeggiate")[0].attrs.direction ?? "plain"; for (const l of lyricsOf(el, si)) if (!last.lyrics.some((o) => o.n === l.n)) last.lyrics.push(l); continue; } // a syllable on a chord's later note counts for the chord
          if (!pitch && !restEl) { if (!chord) cursor += dur; continue; }
          const voiceNo = numOf(el, "voice", 1);
          const rec = { part, voiceNo, si, onset: cursor, dur, kind: pitch ? "note" : "rest", pitches: pitch ? [pitch] : null, type: textOf(el, "type", ""), dots: children(el, "dot").length, tm: null, tStart: false, tStop: false, slurs: [], gliss: false, art: [], arp: null, trem: null, graces: null, hidden: el.attrs["print-object"] === "no", display: null, wholeBar: restEl?.attrs.measure === "yes", lyrics: pitch ? lyricsOf(el, si) : [] };
          if (pitch) { const gk = `${voiceNo}:${si}`; if (pendingGraces.has(gk)) { rec.graces = pendingGraces.get(gk); pendingGraces.delete(gk); } }
          const tm = child(el, "time-modification"); if (tm) rec.tm = { n: numOf(tm, "actual-notes", 1), in: numOf(tm, "normal-notes", 1) };
          if (restEl && child(restEl, "display-step")) rec.display = { step: textOf(restEl, "display-step"), octave: numOf(restEl, "display-octave", 4) };
          for (const t of children(not, "tuplet")) { if (t.attrs.type === "start") rec.tStart = true; if (t.attrs.type === "stop") rec.tStop = true; }
          for (const s of children(not, "slur")) {
            const n = s.attrs.number ?? "1";
            if (s.attrs.type === "start") { const sid = `s${eid()}`; slurOpen.set(n, sid); rec.slurs.push({ id: sid, at: "start" }); }
            else if (s.attrs.type === "stop" && slurOpen.has(n)) { rec.slurs.push({ id: slurOpen.get(n), at: "stop" }); slurOpen.delete(n); }
          }
          for (const g of [...children(not, "glissando"), ...children(not, "slide")]) if (g.attrs.type === "start") rec.gliss = true;
          for (const a of child(not, "articulations")?.children ?? []) if (a.name === "doit" || a.name === "falloff") rec.gliss = a.name === "doit" ? "up" : "down"; // an open gliss (WSHED-167)
          for (const grp of ["articulations", "ornaments"]) for (const a of child(not, grp)?.children ?? []) {
            if (a.name === "tremolo") { const n = parseInt(a.text, 10); if ((a.attrs.type ?? "single") === "single" && n >= 1 && n <= TREM_MAX) rec.trem = n; else warnings.add("a two-note tremolo was skipped"); continue; }
            if (a.name === "wavy-line") { if (a.attrs.type === "start") rec.trillLine = true; continue; } // a trill's extension (only with a trill mark — a bare wavy line is dropped)
            if (a.name === "accidental-mark") { if (ACC_MARK[a.text] !== undefined) rec.trillAlter = ACC_MARK[a.text]; continue; }
            const m = ART_OF[a.name]; if (m && !rec.art.includes(m)) rec.art.push(m);
          }
          if (children(not, "fermata").length) rec.art.push("fermata");
          const arp = children(not, "arpeggiate")[0]; if (arp) rec.arp = arp.attrs.direction === "up" || arp.attrs.direction === "down" ? arp.attrs.direction : "plain";
          bar.notes.push(rec);
          last = rec;
          cursor += dur;
        } else if (el.name === "backup") { cursor = Math.max(0, cursor - scale(numOf(el, "duration", 0))); last = null; }
        else if (el.name === "forward") { cursor += scale(numOf(el, "duration", 0)); last = null; }
        else if (el.name === "direction") {
          const si = ourStaff(part, numOf(el, "staff", 1));
          const at = cursor + scale(numOf(el, "offset", 0));
          const ry = Number(child(el, "direction-type")?.children[0]?.attrs["relative-y"] ?? 0);
          const dy = Math.max(-EXPR_Y_MAX, Math.min(EXPR_Y_MAX, Math.round(ry / TENTHS_PER_STEP)));
          const snd0 = child(el, "sound"), dts = children(el, "direction-type").flatMap((dt) => dt.children);
          const metro = dts.find((x) => x.name === "metronome"), pm = metro ? numOf(metro, "per-minute") : (snd0?.attrs.tempo ? Number(snd0.attrs.tempo) : null);
          const wordsEl = dts.find((x) => x.name === "words"), jump = wordsEl ? jumpOfWords(wordsEl.text) : snd0?.attrs.dacapo ? "dc" : snd0?.attrs.dalsegno ? "ds" : snd0?.attrs.tocoda ? "toCoda" : snd0?.attrs.fine ? "fine" : null;
          const addForm = (f) => { if (part === used[0] && !bar.form.some((o) => o.kind === f.kind)) bar.form.push(f); };
          if (dts.some((x) => x.name === "segno")) addForm({ kind: "segno" });
          if (dts.some((x) => x.name === "coda")) addForm({ kind: "coda" });
          { const rh = dts.find((x) => x.name === "rehearsal"); if (rh) { const t = rh.text.replace(/\s+/g, " ").trim(); addForm({ kind: "rehearsal", ...(/^[A-Z]{1,2}$/.test(t) || !t ? {} : /^\d+$/.test(t) ? { style: "number" } : { text: t.slice(0, 12) }) }); } } // letters stay automatic; numbers a style; anything else a word
          if (pm > 0) { // a metronome mark: the piece's tempo when it is the first thing said, a tempo mark on its bar otherwise (or when it has a word); its beat unit rides along (docs/COMPOSE_RAILS2_DESIGN.md §6)
            const bpm = Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Math.round(pm)));
            const ub = metro ? UNIT_OF_TYPE[textOf(metro, "beat-unit", "quarter")] : 4, ud = metro ? Math.min(1, children(metro, "beat-unit-dot").length) : 0;
            const unit = ub && (ub !== 4 || ud) ? { base: ub, dots: ud } : null;
            if (metro && !ub) warnings.add("a tempo's beat unit was read as a quarter");
            const word = wordsEl && !jump ? wordsEl.text.replace(/\s+/g, " ").trim().slice(0, 20) : "";
            if (tempo === null) tempo = unit ? quarterBpm({ bpm, unit }) : bpm;
            if (word || bi > 0 || unit || bar.form.some((f) => f.kind === "tempo")) addForm({ kind: "tempo", bpm, ...(word ? { text: word } : {}), ...(unit ? { unit } : {}) });
            continue;
          }
          if (jump) { addForm({ kind: jump }); continue; }
          { const dashes = dts.find((x) => x.name === "dashes"); // a dashed text line: the words of its direction belong to it, not to a text mark
            if (dashes && si >= 0) {
              const w = wordsEl ? wordsEl.text.replace(/\s+/g, " ").trim().slice(0, TEXT_MAX) : "";
              if (dashes.attrs.type === "start" && w) { bar.dirs.push({ kind: "textline", si, at, type: "start", number: dashes.attrs.number ?? "1", text: w, dy }); continue; }
              if (dashes.attrs.type === "stop") { bar.dirs.push({ kind: "textline", si, at, type: "stop", number: dashes.attrs.number ?? "1", endText: w || null, dy }); continue; }
            } }
          for (const dt of children(el, "direction-type")) for (const x of dt.children) {
            if (x.name === "dynamics") { const v = DYN_IN[x.children[0]?.name]; if (v && si >= 0) bar.dirs.push({ kind: "dyn", si, at, value: v, dy }); }
            else if (x.name === "words") { const v = x.text.replace(/\s+/g, " ").trim().slice(0, TEXT_MAX); if (v && si >= 0) bar.dirs.push({ kind: "text", si, at, value: v, dy }); }
            else if (x.name === "wedge") { if (si >= 0) bar.dirs.push({ kind: "wedge", si, at, type: x.attrs.type, number: x.attrs.number ?? "1", dy, niente: x.attrs.niente === "yes" }); }
            else if (x.name === "pedal") { if (si >= 0 && ["start", "stop", "change", "sostenuto"].includes(x.attrs.type)) bar.dirs.push({ kind: "pedal", si, at, type: x.attrs.type === "sostenuto" ? "start" : x.attrs.type, number: x.attrs.number ?? "1", dy, style: x.attrs.type === "sostenuto" ? "sost" : x.attrs.line === "no" ? "sign" : null }); }
            else if (x.name === "octave-shift") { if (si >= 0 && ["up", "down", "stop"].includes(x.attrs.type)) { const size = x.attrs.size === "15" ? 15 : 8; if (x.attrs.size && x.attrs.size !== "8" && x.attrs.size !== "15") warnings.add("a 22ma line was read as 15ma"); bar.dirs.push({ kind: "ottava", si, at, type: x.attrs.type, number: x.attrs.number ?? "1", dy, size: x.attrs.size && x.attrs.size !== "8" ? Math.max(size, 15) : 8 }); } }
          }
        } else if (el.name === "sound") { if (el.attrs.tempo && tempo === null) tempo = Number(el.attrs.tempo); }
        else if (el.name === "barline") { // form: barlines, repeats, endings (from the part that gives us staves)
          if (part !== used[0]) continue;
          const loc = el.attrs.location ?? "right", style = textOf(el, "bar-style"), rep = child(el, "repeat")?.attrs.direction, end = child(el, "ending");
          if (rep === "forward") bar.barline.start = "repeat";
          else if (rep === "backward") { bar.barline.end = "repeat"; const tm = parseInt(child(el, "repeat").attrs.times, 10); if (tm >= 3 && tm <= 9) bar.barline.times = tm; }
          else if (loc === "right" && style === "light-light") bar.barline.end = "double";
          else if (loc === "right" && (style === "light-heavy" || style === "heavy-heavy")) bar.barline.end = "final";
          if (end) { const n = parseInt(end.attrs.number, 10); if (end.attrs.type === "start" && n >= 1) bar.endingStart = Math.min(n, 9); else if (end.attrs.type === "stop" || end.attrs.type === "discontinue") bar.endingStop = true; }
        }
        else if (el.name === "harmony") { // a chord symbol (WSHED-166) on its staff at the cursor (+ offset)
          const si = ourStaff(part, numOf(el, "staff", 1)), rootEl = child(el, "root"), kindEl = child(el, "kind");
          const step = textOf(rootEl, "root-step"), alter = numOf(rootEl, "root-alter", 0), bassEl = child(el, "bass");
          if (si >= 0 && /^[A-G]$/.test(step) && Number.isInteger(alter) && Math.abs(alter) <= 2 && kindEl?.text !== "none") {
            const bstep = textOf(bassEl, "bass-step"), balter = numOf(bassEl, "bass-alter", 0);
            const ryv = Number(el.attrs["relative-y"] ?? 0), dyv = Math.max(-EXPR_Y_MAX, Math.min(EXPR_Y_MAX, Math.round(ryv / TENTHS_PER_STEP)));
            bar.dirs.push({ kind: "chord", si, at: cursor + scale(numOf(el, "offset", 0)), root: { step, alter }, q: qualityFromXml(kindEl?.text?.trim() ?? "major", kindEl?.attrs.text), ...(/^[A-G]$/.test(bstep) && Math.abs(balter) <= 2 ? { bass: { step: bstep, alter: balter } } : {}), dy: dyv });
          } else if (si >= 0) warnings.add("a chord symbol Compose cannot spell was skipped");
        }
        else if (el.name === "figured-bass") warnings.add("figured bass ignored");
        bar.len = Math.max(bar.len, cursor);
      }
      if (pendingGraces.size) warnings.add("a grace note with no note after it was dropped");
    });
  }
  // pass 2: each voice's home staff per bar, and a stable voice index per staff across the piece
  const homes = bars.map((bar) => {
    const byVoice = new Map();
    for (const r of bar.notes) { const k = `${r.part.id}:${r.voiceNo}`; if (!byVoice.has(k)) byVoice.set(k, { key: k, recs: [], count: Array.from({ length: nStaves }, () => 0) }); const g = byVoice.get(k); g.recs.push(r); if (r.kind === "note" || !g.recs.some((o) => o.kind === "note")) g.count[r.si] += r.kind === "note" ? 1 : 0.01; }
    // home: where most of the voice's notes sit; a tie goes by the piano convention (voices 1–4 upper, 5–8 lower …) when the part has several staves, else the first note's staff
    for (const g of byVoice.values()) {
      const f = first.get(g.recs[0].part), n = f.end - f.start;
      let best = -1, bestN = -1, tie = false;
      for (let k = f.start; k < f.end; k++) { if (g.count[k] > bestN) { bestN = g.count[k]; best = k; tie = false; } else if (g.count[k] === bestN && bestN > 0) tie = true; }
      g.home = tie && n > 1 ? f.start + Math.min(n - 1, Math.floor((g.recs[0].voiceNo - 1) / 4)) : best >= 0 && bestN > 0 ? best : g.recs[0].si;
    }
    return byVoice;
  });
  const ranks = Array.from({ length: nStaves }, () => new Map());
  for (const byVoice of homes) for (const g of byVoice.values()) if (!ranks[g.home].has(g.key)) ranks[g.home].set(g.key, ranks[g.home].size);
  for (let si = 0; si < nStaves; si++) if (ranks[si].size > MAX_VOICES) refuse(`staff ${si + 1} has ${ranks[si].size} voices; Compose holds ${MAX_VOICES}`);
  // pass 3: the bars
  const measures = [];
  const doc0 = { measures, parts: docParts };
  const spanOpen = new Map(); // "kind:si:number" → { bar, at, kind, dir, dy, staff } while a hairpin / pedal / octave line is open
  const late = new Map(); // bar → expressions that snapped past the bar being built (they land when that bar is made; past the last bar, in the bar added after it)
  const putAt = (bar, x) => { if (bar < measures.length) { const tm = measures[bar]; tm.expressions = [...(tm.expressions ?? []), x]; } else late.set(bar, [...(late.get(bar) ?? []), x]); };
  let openEnding = null; // { n, first } while an ending bracket is open
  let openSimile = null, simileK = 0; // a measure-repeat region: its n, and how many bars of it have been made
  bars.forEach((bar, bi) => {
    const m = newMeasure(nStaves, timeOf(bi));
    const t = timeOf(bi), cap = capacity(t);
    if (bar.simileStop) openSimile = null;
    if (bar.simileStart) { openSimile = bar.simileStart; simileK = 0; }
    const inSimile = openSimile !== null && bi >= openSimile && capacity(timeOf(bi - openSimile)) === cap;
    if (openSimile !== null && !inSimile) { warnings.add("a bar repeat with nothing to repeat was read as rests"); openSimile = null; }
    if (inSimile && (openSimile === 1 || simileK % 2 === 0)) m.simile = openSimile;
    if (inSimile) simileK++;
    if (bi === 0) { m.key = { fifths: bar.key ?? 0 }; m.time = { ...t }; m.clefs = {}; docParts.forEach((p, pi) => p.clefs.forEach((c, k) => { const si = partStart(doc0, pi) + k; m.clefs[si] = bar.clefs[si] ?? c; p.clefs[k] = m.clefs[si]; })); } // the part's defaults become the first bar's clefs
    else { if (bar.key !== null && bar.key !== keyAt(doc0, bi - 1).fifths) m.key = { fifths: bar.key }; if (bar.time) m.time = { ...bar.time }; for (let si = 0; si < nStaves; si++) if (bar.clefs[si] && bar.clefs[si] !== clefAt(doc0, bi - 1, si, Infinity)) m.clefs = { ...(m.clefs ?? {}), [si]: bar.clefs[si] }; }
    if (bar.barline.start || bar.barline.end) m.barline = { ...bar.barline };
    if (bar.form.length) m.form = [...bar.form].sort((a, b) => a.kind.localeCompare(b.kind));
    if (bar.endingStart) { openEnding = { n: bar.endingStart, first: bi }; m.ending = { n: bar.endingStart, end: bi }; }
    else if (openEnding) measures[openEnding.first].ending.end = bi; // an ending runs until it is stopped
    if (openEnding && bar.endingStop) openEnding = null;
    measures.push(m);
    for (const x of late.get(bi) ?? []) putAt(bi, x);
    late.delete(bi);
    if (bar.len > cap + TOL) refuse(`bar ${bi + 1} holds more than its ${t.beats}/${t.unit}`);
    // a bar every voice leaves short is a short bar (§8.5p): a pickup (the first, or one the file marks implicit) counts from the
    // barline that follows, any other closes a section; only a bar within a grid step of full is padded as before
    let shift = 0, tb = t;
    if (bar.len < cap - TOL) {
      const grid = exprGrid(t), len = Math.ceil((bar.len - TOL) / grid) * grid;
      if (len >= grid && len < cap) { m.short = { len, from: bi === 0 || bar.implicit ? "end" : "start" }; tb = shortMetre(t, m.short); if (m.short.from === "end") shift = len - bar.len; }
      else if (bi === 0) { shift = cap - bar.len; warnings.add("the pickup bar was filled from the front"); }
    }
    const g = exprGrid(t), tcap = capacity(tb); // a mid-bar clef lands on the half-beat slot at or before its note (WSHED-168)
    for (const c of bar.clefChanges) { const at = Math.min(tcap - g, Math.max(0, Math.floor((c.at + shift + TOL) / g) * g)); if (at === 0) { if (bi === 0 || c.clef !== clefAt(doc0, bi - 1, c.staff, Infinity)) m.clefs = { ...(m.clefs ?? {}), [c.staff]: c.clef }; } else if (!m.clefChanges?.some((o) => o.staff === c.staff && o.at === at)) m.clefChanges = [...(m.clefChanges ?? []), { staff: c.staff, at, clef: c.clef }]; }
    if (m.clefChanges) m.clefChanges.sort((a, b) => a.at - b.at || a.staff - b.staff);
    // voices
    const present = Array.from({ length: nStaves }, () => []);
    for (const grp of homes[bi].values()) present[grp.home][ranks[grp.home].get(grp.key)] = grp;
    for (let si = 0; si < nStaves; si++) {
      const nV = present[si].filter(Boolean).length;
      const voices = inSimile ? [barRests(t)] : present[si].map((grp, vi) => (grp ? buildVoice(grp, si, vi, nV, bi, tb, shift, doc0, refuse) : null)); // a % bar's own notes are the bar before's: it holds rests
      if (!voices[0]) voices[0] = barRests(tb);
      while (voices.length > 1 && !voices[voices.length - 1]) voices.pop();
      m.staves[si].voices = voices;
    }
    resolveAccidentals(m, keyAt(doc0, bi).fifths, accSupported);
    // directions → expressions
    // a direction at the very end of a bar belongs to the next bar's first slot (a span's stop at the end of the last bar lands in the bar added after it)
    const snap = (at, b, grow = false) => { const tt = timeOf(b), gg = exprGrid(tt), cc = capacity(tt); let a = Math.round(at / gg) * gg; if (a >= cc) { if (b + 1 < nBars || grow) return { bar: b + 1, at: 0 }; a = cc - gg; } return { bar: b, at: Math.max(0, a) }; };
    for (const dd of bar.dirs) {
      const pos = snap(dd.at + shift, bi, dd.type === "stop");
      if (dd.kind === "dyn" || dd.kind === "text") { const x = { id: eid(), kind: dd.kind, staff: dd.si, at: pos.at, value: dd.value }; if (dd.dy) x.dy = dd.dy; putAt(pos.bar, x); continue; }
      if (dd.kind === "chord") { const x = { id: eid(), kind: "chord", staff: dd.si, at: pos.at, root: dd.root, q: dd.q, ...(dd.bass ? { bass: dd.bass } : {}) }; if (dd.dy) x.dy = dd.dy; putAt(pos.bar, x); continue; }
      // spans: a wedge / pedal / octave-shift opens on its staff and number and closes at the next stop of its kind there (any number of that kind when the numbers do not match)
      const kind = dd.kind === "wedge" ? "hairpin" : dd.kind, k = `${kind}:${dd.si}:${dd.number}`;
      const close = () => {
        const open = spanOpen.get(k) ?? [...spanOpen.entries()].find(([kk]) => kk.startsWith(`${kind}:${dd.si}:`))?.[1];
        if (!open) return;
        spanOpen.delete([...spanOpen.entries()].find(([, v]) => v === open)[0]);
        if (pos.bar < open.bar || (pos.bar === open.bar && pos.at <= open.at)) return; // a collapsed span
        const x = { id: eid(), kind, staff: open.staff, at: open.at, ...(kind === "hairpin" || kind === "ottava" ? { dir: open.dir } : {}), end: { bar: pos.bar, at: pos.at } };
        if (kind === "hairpin" && open.niente) x.niente = true;
        if (kind === "ottava" && open.size === 15) x.size = 15;
        if (kind === "pedal" && open.style) x.style = open.style;
        if (kind === "textline") { x.text = open.text; if (dd.endText) x.endText = dd.endText.slice(0, TEXT_MAX); }
        if (open.dy) x.dy = open.dy;
        putAt(open.bar, x);
      };
      const opening = dd.kind === "wedge" ? (dd.type === "crescendo" || dd.type === "diminuendo" ? WEDGE_IN[dd.type] : null) : dd.kind === "pedal" ? (dd.type === "start" || dd.type === "change" ? "pedal" : null) : dd.kind === "textline" ? (dd.type === "start" ? "textline" : null) : dd.type === "down" ? 1 : dd.type === "up" ? -1 : null;
      if (dd.type === "stop" || dd.type === "change") close();
      if (opening !== null) spanOpen.set(k, { ...pos, kind, dir: opening, dy: dd.dy, staff: dd.si, niente: dd.niente, size: dd.size, style: dd.style, text: dd.text });
    }
  });
  for (const o of spanOpen.values()) warnings.add(`${o.kind === "hairpin" ? "a hairpin" : o.kind === "pedal" ? "a pedal line" : o.kind === "textline" ? "a text line" : "an octave line"} without an end was dropped`);
  // finish: one empty bar after the last, at least the default count, standard rests, ties, marks
  const isEmpty = (m) => m.staves.every((s) => s.voices.every((v) => !v || v.every((e) => e.kind === "rest")));
  if (!isEmpty(measures[measures.length - 1]) || late.size) measures.push(newMeasure(nStaves, timeOf(measures.length - 1)));
  for (const [b, xs] of late) for (const x of xs) if (b < measures.length) putAt(b, x); // a span that stopped at the very end lands on the added bar's first slot
  while (measures.length < DEFAULT_BARS) measures.push(newMeasure(nStaves, timeOf(measures.length - 1)));
  const doc = newComposition({ id, title, composer, tags, now, parts: docParts });
  if (subtitle) doc.subtitle = subtitle;
  doc.measures = measures;
  if (tempo !== null && Number.isFinite(tempo)) doc.tempo = Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Math.round(tempo)));
  for (let b = 0; b < measures.length; b++) { try { normalizeBar(doc, b); } catch (e) { refuse(`bar ${b + 1} does not add up (${e.message})`); } }
  cleanTies(doc);
  cleanExpressions(doc);
  try { validate(doc); } catch (e) { refuse(`the piece would not hold together (${e.message})`); }
  return { doc, warnings: [...warnings] };
}

/**
 * Accidentals as read: the engraver (layout.js §6.4) shows one when a pitch's alter differs from the
 * key or from the bar's memory of that pitch; `acc: "show"` marks one the file draws that the engraver
 * would not, `acc: "hide"` one the engraver would draw that the file leaves out — the latter only when
 * the file says it writes every accidental (<supports element="accidental">), so a file that writes
 * none does not hide them all. Walks the bar in time order across voices and drawn staves.
 */
function resolveAccidentals(m, fifths, supported) {
  const keyAlt = keyAlterations(fifths);
  const memory = m.staves.map(() => new Map());
  const timed = [];
  m.staves.forEach((s, si) => s.voices.forEach((v, vi) => { if (v) for (const o of onsets(v)) if (o.ev.kind === "note") timed.push({ ev: o.ev, start: o.start, vi, ds: si + (o.ev.cross ?? 0) }); }));
  timed.sort((a, b) => a.start - b.start || a.ds - b.ds || a.vi - b.vi);
  for (const t of timed) for (const p of t.ev.pitches) {
    const k = p.step + p.octave, mem = memory[t.ds];
    const eff = mem.has(k) ? mem.get(k) : (keyAlt.get(p.step) ?? 0);
    const tiedIn = p.tie === "stop" || p.tie === "both";
    const would = !tiedIn && p.alter !== eff;
    const shown = !!p.accShown;
    delete p.accShown;
    if (shown && !would && !tiedIn) p.acc = "show"; else if (!shown && would && supported) p.acc = "hide";
    const draws = tiedIn ? false : p.acc === "show" ? true : p.acc === "hide" ? false : would;
    if (draws || tiedIn || p.acc === "show") mem.set(k, p.alter);
  }
}
/** One voice of one staff of one bar from its records: events in order, gaps filled, tuplets grouped. */
function buildVoice(grp, si, vi, nV, bi, time, shift, doc0, refuse) {
  const cap = capacity(time);
  const recs = [...grp.recs].sort((a, b) => a.onset - b.onset);
  const evs = []; // [{ start, len, ev }]
  const fillGap = (at, len) => { let parts; try { parts = splitRest(len, at, time); } catch { parts = decompose(len); } if (!parts) refuse(`bar ${bi + 1}: a gap of ${len} ticks Compose cannot fill`); let p = at; for (const d of parts) { evs.push({ start: p, len: ticks(d), ev: restEvent(d) }); p += ticks(d); } };
  let pos = 0;
  for (const r of recs) {
    let start = r.onset + shift;
    if (Math.abs(start - pos) <= TOL) start = pos;
    if (start < pos) refuse(`bar ${bi + 1}: notes overlap in voice ${vi + 1} of staff ${si + 1}`);
    if (start > pos) fillGap(pos, start - pos);
    pos = start;
    const len = Math.round(r.dur);
    let durs;
    if (r.wholeBar && r.kind === "rest") durs = splitRest(cap, 0, time).map((d) => ({ ...d }));
    else {
      const base = BASE_OF_TYPE[r.type];
      if (base !== undefined) {
        const d = { base, dots: r.dots, ...(r.tm ? { tuplet: { n: r.tm.n, in: r.tm.in, id: null } } : {}) };
        let t; try { t = ticks(d); } catch { refuse(`bar ${bi + 1}: a ${r.tm.n}:${r.tm.in} tuplet of ${r.type}s does not fit Compose's grid`); }
        if (Math.abs(t - len) > TOL && !(r.tm && Math.abs(t - len) <= PPQ / 8)) { const alt = decompose(len); if (alt) durs = alt; else refuse(`bar ${bi + 1}: a ${r.type} whose duration is not a ${r.type}`); }
        durs ??= [d];
      } else {
        if (r.type) refuse(`bar ${bi + 1}: ${r.type} notes are shorter than Compose holds`);
        durs = decompose(len); if (!durs) refuse(`bar ${bi + 1}: a duration of ${len} ticks Compose cannot write`);
      }
    }
    durs.forEach((d, k) => {
      const ev = r.kind === "rest" ? restEvent(d) : noteEvent(d, r.pitches.map((p) => { const q = { step: p.step, alter: p.alter, octave: p.octave }; if (p.tie === "start" || p.tie === "both") { if (k === durs.length - 1) q.tie = p.tie; else q.tie = k === 0 && p.tie === "both" ? "both" : "start"; } else if (p.tie === "stop" && k === 0) q.tie = "stop"; if (k < durs.length - 1) q.tie = q.tie === "stop" || q.tie === "both" ? "both" : "start"; if (p.accShown && k === 0) q.accShown = true; if (p.finger) q.finger = p.finger; return q; }).sort((a, b) => diatonicOf(a) - diatonicOf(b)));
      if (r.kind === "note") {
        if (k === 0) { if (r.lyrics?.length) ev.lyrics = r.lyrics.sort((a, b) => a.n - b.n); if (r.art.length) ev.art = r.art.filter((a) => MARKS.includes(a)); if (ev.art?.includes("trill") && (r.trillLine || r.trillAlter !== undefined)) ev.trill = { ...(r.trillLine ? { line: true } : {}), ...(r.trillAlter !== undefined ? { alter: r.trillAlter } : {}) }; if (r.arp) ev.arp = r.arp; if (r.trem) ev.trem = r.trem; if (r.graces?.length) ev.graces = r.graces; if (r.slurs.some((s) => s.at === "start")) ev.slurs = r.slurs.filter((s) => s.at === "start"); }
        if (k === durs.length - 1) { if (r.gliss) ev.gliss = r.gliss === true ? "start" : r.gliss; if (r.slurs.some((s) => s.at === "stop")) ev.slurs = [...(ev.slurs ?? []), ...r.slurs.filter((s) => s.at === "stop")]; }
        if (r.si !== si && Math.abs(r.si - si) === 1 && partOfStaff(doc0, r.si) === partOfStaff(doc0, si)) ev.cross = r.si - si; // a note drawn on the part's other staff; further than that it is simply played from its home
      } else {
        if (r.hidden) ev.hidden = true;
        if (r.display && k === 0) { const clef = clefAt(doc0, bi, si, Math.min(cap - 1, Math.round(start))); const shown = stepOfPitch({ step: r.display.step, octave: r.display.octave }, clef); const y = shown - restAutoStep(d.base, false, nV, vi); if (y && Math.abs(y) <= REST_Y_MAX) ev.restY = y; }
      }
      const t = ticks(d);
      evs.push({ start: pos, len: t, ev, tm: d.tuplet ? r.tm : null, tStart: r.tStart && k === 0, tStop: r.tStop && k === durs.length - 1 });
      pos += t;
    });
  }
  if (pos > cap + TOL) refuse(`bar ${bi + 1}: voice ${vi + 1} of staff ${si + 1} spills past the barline`);
  if (pos < cap) fillGap(pos, cap - pos);
  // tuplets: the file's own start / stop marks, else runs of one ratio cut into whole groups
  const out = evs.map((e) => e.ev);
  let i = 0;
  while (i < evs.length) {
    if (!evs[i].tm) { i++; continue; }
    let j = i;
    const ratio = `${evs[i].tm.n}:${evs[i].tm.in}`;
    const marked = evs[i].tStart;
    while (j + 1 < evs.length && evs[j + 1].tm && `${evs[j + 1].tm.n}:${evs[j + 1].tm.in}` === ratio && !(marked && evs[j].tStop) && !(marked && evs[j + 1].tStart)) j++;
    if (marked) { let k = i; while (k < j && !evs[k].tStop) k++; j = k; }
    const run = evs.slice(i, j + 1), n = evs[i].tm.n;
    const plainOf = (e) => ticks({ base: e.ev.dur.base, dots: e.ev.dur.dots });
    const whole = (list) => { const s = list.reduce((a, e) => a + plainOf(e), 0); return Number.isInteger(s / n) && fromTicks(s / n); };
    const groups = []; // the file's own start / stop mark the whole run; without marks, each shortest prefix that is n of a plain value is one group (six triplet eighths = two brackets)
    if (marked) { if (!whole(run)) refuse(`bar ${bi + 1}: a ${ratio} tuplet Compose cannot hold`); groups.push(run); }
    else { let a = 0; while (a < run.length) { let b = a; while (b < run.length && !whole(run.slice(a, b + 1))) b++; if (b >= run.length) refuse(`bar ${bi + 1}: a ${ratio} tuplet Compose cannot hold`); groups.push(run.slice(a, b + 1)); a = b + 1; } }
    for (const grp2 of groups) { const gid = `t${eid()}`; for (const e of grp2) { e.ev.dur.tuplet = { n: e.tm.n, in: e.tm.in, id: gid }; } if (!grp2.some((e) => e.ev.kind === "note")) for (const e of grp2) { e.ev.dur = { base: e.ev.dur.base, dots: e.ev.dur.dots }; } }
    i = j + 1;
  }
  for (const e of evs) if (e.ev.dur.tuplet && e.ev.dur.tuplet.id === null) e.ev.dur = { base: e.ev.dur.base, dots: e.ev.dur.dots };
  const sum = out.reduce((s, e) => s + evTicks(e), 0);
  if (sum !== cap) refuse(`bar ${bi + 1}: voice ${vi + 1} of staff ${si + 1} adds up to ${sum} ticks, the bar holds ${cap}`);
  return out;
}
