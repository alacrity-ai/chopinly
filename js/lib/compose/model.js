// The composition document (docs/COMPOSE_DESIGN.md §4). Pure — node-testable.
import { ticks, capacity, fromTicks, splitRest, groupSize } from "./ticks.js";

export const SCHEMA = 1;
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

/** An empty bar for a time signature: one voice per staff holding the metre's standard rests (drawn as one whole-bar rest). */
export function newMeasure(staves = 2, time = { beats: 4, unit: 4 }) {
  return { staves: Array.from({ length: staves }, () => ({ voices: [splitRest(capacity(time), 0, time).map(restEvent)] })) };
}

/** A blank piano score: treble + bass, C major, 4/4, eight empty bars. */
export function newComposition({ id, title = "Untitled", composer = "", now = Date.now() } = {}) {
  const measures = Array.from({ length: DEFAULT_BARS }, () => newMeasure(2));
  measures[0].key = { fifths: 0 };
  measures[0].time = { beats: 4, unit: 4 };
  measures[0].clefs = { 0: "treble", 1: "bass" };
  return { id, v: SCHEMA, title, composer, createdAt: now, updatedAt: now, openedAt: now, tempo: DEFAULT_TEMPO, parts: [{ id: "p1", name: "Piano", staves: 2 }], measures };
}

export const clone = (doc) => structuredClone(doc);

/** The time / key in force at a bar (bar 1 always carries both). */
export function timeAt(doc, bar) { for (let i = bar; i >= 0; i--) if (doc.measures[i].time) return doc.measures[i].time; throw new Error("no time signature"); }
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
export const isEmptyBar = (m) => m.staves.every((s) => s.voices.every((v) => v.every((ev) => ev.kind === "rest")));

/** Throws on the first broken invariant (docs/COMPOSE_DESIGN.md §4.2). */
export function validate(doc) {
  if (doc.v !== SCHEMA) throw new Error("schema");
  if (!doc.measures.length) throw new Error("no bars");
  const m0 = doc.measures[0];
  if (!m0.key || !m0.time || !m0.clefs) throw new Error("bar 1 must carry key, time and clefs");
  const ids = new Set();
  doc.measures.forEach((m, bi) => {
    const cap = capacity(timeAt(doc, bi)), beat = groupSize(timeAt(doc, bi));
    if (m.staves.length !== doc.parts[0].staves) throw new Error(`bar ${bi + 1}: staff count`);
    let lastAt = 0;
    for (const c of m.clefChanges ?? []) {
      if (!(c.staff >= 0 && c.staff < m.staves.length) || !Number.isInteger(c.at) || c.at <= 0 || c.at >= cap || c.at % beat || c.at < lastAt) throw new Error(`bar ${bi + 1}: clef change off the beat`);
      if ((m.clefChanges ?? []).some((o) => o !== c && o.staff === c.staff && o.at === c.at)) throw new Error(`bar ${bi + 1}: two clefs on one beat`);
      lastAt = c.at;
    }
    m.staves.forEach((s, si) => s.voices.forEach((v, vi) => {
      const sum = voiceTicks(v);
      if (sum !== cap) throw new Error(`bar ${bi + 1} staff ${si} voice ${vi}: ${sum} ticks, bar holds ${cap}`);
      const groups = new Map();
      v.forEach((ev, i) => {
        if (ids.has(ev.id)) throw new Error(`duplicate event id ${ev.id}`);
        ids.add(ev.id);
        if (ev.kind === "note" && !(ev.pitches?.length > 0)) throw new Error(`note ${ev.id} without pitches`);
        if (ev.kind === "rest" && ev.pitches) throw new Error(`rest ${ev.id} with pitches`);
        if (ev.dur.tuplet) { const g = groups.get(ev.dur.tuplet.id) ?? { n: ev.dur.tuplet.n, plain: 0, last: i - 1, notes: 0 }; if (g.last !== i - 1) throw new Error(`bar ${bi + 1}: tuplet ${ev.dur.tuplet.id} is not contiguous`); g.last = i; g.plain += ticks({ base: ev.dur.base, dots: ev.dur.dots }); if (ev.kind === "note") g.notes++; groups.set(ev.dur.tuplet.id, g); }
      });
      for (const [gid, g] of groups) {
        if (!g.notes) throw new Error(`bar ${bi + 1}: tuplet ${gid} is all rests`);
        if (!Number.isInteger(g.plain / g.n) || !fromTicks(g.plain / g.n)) throw new Error(`bar ${bi + 1}: tuplet ${gid} is not ${g.n} of a plain value`);
      }
    }));
  });
  return true;
}
