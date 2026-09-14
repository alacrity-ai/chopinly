// Every edit as a function doc → doc (docs/COMPOSE_DESIGN.md §7). Each op
// clones the document, changes it, re-normalises the touched bar and returns
// the new document; a refused edit throws Nudge(sentence) and the document is
// untouched. Pure — node-testable.
import { groupSize, ticks, capacity, splitRest, fromTicks } from "./ticks.js";
import { clone, restEvent, noteEvent, durOf, newMeasure, barRests, timeAt, keyAt, clefAt, evTicks, voiceTicks, isEmptyBar, voicesOf, MAX_VOICES, REST_Y_MAX, DEFAULT_BARS, eid } from "./model.js";
import { parsePitch, keyAlterations, CLEFS } from "../music.js";

export class Nudge extends Error { constructor(msg, { bar = null } = {}) { super(msg); this.name = "Nudge"; this.bar = bar; } }

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const PLAIN_BASES = [1, 2, 4, 8, 16, 32, 64];

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
const samePitch = (a, b) => a.step === b.step && a.octave === b.octave && a.alter === b.alter;
const keyAlt = (key, step) => keyAlterations(key.fifths).get(step) ?? 0;

// --- tuplets ----------------------------------------------------------------
/** n in the time of `in`, per the palette: duplet 2:3, triplet 3:2, quintuplet 5:4, sextuplet 6:4, septuplet 7:4. */
export const TUPLET_IN = { 2: 3, 3: 2, 5: 4, 6: 4, 7: 4 };
export const tupletOf = (n, id = `t${eid()}`) => ({ n, in: TUPLET_IN[n], id });
/** Rests filling a gap inside a tuplet group: tuplet-valued, longest first. */
export function splitTupletGap(gap, tuplet) {
  const out = [];
  let left = gap;
  for (const base of PLAIN_BASES) { const v = ticks({ base, tuplet }); while (left >= v) { out.push({ base, dots: 0, tuplet }); left -= v; } }
  if (left) throw new Error(`cannot fill ${gap} ticks inside a tuplet`);
  return out;
}
const groupId = (ev) => ev.dur.tuplet?.id ?? null;
/** The rests for a gap: plain (standard splits) or, inside a tuplet group, tuplet-valued. */
const fill = (gap, at, time, tuplet) => (gap > 0 ? (tuplet ? splitTupletGap(gap, tuplet) : splitRest(gap, at, time)).map(restEvent) : []);

/** items [{ ev, pi? }] → Map(evId → Set(pi | "*")). */
function groupItems(items) {
  const byEv = new Map();
  for (const it of items) { if (!byEv.has(it.ev)) byEv.set(it.ev, new Set()); byEv.get(it.ev).add(it.pi === undefined || it.pi === null ? "*" : it.pi); }
  return byEv;
}
/** The selected pitches of a note per item group: [{ f, ps }]. */
function targets(d, items) {
  const out = [];
  for (const [evId, pis] of groupItems(items)) {
    const f = find(d, evId);
    if (!f || f.ev.kind !== "note") continue;
    const ps = pis.has("*") ? [...f.ev.pitches] : [...pis].map((i) => f.ev.pitches[i]).filter(Boolean);
    if (ps.length) out.push({ f, ps });
  }
  return out;
}

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
  const byEv = groupItems(items);
  const moved = [];
  let movedPi = null;
  for (const [evId, pis] of byEv) {
    const f = find(d, evId);
    if (!f || f.ev.kind !== "note") continue;
    const clef = clefAt(d, f.bar, f.staff, onsetOf(d.measures[f.bar].staves[f.staff].voices[f.voice], f.ev)), key = keyAt(d, f.bar);
    const targets = pis.has("*") ? [...f.ev.pitches] : [...pis].map((i) => f.ev.pitches[i]).filter(Boolean);
    for (const p of targets) {
      const step = stepOf(p, clef) + delta;
      if (step < STEP_MIN || step > STEP_MAX) throw new Nudge("off the staff", { bar: f.bar });
      const np = pitchFromStep(step, clef, key);
      p.step = np.step; p.alter = np.alter; p.octave = np.octave; delete p.acc;
    }
    const seen = new Set();
    for (const q of f.ev.pitches) { const k = q.step + q.octave; if (seen.has(k)) throw new Nudge("that note is already in the chord", { bar: f.bar }); seen.add(k); }
    f.ev.pitches.sort((a, b) => diatonicOf(a) - diatonicOf(b));
    for (const p of targets) moved.push({ ev: evId, pi: f.ev.pitches.indexOf(p) });
    if (targets.length === 1 && byEv.size === 1) movedPi = f.ev.pitches.indexOf(targets[0]);
  }
  cleanTies(d);
  return { doc: d, pi: movedPi, moved };
}

/**
 * Retype events to a duration (docs/COMPOSE_DESIGN.md §7.1) — `dur` is a
 * duration or a function of the event. Shorter → the difference becomes rests
 * after it; longer → consumes the rests that follow it in the bar. Inside a
 * tuplet the ratio is kept and only that group's rests are consumed or made.
 * All or nothing: if any event cannot fit, the Nudge names the bar and the
 * document is untouched. Rests are not retyped (they are the gaps).
 */
export function retype(doc, evIds, dur) {
  const d = clone(doc);
  const bars = new Set();
  const found = evIds.map((id) => find(d, id)).filter(Boolean);
  if (found.some((f) => f.ev.kind !== "note")) throw new Nudge("pick notes to retype");
  // left to right within a bar so an earlier note's growth is seen by the next
  found.sort((a, b) => a.bar - b.bar || a.staff - b.staff || a.voice - b.voice || a.index - b.index);
  for (const f of found) {
    const voice = d.measures[f.bar].staves[f.staff].voices[f.voice];
    const idx = voice.indexOf(f.ev);
    const ev = voice[idx];
    const time = timeAt(d, f.bar);
    const want = typeof dur === "function" ? dur(ev) : dur;
    const tuplet = ev.dur.tuplet ?? null;
    const oldLen = ticks(ev.dur), newLen = ticks({ base: want.base, dots: want.dots ?? 0, tuplet });
    const start = onsets(voice)[idx].start;
    ev.dur = durOf({ base: want.base, dots: want.dots ?? 0, tuplet });
    if (newLen < oldLen) {
      voice.splice(idx + 1, 0, ...fill(oldLen - newLen, start + newLen, time, tuplet));
    } else if (newLen > oldLen) {
      let need = newLen - oldLen, k = idx + 1, got = 0;
      while (got < need) {
        const nx = voice[k];
        if (!nx || nx.kind !== "rest" || groupId(nx) !== (tuplet?.id ?? null)) throw new Nudge(tuplet ? "too long for this tuplet" : "too long for this bar", { bar: f.bar });
        got += ticks(nx.dur); voice.splice(k, 1);
      }
      if (got > need) voice.splice(idx + 1, 0, ...fill(got - need, start + newLen, time, tuplet));
    }
    bars.add(f.bar);
  }
  for (const bar of bars) normalizeBar(d, bar);
  cleanTies(d);
  return d;
}

/** Dot (dots = 1 or 2) or undot (0) notes: a retype that keeps each note's base. */
export const dot = (doc, evIds, dots) => retype(doc, evIds, (ev) => ({ base: ev.dur.base, dots }));

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
  cleanTies(d);
  return d;
}

/**
 * Tie (docs/COMPOSE_DESIGN.md §2): one note selected → each of its pitches ties
 * to the same pitch in the next event of the staff (across a barline included);
 * several selected → only pitches whose next event is also selected. A chord
 * ties every pitch that has a match. Every selected pitch already tied → untie.
 * Nothing tieable → Nudge "tie needs the same pitch next".
 */
