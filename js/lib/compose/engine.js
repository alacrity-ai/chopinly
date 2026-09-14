// Every edit as a function doc → doc (docs/COMPOSE_DESIGN.md §7). Each op
// clones the document, changes it, re-normalises the touched bar and returns
// the new document; a refused edit throws Nudge(sentence) and the document is
// untouched. Pure — node-testable.
import { ticks, capacity, splitRest, grid } from "./ticks.js";
import { clone, restEvent, noteEvent, newMeasure, timeAt, keyAt, clefAt, evTicks, voiceTicks, isEmptyBar, DEFAULT_BARS, eid } from "./model.js";
import { parsePitch, keyAlterations, CLEFS } from "../music.js";

export class Nudge extends Error { constructor(msg, { bar = null } = {}) { super(msg); this.name = "Nudge"; this.bar = bar; } }

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
  if (!delta) return { doc, pi: items[0]?.pi ?? null, moved: items.map((it) => ({ ev: it.ev, pi: it.pi ?? null })) };
  const d = clone(doc);
  const byEv = new Map();
  for (const it of items) { if (!byEv.has(it.ev)) byEv.set(it.ev, new Set()); byEv.get(it.ev).add(it.pi === undefined || it.pi === null ? "*" : it.pi); }
  const moved = [];
  let movedPi = null;
  for (const [evId, pis] of byEv) {
    const f = find(d, evId);
    if (!f || f.ev.kind !== "note") continue;
    const clef = clefAt(d, f.bar, f.staff), key = keyAt(d, f.bar);
    const targets = pis.has("*") ? [...f.ev.pitches] : [...pis].map((i) => f.ev.pitches[i]).filter(Boolean);
    for (const p of targets) {
      const step = stepOf(p, clef) + delta;
      if (step < STEP_MIN || step > STEP_MAX) throw new Nudge("off the staff", { bar: f.bar });
      const np = pitchFromStep(step, clef, key);
      p.step = np.step; p.alter = np.alter; p.octave = np.octave;
    }
    const seen = new Set();
    for (const q of f.ev.pitches) { const k = q.step + q.octave; if (seen.has(k)) throw new Nudge("that note is already in the chord", { bar: f.bar }); seen.add(k); }
    f.ev.pitches.sort((a, b) => diatonicOf(a) - diatonicOf(b));
    for (const p of targets) moved.push({ ev: evId, pi: f.ev.pitches.indexOf(p) });
    if (targets.length === 1 && byEv.size === 1) movedPi = f.ev.pitches.indexOf(targets[0]);
  }
  return { doc: d, pi: movedPi, moved };
}

/**
 * Retype events to a duration (docs/COMPOSE_DESIGN.md §7.1). Shorter → the
 * difference becomes rests after it; longer → consumes the rests that follow
 * it in the bar. All or nothing: if any event cannot fit, the Nudge names the
 * bar and the document is untouched. Rests are not retyped (they are the gaps).
 */
export function retype(doc, evIds, dur) {
  const d = clone(doc);
  const bars = new Set();
  const found = evIds.map((id) => find(d, id)).filter(Boolean);
  if (found.some((f) => f.ev.kind !== "note")) throw new Nudge("pick notes to retype");
  // left to right within a bar so an earlier note's growth is seen by the next
  found.sort((a, b) => a.bar - b.bar || a.staff - b.staff || a.index - b.index);
  for (const f of found) {
    const voice = d.measures[f.bar].staves[f.staff].voices[f.voice];
    const idx = voice.indexOf(f.ev);
    const ev = voice[idx];
    const time = timeAt(d, f.bar);
    const oldLen = ticks(ev.dur), newLen = ticks(dur);
    const start = onsets(voice)[idx].start;
    ev.dur = { base: dur.base, dots: dur.dots ?? 0, ...(dur.tuplet ? { tuplet: dur.tuplet } : {}) };
    if (newLen < oldLen) {
      voice.splice(idx + 1, 0, ...splitRest(oldLen - newLen, start + newLen, time).map(restEvent));
    } else if (newLen > oldLen) {
      let need = newLen - oldLen, k = idx + 1, got = 0;
      while (got < need) {
        const nx = voice[k];
        if (!nx || nx.kind !== "rest") throw new Nudge("too long for this bar", { bar: f.bar });
        got += ticks(nx.dur); voice.splice(k, 1);
      }
      if (got > need) voice.splice(idx + 1, 0, ...splitRest(got - need, start + newLen, time).map(restEvent));
    }
    bars.add(f.bar);
  }
  for (const bar of bars) normalizeBar(d, bar);
  return d;
}

