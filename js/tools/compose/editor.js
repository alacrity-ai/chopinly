// The editor (docs/COMPOSE_DESIGN.md §8): a full-screen layer with the rails
// on top and the score below. Place mode taps place the armed duration; Select
// mode taps only select; Pan is the one mode in which the score moves. In
// edit modes a touch pointer counts only as a single clean tap — a resting
// palm (wide, long, moving, or a second contact) is discarded — and pen and
// mouse are trusted fully.
import { logbook } from "../../lib/logbook.js";
import { toast } from "../logbook/util.js";
import { haptic } from "../logbook/motion.js";
import { layoutComposition } from "../../lib/compose/layout.js";
import { renderComposition } from "../../lib/compose/render.js";
import { slotAt, thingAt, xOfTicks, barAt, lasso, spans as spansOfLayout, isHandle } from "../../lib/compose/hit.js";
import { place, remove, snap, trimBars, find, setPitch, retype, toRests, clipFrom, paste, locate, barStarts, stepOf, onsetOf, dot, tie, tuplet, accidental, setKey, setTime, setClef, articulate, gliss, arpeggio, slur, addExpression, addHairpin, addPedal, addOttava, finger, moveExpressions, moveSpanEnd, nudgeExpressionY, setExpressionValue, removeExpressions, findExpression, exprSlot, slotOfAbs, upgrade, setVoice, swapVoices, crossStaff, hideRest, nudgeRest, setBarline, setEnding, toggleFormMark, TUPLET_IN, TIME_UNITS, Nudge } from "../../lib/compose/engine.js";
import { createHistory } from "../../lib/compose/history.js";
import { createSound } from "../../lib/compose/sound.js";
import { createPlayer } from "../../lib/compose/play.js";
import { clefAt, timeAt, tempoOf, usedVoices, MAX_VOICES, MIN_TEMPO, MAX_TEMPO } from "../../lib/compose/model.js";
import { ticks as ticksOf, capacity, groupSize, exprGrid, WHOLE } from "../../lib/compose/ticks.js";
import { CLEFS } from "../../lib/music.js";
import { buildRails, MAIN_BASES, MORE_BASES, KEYS, RAILS, DEFAULT_RAILS, JUMP_LABEL, durName, tupletName } from "./rails.js";
import { openCompositionDetails } from "./details.js";
import { openExportSheet } from "./exportsheet.js";
import { saveFile } from "./savefile.js";
import { toMusicXml, musicXmlFileName, MUSICXML_TYPE } from "../../lib/compose/musicxml.js";

const TAP_MS = 300, TAP_PX = 10, PALM_PX = 40, S_MIN = 8, S_MAX = 22, SAVE_MS = 300, LASSO_PX = 6;
const KEY_BASE = { 1: 64, 2: 32, 3: 16, 4: 8, 5: 4, 6: 2, 7: 1 };
const EXPR_TYPES = new Set(["dyn", "text", "hairpin", "hairpin-start", "hairpin-end", "pedal", "pedal-start", "pedal-end", "ottava", "ottava-start", "ottava-end"]); // the selectable expressions and a selected span's two handles
const SPAN_PENDING = new Set(["hairpin", "pedal", "ottava"]); // pending kinds placed by two taps (start, end)
const LINE_NAME = { pedal: "pedal", 1: "8va", "-1": "8vb" };
let clipboard = null; // the copied phrase — lives for the session, so it can travel between compositions

