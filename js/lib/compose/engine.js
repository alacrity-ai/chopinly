// Every edit as a function doc → doc (docs/COMPOSE_DESIGN.md §7). Each op
// clones the document, changes it, re-normalises the touched bar and returns
// the new document; a refused edit throws Nudge(sentence) and the document is
// untouched. Pure — node-testable.
import { ticks, capacity, splitRest, grid } from "./ticks.js";
import { clone, restEvent, noteEvent, newMeasure, timeAt, keyAt, clefAt, evTicks, voiceTicks, isEmptyBar, DEFAULT_BARS } from "./model.js";
import { parsePitch, keyAlterations, CLEFS } from "../music.js";

export class Nudge extends Error { constructor(msg) { super(msg); this.name = "Nudge"; } }

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

/** The spelled pitch on a staff step for a clef, taking the key's alteration for that letter. */
export function pitchFromStep(step, clef, key) {
  const diatonic = step + parsePitch(CLEFS[clef].bottom).diatonic;
  const letter = LETTERS[((diatonic % 7) + 7) % 7];
  const octave = Math.floor(diatonic / 7);
  const alter = keyAlterations(key.fifths).get(letter) ?? 0;
  return { step: letter, alter, octave };
}
/** MIDI number of a pitch. */
export const midiOf = (p) => parsePitch(`${p.step}${p.alter === 1 ? "#" : p.alter === -1 ? "b" : ""}${p.octave}`).midi + (Math.abs(p.alter) === 2 ? p.alter : 0);
/** Diatonic index of a pitch (for chord ordering). */
export const diatonicOf = (p) => p.octave * 7 + LETTERS.indexOf(p.step);

/** Staff step of a spelled pitch on a clef. */
export const stepOf = (p, clef) => diatonicOf(p) - parsePitch(CLEFS[clef].bottom).diatonic;
export const STEP_MIN = -10, STEP_MAX = 18;

/**
 * Move pitches by staff steps, spelled from the key (docs/COMPOSE_DESIGN.md §7.1).
 * items: [{ ev, pi? }] — a pitch, or every pitch of the event. A move that
 * would land a pitch on another pitch of the same chord, or off the staff's
 * range, is refused with a Nudge and the document is untouched. Returns
 * { doc, pi } where `pi` is the moved pitch's index after the chord re-sorts
 * (single-pitch moves), so a selection can follow it.
 */
export function setPitch(doc, items, delta) {
  if (!delta) return { doc, pi: items[0]?.pi ?? null };
  const d = clone(doc);
  let movedPi = null;
  for (const it of items) {
    const f = find(d, it.ev);
    if (!f || f.ev.kind !== "note") continue;
    const clef = clefAt(d, f.bar, f.staff), key = keyAt(d, f.bar);
    const targets = it.pi !== undefined && it.pi !== null ? [f.ev.pitches[it.pi]] : [...f.ev.pitches];
    for (const p of targets) {
      const step = stepOf(p, clef) + delta;
      if (step < STEP_MIN || step > STEP_MAX) throw new Nudge("off the staff");
      const np = pitchFromStep(step, clef, key);
      if (f.ev.pitches.some((q) => q !== p && q.step === np.step && q.octave === np.octave)) throw new Nudge("that note is already in the chord");
      p.step = np.step; p.alter = np.alter; p.octave = np.octave;
    }
    f.ev.pitches.sort((a, b) => diatonicOf(a) - diatonicOf(b));
    if (targets.length === 1) movedPi = f.ev.pitches.indexOf(targets[0]);
  }
  return { doc: d, pi: movedPi };
}

/** Onsets of a voice: [{ ev, start, len }]. */
export function onsets(voice) {
  let t = 0;
  return voice.map((ev) => { const len = evTicks(ev); const o = { ev, start: t, len }; t += len; return o; });
}

/** Re-split every run of rests in a bar into standard groupings; throws if a voice does not add up. */
export function normalizeBar(doc, bar) {
  const time = timeAt(doc, bar), cap = capacity(time), m = doc.measures[bar];
  for (const staff of m.staves) {
    staff.voices = staff.voices.map((voice) => {
      const out = [];
      let pos = 0, gapStart = null, gapIds = [];
      const flush = () => {
        if (gapStart === null) return;
        const parts = splitRest(pos - gapStart, gapStart, time);
        parts.forEach((d, i) => { const r = restEvent(d); if (gapIds[i]) r.id = gapIds[i]; out.push(r); });
        gapStart = null; gapIds = [];
      };
      for (const ev of voice) {
        if (ev.kind === "rest") { if (gapStart === null) gapStart = pos; gapIds.push(ev.id); }
        else { flush(); out.push(ev); }
        pos += evTicks(ev);
      }
      flush();
      if (voiceTicks(out) !== cap) throw new Error(`bar ${bar + 1} does not add up (${voiceTicks(out)} of ${cap})`);
      return out;
    });
  }
  return doc;
}