/** Notes → rests of the same length (a rest has no pitch to become a note). */
export function toRests(doc, evIds) {
  const d = clone(doc);
  const bars = new Set();
  for (const id of evIds) {
    const f = find(d, id);
    if (!f || f.ev.kind !== "note") continue;
    const voice = d.measures[f.bar].staves[f.staff].voices[f.voice];
    const r = restEvent(f.ev.dur); r.id = f.ev.id;
    voice[voice.indexOf(f.ev)] = r;
    bars.add(f.bar);
  }
  if (!bars.size) return doc;
  for (const bar of bars) normalizeBar(d, bar);
  return d;
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
  if (runEnd - runStart < dur) throw new Nudge("no room in this bar", { bar });
  const g = grid(armed), cands = [];
  for (let k = Math.ceil(runStart / g) * g; k <= runEnd - dur; k += g) cands.push(k);
  if (runStart <= runEnd - dur && !cands.includes(runStart)) cands.push(runStart);
  if (!cands.length) throw new Nudge("no room in this bar", { bar });
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
    if (armed.rest) throw new Nudge("that beat already has a note", { bar });
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

// --- clipboard: a phrase relative to its own origin (docs/COMPOSE_DESIGN.md §7.1) ---

/** Absolute tick at which each bar starts, plus the total. */
export function barStarts(doc) {
  const out = [];
  let t = 0;
  for (let b = 0; b < doc.measures.length; b++) { out.push(t); t += capacity(timeAt(doc, b)); }
  return { starts: out, total: t };
}
/** Bar index + local tick for an absolute tick (the last bar is not open-ended: past the end → null). */
export function locate(doc, abs) {
  const { starts } = barStarts(doc);
  for (let b = starts.length - 1; b >= 0; b--) if (abs >= starts[b]) { const cap = capacity(timeAt(doc, b)); return abs < starts[b] + cap ? { bar: b, ticks: abs - starts[b], cap } : null; }
  return null;
}

/**
 * The selection as a phrase: items [{ ev, pi? }] → { events: [{ dStaff, offset,
 * kind, dur, pitches? }], span, staves }. Offsets count from the earliest
 * selected onset; staves from the topmost selected staff. A chord with only
 * some pitches selected copies just those.
 */
export function clipFrom(doc, items) {
  const { starts } = barStarts(doc);
  const byEv = new Map();
  for (const it of items) { if (!byEv.has(it.ev)) byEv.set(it.ev, new Set()); byEv.get(it.ev).add(it.pi === undefined || it.pi === null ? "*" : it.pi); }
  const raw = [];
  for (const [evId, pis] of byEv) {
    const f = find(doc, evId);
    if (!f) continue;
    const voice = doc.measures[f.bar].staves[f.staff].voices[f.voice];
    const abs = starts[f.bar] + onsets(voice)[f.index].start;
    const ev = f.ev;
    const pitches = ev.kind === "note" ? (pis.has("*") ? ev.pitches : ev.pitches.filter((_, i) => pis.has(i))).map((p) => ({ ...p })) : null;
    raw.push({ abs, staff: f.staff, kind: ev.kind, dur: { ...ev.dur }, pitches, len: evTicks(ev) });
  }
  if (!raw.length) return null;
  const origin = Math.min(...raw.map((r) => r.abs)), top = Math.min(...raw.map((r) => r.staff));
  const events = raw.sort((a, b) => a.abs - b.abs || a.staff - b.staff).map((r) => ({ dStaff: r.staff - top, offset: r.abs - origin, kind: r.kind, dur: r.dur, pitches: r.pitches, len: r.len }));
  return { events, span: Math.max(...raw.map((r) => r.abs + r.len)) - origin, staves: Math.max(...events.map((e) => e.dStaff)) + 1 };
}

/**
 * Drop a phrase at { bar, ticks, staff } (staff = where the phrase's top staff
 * lands; clamped so every staff of the phrase exists). The region the phrase
 * covers is cleared first — anything overlapping it goes — then the phrase is
 * written, and bars are appended if it runs past the end. An event that would
 * straddle a barline refuses the whole drop. Returns { doc, keys } with the
 * selection keys of what was pasted.
 */
export function paste(doc, clip, { bar, ticks: t, staff = 0 }) {
  if (!clip?.events.length) throw new Nudge("nothing to paste");
  const d = clone(doc);
  const nStaves = d.parts[0].staves;
  const top = Math.max(0, Math.min(nStaves - clip.staves, staff));
  const A0 = barStarts(d).starts[bar] + Math.max(0, Math.round(t));
  // make room: append bars until the whole span fits
  while (barStarts(d).total < A0 + clip.span) appendBar(d);
  const placed = []; // { bar, staff, start, ev }
  for (const e of clip.events) {
    const loc = locate(d, A0 + e.offset);
    if (!loc) throw new Nudge("that runs off the end", { bar: d.measures.length - 1 });
    if (loc.ticks + e.len > loc.cap) throw new Nudge("that would cross a barline", { bar: loc.bar });
    const ev = e.kind === "rest" ? restEvent(e.dur) : { id: eid(), kind: "note", dur: { ...e.dur }, pitches: e.pitches.map((p) => ({ ...p })) };
    placed.push({ bar: loc.bar, staff: top + e.dStaff, start: loc.ticks, ev });
  }
  // rebuild every touched (bar, staff): keep what lies outside the region, drop what overlaps it, add the phrase, fill the gaps
  const touched = new Map();
  for (const p of placed) { const k = `${p.bar}:${p.staff}`; if (!touched.has(k)) touched.set(k, []); touched.get(k).push(p); }
  const { starts } = barStarts(d);
  for (const [k, items] of touched) {
    const [b, st] = k.split(":").map(Number);
    const time = timeAt(d, b), cap = capacity(time);
    const r0 = Math.max(0, A0 - starts[b]), r1 = Math.min(cap, A0 + clip.span - starts[b]);
    const voice = d.measures[b].staves[st].voices[0];
    const keep = onsets(voice).filter((o) => o.start + o.len <= r0 || o.start >= r1).map((o) => ({ start: o.start, len: o.len, ev: o.ev }));
    const all = [...keep, ...items.map((p) => ({ start: p.start, len: evTicks(p.ev), ev: p.ev }))].sort((a, b2) => a.start - b2.start);
    const out = [];
    let pos = 0;
    for (const x of all) {
      if (x.start < pos) throw new Nudge("those overlap", { bar: b });
      if (x.start > pos) out.push(...splitRest(x.start - pos, pos, time).map(restEvent));
      out.push(x.ev); pos = x.start + x.len;
    }
    if (pos < cap) out.push(...splitRest(cap - pos, pos, time).map(restEvent));
    d.measures[b].staves[st].voices[0] = out;
    normalizeBar(d, b);
  }
  const keys = placed.flatMap((p) => (p.ev.kind === "note" ? p.ev.pitches.map((_, i) => `${p.ev.id}:${i}`) : [p.ev.id]));
  return { doc: d, keys };
}