export function openEditor({ id, ctx, onClose }) {
  const stored = logbook.composition(id);
  if (!stored) { toast("that composition is gone"); onClose?.(); return null; }
  const c = upgrade(stored); // a v1 / v2 piece: its note-attached marks become expressions (docs/COMPOSE_EXPRESSIONS_DESIGN.md §1.1)
  const { store, setRunning, getAudio } = ctx;
  const history = createHistory(c);
  let doc = c;
  let S = Math.max(S_MIN, Math.min(S_MAX, store.get("zoom", 12)));
  const savedArm = store.get("armed", null);
  // what the next tap places: base, dots and rest / tuplet persist; an accidental is one-shot
  let armed = { base: MAIN_BASES.includes(savedArm?.base) || MORE_BASES.includes(savedArm?.base) ? savedArm.base : 4, dots: [0, 1, 2].includes(savedArm?.dots) ? savedArm.dots : 0, rest: !!savedArm?.rest, tuplet: TUPLET_IN[savedArm?.tuplet] ? savedArm.tuplet : null, alter: null };
  let tupletN = TUPLET_IN[savedArm?.tupletN] ? savedArm.tupletN : (armed.tuplet ?? 3);
  const saveArm = () => store.set("armed", { base: armed.base, dots: armed.dots, rest: armed.rest, tuplet: armed.tuplet, tupletN });
  let mode = "place";                 // "place" | "select" | "pan"
  let voice = 0;                      // the active voice (0-based; the rail shows 1–4) — a piece always opens in voice 1; it follows the pen (docs/COMPOSE_VOICES_DESIGN.md §7.2)
  let voiceHinted = false;            // the "voice N — tap the staff" toast, once a session
  const selection = new Set();        // "ev" | "ev:pi"
  let L = null, R = null, closed = false, saveTimer = 0, dirty = false, pasting = false;
  let title = c.title, composer = c.composer ?? ""; // shown on the header as "Composer – Title"; the details modal can change both
  const heading = () => (composer ? `${composer} – ${title}` : title);
  let tempo = tempoOf(c);              // playback tempo — saved with the piece, outside undo
  let pending = null;                  // an armed key / time / clef change waiting for a tap: { kind, value }
  const savedRails = store.get("rails", null);
  let railsOn = Object.fromEntries(RAILS.map(([k]) => [k, typeof savedRails?.[k] === "boolean" ? savedRails[k] : DEFAULT_RAILS[k]])); // which rails show — remembered per device
  const sound = createSound(getAudio);
  const player = createPlayer({ getAudio, getDoc: () => doc, getTempo: () => tempo, onTick: showPlayhead, onEnd: () => syncTransport() });

  const el = document.createElement("div");
  el.className = "cp-editor";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", heading());
  el.innerHTML = `<div class="cp-rails" id="cp-rails"></div><div class="cp-view" id="cp-view" data-mode="place"><div class="cp-sheet" id="cp-sheet"></div></div>`;
  document.body.append(el);
  const view = el.querySelector("#cp-view"), sheet = el.querySelector("#cp-sheet");
  const rails = buildRails(el.querySelector("#cp-rails"), { title: heading(), onAction: act });
  setRunning?.(true);
  // every write goes through `put`, so the logbook listener below can tell our own saves from a
  // change that arrived from another device (sync replaces the stored object; we mutate it in place)
  let saving = false, held = c, warnedBig = false;
  const put = (patch) => { saving = true; try { logbook.updateComposition(id, patch); } finally { saving = false; } held = logbook.composition(id); };
  put({ openedAt: Date.now() }); // opening is never an edit: an upgraded document stays in memory until a real edit saves it (v93 — writing it here stamped a stale copy as newest and overrode another device's work)
  const offRemote = logbook.on(() => {
    if (closed || saving) return;
    const cur = logbook.composition(id);
    if (!cur) { close(); return; }                       // deleted — here (the details modal) or on another device
    if (cur === held) return;                            // still our object: nothing came from outside
    held = cur;
    if (dirty) return;                                   // an edit is about to save and will outrank it
    if (drag) grabEnd({ pointerId: drag.id }, { cancel: true });
    if (lassoState) lassoEnd({ pointerId: lassoState.id }, { cancel: true });
    doc = history.push(upgrade(cur)); title = cur.title; composer = cur.composer ?? ""; tempo = tempoOf(cur);
    selection.clear(); pending = null; pasting = false;
    el.setAttribute("aria-label", heading());
    layout(); player.refresh(); rails.transport({ bpm: tempo });
    toast("updated from another device");
  });

  // --- layout / render -------------------------------------------------------
  const width = () => Math.max(300, view.clientWidth);
  function layout() {
    L = layoutComposition(doc, { unit: S, width: width() });
    R = renderComposition(sheet, L);
    showSel();
    sync();
    showPlayhead(player.position);
  }
  /** What the selection allows the voice menu and the expression rail to do. */
  function selFacts() {
    const ids = selEvIds(), fs = ids.map((id) => find(doc, id)).filter(Boolean);
    const notes = fs.filter((f) => f.ev.kind === "note"), rests = fs.filter((f) => f.ev.kind === "rest");
    const xs = ids.map((id) => findExpression(doc, id)).filter(Boolean), exprs = xs.length > 0 && xs.length === ids.length;
    const n = doc.parts[0].staves;
    return { any: fs.length > 0, exprs, dyns: exprs && xs.every((f) => f.x.kind === "dyn"), texts: exprs && xs.every((f) => f.x.kind === "text"), notes: notes.length > 0, rests: rests.length > 0, hidden: rests.length > 0 && rests.every((f) => f.ev.hidden), up: notes.some((f) => f.staff + (f.ev.cross ?? 0) - 1 >= 0 && Math.abs((f.ev.cross ?? 0) - 1) <= 1), down: notes.some((f) => f.staff + (f.ev.cross ?? 0) + 1 < n && Math.abs((f.ev.cross ?? 0) + 1) <= 1) };
  }
  function sync() {
    rails.update({ armed, mode, canUndo: history.canUndo, canRedo: history.canRedo, hasSelection: selection.size > 0, hasClip: !!clipboard, pasting, tupletN, pending, rails: railsOn, title: heading(), voice, used: usedVoices(doc), sel: selFacts() });
    view.dataset.mode = mode; view.classList.toggle("pasting", pasting); view.classList.toggle("arming", !!pending);
    syncTransport();
  }
  /** The selection on the score, plus a selected hairpin's end handles on the overlay. */
  function showSel() {
    R.setSelection(selection);
    const pts = [];
    for (const hp of spansOfLayout(L)) { if (!selection.has(hp.id)) continue; if (hp.half !== "in" && hp.half !== "both") pts.push({ x: hp.x1, y: hp.y }); if (hp.half !== "out" && hp.half !== "both") pts.push({ x: hp.x2, y: hp.y }); }
    R.showHandles(pts);
  }
  const selectedSpans = () => new Set(L ? [...selection].filter((k) => spansOfLayout(L).some((hp) => hp.id === k)) : []);
  function syncTransport() { rails.transport({ playing: player.playing, bpm: tempo, total: barStarts(doc).total, pos: player.position, bar: locate(doc, player.position)?.bar ?? doc.measures.length - 1, bars: doc.measures.length }); }
  function commit(next) {
    if (next === doc) return;
    doc = history.push(next); dirty = true;
    layout(); scheduleSave();
    player.refresh();
  }
  // --- transport: the playhead rides the overlay; the view follows it between systems ---
  let lastSys = -1;
  function showPlayhead(t) {
    if (!L || !R) return;
    const loc = locate(doc, Math.min(t, barStarts(doc).total - 1));
    const hb = loc && barAt(L, loc.bar);
    if (!hb || (!player.playing && t === 0)) { R.showPlayhead(null); if (loc) rails.transport({ pos: t, bar: loc.bar, bars: doc.measures.length }); return; } // at rest on bar 1 there is nothing to mark
    const sysIndex = L.hit.systems.indexOf(hb.sys);
    R.showPlayhead(xOfTicks(hb.bar, loc.ticks), hb.sys);
    rails.transport({ pos: t, bar: loc.bar, bars: doc.measures.length });
    if (player.playing && sysIndex !== lastSys) { // keep the playing system in view (no scroll while the score is being edited by hand)
      const top = hb.sys.top * S + 8, bottom = hb.sys.bottom * S + 8;
      if (top < view.scrollTop || bottom > view.scrollTop + view.clientHeight) view.scrollTo({ top: Math.max(0, top - view.clientHeight * 0.25), behavior: "smooth" });
    }
    lastSys = sysIndex;
  }
  function setTempo(v) {
    const n = Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Math.round(Number(v))));
    if (!Number.isFinite(n) || n === tempo) return;
    tempo = n; put({ tempo }); player.refresh(); rails.transport({ bpm: tempo });
  }
  const barStartOf = (bar) => barStarts(doc).starts[Math.max(0, Math.min(doc.measures.length - 1, bar))];
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, SAVE_MS); }
  function flush() {
    clearTimeout(saveTimer); if (!dirty || closed && !doc) return;
    put({ measures: doc.measures, v: doc.v }); dirty = false; // the schema travels with the measures (an upgraded piece is persisted by its first real edit)
    // a piece past the sync cap is kept here but no longer follows the account — say so once
    if (!warnedBig && !logbook.compositionSyncable(held)) { warnedBig = true; toast("this piece is now too big to back up — it stays on this device"); }
  }

  // --- coordinates -----------------------------------------------------------
  const toS = (clientX, clientY) => { const r = R.svg.getBoundingClientRect(); return { x: (clientX - r.left) / S, y: (clientY - r.top) / S }; };
  const stepY = (sys, staff, step) => sys.staves[staff].topY + (8 - step) / 2;

  // --- ghost -----------------------------------------------------------------
  /** Where a paste would land for a client point: { bar, ticks (snapped), staff } or null. */
  function pasteTarget(clientX, clientY) {
    if (!clipboard || !L) return null;
    const { x, y } = toS(clientX, clientY);
    const slot = slotAt(L, x, y);
    if (!slot) return null;
    const g = ticksOf(clipboard.events[0].dur);
    const cap = barAt(L, slot.bar).bar.cap;
    return { bar: slot.bar, ticks: Math.max(0, Math.min(cap - 1, Math.round(slot.ticks / g) * g)), staff: Math.max(0, Math.min(L.nStaves - clipboard.staves, slot.staff)), voice };
  }
  /** The phrase as ghost notes at a target, using the columns that exist today (good enough to see where it lands). */
  function pasteGhost(target) {
    const A0 = barStarts(doc).starts[target.bar] + target.ticks;
    const out = [];
    for (const e of clipboard.events) {
      const loc = locate(doc, A0 + e.offset);
      if (!loc) continue;
      const hb = barAt(L, loc.bar);
      if (!hb) continue;
      const staff = target.staff + e.dStaff, drawStaff = Math.max(0, Math.min(L.nStaves - 1, staff + (e.cross ?? 0))), x = xOfTicks(hb.bar, loc.ticks);
      if (e.kind === "rest") { out.push({ x, y: stepY(hb.sys, staff, e.dur.base <= 1 ? 6 : 4), base: e.dur.base, rest: true }); continue; }
      const clef = clefAt(doc, loc.bar, drawStaff, loc.ticks);
      for (const p of e.pitches) { const st = stepOf(p, clef); out.push({ x, y: stepY(hb.sys, drawStaff, st), base: e.dur.base, rest: false, stem: false }); }
    }
    return out;
  }
  /** Which way the ghost's stem points: by the voice rule once the bar's staff holds (or is about to hold) more than one voice. */
  const ghostStemUp = (slot) => { const st = doc.measures[slot.bar].staves[slot.staff]; const nV = st.voices.filter(Boolean).length + (st.voices[voice] ? 0 : 1); return nV > 1 ? voice % 2 === 0 : slot.step < 4; };
  // --- an armed key / time / clef change: the tap says where it goes ---
  /** Where a pending change would land for a client point: key / time → { bar }; clef → { bar, staff, at } on the nearest beat; an expression → { bar, staff, at } on the nearest half-beat slot. */
  function changeTarget(clientX, clientY) {
    if (!pending || !L) return null;
    const { x, y } = toS(clientX, clientY);
    const slot = slotAt(L, x, y);
    if (!slot) return null;
    if (pending.kind === "finger") return { bar: slot.bar, x, y };
    if (isExprPending()) { const s = exprSlot(doc, slot.bar, slot.ticks); return { bar: s.bar, at: s.at, staff: pending.start ? pending.start.staff : slot.staff }; }
    if (pending.kind !== "clef") return { bar: slot.bar };
    const time = timeAt(doc, slot.bar), beat = groupSize(time), cap = capacity(time);
    let bar = slot.bar, at = Math.round(slot.ticks / beat) * beat;
    if (at >= cap) { if (bar + 1 < doc.measures.length) { bar++; at = 0; } else at = cap - beat; } // the tail of the last beat means the next barline
    return { bar, staff: slot.staff, at };
  }
  const isExprPending = () => pending && (pending.kind === "dyn" || pending.kind === "text" || SPAN_PENDING.has(pending.kind));
  const absOf = (bar, at) => barStarts(doc).starts[bar] + at;
  /** "beat 2" / "the & of 2" of a bar, for toasts. */
  const slotName = (bar, at) => { const beat = WHOLE / timeAt(doc, bar).unit, n = Math.floor(at / beat) + 1; return `${at % beat ? `the & of ${n}` : `beat ${n}`} of bar ${bar + 1}`; };
  function changeGhost(t) {
    if (isExprPending()) { // the mark where it would land: on the staff's expression line under the slot (text above); a hairpin being drawn is a band from its start to the pen
      R.showTarget(null);
      const hb = barAt(L, t.bar);
      if (!hb) return R.showGhost(null);
      const si = L.hit.systems.indexOf(hb.sys), x = xOfTicks(hb.bar, t.at), abs = absOf(t.bar, t.at);
      if (pending.kind === "dyn") return R.showGhost({ dyn: pending.value, x: x + 0.59, y: L.exprLine(si, t.staff, abs, abs + 1) });
      if (pending.kind === "text") return R.showGhost({ text: pending.value, x, y: L.textLine(si, t.staff, abs) });
      const lineY = (k, staff, a, b) => (pending.kind === "hairpin" ? L.exprLine(k, staff, a, b) : pending.kind === "pedal" ? L.pedalLine(k, staff, a, b) : L.ottavaLine(k, staff, a, b + 1, pending.value));
      if (!pending.start) return pending.kind === "hairpin" ? R.showGhost({ hairpin: pending.value, x1: x, x2: x + 3, y: lineY(si, t.staff, abs, abs + 1) }) : R.showGhost({ line: pending.kind, dir: pending.value, x1: x - 0.2, x2: x + 4, y: lineY(si, t.staff, abs, abs + 1) });
      const s = pending.start, sb = barAt(L, s.bar), ssi = L.hit.systems.indexOf(sb.sys), sx = xOfTicks(sb.bar, s.at), sAbs = absOf(s.bar, s.at);
      const sameSys = ssi === si, x2 = sameSys ? x : sb.sys.bars[sb.sys.bars.length - 1].x1 - 0.3; // on another system the band runs open to the start system's end
      if (pending.kind !== "hairpin") return R.showGhost({ line: pending.kind, dir: pending.value, x1: sx - 0.2, x2: Math.max(sx + 0.5, x2), y: lineY(ssi, s.staff, sAbs, Math.max(sAbs + 1, abs)) });
      return R.showGhost({ hairpin: pending.value, x1: sx, x2: Math.max(sx + 0.5, x2), y: L.exprLine(ssi, s.staff, sAbs, Math.max(sAbs + 1, abs)) });
    }
    if (pending.kind === "finger") { R.showGhost(null); return R.showTarget(null); } // the head under the pen is the target; nothing to preview
    if (pending.kind !== "clef") { const hb = barAt(L, t.bar); R.showGhost(null); return R.showTarget(hb ? { hbar: hb.bar, sys: hb.sys } : null); }
    R.showTarget(null);
    const hb = barAt(L, t.bar);
    if (!hb) return R.showGhost(null);
    const clef = CLEFS[pending.value];
    R.showGhost({ glyph: clef.glyph, small: t.at > 0, x: xOfTicks(hb.bar, t.at) - (t.at > 0 ? 2.9 : 0.6), y: stepY(hb.sys, t.staff, (clef.line - 1) * 2) });
  }
  function setPending(next) {
    pending = next;
    if (pending) { if (drag) grabEnd({ pointerId: drag.id }, { cancel: true }); if (lassoState) lassoEnd({ pointerId: lassoState.id }, { cancel: true }); if (mode === "pan") setMode("place"); pasting = false; }
    R?.showGhost(null); R?.showTarget(null); sync();
  }
  function applyChangeAt(clientX, clientY) {
    const t = changeTarget(clientX, clientY);
    if (!t) return;
    const p = pending;
    try {
      if (p.kind === "key") { commit(setKey(doc, t.bar, p.value)); const k = KEYS.find((x) => x.fifths === p.value); toast(`${k ? `${k.major} major / ${k.minor} minor` : p.value} from bar ${t.bar + 1}`); }
      else if (p.kind === "time") {
        const v = p.value, r = setTime(doc, t.bar, v);
        if (r.doc === doc) { toast(`already ${v.beats}/${v.unit} there`); setPending(null); return; }
        if (r.after > r.before && !confirm(`${v.beats}/${v.unit} from bar ${t.bar + 1} spills into ${r.after - r.before} more ${r.after - r.before === 1 ? "bar" : "bars"} — go ahead?`)) { setPending(null); return; }
        commit(r.doc); toast(`${v.beats}/${v.unit} from bar ${t.bar + 1}`);
      } else if (p.kind === "dyn" || p.kind === "text") { commit(addExpression(doc, { kind: p.kind, staff: t.staff, bar: t.bar, at: t.at, value: p.value }).doc); toast(`${p.value} on ${slotName(t.bar, t.at)}`); }
      else if (p.kind === "hairpin") {
        if (!p.start) { pending = { ...p, start: t }; toast("now tap where it ends"); haptic(6); sync(); return; } // the first tap of three is the start; the second is the end
        commit(addHairpin(doc, { staff: p.start.staff, bar: p.start.bar, at: p.start.at, dir: p.value, end: { bar: t.bar, at: t.at } }).doc);
        toast(`${p.value === "cresc" ? "crescendo" : "diminuendo"} from ${slotName(p.start.bar, p.start.at)} to ${slotName(t.bar, t.at)}`);
      } else if (p.kind === "pedal" || p.kind === "ottava") { // the Piano rail (WSHED-125): the same two taps as a hairpin
        if (!p.start) { pending = { ...p, start: t }; toast(p.kind === "pedal" ? "now tap where it lifts" : "now tap the last note it covers"); haptic(6); sync(); return; }
        const args = { staff: p.start.staff, bar: p.start.bar, at: p.start.at, end: { bar: t.bar, at: t.at } };
        commit(p.kind === "pedal" ? addPedal(doc, args).doc : addOttava(doc, { ...args, dir: p.value }).doc);
        toast(`${p.kind === "pedal" ? "pedal" : LINE_NAME[p.value]} from ${slotName(p.start.bar, p.start.at)} to ${slotName(t.bar, t.at)}`);
      } else if (p.kind === "finger") { // stays armed: every tap on a head stamps it (the same digit there again clears it)
        const th = thingAt(L, t.x, t.y);
        if (!th || th.type !== "head") { toast("tap a notehead"); return; }
        const next = finger(doc, [{ ev: th.ev, pi: th.pi }], p.value);
        if (next !== doc) { commit(next); toast(find(next, th.ev).ev.pitches[th.pi].finger ? `finger ${p.value}` : `finger ${p.value} cleared`); haptic(6); }
        return;
      } else if (p.kind === "barline") { // docs/COMPOSE_FORM_DESIGN.md §3: the picture says which end of the bar; "both" closes this bar and opens the next
        const k = p.value, b = t.bar, m = doc.measures[b];
        let next = doc;
        if (k === "single") next = setBarline(doc, b, { start: null, end: null });
        else if (k === "repeat-start") next = setBarline(doc, b, { start: m.barline?.start ? null : "repeat" });
        else if (k === "both") { next = setBarline(doc, b, { end: "repeat" }); if (b + 1 < doc.measures.length) next = setBarline(next, b + 1, { start: "repeat" }); }
        else next = setBarline(doc, b, { end: m.barline?.end === k ? null : k });
        if (next === doc) { toast("already so"); setPending(null); return; }
        commit(next); toast(k === "single" ? `plain barline on bar ${b + 1}` : k === "repeat-start" ? `${next.measures[b].barline?.start ? "repeat starts at" : "no repeat start on"} bar ${b + 1}` : k === "both" ? `repeat ends on bar ${b + 1} and starts again on bar ${b + 2}` : `${next.measures[b].barline?.end ? `${k} barline on` : "plain barline on"} bar ${b + 1}`);
      } else if (p.kind === "ending") {
        if (p.start === undefined) { pending = { ...p, start: t.bar }; toast(`ending ${p.value} from bar ${t.bar + 1} — now tap its last bar`); haptic(6); sync(); return; }
        const a = Math.min(p.start, t.bar), b = Math.max(p.start, t.bar);
        const next = setEnding(doc, a, p.value, b);
        commit(next); toast(next.measures[a].ending ? `ending ${p.value} over ${a === b ? `bar ${a + 1}` : `bars ${a + 1}–${b + 1}`}` : `ending ${p.value} removed`);
      } else if (p.kind === "sign" || p.kind === "jump" || p.kind === "rehearsal" || p.kind === "tempo-mark") {
        const mark = p.kind === "tempo-mark" ? { kind: "tempo", ...p.value } : { kind: p.kind === "rehearsal" ? "rehearsal" : p.value };
        const had = (doc.measures[t.bar].form ?? []).some((f) => f.kind === mark.kind && (mark.kind !== "tempo" || (f.bpm === mark.bpm && (f.text ?? "") === (mark.text ?? ""))));
        commit(toggleFormMark(doc, t.bar, mark));
        const name = mark.kind === "tempo" ? `♩ = ${mark.bpm}${mark.text ? ` ${mark.text}` : ""}` : mark.kind === "rehearsal" ? "rehearsal mark" : mark.kind === "segno" ? "segno" : mark.kind === "coda" ? "coda sign" : JUMP_LABEL[mark.kind];
        toast(had ? `${name} removed from bar ${t.bar + 1}` : `${name} ${JUMP_LABEL[mark.kind] ? "at the end of" : "on"} bar ${t.bar + 1}`);
      } else { commit(setClef(doc, t.bar, t.staff, p.value, t.at)); toast(`${p.value} clef on the ${t.staff === 0 ? "upper" : "lower"} staff from ${t.at ? `beat ${t.at / groupSize(timeAt(doc, t.bar)) + 1} of ` : ""}bar ${t.bar + 1}`); }
      haptic(8);
    } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar ?? t.bar); }
    setPending(null);
  }
  function ghostAt(clientX, clientY) {
    if (pending) { const t = changeTarget(clientX, clientY); if (!t) { R.showGhost(null); R.showTarget(null); return; } return changeGhost(t); }
    if (pasting) { const t = pasteTarget(clientX, clientY); return R.showGhost(t ? pasteGhost(t) : null, voice); }
    if (mode !== "place" || !L) return R?.showGhost(null);
    const { x, y } = toS(clientX, clientY);
    const slot = slotAt(L, x, y);
    if (!slot) return R.showGhost(null);
    slot.voice = voice;
    try {
      const s = snap(doc, slot, armed);
      const { sys, bar } = barAt(L, slot.bar);
      const gx = xOfTicks(bar, s.onset);
      const gy = armed.rest ? stepY(sys, slot.staff, armed.base <= 1 ? 6 : 4) : stepY(sys, slot.staff, slot.step);
      const ledgers = [];
      if (!armed.rest) { for (let st = -2; st >= slot.step; st -= 2) ledgers.push(stepY(sys, slot.staff, st)); for (let st = 10; st <= slot.step; st += 2) ledgers.push(stepY(sys, slot.staff, st)); }
      R.showGhost({ x: gx, y: gy, base: armed.base, dots: armed.dots, onLine: slot.step % 2 === 0, rest: armed.rest, stemUp: ghostStemUp(slot), ledgers }, voice);
    } catch (e) { if (!(e instanceof Nudge)) throw e; R.showGhost(null); }
  }

  // --- a tap -----------------------------------------------------------------
  function tapAt(clientX, clientY) {
    if (!L) return;
    if (pending) { applyChangeAt(clientX, clientY); return; }
    if (pasting) { dropAt(clientX, clientY); return; }
    const { x, y } = toS(clientX, clientY);
    const thing = thingAt(L, x, y, mode === "select" ? selectedSpans() : undefined);
    // In Place mode a rest (and a chord's stem, and an expression) is where the next note goes; only a notehead selects.
    if (thing && (mode === "select" || thing.type === "head")) { if (isHandle(thing.type)) return; select(thing); return; }
    if (mode === "select") { if (selection.size) { selection.clear(); showSel(); sync(); } return; }
    const slot = slotAt(L, x, y);
    if (!slot) return;
    slot.voice = voice; // a tap places into the active voice, exactly where it is tapped — a rest of another voice there is not the target, the slot is
    try {
      const r = place(doc, slot, armed);
      if (r.action === "none") return;
      if (r.action === "same") { const f = find(doc, r.ev.id), v = doc.measures[f.bar].staves[f.staff].voices[f.voice], clef = clefAt(doc, slot.bar, slot.staff, onsetOf(v, f.ev)); const pi = r.ev.pitches.findIndex((p) => stepOf(p, clef) === slot.step); select({ type: "head", ev: r.ev.id, pi: pi >= 0 ? pi : 0, voice: f.voice }); return; }
      commit(r.doc);
      if (armed.alter !== null) { armed = { ...armed, alter: null }; sync(); } // an accidental carries once
      if (r.ev.kind === "note") sound.play(r.ev.pitches, 260);
      haptic(6);
    } catch (e) {
      if (!(e instanceof Nudge)) throw e;
      nudge(e.message, e.bar ?? slot.bar);
    }
  }
  /** The selection as engine items and as event ids; whether every selected thing is a notehead / a note. */
  const selItems = () => [...selection].map((k) => { const [ev, pi] = k.split(":"); return pi === undefined ? { ev } : { ev, pi: Number(pi) }; });
  const selEvIds = () => [...new Set(selItems().map((it) => it.ev))];
  const allHeads = () => selection.size > 0 && [...selection].every((k) => k.includes(":"));
  const allRests = () => selection.size > 0 && [...selection].every((k) => !k.includes(":") && find(doc, k)?.ev.kind === "rest");
  const allNotes = () => selection.size > 0 && selEvIds().every((id) => find(doc, id)?.ev.kind === "note");
  const allExprs = () => selection.size > 0 && [...selection].every((k) => !k.includes(":") && findExpression(doc, k));
  /** After undo / redo: keep whatever is still there (a note that came back stays selected). */
  function pruneSelection() {
    for (const k of [...selection]) { const [ev, pi] = k.split(":"); const f = find(doc, ev); if (!f) { if (pi !== undefined || !findExpression(doc, ev)) selection.delete(k); continue; } if (pi !== undefined && (f.ev.kind !== "note" || Number(pi) >= f.ev.pitches.length)) selection.delete(k); }
  }
  // --- clipboard: copy / cut take the selection as a phrase; paste arms a cursor and a tap drops it ---
  function copySelection() {
    if (!selection.size) return;
    clipboard = clipFrom(doc, selItems());
    toast(`copied ${clipboard.events.length === 1 ? "one note" : `${clipboard.events.length} things`} — tap paste, then tap where it goes`);
    haptic(6); sync();
  }
  function cutSelection() { if (!selection.size) return; copySelection(); deleteSelection(); }
  function setPasting(on) {
    pasting = !!on && !!clipboard;
    if (pasting) { if (drag) grabEnd({ pointerId: drag.id }, { cancel: true }); if (lassoState) lassoEnd({ pointerId: lassoState.id }, { cancel: true }); if (mode === "pan") setMode("place"); pending = null; }
    R?.showGhost(null); R?.showTarget(null); sync();
  }
  function dropAt(clientX, clientY) {
    const t = pasteTarget(clientX, clientY);
    if (!t) return;
    try {
      const r = paste(doc, clipboard, t);
      commit(r.doc);
      selection.clear(); for (const k of r.keys) selection.add(k); showSel();
      pasting = false; sync(); haptic(10);
      const notes = r.keys.filter((k) => k.includes(":")).slice(0, 6).map((k) => { const [ev, pi] = k.split(":"); return find(doc, ev)?.ev.pitches[Number(pi)]; }).filter(Boolean);
      sound.play(notes, 260);
    } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar ?? t.bar); }
  }
  function nudge(msg, bar) {
    toast(msg); haptic(20);
    const b = bar !== undefined && barAt(L, bar);
    if (b) R.flashBar(b.bar, b.sys);
  }
  const keyOf = (thing) => (thing.type === "head" ? `${thing.ev}:${thing.pi}` : thing.ev);
  function select(thing, { toggle = true } = {}) {
    const key = keyOf(thing);
    if (selection.has(key)) { if (toggle) selection.delete(key); }
    else { selection.clear(); selection.add(key); }
    follow(thing);
    showSel(); sync(); haptic(4);
  }
  /** The voice follows the pen: selecting a thing makes its voice the active one (the switcher moves). */
  function follow(thing) { if (thing && Number.isInteger(thing.voice) && thing.voice !== voice) { voice = thing.voice; } }

  // --- grab + drag: pen / mouse / one finger down on a notehead takes it at once; vertical
  // movement re-pitches by staff step (sounding each), release commits. The mode is untouched:
  // in Place mode the armed duration stays armed and the next tap elsewhere still places.
  // In Select mode a rest grabs the same way: dragging moves the glyph by staff steps out of
  // another voice's way (`nudgeRest`) — silent, the bar's arithmetic untouched. An expression
  // (dynamic, text, hairpin) grabs in both directions: the pointer's slot moves it in time
  // (`moveExpressions`) and its vertical travel lifts it off its automatic line by staff steps
  // (`nudgeExpressionY`, quantised so two marks line up); a selected hairpin's end handle moves
  // that end alone, sideways (`moveSpanEnd`); pedal and octave lines (WSHED-125) behave as hairpins do.
  let drag = null; // { id, type, thing, items, cluster, wasSelected, y0, delta, base, preview, keys, t, at0?, at?, dy? }
  function grabStart(e, thing) {
    const handle = isHandle(thing.type), expr = EXPR_TYPES.has(thing.type);
    const wasSelected = selection.has(keyOf(thing));
    // a grabbed head that belongs to an all-noteheads selection takes the whole cluster with it (rests and expressions likewise)
    const cluster = !handle && wasSelected && (thing.type === "rest" ? allRests() : expr ? allExprs() : allHeads()) && selection.size > 1;
    if (!cluster && !handle) select(thing, { toggle: false });
    const items = cluster ? selItems() : [{ ev: thing.ev, pi: thing.pi }];
    let at0 = null, ref = null; // at0: the slot under the pen at grab time (the drag's delta counts from there, so a vertical drag slides nothing); ref: the mark's own slot (or the grabbed end's) that the delta applies to
    if (expr) { const { x, y } = toS(e.clientX, e.clientY), sl = slotAt(L, x, y), s0 = sl && exprSlot(doc, sl.bar, sl.ticks); at0 = s0 ? absOf(s0.bar, s0.at) : null; const f = findExpression(doc, thing.ev); ref = thing.type.endsWith("-end") ? absOf(f.x.end.bar, f.x.end.at) : absOf(f.bar, f.x.at); }
    drag = { id: e.pointerId, type: e.pointerType, thing, items, cluster, wasSelected, y0: e.clientY, delta: 0, base: doc, preview: doc, keys: [...selection], keys0: [...selection], t: performance.now(), at0, at: at0, ref, dy: 0 };
    R.showGhost(null);
    try { view.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  }
  function grabMove(e) {
    if (!drag || drag.id !== e.pointerId) return;
    if (EXPR_TYPES.has(drag.thing.type)) { // sideways: the slot under the pointer, across bars and systems; up / down: whole staff steps off the automatic line
      const { x, y } = toS(e.clientX, e.clientY);
      const slot = slotAt(L, x, y);
      if (!slot) return;
      const type = drag.thing.type, handle = isHandle(type), ids = drag.items.map((it) => it.ev);
      const s = exprSlot(drag.base, slot.bar, slot.ticks), abs = barStarts(drag.base).starts[s.bar] + s.at;
      const dy = handle ? 0 : Math.round((drag.y0 - e.clientY) / (S / 2));
      if (drag.at0 === null || (abs === drag.at && dy === drag.dy)) return;
      const sideways = (base, delta) => { // the mark (or the grabbed end) by the pen's travel in slots
        if (!handle) return moveExpressions(base, ids, delta);
        const tgt = slotOfAbs(base, drag.ref + delta);
        if (!tgt) throw new Nudge("as far right as it goes");
        return moveSpanEnd(base, drag.thing.ev, type.endsWith("-start") ? "start" : "end", tgt);
      };
      let next = drag.base;
      try { next = sideways(next, abs - drag.at0); drag.at = abs; }
      catch (err) { if (!(err instanceof Nudge)) throw err; if (drag.at !== drag.at0) next = sideways(next, drag.at - drag.at0); } // holds at the last good slot
      if (!handle && dy !== 0) { try { next = nudgeExpressionY(next, ids, dy); drag.dy = dy; } catch (err) { if (!(err instanceof Nudge)) throw err; if (drag.dy) next = nudgeExpressionY(next, ids, drag.dy); } } // holds at the last good step
      else drag.dy = dy;
      if (next === drag.preview) return;
      drag.preview = next; drag.delta = (drag.at - drag.at0) || drag.dy;
      doc = next; layout(); haptic(3);
      return;
    }
    const delta = Math.round((drag.y0 - e.clientY) / (S / 2));
    if (delta === drag.delta) return;
    try {
      if (drag.thing.type === "rest") {
        const ids = drag.items.map((it) => it.ev);
        drag.preview = nudgeRest(drag.base, ids, delta); drag.delta = delta; drag.keys = ids;
        doc = drag.preview; layout(); haptic(3);
        return;
      }
      const r = setPitch(drag.base, drag.items, delta);
      drag.delta = delta; drag.preview = r.doc; drag.keys = r.moved.map((m) => `${m.ev}:${m.pi}`);
      doc = r.doc;
      selection.clear(); for (const k of drag.keys) selection.add(k);
      layout();
      const pitches = r.moved.slice(0, 8).map((m) => find(doc, m.ev)?.ev.pitches[m.pi]).filter(Boolean);
      sound.play(pitches, 180);
      haptic(3);
    } catch (err) { if (!(err instanceof Nudge)) throw err; /* the cluster holds at the last good step */ }
  }
  function grabEnd(e, { cancel = false } = {}) {
    if (!drag || drag.id !== e.pointerId) return;
    const g = drag; drag = null;
    if (cancel || g.delta === 0) {
      doc = g.base;
      if (g.delta !== 0) { selection.clear(); for (const k of (g.cluster ? g.keys0 ?? g.keys : [keyOf(g.thing)])) selection.add(k); layout(); }
      // a clean tap on an already-selected single note deselects it (the toggle a tap always had); a tap on a handle is nothing
      if (!cancel && g.wasSelected && !g.cluster && !isHandle(g.thing.type) && performance.now() - g.t <= TAP_MS) { selection.clear(); showSel(); sync(); }
      return;
    }
    doc = g.base;                         // commit records base → preview as one step
    commit(g.preview);
    selection.clear(); for (const k of g.keys) selection.add(k); showSel(); sync();
    haptic(8);
  }

  // --- lasso (Select mode): pointer down on empty staff, move a few px, and a freehand
  // path grows under the tip; lifting closes it and selects everything inside.
  let lassoState = null; // { id, type, x0, y0, pts, active }
  function lassoStart(e) {
    const { x, y } = toS(e.clientX, e.clientY);
    lassoState = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, pts: [{ x, y }], active: false };
    try { view.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  }
  function lassoMove(e) {
    if (!lassoState || lassoState.id !== e.pointerId) return;
    if (!lassoState.active && Math.hypot(e.clientX - lassoState.x0, e.clientY - lassoState.y0) < LASSO_PX) return;
    lassoState.active = true;
    lassoState.pts.push(toS(e.clientX, e.clientY));
    R.showLasso(lassoState.pts);
  }
  function lassoEnd(e, { cancel = false } = {}) {
    if (!lassoState || lassoState.id !== e.pointerId) return;
    const l = lassoState; lassoState = null;
    R.showLasso(null);
    if (cancel) return;
    if (!l.active) { // a plain tap: on a rest (or a stem) it selects that; on empty staff it clears
      const t = thingAt(L, l.pts[0].x, l.pts[0].y);
      if (t) { select(t); return; }
      if (selection.size) { selection.clear(); showSel(); sync(); }
      return;
    }
    selection.clear();
    const got = lasso(L, l.pts);
    for (const t of got) selection.add(keyOf(t));
    const lastHead = [...got].reverse().find((t) => t.type === "head") ?? got[got.length - 1];
    follow(lastHead); // the last head lassoed sets the active voice
    showSel(); sync(); haptic(selection.size ? 6 : 0);
  }
  function deleteSelection() {
    if (!selection.size) return;
    const items = [...selection].map((k) => { const [ev, pi] = k.split(":"); return pi === undefined ? { ev } : { ev, pi: Number(pi) }; });
    const next = removeExpressions(remove(doc, items), selEvIds()); // notes to rests, expressions gone — one undo step
    selection.clear();
    commit(next); haptic(8);
  }

  // --- pointer policy --------------------------------------------------------
  const touches = new Set();
  let gesture = null;   // the pointer that may become a tap: { id, type, x, y, t, valid }
  let pan = null;     // Pan state: { pointers: Map(id → {x, y}), scrollTop, dist0, S0, last, vy, inertia }
  const wide = (e) => (e.width > PALM_PX || e.height > PALM_PX);

  /** The grabbable thing under the pointer: a head in any mode; in Select mode a rest or an expression (and a selected hairpin's handles) as well. */
  const headUnder = (e) => { if (!L) return null; const { x, y } = toS(e.clientX, e.clientY); const t = thingAt(L, x, y, mode === "select" ? selectedSpans() : undefined); return t?.type === "head" || (mode === "select" && t && (t.type === "rest" || EXPR_TYPES.has(t.type))) ? t : null; };
  view.addEventListener("pointerdown", (e) => {
    if (mode === "pan") { onPanDown(e); return; }
    if (e.pointerType === "touch") {
      const valid = touches.size === 0 && !wide(e);
      touches.add(e.pointerId);
      if (drag?.type === "touch") { grabEnd({ pointerId: drag.id }, { cancel: true }); return; } // a second finger lets go
      if (gesture?.type === "touch") gesture.valid = false; // a second finger spoils the first
      if (!valid) { if (gesture?.type !== "touch") return; gesture = { id: e.pointerId, type: "touch", valid: false }; return; }
      if (lassoState?.type === "touch") { lassoEnd({ pointerId: lassoState.id }, { cancel: true }); return; } // a second finger lets go
      const head = pasting || pending ? null : headUnder(e);
      if (head) { gesture = null; grabStart(e, head); return; }
      if (mode === "select" && !pasting && !pending) { gesture = null; lassoStart(e); return; }
      gesture = { id: e.pointerId, type: "touch", x: e.clientX, y: e.clientY, t: performance.now(), valid: true };
      ghostAt(e.clientX, e.clientY);
      return;
    }
    if (e.button && e.button !== 0) return;
    const head = pasting || pending ? null : headUnder(e);
    if (head) { gesture = null; grabStart(e, head); return; }
    if (mode === "select" && !pasting && !pending) { gesture = null; lassoStart(e); return; }
    gesture = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, t: performance.now(), valid: true };
  });
  view.addEventListener("pointermove", (e) => {
    if (mode === "pan") { onPanMove(e); return; }
    if (drag) { grabMove(e); return; }
    if (lassoState) { lassoMove(e); return; }
    if (e.pointerType === "touch") { if (gesture?.id === e.pointerId && gesture.valid && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > TAP_PX) { gesture.valid = false; R?.showGhost(null); R?.showTarget(null); } return; }
    if (!gesture || gesture.id !== e.pointerId) ghostAt(e.clientX, e.clientY); // hover
    else if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > TAP_PX) { gesture.valid = false; R?.showGhost(null); R?.showTarget(null); }
  });
  const up = (e) => {
    if (mode === "pan") { onPanUp(e); return; }
    if (drag?.id === e.pointerId) { if (e.pointerType === "touch") touches.delete(e.pointerId); grabEnd(e, { cancel: e.type === "pointercancel" }); return; }
    if (lassoState?.id === e.pointerId) { if (e.pointerType === "touch") touches.delete(e.pointerId); lassoEnd(e, { cancel: e.type === "pointercancel" }); return; }
    if (e.pointerType === "touch") {
      touches.delete(e.pointerId);
      if (gesture?.id === e.pointerId) {
        const ok = gesture.valid && e.type === "pointerup" && performance.now() - gesture.t <= TAP_MS && touches.size === 0 && !wide(e);
        const g = gesture; gesture = null; R?.showGhost(null); R?.showTarget(null);
        if (ok) tapAt(g.x, g.y);
      }
      return;
    }
    if (gesture?.id === e.pointerId) {
      const ok = gesture.valid && e.type === "pointerup" && performance.now() - gesture.t <= TAP_MS && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) <= TAP_PX;
      const g = gesture; gesture = null;
      if (ok) tapAt(g.x, g.y);
      ghostAt(e.clientX, e.clientY);
    }
  };
  view.addEventListener("pointerup", up);
  view.addEventListener("pointercancel", up);
  view.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") { R?.showGhost(null); R?.showTarget(null); } });
  view.addEventListener("contextmenu", (e) => e.preventDefault());

  // --- Pan: pan with one pointer (inertia), pinch to zoom with two ---------
  function onPanDown(e) {
    try { view.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer (tests) cannot be captured */ }
    if (!pan) pan = { pointers: new Map(), last: performance.now(), vy: 0 };
    cancelAnimationFrame(pan.inertia);
    pan.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pan.pointers.size === 2) { const [a, b] = [...pan.pointers.values()]; pan.dist0 = Math.hypot(a.x - b.x, a.y - b.y); pan.S0 = S; }
  }
  function onPanMove(e) {
    if (!pan?.pointers.has(e.pointerId)) return;
    const prev = pan.pointers.get(e.pointerId);
    pan.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pan.pointers.size === 1) {
      const dy = e.clientY - prev.y, now = performance.now();
      view.scrollTop -= dy;
      pan.vy = dy / Math.max(1, now - pan.last); pan.last = now;
    } else if (pan.pointers.size === 2 && pan.dist0) {
      const [a, b] = [...pan.pointers.values()];
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / pan.dist0;
      const next = Math.max(S_MIN, Math.min(S_MAX, Math.round(pan.S0 * ratio)));
      if (next !== S) setZoom(next, false);
    }
  }
  function onPanUp(e) {
    if (!pan) return;
    pan.pointers.delete(e.pointerId);
    if (pan.pointers.size === 0) {
      let v = pan.vy * 16; // px per frame
      const glide = () => { if (Math.abs(v) < 0.5) return; view.scrollTop -= v; v *= 0.93; pan.inertia = requestAnimationFrame(glide); };
      if (Math.abs(v) > 1) pan.inertia = requestAnimationFrame(glide);
      store.set("zoom", S);
    } else pan.dist0 = null;
  }
  function setZoom(next, persist = true) {
    next = Math.max(S_MIN, Math.min(S_MAX, next));
    if (next === S) return;
    const frac = view.scrollHeight ? view.scrollTop / view.scrollHeight : 0;
    S = next; layout();
    view.scrollTop = frac * view.scrollHeight;
    if (persist) store.set("zoom", S);
  }

  // --- actions from the rails + keys -----------------------------------------
  function act(name, arg) {
    switch (name) {
      case "back": close(); return;
      case "details": { // title · composer · tags in the shared modal; the header follows a rename, a delete leaves the editor
        flush();
        openCompositionDetails(id).then((r) => { if (closed) return; if (r.deleted) { close(); return; } if (r.saved) { title = r.saved.title; composer = r.saved.composer ?? ""; held = logbook.composition(id); el.setAttribute("aria-label", heading()); sync(); } });
        return;
      }
      case "export-pdf": case "save-pdf": { // the export sheet: size, page, margins, header, preview → Save PDF / Add to Scores (WSHED-121)
        flush();
        openExportSheet({ id, doc, primary: name });
        return;
      }
      case "export-xml": { // MusicXML 4.0 of the piece as it stands (WSHED-119): save to the device or share it, like the PDF
        flush();
        const c = logbook.composition(id) ?? { title, composer };
        const file = new File([toMusicXml(doc, { title: c.title, composer: c.composer ?? "" })], musicXmlFileName(c), { type: MUSICXML_TYPE });
        saveFile(file, { title: "save MusicXML", shareTitle: c.title }).then((way) => { if (way === "device") toast(`saved as ${file.name}`); else if (way === "share") toast("shared"); }).catch((e) => { console.error(e); toast(e.message || "the export failed"); });
        return;
      }
      case "undo": if (history.canUndo) { doc = history.undo(); dirty = true; pruneSelection(); layout(); flush(); } return;
      case "redo": if (history.canRedo) { doc = history.redo(); dirty = true; pruneSelection(); layout(); flush(); } return;
      case "select": setMode(mode === "select" ? "place" : "select"); return;
      case "pan": setMode(mode === "pan" ? "place" : "pan"); return;
      case "delete": deleteSelection(); return;
      case "copy": copySelection(); return;
      case "cut": cutSelection(); return;
      case "paste": setPasting(!pasting); if (pasting) toast("tap where the phrase goes"); return;
      case "play": player.toggle(); syncTransport(); return;
      case "stop": player.stop(); syncTransport(); return;
      case "rew": { const loc = locate(doc, player.position); const b = loc ? (loc.ticks > 0 ? loc.bar : loc.bar - 1) : doc.measures.length - 1; player.seek(barStartOf(b)); syncTransport(); return; }
      case "ff": { const loc = locate(doc, player.position); player.seek(loc && loc.bar < doc.measures.length - 1 ? barStartOf(loc.bar + 1) : barStarts(doc).total - 1); syncTransport(); return; }
      case "seek": player.seek(Math.max(0, Math.min(barStarts(doc).total - 1, Number(arg) || 0))); return;
      case "tempo-down": setTempo(tempo - 1); return;
      case "tempo-up": setTempo(tempo + 1); return;
      case "tempo": { const v = prompt("tempo (beats per minute)", String(tempo)); if (v !== null) setTempo(v); return; }
      case "rail": if (!(arg in railsOn)) return; railsOn = { ...railsOn, [arg]: !railsOn[arg] }; store.set("rails", railsOn); sync(); setTimeout(layout, 0); return; // the rails' height changed: the view re-measures
      case "key": { // arm the key; the next tap on a bar puts the change there (the armed one again → off)
        if (pending?.kind === "key" && pending.value === arg) { setPending(null); return; }
        const k = KEYS.find((x) => x.fifths === arg);
        setPending({ kind: "key", value: arg }); toast(`${k ? `${k.major} major / ${k.minor} minor` : arg} — tap the bar it starts at`);
        return;
      }
      case "time": {
        let t = arg;
        if (t === "custom") { const v = prompt("time signature (beats/unit, e.g. 7/8)", "7/8"); if (v === null) return; const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(v); if (!m || !TIME_UNITS.includes(Number(m[2]))) { toast("say it as beats/unit, like 7/8"); return; } t = { beats: Number(m[1]), unit: Number(m[2]) }; }
        if (pending?.kind === "time" && pending.value.beats === t.beats && pending.value.unit === t.unit) { setPending(null); return; }
        setPending({ kind: "time", value: t }); toast(`${t.beats}/${t.unit} — tap the bar it starts at`);
        return;
      }
      case "clef": {
        if (pending?.kind === "clef" && pending.value === arg) { setPending(null); return; }
        setPending({ kind: "clef", value: arg }); toast(`${arg} clef — tap the beat it starts on`);
        return;
      }
      case "barline": { // the Form rail (WSHED-124): every button arms a tap on a bar; the armed one again → off
        if (pending?.kind === "barline" && pending.value === arg) { setPending(null); return; }
        setPending({ kind: "barline", value: arg }); toast(`${arg === "single" ? "plain barline" : arg === "repeat-start" ? "repeat start" : arg === "both" ? "repeat end + start" : `${arg} barline`} — tap the bar`);
        return;
      }
      case "ending": {
        if (pending?.kind === "ending" && pending.value === arg) { setPending(null); return; }
        setPending({ kind: "ending", value: arg }); toast(`ending ${arg} — tap its first bar, then its last`);
        return;
      }
      case "sign": case "jump": {
        if (pending?.kind === name && pending.value === arg) { setPending(null); return; }
        setPending({ kind: name, value: arg }); toast(`${name === "sign" ? (arg === "segno" ? "segno" : "coda sign") : JUMP_LABEL[arg]} — tap the bar${name === "jump" ? " it ends" : ""}`);
        return;
      }
      case "rehearsal": {
        if (pending?.kind === "rehearsal") { setPending(null); return; }
        setPending({ kind: "rehearsal" }); toast("rehearsal mark — tap the bar");
        return;
      }
      case "tempo-mark": {
        if (pending?.kind === "tempo-mark") { setPending(null); return; }
        const v = prompt("tempo for the bar you tap next — a number, or a word and a number (Allegro 120)", String(tempo));
        if (v === null) return;
        const m = /^\s*(.*?)\s*(\d+)\s*$/.exec(v);
        if (!m) { toast("say a number, like 120, or Allegro 120"); return; }
        const bpm = Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Number(m[2]))), text = m[1].trim().slice(0, 20);
        setPending({ kind: "tempo-mark", value: { bpm, ...(text ? { text } : {}) } }); toast(`♩ = ${bpm}${text ? ` ${text}` : ""} — tap the bar it starts at`);
        return;
      }
      case "art": {
        if (!selection.size) { toast("select notes for the mark"); return; }
        try { commit(articulate(doc, selEvIds(), arg)); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
        return;
      }
      case "gliss": {
        if (!selection.size) { toast("select the note to slide from"); return; }
        try { commit(gliss(doc, selEvIds())); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
        return;
      }
      case "slur": {
        if (!selection.size) { toast("select the notes to slur"); return; }
        try { commit(slur(doc, selEvIds())); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
        return;
      }
      case "dyn": { // with dynamics selected it retypes them; otherwise it arms — the next tap on the staff places it on the nearest half-beat (the armed one again → off)
        if (selection.size && selFacts().dyns) { try { commit(setExpressionValue(doc, selEvIds(), arg)); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); } return; }
        if (pending?.kind === "dyn" && pending.value === arg) { setPending(null); return; }
        setPending({ kind: "dyn", value: arg }); toast(`${arg} — tap the beat it goes on`);
        return;
      }
      case "pedal": { // the Piano rail (WSHED-125): three taps like a hairpin
        if (pending?.kind === "pedal") { setPending(null); return; }
        setPending({ kind: "pedal", start: null }); toast("pedal — tap where it goes down, then where it lifts");
        return;
      }
      case "ottava": {
        if (pending?.kind === "ottava" && pending.value === arg) { setPending(null); return; }
        setPending({ kind: "ottava", value: arg, start: null }); toast(`${LINE_NAME[arg]} — tap the first note it covers, then the last`);
        return;
      }
      case "finger": { // with heads selected: stamps them (the same digit on all → cleared); else arms the digit for taps on heads
        const n = Number(arg);
        if (selection.size) {
          if (!allNotes()) { toast("pick notes to finger"); return; }
          try { const next = finger(doc, selItems(), n); if (next === doc) return; commit(next); toast(selItems().every((it) => { const f = find(next, it.ev); return (it.pi === undefined ? f.ev.pitches : [f.ev.pitches[it.pi]]).every((q) => q.finger === n); }) ? `finger ${n}` : `finger ${n} cleared`); haptic(8); }
          catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
          return;
        }
        if (pending?.kind === "finger" && pending.value === n) { setPending(null); return; }
        setPending({ kind: "finger", value: n }); toast(`finger ${n} — tap the notes`);
        return;
      }
      case "hairpin": { // three taps: the button, where it starts, where it ends
        if (pending?.kind === "hairpin" && pending.value === arg) { setPending(null); return; }
        setPending({ kind: "hairpin", value: arg, start: null }); toast(`${arg === "cresc" ? "crescendo" : "diminuendo"} — tap where it starts, then where it ends`);
        return;
      }
      case "text": { // a chip or typed words: with texts selected it retypes them; otherwise it arms
        const t = String(arg ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
        if (!t) { toast("say what the text is"); return; }
        if (selection.size && selFacts().texts) { try { commit(setExpressionValue(doc, selEvIds(), t)); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); } return; }
        if (pending?.kind === "text" && pending.value === t) { setPending(null); return; }
        setPending({ kind: "text", value: t }); toast(`${t} — tap the beat it goes over`);
        return;
      }
      case "expr-nudge-y": { // ↑ / ↓ on an expression-only selection: one staff step off the automatic line
        try { commit(nudgeExpressionY(doc, selEvIds(), arg)); haptic(4); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
        return;
      }
      case "expr-nudge": { // ← / → on an expression-only selection: one slot of the first one's bar
        const ids = selEvIds(), f = findExpression(doc, ids[0]);
        if (!f) return;
        try { commit(moveExpressions(doc, ids, arg * exprGrid(timeAt(doc, f.bar)))); haptic(4); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
        return;
      }
      case "arp": {
        if (!selection.size) { toast("select the chord to roll"); return; }
        try { commit(arpeggio(doc, selEvIds(), arg)); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
        return;
      }
      case "voice": { // arg = 0-based voice: with notes selected they move to it; otherwise it becomes the voice the next tap writes in
        const v = Number(arg);
        if (!(v >= 0 && v < MAX_VOICES)) return;
        if (selection.size && selFacts().notes) {
          try { const ids = selEvIds(); commit(setVoice(doc, ids, v)); voice = v; pruneSelection(); showSel(); sync(); haptic(8); } // the selection stays selected, so a wrong move is one tap back
          catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
          return;
        }
        if (voice === v) { sync(); return; }
        voice = v; if (mode === "pan") setMode("place"); else sync();
        if (!voiceHinted) { voiceHinted = true; toast(`voice ${v + 1} — tap the staff`); }
        return;
      }
      case "voice-swap": { // swap voices 1 and 2 in the bars the selection touches
        if (!selection.size) { toast("select notes in the bars to swap"); return; }
        const bars = [...new Map(selEvIds().map((id) => find(doc, id)).filter(Boolean).map((f) => [`${f.bar}:${f.staff}`, { bar: f.bar, staff: f.staff }])).values()];
        try { commit(swapVoices(doc, bars, 0, 1)); pruneSelection(); showSel(); sync(); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
        return;
      }
      case "cross": { // arg = −1 (to the staff above) | 1 (below)
        if (!selection.size) { toast("select the notes to cross"); return; }
        try { commit(crossStaff(doc, selEvIds(), Number(arg))); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
        return;
      }
      case "hide-rest": {
        if (!selection.size) { toast("select the rests to hide"); return; }
        try { commit(hideRest(doc, selEvIds())); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
        return;
      }
      case "rest-nudge": { // ↑ / ↓ on a rest-only selection: one staff step
        try { commit(nudgeRest(doc, selEvIds(), arg)); haptic(4); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
        return;
      }
      case "zoom-in": setZoom(S + 2); return;
      case "zoom-out": setZoom(S - 2); return;
      case "dur":
        if (selection.size) { // selection first, then the button: retype every selected note, and arm that duration
          if (!allNotes()) { toast("pick notes to retype"); return; }
          try { commit(retype(doc, selEvIds(), { base: arg, dots: 0 })); haptic(8); }
          catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); return; }
          armed = { ...armed, base: arg }; saveArm();
          if (mode !== "place") setMode("place"); else sync();
          return;
        }
        if (mode === "place" && armed.base === arg) { setMode("select"); return; } // tap the armed one again → nothing armed
        armed = { ...armed, base: arg }; saveArm();
        if (mode !== "place") setMode("place"); else sync();
        return;
      case "dot":
        if (selection.size) { // dot every selected note (a chord dots as one); all dotted already → undot
          if (!allNotes()) { toast("pick notes to dot"); return; }
          const ids = selEvIds(), dots = ids.every((id) => find(doc, id).ev.dur.dots > 0) ? 0 : 1;
          try { commit(dot(doc, ids, dots)); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
          return;
        }
        armed = { ...armed, dots: (armed.dots + 1) % 3 }; saveArm(); if (mode !== "place") setMode("place"); else sync();
        toast(armed.dots === 0 ? "no dot" : armed.dots === 1 ? "dotted" : "double dotted");
        return;
      case "tie":
        if (!selection.size) { toast("select a note, then tie it to the next"); return; }
        try { commit(tie(doc, selItems())); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
        return;
      case "tuplet": { // arg = n from the hold menu; a plain tap uses the current n
        const n = arg ?? tupletN;
        if (selection.size) {
          try { const ids = selEvIds(); commit(tuplet(doc, ids, n)); selection.clear(); for (const id of ids) selection.add(id); showSel(); sync(); haptic(8); }
          catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
          tupletN = n; saveArm(); sync();
          return;
        }
        const on = armed.tuplet && !arg ? null : n; // tap the armed tuplet again → off; picking a size arms it
        tupletN = n; armed = { ...armed, tuplet: on }; saveArm();
        if (mode !== "place") setMode("place"); else sync();
        toast(on ? `${tupletName(on)} — each tap places a ${tupletName(on)} ${durName(armed.base)}` : "tuplet off");
        return;
      }
      case "acc": { // arg = alter −2 … 2
        if (selection.size) {
          try { commit(accidental(doc, selItems(), arg)); haptic(8); } catch (e) { if (!(e instanceof Nudge)) throw e; nudge(e.message, e.bar); }
          return;
        }
        armed = { ...armed, alter: armed.alter === arg ? null : arg };
        if (mode !== "place") setMode("place"); else sync();
        return;
      }
      case "rest":
        if (selection.size) { // the selected notes become rests of the same length; the toggle itself is untouched
          if (!allNotes()) { toast("pick notes to turn into rests"); return; }
          const ids = selEvIds();
          commit(toRests(doc, ids));
          selection.clear(); for (const id of ids) selection.add(id); showSel(); sync(); haptic(8);
          return;
        }
        armed = { ...armed, rest: !armed.rest }; saveArm(); if (mode !== "place") setMode("place"); else sync(); return;
      default: return;
    }
  }
  function setMode(next) {
    if (mode === next) return;
    if (drag) grabEnd({ pointerId: drag.id }, { cancel: true });
    if (lassoState) lassoEnd({ pointerId: lassoState.id }, { cancel: true });
    if (next === "pan") { pasting = false; pending = null; R?.showTarget(null); }
    mode = next; R?.showGhost(null);
    if (mode === "pan") { gesture = null; } else { cancelAnimationFrame(pan?.inertia); pan = null; }
    sync();
  }
  const onKey = (e) => {
    if (e.target?.closest?.("input, textarea, [contenteditable]")) return; // typing in a field is not a shortcut
    if (closed || e.target.matches("input, textarea, [contenteditable]") || document.querySelector(".lb-sheet-wrap")) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); act(e.shiftKey ? "redo" : "undo"); return; }
    if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copySelection(); return; }
    if (mod && e.key.toLowerCase() === "x") { e.preventDefault(); cutSelection(); return; }
    if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); if (clipboard) { setPasting(true); toast("tap where the phrase goes"); } return; }
    if (mod && /^[1-4]$/.test(e.key)) { e.preventDefault(); act("voice", Number(e.key) - 1); return; }
    if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); act("cross", e.key === "ArrowUp" ? -1 : 1); return; }
    if (mod) return;
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && allRests()) { e.preventDefault(); act("rest-nudge", e.key === "ArrowUp" ? 1 : -1); return; }
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && allExprs()) { e.preventDefault(); act("expr-nudge-y", e.key === "ArrowUp" ? 1 : -1); return; }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && allExprs()) { e.preventDefault(); act("expr-nudge", e.key === "ArrowLeft" ? -1 : 1); return; }
    if (e.key === " " || e.code === "Space") { e.preventDefault(); act("play"); return; }
    if (e.key === "Home") { e.preventDefault(); act("stop"); return; }
    if (e.key === "Escape" && pending) { setPending(null); return; }
    if (e.key === "Escape" && pasting) { setPasting(false); return; }
    if (e.key === "Escape") { if (selection.size) { selection.clear(); showSel(); sync(); } else setMode(mode === "select" ? "place" : "select"); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); return; }
    if (KEY_BASE[e.key]) { act("dur", KEY_BASE[e.key]); return; }
    if (e.key === ".") { act("dot"); return; }
    if (e.key === "t" || e.key === "T") { act("tie"); return; }
    const k = e.key.toLowerCase();
    if (k === "r") act("rest"); else if (k === "h") setMode(mode === "pan" ? "place" : "pan"); else if (k === "v") setMode(mode === "select" ? "place" : "select");
    else if (k === "=" || k === "+") act("zoom-in"); else if (k === "-") act("zoom-out");
  };
  document.addEventListener("keydown", onKey);
  const onResize = () => { if (!closed) layout(); };
  window.addEventListener("resize", onResize);
  const onHide = () => flush();
  window.addEventListener("pagehide", onHide);

  layout();
  // marks are centred on measured ink; if Bravura is not in yet the first render centred their advance box — lay out again once it is
  if (document.fonts && !document.fonts.check('1em "Bravura"')) document.fonts.load('1em "Bravura"').then(() => { if (!closed) layout(); }, () => {});
  toast(`${durName(armed.base)} armed — tap the staff`);

  function close({ silent = false } = {}) {
    if (closed) return;
    closed = true;
    flush();
    const trimmed = trimBars(doc);
    if (trimmed.measures.length !== doc.measures.length && logbook.composition(id)) put({ measures: trimmed.measures, v: doc.v });
    offRemote();
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pagehide", onHide);
    cancelAnimationFrame(pan?.inertia);
    player.destroy();
    rails.destroy();
    sound.destroy();
    setRunning?.(false);
    el.remove();
    if (!silent) onClose?.();
  }

  const api = {
    id, close,
    /** For tests: the live state. */
    get state() { return { mode, armed, voice, S, selection: [...selection], bars: doc.measures.length, dragging: !!drag, lassoing: !!lassoState?.active, pasting, hasClip: !!clipboard, playing: player.playing, position: player.position, tempo, pending, rails: railsOn, title, doc }; },
    /** For tests: the current layout. */
    get layout() { return L; },
    /** For tests: the client point of a musical place. */
    pointFor({ bar, staff, ticks, step }) {
      const { sys, bar: hb } = barAt(L, bar);
      const r = R.svg.getBoundingClientRect();
      return { x: r.left + xOfTicks(hb, ticks) * S, y: r.top + stepY(sys, staff, step) * S };
    },
  };
  el.__editor = api;
  return api;
}