export function tie(doc, items) {
  const d = clone(doc);
  const ts = targets(d, items);
  if (!ts.length) throw new Nudge("pick a note to tie");
  const all = ts.flatMap((t) => t.ps);
  const starts = all.filter((p) => p.tie === "start" || p.tie === "both");
  if (starts.length === all.length) { for (const p of starts) { if (p.tie === "both") p.tie = "stop"; else delete p.tie; } cleanTies(d); return d; }
  const selected = new Set(ts.map((t) => t.f.ev.id));
  let tied = 0;
  for (const { f, ps } of ts) {
    const nx = nextEvent(d, f);
    if (!nx || nx.kind !== "note" || (ts.length > 1 && !selected.has(nx.id))) continue;
    for (const p of ps) {
      if (p.tie === "start" || p.tie === "both") continue;
      if (nx.pitches.some((q) => samePitch(p, q))) { p.tie = p.tie === "stop" ? "both" : "start"; tied++; }
    }
  }
  if (!tied) throw new Nudge("tie needs the same pitch next", { bar: ts[0].f.bar });
  cleanTies(d);
  return d;
}
/**
 * Slur (docs/COMPOSE_DESIGN.md §7.1): from the earliest selected note of a staff to the latest
 * (one note: to the staff's next note). A slur is a pair of entries sharing an id —
 * `ev.slurs: [{ id, at: "start" | "stop" }]` — so slurs may nest, overlap, and share a note
 * as an end (a phrasing slur over articulation slurs), and an edit can never leave half of one
 * (`cleanSlurs`). The same span again removes it.
 */
export function slur(doc, evIds) {
  const d = clone(doc);
  const fs = [...new Set(evIds)].map((id) => find(d, id)).filter((f) => f && f.ev.kind === "note");
  if (!fs.length) throw new Nudge("pick the notes to slur");
  for (const list of byLine(fs).values()) {
    const a = list[0].ev;
    let b = list[list.length - 1].ev;
    if (b === a) b = nextNote(d, list[0]);
    if (!b || b.kind !== "note") throw new Nudge("slur needs a note after it", { bar: list[0].bar });
    const have = (a.slurs ?? []).find((x) => x.at === "start" && (b.slurs ?? []).some((y) => y.id === x.id && y.at === "stop"));
    if (have) { // exactly this slur exists → off
      a.slurs = a.slurs.filter((x) => x.id !== have.id); if (!a.slurs.length) delete a.slurs;
      b.slurs = b.slurs.filter((x) => x.id !== have.id); if (!b.slurs.length) delete b.slurs;
    } else {
      const id = `s${eid()}`;
      a.slurs = [...(a.slurs ?? []), { id, at: "start" }];
      b.slurs = [...(b.slurs ?? []), { id, at: "stop" }];
    }
  }
  cleanSlurs(d);
  return d;
}
/** Every event of one voice of one staff across the piece, in order (a voice absent from a bar contributes nothing). */
export const seqOf = (doc, staff, voice) => doc.measures.flatMap((m) => m.staves[staff].voices[voice] ?? []);
/** Found events grouped by the line they sit in (staff + voice), each list in score order. */
function byLine(fs) {
  const out = new Map();
  for (const f of fs) { const k = `${f.staff}:${f.voice}`; if (!out.has(k)) out.set(k, []); out.get(k).push(f); }
  for (const list of out.values()) list.sort((a, b) => a.bar - b.bar || a.index - b.index);
  return out;
}
/** The note the slur `id` starting at `ev` ends on (later in its voice's sequence), or null. */
export function slurEnd(doc, staff, voice, ev, id) {
  const seq = seqOf(doc, staff, voice);
  const i = seq.indexOf(ev);
  if (i < 0) return null;
  for (let k = i + 1; k < seq.length; k++) if (seq[k].slurs?.some((x) => x.id === id && x.at === "stop")) return seq[k];
  return null;
}
/** Re-derive every slur: rests carry none; a start without a stop later in its voice (or the reverse) is dropped. */
export function cleanSlurs(doc) {
  const nStaves = doc.parts[0].staves;
  for (let staff = 0; staff < nStaves; staff++) for (let voice = 0; voice < MAX_VOICES; voice++) {
    const seq = seqOf(doc, staff, voice);
    if (!seq.length) continue;
    const startAt = new Map(), stopAt = new Map();
    seq.forEach((e, i) => { if (e.kind !== "note") { delete e.slurs; return; } for (const x of e.slurs ?? []) { const m = x.at === "start" ? startAt : stopAt; if (!m.has(x.id)) m.set(x.id, i); } });
    const ok = (x) => startAt.has(x.id) && stopAt.has(x.id) && startAt.get(x.id) < stopAt.get(x.id);
    for (const e of seq) {
      if (!e.slurs) continue;
      const seen = new Set();
      e.slurs = e.slurs.filter((x) => ok(x) && !seen.has(`${x.id}:${x.at}`) && seen.add(`${x.id}:${x.at}`));
      if (!e.slurs.length) delete e.slurs;
    }
  }
  return doc;
}
/**
 * The event after `f` in its voice, adjacent in time: the next in the bar, else the first of the
 * next bar when the voice is there. A voice absent from the next bar has nothing next (silence),
 * so a tie or a gliss never reaches across a bar the voice does not sound in.
 */
export function nextEvent(doc, f) {
  const voice = doc.measures[f.bar].staves[f.staff].voices[f.voice];
  const i = voice.indexOf(f.ev);
  if (i >= 0 && i + 1 < voice.length) return voice[i + 1];
  return doc.measures[f.bar + 1]?.staves[f.staff].voices[f.voice]?.[0] ?? null;
}
/** The next note of `f`'s voice anywhere later in the piece (rests and silent bars skipped) — what a one-note slur or hairpin reaches for. */
export function nextNote(doc, f) {
  const seq = seqOf(doc, f.staff, f.voice);
  for (let k = seq.indexOf(f.ev) + 1; k < seq.length; k++) if (seq[k].kind === "note") return seq[k];
  return null;
}
/**
 * Re-derive every tie: a `start` survives only when the next event of its
 * voice holds the same spelled pitch, and that pitch is marked `stop` (or
 * `both`). Runs after every edit, so no tie ever dangles.
 */
export function cleanTies(doc) {
  const nStaves = doc.parts[0].staves;
  for (let staff = 0; staff < nStaves; staff++) for (let voice = 0; voice < MAX_VOICES; voice++) {
    const seq = seqOf(doc, staff, voice);
    if (!seq.length) continue;
    for (const ev of seq) for (const p of ev.pitches ?? []) { if (p.tie === "stop") delete p.tie; else if (p.tie === "both") p.tie = "start"; }
    for (let bar = 0; bar < doc.measures.length; bar++) {
      const v = doc.measures[bar].staves[staff].voices[voice];
      if (!v) continue;
      for (const ev of v) {
        if (ev.kind !== "note") continue;
        const nx = nextEvent(doc, { bar, staff, voice, ev }); // adjacent in time — never across a bar the voice is silent in
        if (ev.gliss && nx?.kind !== "note") delete ev.gliss;
        for (const p of ev.pitches) {
          if (p.tie !== "start" && p.tie !== "both") continue;
          const q = nx?.kind === "note" ? nx.pitches.find((x) => samePitch(p, x)) : null;
          if (!q) { if (p.tie === "both") p.tie = "stop"; else delete p.tie; continue; }
          q.tie = q.tie === "start" ? "both" : "stop";
        }
      }
    }
  }
  cleanSlurs(doc); cleanHairpins(doc); // slurs and hairpins are re-derived with the ties, so every edit path keeps them whole
  return doc;
}

