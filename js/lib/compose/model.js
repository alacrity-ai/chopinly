// The composition document (docs/COMPOSE_DESIGN.md §4). Pure — node-testable.
import { ticks, capacity, fromTicks, splitRest, exprGrid, inMetre } from "./ticks.js";
import { INSTRUMENTS, partFor } from "./instruments.js";
import { CLEFS } from "../music.js";

export const SCHEMA = 4; // v3 (WSHED-122): dynamics, hairpins and text are bar-level `expressions`; v4 (WSHED-180): `parts[]` are real instruments — name, abbr, instrument, staves, default clefs
/**
 * Parts (docs/COMPOSE_PARTS_DESIGN.md §1.1): `parts[] = { id, name, abbr, instrument, staves, clefs }`. The measures'
 * `staves[]` stays ONE FLAT ARRAY in part order — a part is a grouping of staves for brackets, names, clefs and sound.
 */
export const PARTS_MAX = 12, STAVES_MAX = 16, PART_STAVES_MAX = 3, PART_NAME_MAX = 40, PART_ABBR_MAX = 12;
/** The staves of the document in score order, each with its part and its place in it. */
export const staffList = (doc) => doc.parts.flatMap((p, pi) => Array.from({ length: p.staves }, (_, k) => ({ part: pi, index: k, first: k === 0, last: k === p.staves - 1 })));
export const nStavesOf = (doc) => doc.parts.reduce((n, p) => n + p.staves, 0);
/** The part (index into `parts`) a flat staff index belongs to; −1 off the end. */
export const partOfStaff = (doc, k) => staffList(doc)[k]?.part ?? -1;
/** The flat index of a part's first staff. */
export const partStart = (doc, pi) => doc.parts.slice(0, pi).reduce((n, p) => n + p.staves, 0);
/** The instrument group of a part (the catalogue's; a part whose instrument is unknown counts as "other"). */
export const partGroup = (part) => (INSTRUMENTS[part?.instrument] ?? INSTRUMENTS.other).group;
/** Dynamics, softest to loudest; the hairpin directions. */
export const DYNAMICS = ["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff"]; // the levels, softest first (the extremes since v98, WSHED-127)
export const SUDDEN = ["sf", "sfz", "sfp", "fp", "rfz"]; // an accent on the slot's notes, the level in force untouched (fp / sfp then drop to p)
export const DYN_VALUES = [...DYNAMICS, ...SUDDEN];
export const HAIRPINS = ["cresc", "dim"];
export const SPAN_KINDS = ["hairpin", "pedal", "ottava", "textline"]; // expressions with an end (docs/COMPOSE_PIANO_DESIGN.md §1): one kind on one staff never overlaps itself; textline = "cresc. – – –" / "una corda … tre corde" (docs/COMPOSE_RAILS2_DESIGN.md §1)
export const PEDAL_STYLES = ["sign", "sost"]; // absent = the line
export const TEMPO_UNITS = [2, 4, 8]; // a tempo mark's beat unit (absent = quarter)
export const REHEARSAL_TEXT_MAX = 12;
export const REPEAT_TIMES_MAX = 9;
export const TRILL_ALTERS = [-1, 0, 1];
export const FINGER_MAX = 5;
export const GRACE_BASES = [8, 16, 32]; // a grace note's value (docs/COMPOSE_NOTES2_DESIGN.md §1)
export const TREM_MAX = 3;
export const TEXT_MAX = 40;
/** Chord symbols (docs/COMPOSE_CHORDS_DESIGN.md §1, WSHED-166): a root, the quality as engraved text, an optional slash bass. */
export const CHORD_Q_MAX = 16;
export const SUBTITLE_MAX = 80; // a piece's subtitle ("As played by …", WSHED-169)
/** A glissando (WSHED-167): "start" slides to the voice's next note; "up" / "down" leave the note with no landing (an open gliss). */
export const GLISS = ["start", "up", "down"];
/** Lyrics (docs/COMPOSE_LYRICS_DESIGN.md §1, WSHED-174): `ev.lyrics = [{ n, text, syl, ext? }]` on a note — the verse (1-based), the syllable as sung, its place in the word (MusicXML's syllabic), a melisma through the notes that follow. */
export const LYRIC_MAX = 40, LYRIC_VERSES_MAX = 4;
export const SYLLABICS = ["single", "begin", "middle", "end"];
/** The highest verse number used on each staff of the document (0 where a staff carries no lyrics) — what sizes the band below a staff. */
export function lyricVersesOf(doc) {
  const out = doc.parts.flatMap((p) => Array.from({ length: p.staves }, () => 0));
  doc.measures.forEach((m) => m.staves.forEach((s, si) => { for (const v of s.voices) for (const ev of v ?? []) for (const l of ev.lyrics ?? []) if (l.n > out[si]) out[si] = l.n; }));
  return out;
}
const isPitchName = (r) => !!r && typeof r === "object" && /^[A-G]$/.test(r.step) && Number.isInteger(r.alter ?? 0) && Math.abs(r.alter ?? 0) <= 2 && Object.keys(r).every((k) => k === "step" || k === "alter");
export const MAX_VOICES = 4;
/** How far a rest may be dragged from its automatic place, in staff steps (`ev.restY`). */
export const REST_Y_MAX = 12;
/** How far an expression (dynamic, text, hairpin) may be nudged off its automatic line, in staff steps (`x.dy`, positive = up). */
export const EXPR_Y_MAX = 20;
/** Form (docs/COMPOSE_FORM_DESIGN.md §1): closing barlines, the jumps, every mark kind, a tempo word's length. */
export const BARLINE_ENDS = ["double", "final", "repeat"];
export const JUMPS = ["dc", "ds", "dcAlFine", "dsAlFine", "dcAlCoda", "dsAlCoda"];
export const FORM_KINDS = ["segno", "coda", "toCoda", "fine", ...JUMPS, "rehearsal", "tempo"];
export const TEMPO_TEXT_MAX = 20;
export const ENDING_MAX = 9;
export const LAY_BREAKS = ["break", "keep"]; // a layout pin on the barline that closes a bar (docs/COMPOSE_LAYOUT_DESIGN.md §1): the row ends here / never ends here
export const LAY_W_MIN = 0.4, LAY_W_MAX = 3; // a bar's weight in its row's justification on paper (1 = natural, never stored)
export const DEFAULT_BARS = 8;
export const DEFAULT_TEMPO = 100, MIN_TEMPO = 20, MAX_TEMPO = 300;
/** The playback tempo of a document (older documents carry none). */
export const tempoOf = (doc) => Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Math.round(doc.tempo ?? DEFAULT_TEMPO)));