/** Where a tap would land: { onset } for the armed duration inside the rest under `t`, or a Nudge. Does not change the document. */
export function snap(doc, { bar, staff, ticks: t }, armed) {
  const voice = doc.measures[bar].staves[staff].voices[0];
  const dur = ticks(armed), cap = capacity(timeAt(doc, bar));
  const tt = Math.max(0, Math.min(cap - 1, Math.round(t)));
  const os = onsets(voice);
  const hit = os.find((o) => tt >= o.start && tt < o.start + o.len) ?? os[os.length - 1];
  if (hit.ev.kind === "note") return { onset: hit.start, joins: hit.ev };
  // the run of rests around the tap
  let i0 = os.indexOf(hit), i1 = i0;
  while (i0 > 0 && os[i0 - 1].ev.kind === "rest") i0--;
  while (i1 < os.length - 1 && os[i1 + 1].ev.kind === "rest") i1++;
  const runStart = os[i0].start, runEnd = os[i1].start + os[i1].len;
  if (runEnd - runStart < dur) throw new Nudge("no room in this bar");
  const g = grid(armed), cands = [];
  for (let k = Math.ceil(runStart / g) * g; k <= runEnd - dur; k += g) cands.push(k);
  if (runStart <= runEnd - dur && !cands.includes(runStart)) cands.push(runStart);
  if (!cands.length) throw new Nudge("no room in this bar");
  const onset = cands.reduce((best, c) => (Math.abs(c - tt) < Math.abs(best - tt) ? c : best), cands[0]);
  return { onset, joins: null, runStart, runEnd };
}

/**
 * Place the armed duration at the tapped slot and step. Into a rest: the note
 * (or rest) consumes the rests under it. Onto a note's slot: the pitch joins the
 * chord. Returns { doc, ev, action: "place" | "chord" | "same" }.
 */
export function place(doc, slot, armed) {
  const d = clone(doc);
  const { bar, staff, step } = slot;
  const s = snap(d, slot, armed);
  const time = timeAt(d, bar), key = keyAt(d, bar), clef = clefAt(d, bar, staff);
  const voice = d.measures[bar].staves[staff].voices[0];
  if (s.joins) {
    if (armed.rest) throw new Nudge("that beat already has a note");
    const ev = voice.find((e) => e.id === s.joins.id);
    const p = pitchFromStep(step, clef, key);
    if (ev.pitches.some((q) => q.step === p.step && q.octave === p.octave)) return { doc, ev, action: "same" };
    ev.pitches.push(p);
    ev.pitches.sort((a, b) => diatonicOf(a) - diatonicOf(b));
    return { doc: d, ev, action: "chord" };
  }
  const dur = ticks(armed);
  const os = onsets(voice);
  const before = os.filter((o) => o.start + o.len <= s.runStart).map((o) => o.ev);
  const after = os.filter((o) => o.start >= s.runEnd).map((o) => o.ev);
  const ev = armed.rest ? restEvent(armed) : noteEvent(armed, [pitchFromStep(step, clef, key)]);
  const gapA = s.onset - s.runStart, gapB = s.runEnd - (s.onset + dur);
  const mid = [
    ...(gapA > 0 ? splitRest(gapA, s.runStart, time).map(restEvent) : []),
    ev,
    ...(gapB > 0 ? splitRest(gapB, s.onset + dur, time).map(restEvent) : []),
  ];
  d.measures[bar].staves[staff].voices[0] = [...before, ...mid, ...after];
  normalizeBar(d, bar);
  if (bar === d.measures.length - 1 && !isEmptyBar(d.measures[bar])) appendBar(d);
  return { doc: d, ev, action: "place" };
}

/** Find an event anywhere: { bar, staff, voice, index, ev } or null. */
export function find(doc, evId) {
  for (let bar = 0; bar < doc.measures.length; bar++) {
    const m = doc.measures[bar];
    for (let staff = 0; staff < m.staves.length; staff++) {
      const voices = m.staves[staff].voices;
      for (let voice = 0; voice < voices.length; voice++) {
        const index = voices[voice].findIndex((e) => e.id === evId);
        if (index >= 0) return { bar, staff, voice, index, ev: voices[voice][index] };
      }
    }
  }
  return null;
}

/**
 * Remove things: [{ ev, pi? }]. A pitch leaves its chord; the last pitch (or a
 * whole event, or a rest) becomes a rest of the same duration. Bars are
 * re-normalised; the document is returned unchanged when nothing matched.
 */
export function remove(doc, items) {
  const d = clone(doc);
  const bars = new Set();
  const byEv = new Map();
  for (const it of items) { if (!byEv.has(it.ev)) byEv.set(it.ev, new Set()); if (it.pi !== undefined && it.pi !== null) byEv.get(it.ev).add(it.pi); else byEv.get(it.ev).add("*"); }
  for (const [evId, pis] of byEv) {
    const f = find(d, evId);
    if (!f) continue;
    const voice = d.measures[f.bar].staves[f.staff].voices[f.voice];
    if (f.ev.kind === "note" && !pis.has("*") && pis.size < f.ev.pitches.length) {
      f.ev.pitches = f.ev.pitches.filter((_, i) => !pis.has(i));
    } else {
      voice[f.index] = restEvent(f.ev.dur);
    }
    bars.add(f.bar);
  }
  if (!bars.size) return doc;
  for (const bar of bars) normalizeBar(d, bar);
  return d;
}

/** Append an empty bar (in place — used by place; callers pass a clone). */
export function appendBar(doc) {
  doc.measures.push(newMeasure(doc.parts[0].staves));
  return doc;
}

/** Drop trailing empty bars beyond one, never below the default eight. */
export function trimBars(doc) {
  const d = clone(doc);
  let last = d.measures.length - 1;
  while (last > 0 && isEmptyBar(d.measures[last])) last--;
  const keep = Math.max(DEFAULT_BARS, last + 2);
  if (d.measures.length > keep) d.measures.length = keep;
  return d;
}