/**
 * Accidental (docs/COMPOSE_DESIGN.md §7.1): set `alter` on the selected
 * pitches. Pressing the accidental a pitch already has takes it back to the
 * key's spelling; a natural (or any accidental) the key already implies is
 * drawn as a cautionary (`acc: "show"`), and pressing it again hides it.
 */
export function accidental(doc, items, alter) {
  const d = clone(doc);
  const ts = targets(d, items);
  if (!ts.length) throw new Nudge("pick a note for the accidental");
  for (const { f, ps } of ts) {
    const key = keyAt(d, f.bar);
    for (const p of ps) spell(p, alter, keyAlt(key, p.step));
  }
  cleanTies(d);
  return d;
}
/** Apply an explicit accidental to a pitch given the key's alteration for its letter. */
function spell(p, alter, ka) {
  if (p.alter === alter) {
    if (alter === ka) { if (p.acc === "show") delete p.acc; else p.acc = "show"; }
    else { p.alter = ka; delete p.acc; }
  } else {
    p.alter = alter;
    if (alter === ka) p.acc = "show"; else delete p.acc;
  }
}

/**
 * Tuplet (docs/COMPOSE_DESIGN.md §2): the selected run of events (side by
 * side in one voice) becomes n in the time of `in`: their durations keep base
 * and dots, gain the ratio, and the time they free becomes rests after the
 * group. Their plain total must be n × a plain value. If the run is already
 * one tuplet group, the group is undone: durations go plain and the rests
 * after it are consumed (Nudge when they do not suffice).
 */
export function tuplet(doc, evIds, n = 3) {
  if (!TUPLET_IN[n]) throw new Nudge("tuplets come in 2, 3, 5, 6 or 7");
  const d = clone(doc);
  const found = [...new Set(evIds)].map((id) => find(d, id)).filter(Boolean).sort((a, b) => a.bar - b.bar || a.staff - b.staff || a.index - b.index);
  if (!found.length) throw new Nudge("pick the notes to make a tuplet");
  const f0 = found[0];
  if (found.some((f) => f.bar !== f0.bar || f.staff !== f0.staff || f.voice !== f0.voice)) throw new Nudge("pick a run of notes in one bar", { bar: f0.bar });
  if (found.some((f, i) => f.index !== f0.index + i)) throw new Nudge("pick notes side by side", { bar: f0.bar });
  const voice = d.measures[f0.bar].staves[f0.staff].voices[f0.voice], time = timeAt(d, f0.bar);
  const gids = new Set(found.map((f) => groupId(f.ev)));
  if (gids.size === 1 && !gids.has(null)) { // undo the whole group
    const gid = [...gids][0];
    const members = voice.filter((e) => groupId(e) === gid);
    const last = voice.indexOf(members[members.length - 1]);
    const start = onsets(voice)[voice.indexOf(members[0])].start;
    const plain = members.reduce((s, e) => s + ticks({ base: e.dur.base, dots: e.dur.dots }), 0);
    const now = members.reduce((s, e) => s + ticks(e.dur), 0);
    let need = plain - now, got = 0, k = last + 1;
    while (got < need) {
      const nx = voice[k];
      if (!nx || nx.kind !== "rest" || groupId(nx)) throw new Nudge("no room to undo the tuplet", { bar: f0.bar });
      got += ticks(nx.dur); voice.splice(k, 1);
    }
    for (const e of members) e.dur = durOf({ base: e.dur.base, dots: e.dur.dots });
    if (got > need) voice.splice(last + 1, 0, ...fill(got - need, start + plain, time, null));
    normalizeBar(d, f0.bar); cleanTies(d);
    return d;
  }
  if (gids.size > 1 || !gids.has(null)) throw new Nudge("those are already in a tuplet", { bar: f0.bar });
  const T = found.reduce((s, f) => s + ticks(f.ev.dur), 0);
  if (!Number.isInteger(T / n) || !fromTicks(T / n)) throw new Nudge(`those don't make a tuplet of ${n}`, { bar: f0.bar });
  if (!found.some((f) => f.ev.kind === "note")) throw new Nudge("a tuplet needs a note", { bar: f0.bar });
  const tp = tupletOf(n);
  const start = onsets(voice)[f0.index].start, span = (T * tp.in) / n, end = f0.index + found.length;
  if (span > T) { // a duplet takes more room than the run it replaces: the rests after it give way
    let need = span - T, got = 0;
    while (got < need) {
      const nx = voice[end];
      if (!nx || nx.kind !== "rest" || groupId(nx)) throw new Nudge(`no room for the ${n === 2 ? "duplet" : "tuplet"}`, { bar: f0.bar });
      got += ticks(nx.dur); voice.splice(end, 1);
    }
    for (const f of found) f.ev.dur = durOf({ ...f.ev.dur, tuplet: tp });
    if (got > need) voice.splice(end, 0, ...fill(got - need, start + span, time, null));
  } else {
    for (const f of found) f.ev.dur = durOf({ ...f.ev.dur, tuplet: tp });
    voice.splice(end, 0, ...fill(T - span, start + span, time, null));
  }
  normalizeBar(d, f0.bar); cleanTies(d);
  return d;
}

/** Onsets of a voice: [{ ev, start, len }]. */
export function onsets(voice) {
  let t = 0;
  return voice.map((ev) => { const len = evTicks(ev); const o = { ev, start: t, len }; t += len; return o; });
}
/** The tick inside its bar at which an event starts. */
export const onsetOf = (voice, ev) => onsets(voice).find((o) => o.ev === ev)?.start ?? 0;

/**
 * Re-split every run of plain rests in a bar into standard groupings; a tuplet
 * group that is all rests dissolves into plain rests; other tuplet rests stay
 * as they are. Throws if a voice does not add up.
 */
export function normalizeBar(doc, bar) {
  const time = timeAt(doc, bar), cap = capacity(time), m = doc.measures[bar];
  for (const staff of m.staves) {
    staff.voices = staff.voices.map((voice) => {
      if (!voice) return null;
      const live = new Set(voice.filter((e) => e.kind === "note" && e.dur.tuplet).map(groupId));
      const out = [];
      let pos = 0, gapStart = null, gapEvs = [];
      const flush = () => {
        if (gapStart === null) return;
        const parts = splitRest(pos - gapStart, gapStart, time);
        let at = gapStart;
        parts.forEach((d, i) => {
          const r = restEvent(d);
          if (gapEvs[i]) r.id = gapEvs[i].ev.id;
          // a rest that comes back at the same onset with the same length keeps its look (hidden / dragged)
          const same = gapEvs.find((g) => g.at === at && evTicks(g.ev) === ticks(d));
          if (same?.ev.hidden) r.hidden = true;
          if (same?.ev.restY) r.restY = same.ev.restY;
          at += ticks(d);
          out.push(r);
        });
        gapStart = null; gapEvs = [];
      };
      for (const ev of voice) {
        const plainRest = ev.kind === "rest" && (!ev.dur.tuplet || !live.has(ev.dur.tuplet.id));
        if (plainRest) { if (gapStart === null) gapStart = pos; gapEvs.push({ ev, at: pos }); }
        else { flush(); out.push(ev); }
        pos += evTicks(ev);
      }
      flush();
      if (voiceTicks(out) !== cap) throw new Error(`bar ${bar + 1} does not add up (${voiceTicks(out)} of ${cap})`);
      return out;
    });
    compactVoices(staff);
  }
  return doc;
}
/** A secondary voice left with only rests leaves the bar; trailing empty slots go too (docs/COMPOSE_VOICES_DESIGN.md §3). */
export function compactVoices(staff) {
  staff.voices = staff.voices.map((v, vi) => (vi > 0 && v && !v.some((e) => e.kind === "note") ? null : v));
  while (staff.voices.length > 1 && !staff.voices[staff.voices.length - 1]) staff.voices.pop();
  return staff;
}
/** The voice `vi` of a staff in a bar, created as one bar of rests when absent (in place). */
export function ensureVoice(doc, bar, staff, vi) {
  if (!Number.isInteger(vi) || vi < 0 || vi >= MAX_VOICES) throw new Nudge(`voices run 1 to ${MAX_VOICES}`, { bar });
  const st = doc.measures[bar].staves[staff];
  while (st.voices.length <= vi) st.voices.push(null);
  st.voices[vi] ??= barRests(timeAt(doc, bar));
  return st.voices[vi];
}

