// The composition document (docs/COMPOSE_DESIGN.md §4). Pure — node-testable.
import { ticks, capacity } from "./ticks.js";

export const SCHEMA = 1;
export const DEFAULT_BARS = 8;
export const DEFAULT_TEMPO = 100, MIN_TEMPO = 20, MAX_TEMPO = 300;
/** The playback tempo of a document (older documents carry none). */
export const tempoOf = (doc) => Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Math.round(doc.tempo ?? DEFAULT_TEMPO)));

let seq = 0;
/** Short unique ids for events and pitches — unique within a session, which is all a document needs. */
export const eid = () => `e${Date.now().toString(36).slice(-4)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const restEvent = (dur) => ({ id: eid(), kind: "rest", dur: { base: dur.base, dots: dur.dots ?? 0 } });
export const noteEvent = (dur, pitches) => ({ id: eid(), kind: "note", dur: { base: dur.base, dots: dur.dots ?? 0, ...(dur.tuplet ? { tuplet: dur.tuplet } : {}) }, pitches });

/** An empty bar for a time signature: one voice per staff, one whole rest (the whole-bar rest). */
export function newMeasure(staves = 2) {
  return { staves: Array.from({ length: staves }, () => ({ voices: [[restEvent({ base: 1 })]] })) };
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

/** The time / key / clefs in force at a bar (bar 1 always carries all three). */
export function timeAt(doc, bar) { for (let i = bar; i >= 0; i--) if (doc.measures[i].time) return doc.measures[i].time; throw new Error("no time signature"); }
export function keyAt(doc, bar) { for (let i = bar; i >= 0; i--) if (doc.measures[i].key) return doc.measures[i].key; throw new Error("no key"); }
export function clefAt(doc, bar, staff) { for (let i = bar; i >= 0; i--) { const c = doc.measures[i].clefs?.[staff]; if (c) return c; } throw new Error("no clef"); }

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
    const cap = capacity(timeAt(doc, bi));
    if (m.staves.length !== doc.parts[0].staves) throw new Error(`bar ${bi + 1}: staff count`);
    m.staves.forEach((s, si) => s.voices.forEach((v, vi) => {
      const sum = voiceTicks(v);
      if (sum !== cap) throw new Error(`bar ${bi + 1} staff ${si} voice ${vi}: ${sum} ticks, bar holds ${cap}`);
      for (const ev of v) {
        if (ids.has(ev.id)) throw new Error(`duplicate event id ${ev.id}`);
        ids.add(ev.id);
        if (ev.kind === "note" && !(ev.pitches?.length > 0)) throw new Error(`note ${ev.id} without pitches`);
        if (ev.kind === "rest" && ev.pitches) throw new Error(`rest ${ev.id} with pitches`);
      }
    }));
  });
  return true;
}