let seq = 0;
/** Short unique ids for events and pitches — unique within a session, which is all a document needs. */
export const eid = () => `e${Date.now().toString(36).slice(-4)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A duration record: base, dots, and the tuplet ratio when there is one (never `undefined` keys). */
export const durOf = (dur) => ({ base: dur.base, dots: dur.dots ?? 0, ...(dur.tuplet ? { tuplet: { n: dur.tuplet.n, in: dur.tuplet.in, id: dur.tuplet.id } } : {}) });
export const restEvent = (dur) => ({ id: eid(), kind: "rest", dur: durOf(dur) });
export const noteEvent = (dur, pitches) => ({ id: eid(), kind: "note", dur: durOf(dur), pitches });

/** The metre's standard rests filling a whole bar (drawn as one whole-bar rest). */
export const barRests = (time) => splitRest(capacity(time), 0, time).map(restEvent);
/** An empty bar for a time signature: one voice per staff holding the metre's standard rests. */
export function newMeasure(staves = 2, time = { beats: 4, unit: 4 }) {
  return { staves: Array.from({ length: staves }, () => ({ voices: [barRests(time)] })) };
}
/**
 * Voices are sparse per bar (docs/COMPOSE_VOICES_DESIGN.md §3): `staves[si].voices[k]`
 * (k = voice − 1) is present only where that voice has a note; voice 1 is always present.
 * An absent voice is a `null` slot (never a trailing one). These walk what is present.
 */
export const voicesOf = (staff) => staff.voices.map((v, vi) => [vi, v]).filter(([, v]) => v);
export const voiceIn = (m, staff, vi) => m.staves[staff].voices[vi] ?? null;
/** Voices present on a staff of a bar. */
export const voiceCount = (m, staff) => m.staves[staff].voices.filter(Boolean).length;
/** Every voice a document uses anywhere (0-based), for the switcher's ink. */
export function usedVoices(doc) {
  const out = new Set([0]);
  for (const m of doc.measures) for (const s of m.staves) s.voices.forEach((v, vi) => { if (v) out.add(vi); });
  return out;
}

/** The default part: a piano on the grand staff. */
export const pianoPart = () => partFor("piano", 1, { abbr: "" });
/** A blank score — a piano (treble + bass) unless `parts` says otherwise — C major, 4/4, eight empty bars. */
export function newComposition({ id, title = "Untitled", composer = "", tags = [], now = Date.now(), parts = [pianoPart()] } = {}) {
  const ps = parts.map((p) => structuredClone(p)), n = ps.reduce((s, p) => s + p.staves, 0);
  const measures = Array.from({ length: DEFAULT_BARS }, () => newMeasure(n));
  measures[0].key = { fifths: 0 };
  measures[0].time = { beats: 4, unit: 4 };
  measures[0].clefs = Object.fromEntries(ps.flatMap((p) => p.clefs).map((c, k) => [k, c]));
  return { id, v: SCHEMA, title, composer, tags: [...tags], createdAt: now, updatedAt: now, openedAt: now, tempo: DEFAULT_TEMPO, parts: ps, measures };
}

export const clone = (doc) => structuredClone(doc);

/** The time signature in force at a bar (bar 1 always carries one). */
export function sigAt(doc, bar) { for (let i = bar; i >= 0; i--) if (doc.measures[i].time) return doc.measures[i].time; throw new Error("no time signature"); }
/**
 * The metre of a bar: its time signature, and for a short bar (docs/COMPOSE_DESIGN.md §8.5p — a pickup, or the
 * bar that completes one) also `cap`, its real length, and `offset`, where its first tick sits in the signature
 * (a pickup counts from the barline that follows). `capacity(timeAt(doc, b))` is therefore always the bar's length.
 */
export function timeAt(doc, bar) {
  const sig = sigAt(doc, bar), sh = doc.measures[bar]?.short;
  return sh ? shortMetre(sig, sh) : sig;
}
export const shortMetre = (sig, sh) => ({ beats: sig.beats, unit: sig.unit, cap: sh.len, offset: sh.from === "end" ? capacity(sig) - sh.len : 0 });
/** The key in force at a bar. */
export function keyAt(doc, bar) { for (let i = bar; i >= 0; i--) if (doc.measures[i].key) return doc.measures[i].key; throw new Error("no key"); }
/**
 * The clef in force on a staff at a tick of a bar. A bar's `clefs[staff]` is a
 * change at its barline; `clefChanges` [{ staff, at, clef }] (sorted by `at`)
 * are changes on a beat inside it. Either holds until the next change.
 */
export function clefAt(doc, bar, staff, at = 0) {
  for (let i = bar; i >= 0; i--) {
    const m = doc.measures[i];
    let found = null;
    for (const c of m.clefChanges ?? []) if (c.staff === staff && (i < bar || c.at <= at)) found = c.clef;
    if (found) return found;
    if (m.clefs?.[staff]) return m.clefs[staff];
  }
  throw new Error("no clef");
}

/** Every event's ticks; a voice's total. */
export const evTicks = (ev) => ticks(ev.dur);
export const voiceTicks = (voice) => voice.reduce((n, ev) => n + evTicks(ev), 0);
export const isEmptyBar = (m) => m.staves.every((s) => s.voices.every((v) => !v || v.every((ev) => ev.kind === "rest")));

/** Throws on the first broken invariant (docs/COMPOSE_DESIGN.md §4.2). */
export function validate(doc) {
  if (![1, 2, 3, SCHEMA].includes(doc.v)) throw new Error("schema"); // v1 documents are v2 documents with one voice per staff; v2 carries marks on notes (upgrade() lifts them); v3 has a bare piano part (upgrade() fills it)
  if (!doc.measures.length) throw new Error("no bars");
  const v3 = doc.v >= 3;
  if (!Array.isArray(doc.parts) || !doc.parts.length) throw new Error("a piece needs one instrument");
  const nStaves = nStavesOf(doc);
  if (doc.v === SCHEMA) validateParts(doc);
  const m0 = doc.measures[0];
  if (!m0.key || !m0.time || !m0.clefs) throw new Error("bar 1 must carry key, time and clefs");
  for (let k = 0; k < nStaves; k++) if (!CLEFS[m0.clefs[k]]) throw new Error(`bar 1: staff ${k + 1} has no clef`);
  if (doc.subtitle !== undefined && (typeof doc.subtitle !== "string" || !doc.subtitle.trim() || doc.subtitle.length > SUBTITLE_MAX)) throw new Error(`a subtitle is 1–${SUBTITLE_MAX} letters or absent`);
  const ids = new Set();
  doc.measures.forEach((m, bi) => {
    if (m.short !== undefined) { // a short bar (§8.5p): a whole number of expression-grid steps, less than the signature, opening (from the end of the metre) or closing
      const sig = sigAt(doc, bi), full = capacity(sig), grid = exprGrid(sig);
      if (typeof m.short !== "object" || !m.short || (m.short.from !== "end" && m.short.from !== "start") || !Number.isInteger(m.short.len) || m.short.len < grid || m.short.len >= full || m.short.len % grid) throw new Error(`bar ${bi + 1}: a short bar is a whole number of grid steps shorter than its ${sig.beats}/${sig.unit}, from the end or the start`);
      if (m.simile !== undefined) throw new Error(`bar ${bi + 1}: a short bar is not a bar repeat`);
    }
    if (m.lay !== undefined) { // layout pins for paper (docs/COMPOSE_LAYOUT_DESIGN.md §1): a break / keep on the closing barline, a weight in the row
      const { brk, w, ...rest } = typeof m.lay === "object" && m.lay ? m.lay : { bad: 1 };
      if (Object.keys(rest).length || (brk === undefined && w === undefined) || (brk !== undefined && !LAY_BREAKS.includes(brk)) || (w !== undefined && (typeof w !== "number" || !(w >= LAY_W_MIN && w <= LAY_W_MAX) || w === 1))) throw new Error(`bar ${bi + 1}: a layout pin is a break or a keep, and a weight ${LAY_W_MIN}–${LAY_W_MAX} other than 1`);
    }
    const cap = capacity(timeAt(doc, bi));
    if (m.staves.length !== nStaves) throw new Error(`bar ${bi + 1}: staff count`);
    for (const [k, c] of Object.entries(m.clefs ?? {})) if (!(Number(k) >= 0 && Number(k) < nStaves) || !CLEFS[c]) throw new Error(`bar ${bi + 1}: a clef on a staff that is not there`);
    let lastAt = 0;
    for (const c of m.clefChanges ?? []) {
      if (!(c.staff >= 0 && c.staff < m.staves.length) || !Number.isInteger(c.at) || c.at <= 0 || c.at >= cap || inMetre(c.at, timeAt(doc, bi)) % exprGrid(timeAt(doc, bi)) || c.at < lastAt) throw new Error(`bar ${bi + 1}: clef change off the half-beat grid`); // on the expression grid since WSHED-168 (a beat before)
      if ((m.clefChanges ?? []).some((o) => o !== c && o.staff === c.staff && o.at === c.at)) throw new Error(`bar ${bi + 1}: two clefs on one beat`);
      lastAt = c.at;
    }
    // expressions (docs/COMPOSE_EXPRESSIONS_DESIGN.md §1.2): on the grid, on a staff, sorted, one dynamic / text per staff and slot, hairpins never overlapping
    const grid = exprGrid(timeAt(doc, bi));
    let prev = null;
    for (const x of m.expressions ?? []) {
      if (!x.id || !(x.staff >= 0 && x.staff < m.staves.length) || !Number.isInteger(x.at) || x.at < 0 || x.at >= cap || x.at % grid) throw new Error(`bar ${bi + 1}: ${x.kind ?? "expression"} ${x.id} off the grid`);
      if (x.dy !== undefined && (!Number.isInteger(x.dy) || x.dy === 0 || Math.abs(x.dy) > EXPR_Y_MAX)) throw new Error(`bar ${bi + 1}: ${x.id}: dy must be a whole number of steps within ±${EXPR_Y_MAX} (absent when 0)`);
      if (x.kind === "dyn") { if (!DYN_VALUES.includes(x.value)) throw new Error(`bar ${bi + 1}: ${x.id} is not a dynamic`); }
      else if (x.kind === "text") { if (typeof x.value !== "string" || !x.value.trim() || x.value.length > TEXT_MAX) throw new Error(`bar ${bi + 1}: ${x.id} text`); }
      else if (x.kind === "chord") { if (!isPitchName(x.root) || typeof x.q !== "string" || x.q.length > CHORD_Q_MAX || x.q !== x.q.trim() || (x.bass !== undefined && !isPitchName(x.bass)) || x.value !== undefined) throw new Error(`bar ${bi + 1}: chord symbol ${x.id} needs a root, a quality of at most ${CHORD_Q_MAX} letters and an optional bass`); }
      else if (SPAN_KINDS.includes(x.kind)) {
        const eb = doc.measures[x.end?.bar];
        if (x.kind === "hairpin" && !HAIRPINS.includes(x.dir)) throw new Error(`bar ${bi + 1}: hairpin ${x.id} has no direction`);
        if (x.kind === "ottava" && x.dir !== 1 && x.dir !== -1) throw new Error(`bar ${bi + 1}: octave line ${x.id} must be 8va (1) or 8vb (-1)`);
        if (x.kind === "pedal" && x.dir !== undefined) throw new Error(`bar ${bi + 1}: pedal ${x.id} carries a direction`);
        if (x.kind === "hairpin" && x.niente !== undefined && x.niente !== true) throw new Error(`bar ${bi + 1}: hairpin ${x.id}: niente is true or absent`);
        if (x.kind === "ottava" && x.size !== undefined && x.size !== 15) throw new Error(`bar ${bi + 1}: octave line ${x.id}: size is 15 or absent`);
        if (x.kind === "pedal" && x.style !== undefined && !PEDAL_STYLES.includes(x.style)) throw new Error(`bar ${bi + 1}: pedal ${x.id}: no such style`);
        if (x.kind === "textline" && (typeof x.text !== "string" || !x.text.trim() || x.text.length > TEXT_MAX || (x.endText !== undefined && (typeof x.endText !== "string" || !x.endText.trim() || x.endText.length > TEXT_MAX)))) throw new Error(`bar ${bi + 1}: text line ${x.id} text`);
        if (!eb) throw new Error(`bar ${bi + 1}: ${x.kind} ${x.id} has no end`);
        const ecap = capacity(timeAt(doc, x.end.bar)), egrid = exprGrid(timeAt(doc, x.end.bar));
        if (!Number.isInteger(x.end.at) || x.end.at < 0 || x.end.at >= ecap || x.end.at % egrid) throw new Error(`bar ${bi + 1}: ${x.kind} ${x.id} ends off the grid`);
        if (x.end.bar < bi || (x.end.bar === bi && x.end.at <= x.at)) throw new Error(`bar ${bi + 1}: ${x.kind} ${x.id} ends before it starts`);
      } else throw new Error(`bar ${bi + 1}: ${x.id} has no kind`);
      if (ids.has(x.id)) throw new Error(`duplicate id ${x.id}`);
      ids.add(x.id);
      if (prev && (prev.at > x.at || (prev.at === x.at && prev.staff > x.staff))) throw new Error(`bar ${bi + 1}: expressions out of order`);
      if (prev && prev.at === x.at && prev.staff === x.staff && prev.kind === x.kind && !SPAN_KINDS.includes(x.kind)) throw new Error(`bar ${bi + 1}: two ${x.kind}s on one slot`);
      prev = x;
    }
    // form (docs/COMPOSE_FORM_DESIGN.md §1): barlines, an ending over bars, marks on the bar
    if (m.barline !== undefined) {
      if (typeof m.barline !== "object" || !m.barline || (m.barline.start === undefined && m.barline.end === undefined)) throw new Error(`bar ${bi + 1}: an empty barline record`);
      if (m.barline.start !== undefined && m.barline.start !== "repeat") throw new Error(`bar ${bi + 1}: a barline can only start a repeat`);
      if (m.barline.end !== undefined && !BARLINE_ENDS.includes(m.barline.end)) throw new Error(`bar ${bi + 1}: no such barline`);
      if (m.barline.times !== undefined && (m.barline.end !== "repeat" || !Number.isInteger(m.barline.times) || m.barline.times < 2 || m.barline.times > REPEAT_TIMES_MAX)) throw new Error(`bar ${bi + 1}: repeat times go 2–${REPEAT_TIMES_MAX} on a repeat end`);
    }
    if (m.simile !== undefined) { // docs/COMPOSE_RAILS2_DESIGN.md §1: a % bar holds only rests and plays the bar(s) before it
      const n = m.simile;
      if (n !== 1 && n !== 2) throw new Error(`bar ${bi + 1}: a bar repeat is 1 or 2 bars`);
      if (bi < n) throw new Error(`bar ${bi + 1}: nothing before it to repeat`);
      const pair = n === 2 ? doc.measures[bi + 1] : null;
      if (n === 2 && (!pair || pair.simile !== undefined)) throw new Error(`bar ${bi + 1}: a two-bar repeat needs a plain bar after it`);
      for (const [b, mm] of [[bi, m], ...(pair ? [[bi + 1, pair]] : [])]) { if (!isEmptyBar(mm)) throw new Error(`bar ${b + 1}: a bar repeat holds no notes`); if (capacity(timeAt(doc, b)) !== capacity(timeAt(doc, b - n))) throw new Error(`bar ${b + 1}: a bar repeat needs the same metre as the bar it repeats`); }
    }
    if (m.ending !== undefined) {
      if (!Number.isInteger(m.ending.n) || m.ending.n < 1 || m.ending.n > ENDING_MAX || !Number.isInteger(m.ending.end) || m.ending.end < bi || m.ending.end >= doc.measures.length) throw new Error(`bar ${bi + 1}: an ending needs a number 1–${ENDING_MAX} and a last bar in the piece`);
      for (let b = 0; b < bi; b++) if (doc.measures[b].ending && doc.measures[b].ending.end >= bi) throw new Error(`bar ${bi + 1}: endings overlap`);
    }
    if (m.form !== undefined) {
      if (!Array.isArray(m.form) || !m.form.length) throw new Error(`bar ${bi + 1}: an empty form list`);
      const kinds = new Set();
      let jumps = 0;
      for (const f of m.form) {
        if (!FORM_KINDS.includes(f.kind) || kinds.has(f.kind)) throw new Error(`bar ${bi + 1}: form mark ${f.kind}`);
        kinds.add(f.kind);
        if (JUMPS.includes(f.kind) && ++jumps > 1) throw new Error(`bar ${bi + 1}: two jumps on one bar`);
        if (f.kind === "tempo" && (!Number.isInteger(f.bpm) || f.bpm < MIN_TEMPO || f.bpm > MAX_TEMPO || (f.text !== undefined && (typeof f.text !== "string" || !f.text.trim() || f.text.length > TEMPO_TEXT_MAX)))) throw new Error(`bar ${bi + 1}: a tempo mark needs ${MIN_TEMPO}–${MAX_TEMPO} and at most ${TEMPO_TEXT_MAX} letters`);
        if (f.kind === "tempo" && f.unit !== undefined && (!TEMPO_UNITS.includes(f.unit.base) || (f.unit.dots !== 0 && f.unit.dots !== 1))) throw new Error(`bar ${bi + 1}: a tempo mark's unit is a half, quarter or eighth, dotted or not`);
        if (f.kind === "rehearsal" && ((f.text !== undefined && (typeof f.text !== "string" || !f.text.trim() || f.text.length > REHEARSAL_TEXT_MAX || f.style !== undefined)) || (f.style !== undefined && f.style !== "number"))) throw new Error(`bar ${bi + 1}: a rehearsal mark is letters, numbers or a word of at most ${REHEARSAL_TEXT_MAX} letters`);
        if (f.kind !== "tempo" && f.kind !== "rehearsal" && (f.bpm !== undefined || f.text !== undefined || f.unit !== undefined || f.style !== undefined)) throw new Error(`bar ${bi + 1}: only a tempo mark carries a value`);
        if (f.kind === "tempo" && f.style !== undefined) throw new Error(`bar ${bi + 1}: only a rehearsal mark carries a style`);
      }
      for (let i = 1; i < m.form.length; i++) if (m.form[i - 1].kind > m.form[i].kind) throw new Error(`bar ${bi + 1}: form marks out of order`);
    }
    m.staves.forEach((s, si) => s.voices.forEach((v, vi) => {
      if (vi >= MAX_VOICES) throw new Error(`bar ${bi + 1} staff ${si}: more than ${MAX_VOICES} voices`);
      if (!v) { if (vi === 0) throw new Error(`bar ${bi + 1} staff ${si}: no voice 1`); if (vi === s.voices.length - 1) throw new Error(`bar ${bi + 1} staff ${si}: a trailing empty voice slot`); return; }
      if (vi > 0 && !v.some((e) => e.kind === "note")) throw new Error(`bar ${bi + 1} staff ${si} voice ${vi + 1}: present without a note`);
      const sum = voiceTicks(v);
      if (sum !== cap) throw new Error(`bar ${bi + 1} staff ${si} voice ${vi + 1}: ${sum} ticks, bar holds ${cap}`);
      const groups = new Map();
      v.forEach((ev, i) => {
        if (ids.has(ev.id)) throw new Error(`duplicate event id ${ev.id}`);
        ids.add(ev.id);
        if (ev.kind === "note" && !(ev.pitches?.length > 0)) throw new Error(`note ${ev.id} without pitches`);
        if (ev.kind === "note") for (const p of ev.pitches) if (p.finger !== undefined && !(Number.isInteger(p.finger) && p.finger >= 1 && p.finger <= FINGER_MAX)) throw new Error(`${ev.id}: a finger is 1–${FINGER_MAX}`);
        if (ev.graces !== undefined) { // docs/COMPOSE_NOTES2_DESIGN.md §1: grace notes ride the note they precede
          if (ev.kind !== "note" || !Array.isArray(ev.graces) || !ev.graces.length) throw new Error(`${ev.id}: graces belong on a note, at least one`);
          for (const g of ev.graces) if (!GRACE_BASES.includes(g.base) || !(g.pitches?.length > 0) || g.pitches.some((p) => !/^[A-G]$/.test(p.step) || !Number.isInteger(p.octave) || !Number.isInteger(p.alter ?? 0) || Math.abs(p.alter ?? 0) > 2)) throw new Error(`${ev.id}: a grace note needs a value of 8, 16 or 32 and pitches`);
        }
        if (ev.gliss !== undefined && (ev.kind !== "note" || !GLISS.includes(ev.gliss))) throw new Error(`${ev.id}: a glissando is start, up or down, on a note`);
        if (ev.lyrics !== undefined) { // docs/COMPOSE_LYRICS_DESIGN.md §1.2: syllables on a note, one per verse, verses ascending
          if (ev.kind !== "note" || !Array.isArray(ev.lyrics) || !ev.lyrics.length) throw new Error(`${ev.id}: lyrics go on a note, at least one syllable`);
          let lastN = 0;
          for (const l of ev.lyrics) {
            if (!l || typeof l !== "object" || !Number.isInteger(l.n) || l.n < 1 || l.n > LYRIC_VERSES_MAX || l.n <= lastN) throw new Error(`${ev.id}: a lyric's verse is 1–${LYRIC_VERSES_MAX}, each once, in order`);
            if (typeof l.text !== "string" || !l.text.trim() || l.text !== l.text.trim() || l.text.length > LYRIC_MAX || /[\r\n]/.test(l.text)) throw new Error(`${ev.id}: a syllable is 1–${LYRIC_MAX} letters with no line break`);
            if (l.syl !== undefined && !SYLLABICS.includes(l.syl)) throw new Error(`${ev.id}: a syllable is single, begin, middle or end`);
            if (l.ext !== undefined && l.ext !== true) throw new Error(`${ev.id}: a melisma is true or absent`);
            if (Object.keys(l).some((k) => !["n", "text", "syl", "ext"].includes(k))) throw new Error(`${ev.id}: a lyric carries only n, text, syl and ext`);
            lastN = l.n;
          }
        }
        if (ev.trem !== undefined && (ev.kind !== "note" || !Number.isInteger(ev.trem) || ev.trem < 1 || ev.trem > TREM_MAX)) throw new Error(`${ev.id}: a tremolo is 1–${TREM_MAX} strokes on a note`);
        if (ev.trill !== undefined && (ev.kind !== "note" || !ev.art?.includes("trill") || typeof ev.trill !== "object" || !ev.trill || (ev.trill.line !== undefined && ev.trill.line !== true) || (ev.trill.alter !== undefined && !TRILL_ALTERS.includes(ev.trill.alter)) || (ev.trill.line === undefined && ev.trill.alter === undefined))) throw new Error(`${ev.id}: trill options belong on a trilled note — a line, an accidental`);
        if (ev.stem !== undefined && (ev.kind !== "note" || (ev.stem !== "up" && ev.stem !== "down"))) throw new Error(`${ev.id}: a stem is up or down, on a note`);
        if (ev.beam !== undefined && (ev.kind !== "note" || (ev.beam !== "break" && ev.beam !== "join"))) throw new Error(`${ev.id}: a beam break or join goes on a note`); // join since WSHED-170: the beam runs on across the beat
        if (ev.art && ev.art.filter((a) => a === "turn" || a === "invertedTurn" || a === "delayedTurn").length > 1) throw new Error(`${ev.id}: one turn per note`);
        if (ev.kind === "rest" && ev.pitches) throw new Error(`rest ${ev.id} with pitches`);
        if (ev.hidden && ev.kind !== "rest") throw new Error(`note ${ev.id} marked hidden`);
        if (v3 && (ev.dyn !== undefined || ev.hairpin !== undefined || ev.text !== undefined)) throw new Error(`${ev.id}: a v3 document keeps its marks in expressions`);
        if (ev.restY !== undefined && (ev.kind !== "rest" || !Number.isInteger(ev.restY) || Math.abs(ev.restY) > REST_Y_MAX)) throw new Error(`${ev.id}: restY must be a whole number of steps within ±${REST_Y_MAX} on a rest`);
        if (ev.cross !== undefined && (ev.kind !== "note" || (ev.cross !== 1 && ev.cross !== -1) || si + ev.cross < 0 || si + ev.cross >= m.staves.length)) throw new Error(`bar ${bi + 1}: ${ev.id} crosses to a staff that is not there`);
        if (ev.cross !== undefined && partOfStaff(doc, si + ev.cross) !== partOfStaff(doc, si)) throw new Error(`bar ${bi + 1}: ${ev.id} crosses out of its instrument`); // docs/COMPOSE_PARTS_DESIGN.md §1.4
        if (ev.dur.tuplet) { const g = groups.get(ev.dur.tuplet.id) ?? { n: ev.dur.tuplet.n, plain: 0, last: i - 1, notes: 0 }; if (g.last !== i - 1) throw new Error(`bar ${bi + 1}: tuplet ${ev.dur.tuplet.id} is not contiguous`); g.last = i; g.plain += ticks({ base: ev.dur.base, dots: ev.dur.dots }); if (ev.kind === "note") g.notes++; groups.set(ev.dur.tuplet.id, g); }
      });
      for (const [gid, g] of groups) {
        if (!g.notes) throw new Error(`bar ${bi + 1}: tuplet ${gid} is all rests`);
        if (!Number.isInteger(g.plain / g.n) || !fromTicks(g.plain / g.n)) throw new Error(`bar ${bi + 1}: tuplet ${gid} is not ${g.n} of a plain value`);
      }
    }));
  });
  // spans of one kind on a staff never overlap (a span is [start, end) in absolute ticks); kinds may share a range
  const spans = [];
  let abs = 0;
  doc.measures.forEach((m, bi) => { const starts = abs; abs += capacity(timeAt(doc, bi)); for (const x of m.expressions ?? []) if (SPAN_KINDS.includes(x.kind)) spans.push({ kind: x.kind, staff: x.staff, a: starts + x.at, b: barStartAbs(doc, x.end.bar) + x.end.at, id: x.id, bar: bi }); });
  spans.sort((p, q) => p.kind.localeCompare(q.kind) || p.staff - q.staff || p.a - q.a);
  for (let i = 1; i < spans.length; i++) if (spans[i].kind === spans[i - 1].kind && spans[i].staff === spans[i - 1].staff && spans[i].a < spans[i - 1].b) throw new Error(`bar ${spans[i].bar + 1}: ${spans[i].kind}s ${spans[i - 1].id} and ${spans[i].id} overlap`);
  return true;
}
function barStartAbs(doc, bar) { let t = 0; for (let b = 0; b < bar; b++) t += capacity(timeAt(doc, b)); return t; }
/** The v4 part shapes (docs/COMPOSE_PARTS_DESIGN.md §1.1): ids unique, names bounded, a known instrument, 1–3 staves with a valid default clef each, the maxima. */
function validateParts(doc) {
  if (doc.parts.length > PARTS_MAX) throw new Error(`a piece holds at most ${PARTS_MAX} instruments`);
  if (nStavesOf(doc) > STAVES_MAX) throw new Error(`a piece holds at most ${STAVES_MAX} staves`);
  const ids = new Set();
  for (const p of doc.parts) {
    if (!p || typeof p !== "object" || typeof p.id !== "string" || !/^p\d+$/.test(p.id) || ids.has(p.id)) throw new Error("an instrument needs its own id");
    ids.add(p.id);
    if (typeof p.name !== "string" || !p.name.trim() || p.name !== p.name.trim() || p.name.length > PART_NAME_MAX) throw new Error(`an instrument's name is 1–${PART_NAME_MAX} letters`);
    if (typeof p.abbr !== "string" || p.abbr !== p.abbr.trim() || p.abbr.length > PART_ABBR_MAX) throw new Error(`an instrument's abbreviation is at most ${PART_ABBR_MAX} letters`);
    if (!INSTRUMENTS[p.instrument]) throw new Error(`${p.name}: no such instrument`);
    if (!Number.isInteger(p.staves) || p.staves < 1 || p.staves > PART_STAVES_MAX) throw new Error(`${p.name}: an instrument has 1–${PART_STAVES_MAX} staves`);
    if (!Array.isArray(p.clefs) || p.clefs.length !== p.staves || p.clefs.some((c) => !CLEFS[c])) throw new Error(`${p.name}: one default clef per staff`);
    if (Object.keys(p).some((k) => !["id", "name", "abbr", "instrument", "staves", "clefs"].includes(k))) throw new Error(`${p.name}: an instrument carries only id, name, abbr, instrument, staves and clefs`);
  }
}