/**
 * Where a tap would land: { onset } for the armed duration inside the rest
 * under `t`, or a Nudge. Inside a tuplet group the armed base takes the
 * group's ratio; with a tuplet armed on plain rests, a whole new group has to
 * fit. Does not change the document.
 */
export function snap(doc, { bar, staff, ticks: t, voice: vi = 0 }, armed) {
  const time = timeAt(doc, bar);
  const voice = doc.measures[bar].staves[staff].voices[vi] ?? barRests(time); // a voice not in this bar yet: one bar of rests to tap into
  const cap = capacity(time);
  const tt = Math.max(0, Math.min(cap - 1, Math.round(t)));
  const os = onsets(voice);
  const hit = os.find((o) => tt >= o.start && tt < o.start + o.len) ?? os[os.length - 1];
  if (hit.ev.kind === "note") return { onset: hit.start, joins: hit.ev };
  // the run of rests around the tap, within one tuplet group (or plain)
  const gid = groupId(hit.ev);
  let i0 = os.indexOf(hit), i1 = i0;
  while (i0 > 0 && os[i0 - 1].ev.kind === "rest" && groupId(os[i0 - 1].ev) === gid) i0--;
  while (i1 < os.length - 1 && os[i1 + 1].ev.kind === "rest" && groupId(os[i1 + 1].ev) === gid) i1++;
  const runStart = os[i0].start, runEnd = os[i1].start + os[i1].len;
  const group = hit.ev.dur.tuplet ?? null;
  const newGroup = !group && armed.tuplet ? tupletOf(armed.tuplet) : null;
  const unit = ticks({ base: armed.base, dots: armed.dots ?? 0, tuplet: group ?? newGroup });
  const need = newGroup ? unit * newGroup.n : unit; // a new group needs its whole span (n tuplet units = `in` plain ones)
  if (runEnd - runStart < need) throw new Nudge(group ? "no room in this tuplet" : "no room in this bar", { bar });
  const cands = [];
  // plain rests snap to the bar's grid (beats first); inside a tuplet group the grid counts from the run's start
  for (let k = group ? runStart : Math.ceil(runStart / need) * need; k <= runEnd - need; k += need) cands.push(k);
  if (!cands.includes(runStart)) cands.push(runStart);
  const onset = cands.reduce((best, c) => (Math.abs(c - tt) < Math.abs(best - tt) ? c : best), cands[0]);
  return { onset, joins: null, runStart, runEnd, group, newGroup, unit, need };
}

/**
 * Place the armed duration at the tapped slot and step. Into a rest: the note
 * (or rest) consumes the rests under it (a new tuplet group brings its own
 * rests). Onto a note's slot: the pitch joins the chord (an armed accidental
 * respells a pitch already there). Returns { doc, ev, action: "place" |
 * "chord" | "same" | "alter" }.
 */
export function place(doc, slot, armed) {
  const d = clone(doc);
  const { bar, staff, step, voice: vi = 0 } = slot;
  if (!Number.isInteger(vi) || vi < 0 || vi >= MAX_VOICES) throw new Nudge(`voices run 1 to ${MAX_VOICES}`, { bar });
  const s = snap(d, slot, armed);
  const time = timeAt(d, bar), key = keyAt(d, bar), clef = clefAt(d, bar, staff, s.onset);
  if (armed.rest && !d.measures[bar].staves[staff].voices[vi]) return { doc, ev: null, action: "none" }; // a rest into a voice that is not there changes nothing (a silent voice draws nothing)
  const voice = ensureVoice(d, bar, staff, vi);
  const pitch = () => { const p = pitchFromStep(step, clef, key); if (armed.alter !== null && armed.alter !== undefined) spell(p, armed.alter, keyAlt(key, p.step)); return p; };
  if (s.joins) {
    if (armed.rest) throw new Nudge("that beat already has a note", { bar });
    const ev = voice.find((e) => e.id === s.joins.id);
    const p = pitch();
    const there = ev.pitches.find((q) => q.step === p.step && q.octave === p.octave);
    if (there) {
      if (armed.alter === null || armed.alter === undefined || (there.alter === p.alter && (there.acc ?? null) === (p.acc ?? null))) return { doc, ev, action: "same" };
      there.alter = p.alter; if (p.acc) there.acc = p.acc; else delete there.acc;
      cleanTies(d);
      return { doc: d, ev, action: "alter" };
    }
    ev.pitches.push(p);
    ev.pitches.sort((a, b) => diatonicOf(a) - diatonicOf(b));
    cleanTies(d);
    return { doc: d, ev, action: "chord" };
  }
  const tp = s.group ?? s.newGroup;
  const dur = { base: armed.base, dots: armed.dots ?? 0, tuplet: tp };
  const os = onsets(voice);
  const before = os.filter((o) => o.start + o.len <= s.runStart).map((o) => o.ev);
  const after = os.filter((o) => o.start >= s.runEnd).map((o) => o.ev);
  const ev = armed.rest ? restEvent(dur) : noteEvent(dur, [pitch()]);
  const gapA = s.onset - s.runStart, gapB = s.runEnd - (s.onset + s.need);
  const mid = [
    ...fill(gapA, s.runStart, time, s.group),
    ev,
    ...(s.newGroup ? fill(s.need - s.unit, s.onset + s.unit, time, s.newGroup) : []),
    ...fill(gapB, s.onset + s.need, time, s.group),
  ];
  d.measures[bar].staves[staff].voices[vi] = [...before, ...mid, ...after];
  normalizeBar(d, bar);
  cleanTies(d);
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
        if (!voices[voice]) continue;
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
  for (const [evId, pis] of groupItems(items)) {
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
  cleanTies(d);
  return d;
}

/** Append an empty bar (in place — used by place; callers pass a clone). */
export function appendBar(doc) {
  doc.measures.push(newMeasure(doc.parts[0].staves, timeAt(doc, doc.measures.length - 1)));
  return doc;
}
/** Keep one empty bar after the last bar with anything in it (in place). */
function ensureTrailingBar(doc) {
  if (!isEmptyBar(doc.measures[doc.measures.length - 1])) appendBar(doc);
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
 * some pitches selected copies just those. A tuplet travels whole: its
 * unselected members come along as rests, so the group still adds up.
 */
export function clipFrom(doc, items) {
  const { starts } = barStarts(doc);
  const byEv = groupItems(items);
  // whole tuplet groups
  for (const [evId] of [...byEv]) {
    const f = find(doc, evId);
    const gid = f && groupId(f.ev);
    if (!gid) continue;
    for (const e of doc.measures[f.bar].staves[f.staff].voices[f.voice]) if (groupId(e) === gid && !byEv.has(e.id)) byEv.set(e.id, new Set(["rest"]));
  }
  const raw = [];
  for (const [evId, pis] of byEv) {
    const f = find(doc, evId);
    if (!f) continue;
    const voice = doc.measures[f.bar].staves[f.staff].voices[f.voice];
    const abs = starts[f.bar] + onsets(voice)[f.index].start;
    const ev = f.ev;
    const asRest = ev.kind === "rest" || pis.has("rest");
    const pitches = asRest ? null : (pis.has("*") ? ev.pitches : ev.pitches.filter((_, i) => pis.has(i))).map((p) => ({ ...p }));
    raw.push({ abs, staff: f.staff, voice: f.voice, kind: asRest ? "rest" : "note", dur: durOf(ev.dur), pitches, len: evTicks(ev), ...(ev.cross && !asRest ? { cross: ev.cross } : {}) }); // a rest never crosses
  }
  if (!raw.length) return null;
  const origin = Math.min(...raw.map((r) => r.abs)), top = Math.min(...raw.map((r) => r.staff)), low = Math.min(...raw.map((r) => r.voice));
  const events = raw.sort((a, b) => a.abs - b.abs || a.staff - b.staff || a.voice - b.voice).map((r) => ({ dStaff: r.staff - top, dVoice: r.voice - low, offset: r.abs - origin, kind: r.kind, dur: r.dur, pitches: r.pitches, len: r.len, ...(r.cross ? { cross: r.cross } : {}) }));
  return { events, span: Math.max(...raw.map((r) => r.abs + r.len)) - origin, staves: Math.max(...events.map((e) => e.dStaff)) + 1 };
}

/**
 * Drop a phrase at { bar, ticks, staff } (staff = where the phrase's top staff
 * lands; clamped so every staff of the phrase exists). The region the phrase
 * covers is cleared first — anything overlapping it goes, a tuplet group
 * whole — then the phrase is written (tuplet groups get fresh ids), and bars
 * are appended if it runs past the end. An event that would straddle a
 * barline refuses the whole drop. Returns { doc, keys } with the selection
 * keys of what was pasted.
 */
export function paste(doc, clip, { bar, ticks: t, staff = 0, voice = 0 }) {
  if (!clip?.events.length) throw new Nudge("nothing to paste");
  const d = clone(doc);
  const nStaves = d.parts[0].staves;
  const top = Math.max(0, Math.min(nStaves - clip.staves, staff));
  const vOf = (e) => Math.min(MAX_VOICES - 1, voice + (e.dVoice ?? 0)); // the phrase's lowest voice lands in the active one; the rest keep their offsets, capped
  const A0 = barStarts(d).starts[bar] + Math.max(0, Math.round(t));
  // make room: append bars until the whole span fits
  while (barStarts(d).total < A0 + clip.span) appendBar(d);
  const placed = []; // { bar, staff, start, ev }
  const gids = new Map();
  for (const e of clip.events) {
    const loc = locate(d, A0 + e.offset);
    if (!loc) throw new Nudge("that runs off the end", { bar: d.measures.length - 1 });
    if (loc.ticks + e.len > loc.cap) throw new Nudge("that would cross a barline", { bar: loc.bar });
    let dur = e.dur;
    if (dur.tuplet) { if (!gids.has(dur.tuplet.id)) gids.set(dur.tuplet.id, `t${eid()}`); dur = { ...dur, tuplet: { ...dur.tuplet, id: gids.get(dur.tuplet.id) } }; }
    const ev = e.kind === "rest" ? restEvent(dur) : noteEvent(dur, e.pitches.map((p) => ({ ...p })));
    const st = top + e.dStaff;
    if (e.cross && ev.kind === "note" && st + e.cross >= 0 && st + e.cross < nStaves) ev.cross = e.cross;
    placed.push({ bar: loc.bar, staff: st, voice: vOf(e), start: loc.ticks, ev });
  }
  // rebuild every touched (bar, staff, voice): keep what lies outside the region, drop what overlaps it (tuplets whole), add the phrase, fill the gaps
  const touched = new Map();
  for (const p of placed) { const k = `${p.bar}:${p.staff}:${p.voice}`; if (!touched.has(k)) touched.set(k, []); touched.get(k).push(p); }
  const { starts } = barStarts(d);
  for (const [k, items] of touched) {
    const [b, st, vi] = k.split(":").map(Number);
    const time = timeAt(d, b), cap = capacity(time);
    const r0 = Math.max(0, A0 - starts[b]), r1 = Math.min(cap, A0 + clip.span - starts[b]);
    const voice = ensureVoice(d, b, st, vi);
    const os = onsets(voice);
    const dropped = new Set(os.filter((o) => !(o.start + o.len <= r0 || o.start >= r1)).map((o) => groupId(o.ev)).filter(Boolean));
    const keep = os.filter((o) => (o.start + o.len <= r0 || o.start >= r1) && !dropped.has(groupId(o.ev))).map((o) => ({ start: o.start, len: o.len, ev: o.ev }));
    const all = [...keep, ...items.map((p) => ({ start: p.start, len: evTicks(p.ev), ev: p.ev }))].sort((a, b2) => a.start - b2.start);
    const out = [];
    let pos = 0;
    const gap = (len, at) => { try { return splitRest(len, at, time).map(restEvent); } catch { throw new Nudge("that doesn't line up with the beat", { bar: b }); } };
    for (const x of all) {
      if (x.start < pos) throw new Nudge("those overlap", { bar: b });
      if (x.start > pos) out.push(...gap(x.start - pos, pos));
      out.push(x.ev); pos = x.start + x.len;
    }
    if (pos < cap) out.push(...gap(cap - pos, pos));
    d.measures[b].staves[st].voices[vi] = out;
  }
  for (const k of touched.keys()) normalizeBar(d, Number(k.split(":")[0]));
  cleanTies(d);
  ensureTrailingBar(d);
  const keys = placed.flatMap((p) => (p.ev.kind === "note" ? p.ev.pitches.map((_, i) => `${p.ev.id}:${i}`) : [p.ev.id]));
  return { doc: d, keys };
}

// --- key / time / clef anywhere; articulations; glissando (docs/COMPOSE_DESIGN.md §7.1, P2) ---

/** The marks a note can carry. `mordent` is the plain one (SMuFL ornamentShortTrill); `lowerMordent` has the line through it (ornamentMordent). */
export const MARKS = ["staccato", "accent", "tenuto", "fermata", "trill", "mordent", "lowerMordent", "turn"];
export const TIME_UNITS = [1, 2, 4, 8, 16, 32];

/** A key change at a bar (fifths −7 … 7); the key already in force there removes the change instead. */
export function setKey(doc, bar, fifths) {
  if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7) throw new Nudge("keys run from seven flats to seven sharps");
  const d = clone(doc);
  if (bar > 0 && keyAt(d, bar - 1).fifths === fifths) delete d.measures[bar].key;
  else d.measures[bar].key = { fifths };
  return d;
}
/**
 * A clef change for one staff on a beat of a bar (`at` in ticks, 0 = the
 * barline; any beat of the metre — the dotted group in compound metres). It
 * holds for that staff until the next change. Choosing the clef already in
 * force there removes a change on that beat instead. Pitches are absolute,
 * so nothing re-steps.
 */
export function setClef(doc, bar, staff, clef, at = 0) {
  if (!CLEFS[clef]) throw new Nudge("no such clef");
  const d = clone(doc), m = d.measures[bar], time = timeAt(d, bar);
  if (!Number.isInteger(at) || at < 0 || at >= capacity(time) || at % groupSize(time)) throw new Nudge("a clef change goes on a beat", { bar });
  if (at === 0) { if (m.clefs) { delete m.clefs[staff]; if (!Object.keys(m.clefs).length) delete m.clefs; } }
  else if (m.clefChanges) { m.clefChanges = m.clefChanges.filter((c) => !(c.staff === staff && c.at === at)); if (!m.clefChanges.length) delete m.clefChanges; }
  const before = at > 0 ? clefAt(d, bar, staff, at - 1) : bar > 0 ? clefAt(d, bar - 1, staff, Infinity) : null;
  if (before === clef) return d;
  if (at === 0) m.clefs = { ...(m.clefs ?? {}), [staff]: clef };
  else m.clefChanges = [...(m.clefChanges ?? []), { staff, at, clef }].sort((a, b) => a.at - b.at || a.staff - b.staff);
  return d;
}
/** A note's length as tied pieces: one plain / dotted value when it is one, else the fewest plain values longest first. */
export function decompose(len) {
  const one = fromTicks(len);
  if (one) return [one];
  const out = [];
  let left = len;
  for (const base of PLAIN_BASES) { const v = ticks({ base }); while (left >= v) { out.push({ base, dots: 0 }); left -= v; } }
  if (left) return null;
  return out;
}
/**
 * A time change at a bar: the bars from there to the next time change are
 * re-cut to the new capacity. Notes that cross a new barline split into tied
 * notes; a tuplet that would cross one refuses the change; key and clef
 * changes inside the stretch land on the bar that now holds their tick.
 * Returns { doc, before, after } — the bar counts of the stretch, so the
 * editor can ask before content spills into new bars.
 */
export function setTime(doc, bar, time) {
  if (!Number.isInteger(time?.beats) || time.beats < 1 || time.beats > 32 || !TIME_UNITS.includes(time.unit)) throw new Nudge("that's not a time signature");
  const old = timeAt(doc, bar);
  const same = old.beats === time.beats && old.unit === time.unit;
  let end = bar + 1;
  while (end < doc.measures.length && !doc.measures[end].time) end++;
  const nOld = end - bar;
  if (same) {
    // already in force: nothing to do — except that an explicit change equal to the metre before it is redundant and goes away
    if (bar === 0 || !doc.measures[bar].time) return { doc, before: nOld, after: nOld };
    const prev = timeAt(doc, bar - 1);
    if (prev.beats !== time.beats || prev.unit !== time.unit) return { doc, before: nOld, after: nOld };
    const d = clone(doc); delete d.measures[bar].time; return { doc: d, before: nOld, after: nOld };
  }
  const d = clone(doc);
  const capOld = capacity(old), capNew = capacity(time), total = nOld * capOld, nNew = Math.max(1, Math.ceil(total / capNew));
  const nStaves = d.parts[0].staves;
  const fresh = Array.from({ length: nNew }, () => newMeasure(nStaves, time));
  const oldBars = d.measures.slice(bar, end);
  // key / clef changes inside the stretch follow their tick (a clef lands on the beat of the new metre at or before it)
  const beatNew = groupSize(time);
  const putClef = (abs, staff, clef) => {
    const nb = fresh[Math.min(nNew - 1, Math.floor(abs / capNew))], local = abs - Math.min(nNew - 1, Math.floor(abs / capNew)) * capNew, at = local - (local % beatNew);
    if (at === 0) { nb.clefs = { ...(nb.clefs ?? {}), [staff]: clef }; return; }
    nb.clefChanges = [...(nb.clefChanges ?? []).filter((c) => !(c.staff === staff && c.at === at)), { staff, at, clef }].sort((a, b) => a.at - b.at || a.staff - b.staff);
  };
  oldBars.forEach((m, k) => {
    const nb = fresh[Math.min(nNew - 1, Math.floor((k * capOld) / capNew))];
    if (m.key) nb.key = m.key;
    for (const [st, clef] of Object.entries(m.clefs ?? {})) putClef(k * capOld, Number(st), clef);
    for (const c of m.clefChanges ?? []) putClef(k * capOld + c.at, c.staff, c.clef);
  });
  const prevT = bar > 0 ? timeAt(doc, bar - 1) : null;
  if (!prevT || prevT.beats !== time.beats || prevT.unit !== time.unit) fresh[0].time = { beats: time.beats, unit: time.unit }; // back to the metre before it: the stretch simply rejoins it
  if (bar === 0) { fresh[0].key ??= oldBars[0].key; fresh[0].clefs ??= oldBars[0].clefs; }
  for (let st = 0; st < nStaves; st++) for (let vi = 0; vi < MAX_VOICES; vi++) {
    if (vi > 0 && !oldBars.some((m) => m.staves[st].voices[vi])) continue;
    // the stretch as one stream of absolute ticks; tuplet groups travel as units
    const items = [];
    oldBars.forEach((m, k) => {
      let unit = null;
      for (const o of onsets(m.staves[st].voices[vi] ?? [])) {
        const start = k * capOld + o.start, gid = groupId(o.ev);
        if (gid) { if (unit && unit.gid === gid) { unit.len += o.len; unit.evs.push({ ev: o.ev, at: start }); } else { unit = { gid, start, len: o.len, evs: [{ ev: o.ev, at: start }] }; items.push(unit); } continue; }
        unit = null;
        if (o.ev.kind === "rest") continue;
        items.push({ start, len: o.len, ev: o.ev });
      }
    });
    const lanes = fresh.map(() => []); // per new bar: { start (local), ev }
    for (const it of items) {
      const b0 = Math.floor(it.start / capNew);
      if (it.gid) {
        if (it.start + it.len > (b0 + 1) * capNew) throw new Nudge(`a tuplet in bar ${bar + b0 + 1} would cross the new barline`, { bar: bar + b0 });
        for (const e of it.evs) lanes[b0].push({ start: e.at - b0 * capNew, ev: e.ev });
        continue;
      }
      // a plain note: cut at every new barline it crosses, tie the pieces
      const parts = [];
      let s = it.start, left = it.len;
      while (left > 0) { const room = (Math.floor(s / capNew) + 1) * capNew - s, take = Math.min(room, left); parts.push({ s, take }); s += take; left -= take; }
      const chain = [];
      parts.forEach((p, pi) => {
        const durs = decompose(p.take);
        if (!durs) throw new Nudge(`a note in bar ${bar + Math.floor(p.s / capNew) + 1} can't be split at the new barline`, { bar: bar + Math.floor(p.s / capNew) });
        let at = p.s;
        for (const du of durs) { chain.push({ at, dur: du }); at += ticks(du); }
        void pi;
      });
      chain.forEach((c, ci) => {
        const last = ci === chain.length - 1;
        const ev = ci === 0 ? { ...it.ev, dur: durOf(c.dur), pitches: it.ev.pitches.map((p) => ({ ...p })) } : { id: eid(), kind: "note", dur: durOf(c.dur), pitches: it.ev.pitches.map((p) => ({ ...p })) };
        if (!last) { for (const p of ev.pitches) p.tie = "start"; delete ev.gliss; }
        if (ci > 0) { delete ev.art; for (const p of ev.pitches) delete p.acc; }
        const b = Math.floor(c.at / capNew);
        lanes[b].push({ start: c.at - b * capNew, ev });
      });
    }
    lanes.forEach((lane, b) => {
      lane.sort((x, y) => x.start - y.start);
      const out = [];
      let pos = 0;
      for (const x of lane) {
        if (x.start > pos) out.push(...splitRest(x.start - pos, pos, time).map(restEvent));
        out.push(x.ev); pos = x.start + ticks(x.ev.dur);
      }
      if (pos < capNew) out.push(...splitRest(capNew - pos, pos, time).map(restEvent));
      if (vi === 0) fresh[b].staves[st].voices[0] = out;
      else if (lane.length) { while (fresh[b].staves[st].voices.length <= vi) fresh[b].staves[st].voices.push(null); fresh[b].staves[st].voices[vi] = out; }
    });
  }
  d.measures.splice(bar, nOld, ...fresh);
  for (let b = bar; b < bar + nNew; b++) normalizeBar(d, b);
  cleanTies(d);
  ensureTrailingBar(d);
  return { doc: d, before: nOld, after: nNew };
}

/** Toggle an articulation / ornament on the selected notes: every note has it → off, else on for all. */
export function articulate(doc, evIds, mark) {
  if (!MARKS.includes(mark)) throw new Nudge("no such mark");
  const d = clone(doc);
  const notes = [...new Set(evIds)].map((id) => find(d, id)).filter((f) => f && f.ev.kind === "note").map((f) => f.ev);
  if (!notes.length) throw new Nudge("pick notes for the mark");
  const all = notes.every((e) => e.art?.includes(mark));
  for (const e of notes) {
    if (all) { e.art = e.art.filter((m) => m !== mark); if (!e.art.length) delete e.art; }
    else if (!e.art?.includes(mark)) e.art = [...(e.art ?? []), mark];
  }
  return d;
}
/** Dynamics, softest to loudest. */
export const DYNAMICS = ["pp", "p", "mp", "mf", "f", "ff"];
/** Set a dynamic on the selected notes (one per note); every note already has that one → off. */
export function dynamic(doc, evIds, mark) {
  if (!DYNAMICS.includes(mark)) throw new Nudge("no such dynamic");
  const d = clone(doc);
  const notes = [...new Set(evIds)].map((id) => find(d, id)).filter((f) => f && f.ev.kind === "note").map((f) => f.ev);
  if (!notes.length) throw new Nudge("pick the notes for the dynamic");
  const all = notes.every((e) => e.dyn === mark);
  for (const e of notes) { if (all) delete e.dyn; else e.dyn = mark; }
  return d;
}
export const HAIRPINS = ["cresc", "dim"];
/**
 * A hairpin from the earliest selected note of a staff to the latest (one note: to the staff's next
 * note): `ev.hairpin` = "cresc-start" | "cresc-stop" | "dim-start" | "dim-stop". Hairpins do not nest,
 * so matching is positional (`hairpinEnd`) and `cleanHairpins` drops any half left by an edit.
 * The same span with the same kind again removes it.
 */
export function hairpin(doc, evIds, kind) {
  if (!HAIRPINS.includes(kind)) throw new Nudge("no such hairpin");
  const d = clone(doc);
  const fs = [...new Set(evIds)].map((id) => find(d, id)).filter((f) => f && f.ev.kind === "note");
  if (!fs.length) throw new Nudge("pick the notes for the hairpin");
  for (const list of byLine(fs).values()) {
    const a = list[0].ev;
    let b = list[list.length - 1].ev;
    if (b === a) b = nextNote(d, list[0]);
    if (!b || b.kind !== "note") throw new Nudge("a hairpin needs a note after it", { bar: list[0].bar });
    if (a.hairpin === `${kind}-start` && hairpinEnd(d, list[0].staff, list[0].voice, a) === b) { delete a.hairpin; delete b.hairpin; }
    else { // the new span owns its range: any hairpin marker inside it goes (hairpins never nest)
      const seq = seqOf(d, list[0].staff, list[0].voice);
      for (let k = seq.indexOf(a); k <= seq.indexOf(b); k++) delete seq[k].hairpin;
      a.hairpin = `${kind}-start`; b.hairpin = `${kind}-stop`;
    }
  }
  cleanHairpins(d);
  return d;
}
/** The note the hairpin starting at `ev` ends on: the first matching stop in its voice before any other start, or null. */
export function hairpinEnd(doc, staff, voice, ev) {
  if (!ev.hairpin?.endsWith("-start")) return null;
  const kind = ev.hairpin.slice(0, -6);
  const seq = seqOf(doc, staff, voice);
  for (let k = seq.indexOf(ev) + 1; k < seq.length; k++) {
    if (seq[k].hairpin === `${kind}-stop`) return seq[k];
    if (seq[k].hairpin?.endsWith("-start")) return null;
  }
  return null;
}
/** Re-derive every hairpin: rests carry none; a start without its stop (before another start) and a stop without its start are dropped. */
export function cleanHairpins(doc) {
  const nStaves = doc.parts[0].staves;
  for (let staff = 0; staff < nStaves; staff++) for (let voice = 0; voice < MAX_VOICES; voice++) {
    const seq = seqOf(doc, staff, voice);
    let open = null;
    for (const e of seq) {
      if (!e.hairpin) continue;
      if (e.kind !== "note") { delete e.hairpin; continue; }
      if (e.hairpin.endsWith("-start")) { if (open) delete open.hairpin; open = e; continue; }
      if (open && e.hairpin === `${open.hairpin.slice(0, -6)}-stop`) open = null; else delete e.hairpin;
    }
    if (open) delete open.hairpin;
  }
  return doc;
}
/** Expression text (rit., a tempo, dolce…) on the earliest selected event; an empty string clears it. */
export function exprText(doc, evIds, str) {
  const d = clone(doc);
  const fs = [...new Set(evIds)].map((id) => find(d, id)).filter(Boolean).sort((a, b) => a.bar - b.bar || a.staff - b.staff || a.index - b.index);
  if (!fs.length) throw new Nudge("pick where the text goes");
  const t = String(str ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (t) fs[0].ev.text = t; else delete fs[0].ev.text;
  return d;
}
/** The rolled-chord signs: a plain wiggle, or one with an arrowhead saying which way the roll goes. */
export const ARPS = ["plain", "up", "down"];
/** Set the roll on the selected notes (`ev.arp`); every note already has that roll → off. One roll per note. */
export function arpeggio(doc, evIds, kind) {
  if (!ARPS.includes(kind)) throw new Nudge("no such roll");
  const d = clone(doc);
  const notes = [...new Set(evIds)].map((id) => find(d, id)).filter((f) => f && f.ev.kind === "note").map((f) => f.ev);
  if (!notes.length) throw new Nudge("pick the chord to roll");
  const all = notes.every((e) => e.arp === kind);
  for (const e of notes) { if (all) delete e.arp; else e.arp = kind; }
  return d;
}
/** Toggle a glissando from each selected note to the next note of its staff; nothing after it → Nudge. */
export function gliss(doc, evIds) {
  const d = clone(doc);
  const fs = [...new Set(evIds)].map((id) => find(d, id)).filter((f) => f && f.ev.kind === "note");
  if (!fs.length) throw new Nudge("pick a note to slide from");
  const can = fs.filter((f) => nextEvent(d, f)?.kind === "note");
  if (!can.length) throw new Nudge("gliss needs a note after it", { bar: fs[0].bar });
  const all = can.every((f) => f.ev.gliss === "start");
  for (const f of can) { if (all) delete f.ev.gliss; else f.ev.gliss = "start"; }
  return d;
}

// --- voices (docs/COMPOSE_VOICES_DESIGN.md §4) ---------------------------------------

/** The lines (bar, staff, voice) and tick ranges a set of events occupies. */
function ranges(d, fs) {
  return fs.map((f) => { const o = onsets(d.measures[f.bar].staves[f.staff].voices[f.voice]); const x = o[f.index]; return { ...f, start: x.start, end: x.start + x.len }; });
}
/**
 * Move notes to another voice of their own staff, at their own onsets. Refused
 * (bar flash, nothing changes) when the target voice already sounds anywhere
 * under them, or a tuplet group would be split. The time they leave becomes
 * rests in the source voice (which leaves the bar if that was its last note);
 * the target voice is created in the bar when it is not there yet.
 */
export function setVoice(doc, evIds, vi) {
  if (!Number.isInteger(vi) || vi < 0 || vi >= MAX_VOICES) throw new Nudge(`voices run 1 to ${MAX_VOICES}`);
  const d = clone(doc);
  const fs = [...new Set(evIds)].map((id) => find(d, id)).filter((f) => f && f.ev.kind === "note" && f.voice !== vi);
  if (!fs.length) { if (evIds.length && [...new Set(evIds)].every((id) => find(doc, id)?.voice === vi)) return doc; throw new Nudge("pick the notes to move"); }
  const ids = new Set(fs.map((f) => f.ev.id));
  for (const f of fs) { // a tuplet travels whole, or not at all
    const gid = groupId(f.ev);
    if (gid && d.measures[f.bar].staves[f.staff].voices[f.voice].some((e) => groupId(e) === gid && e.kind === "note" && !ids.has(e.id))) throw new Nudge("move the whole tuplet", { bar: f.bar });
  }
  // tuplet rests come along so the group still adds up
  const moving = [...fs];
  for (const f of fs) { const gid = groupId(f.ev); if (!gid) continue; d.measures[f.bar].staves[f.staff].voices[f.voice].forEach((e, index) => { if (groupId(e) === gid && !ids.has(e.id)) { ids.add(e.id); moving.push({ bar: f.bar, staff: f.staff, voice: f.voice, index, ev: e }); } }); }
  const byBar = new Map();
  for (const r of ranges(d, moving)) { const k = `${r.bar}:${r.staff}`; if (!byBar.has(k)) byBar.set(k, []); byBar.get(k).push(r); }
  for (const [k, items] of byBar) {
    const [bar, staff] = k.split(":").map(Number);
    const time = timeAt(d, bar), cap = capacity(time);
    const target = d.measures[bar].staves[staff].voices[vi];
    const busy = target ? onsets(target).filter((o) => o.ev.kind === "note" || groupId(o.ev)) : []; // a note, or a tuplet's rest, in the target is in the way
    for (const it of items) if (busy.some((o) => o.start < it.end && o.start + o.len > it.start)) throw new Nudge(`voice ${vi + 1} already sounds there`, { bar });
    // source: the moved events become rests
    for (const it of items) { const src = d.measures[bar].staves[staff].voices[it.voice]; src[src.indexOf(it.ev)] = restEvent(it.ev.dur); }
    // target: keep everything outside the moved ranges, add the events, fill the gaps
    const tv = ensureVoice(d, bar, staff, vi);
    const keep = onsets(tv).filter((o) => !items.some((it) => o.start < it.end && o.start + o.len > it.start)).map((o) => ({ start: o.start, len: o.len, ev: o.ev }));
    const all = [...keep, ...items.map((it) => ({ start: it.start, len: it.end - it.start, ev: it.ev }))].sort((a, b) => a.start - b.start);
    const out = [];
    let pos = 0;
    const gap = (len, at) => { try { return splitRest(len, at, time).map(restEvent); } catch { throw new Nudge("that doesn't line up with the beat", { bar }); } };
    for (const x of all) { if (x.start < pos) throw new Nudge(`voice ${vi + 1} already sounds there`, { bar }); if (x.start > pos) out.push(...gap(x.start - pos, pos)); out.push(x.ev); pos = x.start + x.len; }
    if (pos < cap) out.push(...gap(cap - pos, pos));
    d.measures[bar].staves[staff].voices[vi] = out;
    normalizeBar(d, bar);
  }
  cleanTies(d);
  return d;
}
/** Exchange two voices of a staff in whole bars: bars = [{ bar, staff }]. A bar where neither is present is untouched; voice 1 never leaves (it becomes rests). */
export function swapVoices(doc, bars, a, b) {
  for (const v of [a, b]) if (!Number.isInteger(v) || v < 0 || v >= MAX_VOICES) throw new Nudge(`voices run 1 to ${MAX_VOICES}`);
  if (a === b) return doc;
  const d = clone(doc);
  const seen = new Set();
  let touched = 0;
  for (const { bar, staff } of bars) {
    const k = `${bar}:${staff}`;
    if (seen.has(k)) continue; seen.add(k);
    const st = d.measures[bar].staves[staff];
    const va = st.voices[a] ?? null, vb = st.voices[b] ?? null;
    if (!va && !vb) continue;
    while (st.voices.length <= Math.max(a, b)) st.voices.push(null);
    st.voices[a] = vb; st.voices[b] = va;
    if (!st.voices[0]) st.voices[0] = barRests(timeAt(d, bar));
    touched++;
    normalizeBar(d, bar);
  }
  if (!touched) throw new Nudge("nothing to swap there");
  cleanTies(d);
  return d;
}
/** Draw the selected notes on the staff above (dir −1) or below (+1) their own — a step toward it from where they are drawn now; back to their own staff when that is where the step lands. */
export function crossStaff(doc, evIds, dir) {
  if (dir !== 1 && dir !== -1) throw new Nudge("cross to the upper or the lower staff");
  const d = clone(doc);
  const nStaves = d.parts[0].staves;
  const fs = [...new Set(evIds)].map((id) => find(d, id)).filter((f) => f && f.ev.kind === "note");
  if (!fs.length) throw new Nudge("pick the notes to cross");
  for (const f of fs) {
    const next = (f.ev.cross ?? 0) + dir;
    if (Math.abs(next) > 1 || f.staff + next < 0 || f.staff + next >= nStaves) throw new Nudge(dir < 0 ? "there is no staff above" : "there is no staff below", { bar: f.bar });
    if (next === 0) delete f.ev.cross; else f.ev.cross = next;
  }
  return d;
}
/** Move the selected rests up (delta > 0) or down by staff steps: a display offset on top of the
 * automatic place (`ev.restY`, within ±REST_Y_MAX; 0 clears it). Playback and the bar's arithmetic
 * never see it — it only moves the glyph out of another voice's way. */
export function nudgeRest(doc, evIds, delta) {
  const d = clone(doc);
  const rests = [...new Set(evIds)].map((id) => find(d, id)).filter((f) => f && f.ev.kind === "rest");
  if (!rests.length) throw new Nudge("pick the rests to move");
  if (!Number.isInteger(delta)) throw new Nudge("rests move by whole steps");
  for (const f of rests) {
    const y = (f.ev.restY ?? 0) + delta;
    if (Math.abs(y) > REST_Y_MAX) throw new Nudge(delta > 0 ? "that rest is as high as it goes" : "that rest is as low as it goes", { bar: f.bar });
    if (y === 0) delete f.ev.restY; else f.ev.restY = y;
  }
  return d;
}
/** Hide (or show again) the selected rests: every selected rest hidden → all shown, else all hidden. A hidden rest still counts and still takes taps. */
export function hideRest(doc, evIds) {
  const d = clone(doc);
  const rests = [...new Set(evIds)].map((id) => find(d, id)).filter((f) => f && f.ev.kind === "rest").map((f) => f.ev);
  if (!rests.length) throw new Nudge("pick the rests to hide");
  const all = rests.every((e) => e.hidden);
  for (const e of rests) { if (all) delete e.hidden; else e.hidden = true; }
  return d;
}
