// Logbook data layer — the practice log's document, its reads and writes, and
// the derived numbers. Pure and DOM-free so the shell, the metronome and sight
// singing can import it, and so `tests/logbook.test.mjs` can drive it with an
// in-memory store. See docs/LOGBOOK_IMPLEMENTATION.md §2.
//
// One document lives under ws.logbook.data (via makeStore("logbook")):
//   { schemaVersion, goals[], entries[], days{}, clock, deleted[] }
// Every write saves the whole document and emits a change event.

import { makeStore } from "./store.js";

export const SCHEMA_VERSION = 1;
export const BUILTIN_SIGHTSINGING = "sightsinging";
/** Days without an entry before a goal is flagged as neglected. */
export const NEGLECT_DAYS = 7;

const pad = (n) => String(n).padStart(2, "0");
/** Local-time day key, YYYY-MM-DD. */
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** ms at local midnight for a day key. */
export function dayStart(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n).getTime());
}

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function emptyDoc() {
  return { schemaVersion: SCHEMA_VERSION, goals: [], entries: [], days: {}, clock: null, deleted: [] };
}

function migrate(doc) {
  if (!doc || typeof doc !== "object") return emptyDoc();
  if (doc.schemaVersion === SCHEMA_VERSION) {
    // Defensive fill for hand-edited imports.
    return { ...emptyDoc(), ...doc };
  }
  // Future: step upgrades by version. v1 has no predecessors.
  return emptyDoc();
}

/**
 * Build a logbook bound to a store. Defaults to localStorage via makeStore;
 * tests pass an in-memory store and a fake clock.
 */
export function createLogbook({ store = makeStore("logbook"), now = () => Date.now() } = {}) {
  let doc = migrate(store.get("data", null));
  const listeners = new Set();

  const save = () => { store.set("data", doc); for (const fn of listeners) fn(doc); };
  const stamp = (obj) => { obj.updatedAt = now(); return obj; };
  const goalById = (id) => doc.goals.find((g) => g.id === id) ?? null;
  const mustGoal = (id) => { const g = goalById(id); if (!g) throw new Error(`no goal ${id}`); return g; };

  // --- goals ----------------------------------------------------------------
  function goals(status = "active") {
    const list = doc.goals.filter((g) => status === "all" || g.status === status);
    return list.sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
  }
  function addGoal({ title, target = null, next = null, kind = "user", id = uuid() }) {
    const t = String(title ?? "").trim();
    if (!t) throw new Error("a goal needs a title");
    const order = doc.goals.reduce((m, g) => Math.max(m, g.order), 0) + 1;
    const g = stamp({
      id, title: t, target: target ? String(target).trim() || null : null,
      next: next ? String(next).trim() || null : null,
      status: "active", kind, order, createdAt: now(), finishedAt: null, spots: [],
    });
    doc.goals.push(g); save(); return g;
  }
  function updateGoal(id, patch) {
    const g = mustGoal(id);
    for (const k of ["title", "target", "next"]) {
      if (k in patch) {
        const v = patch[k] == null ? null : String(patch[k]).trim();
        if (k === "title" && !v) throw new Error("a goal needs a title");
        g[k] = v || null;
      }
    }
    stamp(g); save(); return g;
  }
  function setStatus(id, status) {
    const g = mustGoal(id);
    g.status = status;
    g.finishedAt = status === "finished" ? now() : null;
    stamp(g); save(); return g;
  }
  const finishGoal = (id) => setStatus(id, "finished");
  const shelveGoal = (id) => setStatus(id, "shelved");
  const reactivateGoal = (id) => setStatus(id, "active");
  function deleteGoal(id) {
    const g = mustGoal(id);
    if (g.kind === "builtin") throw new Error("built-in goals can't be deleted");
    doc.goals = doc.goals.filter((x) => x.id !== id);
    const gone = doc.entries.filter((e) => e.goalId === id);
    doc.entries = doc.entries.filter((e) => e.goalId !== id);
    doc.deleted.push({ id, kind: "goal", at: now() }, ...gone.map((e) => ({ id: e.id, kind: "entry", at: now() })));
    save();
  }
  /** ids in the new order (active goals only; others keep their order). */
  function reorderGoals(ids) {
    ids.forEach((id, i) => { const g = goalById(id); if (g) { g.order = i + 1; stamp(g); } });
    save();
  }

  // --- spots ----------------------------------------------------------------
  function addSpot(goalId, text) {
    const g = mustGoal(goalId);
    const t = String(text ?? "").trim();
    if (!t) throw new Error("a spot needs text");
    const s = { id: uuid(), text: t, createdAt: now(), fixedAt: null };
    g.spots.push(s); stamp(g); save(); return s;
  }
  function spotOf(goalId, spotId) {
    const g = mustGoal(goalId);
    const s = g.spots.find((x) => x.id === spotId);
    if (!s) throw new Error(`no spot ${spotId}`);
    return [g, s];
  }
  function fixSpot(goalId, spotId) { const [g, s] = spotOf(goalId, spotId); s.fixedAt = now(); stamp(g); save(); return s; }
  function unfixSpot(goalId, spotId) { const [g, s] = spotOf(goalId, spotId); s.fixedAt = null; stamp(g); save(); return s; }
  function deleteSpot(goalId, spotId) {
    const [g] = spotOf(goalId, spotId);
    g.spots = g.spots.filter((x) => x.id !== spotId);
    for (const e of doc.entries) e.spotIds = e.spotIds.filter((x) => x !== spotId);
    stamp(g); save();
  }

  // --- entries --------------------------------------------------------------
  function addEntry({ goalId, bpm = null, spotIds = [], note = null, next, auto = null, at = now() }) {
    const g = mustGoal(goalId);
    const b = bpm == null || bpm === "" ? null : Math.round(Number(bpm));
    if (b !== null && !(b >= 20 && b <= 300)) throw new Error("tempo must be 20–300");
    const e = {
      id: uuid(), goalId, at, bpm: b,
      spotIds: spotIds.filter((id) => g.spots.some((s) => s.id === id)),
      note: note ? String(note).trim() || null : null,
      auto,
    };
    doc.entries.push(e);
    if (next !== undefined) g.next = next ? String(next).trim() || null : null;
    stamp(g); save(); return e;
  }
  function deleteEntry(id) {
    const before = doc.entries.length;
    doc.entries = doc.entries.filter((e) => e.id !== id);
    if (doc.entries.length !== before) { doc.deleted.push({ id, kind: "entry", at: now() }); save(); }
  }
  /** Built-in goal + entry from another tool (sight singing). */
  function addAuto({ source, label, at = now() }) {
    let g = goalById(BUILTIN_SIGHTSINGING);
    if (!g) g = addGoal({ id: BUILTIN_SIGHTSINGING, title: "Sight singing", kind: "builtin" });
    if (g.status !== "active") setStatus(g.id, "active");
    return addEntry({ goalId: g.id, auto: { source, label }, at });
  }

  // --- days + clock ---------------------------------------------------------
  function addMinutes(key, n) {
    const m = Math.max(0, Math.round(Number(n) || 0));
    if (!m) return;
    doc.days[key] = { minutes: (doc.days[key]?.minutes ?? 0) + m };
    save();
  }
  const clock = () => doc.clock;
  function startClock() { if (!doc.clock) { doc.clock = { startedAt: now() }; save(); } return doc.clock; }
  /** Stops the clock and credits whole minutes to the day it started. */
  function stopClock() {
    if (!doc.clock) return 0;
    const started = doc.clock.startedAt;
    const minutes = Math.round((now() - started) / 60000);
    doc.clock = null;
    if (minutes > 0) addMinutes(dayKey(started), minutes); else save();
    return minutes;
  }

  // --- read models ----------------------------------------------------------
  const today = () => dayKey(now());
  const entriesOn = (key) =>
    doc.entries.map((e, i) => [e, i]).filter(([e]) => dayKey(e.at) === key)
      .sort((a, b) => (b[0].at - a[0].at) || (b[1] - a[1])).map(([e]) => e);
  const minutesOn = (key) => doc.days[key]?.minutes ?? 0;
  const practicedOn = (key) => minutesOn(key) > 0 || doc.entries.some((e) => dayKey(e.at) === key);

  function lastEntry(goalId) {
    let best = null;
    for (const e of doc.entries) if (e.goalId === goalId && (!best || e.at >= best.at)) best = e;
    return best;
  }
  function lastBpm(goalId) {
    let best = null;
    for (const e of doc.entries) if (e.goalId === goalId && e.bpm != null && (!best || e.at >= best.at)) best = e;
    return best?.bpm ?? null;
  }
  function daysSince(goalId) {
    const e = lastEntry(goalId);
    if (!e) return null;
    return Math.round((dayStart(today()) - dayStart(dayKey(e.at))) / 86400000);
  }
  function goalCard(g) {
    const since = daysSince(g.id);
    return {
      ...g,
      lastBpm: lastBpm(g.id),
      daysSince: since,
      neglected: g.kind === "user" && (since === null ? false : since >= NEGLECT_DAYS),
      openSpots: g.spots.filter((s) => !s.fixedAt),
      fixedSpots: g.spots.filter((s) => s.fixedAt),
    };
  }

  // --- metrics --------------------------------------------------------------
  function streak() {
    let key = today();
    if (!practicedOn(key)) key = addDays(key, -1); // a fresh morning keeps yesterday's streak
    let n = 0;
    while (practicedOn(key)) { n++; key = addDays(key, -1); if (n > 3660) break; }
    return n;
  }
  /** Per-goal BPM high-water marks reached on a day → gold. Also days a spot was fixed. */
  function goldDaySet() {
    const gold = new Set();
    const best = new Map(); // goalId → best so far, in chronological order
    for (const e of [...doc.entries].sort((a, b) => a.at - b.at)) {
      if (e.bpm == null) continue;
      const prev = best.get(e.goalId);
      if (prev != null && e.bpm > prev) gold.add(dayKey(e.at));
      if (prev == null || e.bpm > prev) best.set(e.goalId, e.bpm);
    }
    for (const g of doc.goals) for (const s of g.spots) if (s.fixedAt) gold.add(dayKey(s.fixedAt));
    return gold;
  }
  function weekStrip() {
    const gold = goldDaySet();
    const t = today();
    return Array.from({ length: 7 }, (_, i) => {
      const key = addDays(t, i - 6);
      return { key, practiced: practicedOn(key), gold: gold.has(key), today: key === t };
    });
  }
  function minutesBetween(fromKey, toKey) {
    let sum = 0;
    for (const [k, v] of Object.entries(doc.days)) if (k >= fromKey && k <= toKey) sum += v.minutes;
    return sum;
  }
  /** Calendar for a month: [{ key, inMonth, minutes, practiced, gold, entries }]. */
  function month(year, monthIndex) {
    const gold = goldDaySet();
    const first = new Date(year, monthIndex, 1);
    const daysIn = new Date(year, monthIndex + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday-first grid
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysIn; d++) {
      const key = dayKey(new Date(year, monthIndex, d).getTime());
      cells.push({ key, minutes: minutesOn(key), practiced: practicedOn(key), gold: gold.has(key), entries: entriesOn(key).length });
    }
    const from = dayKey(first.getTime()), to = dayKey(new Date(year, monthIndex, daysIn).getTime());
    const practicedDays = cells.filter((c) => c?.practiced).length;
    return { cells, totals: { days: practicedDays, minutes: minutesBetween(from, to) } };
  }
  function tempoSeries(goalId) {
    return doc.entries.filter((e) => e.goalId === goalId && e.bpm != null)
      .sort((a, b) => a.at - b.at).map((e) => ({ at: e.at, bpm: e.bpm }));
  }
  /** Per-goal numbers. Minutes are the goal's share of each day's minutes (split evenly across goals touched that day). */
  function goalStats(goalId) {
    const days = new Map();
    for (const e of doc.entries) {
      const k = dayKey(e.at);
      if (!days.has(k)) days.set(k, new Set());
      days.get(k).add(e.goalId);
    }
    let sessions = 0, minutes = 0;
    for (const [k, set] of days) if (set.has(goalId)) { sessions++; minutes += minutesOn(k) / set.size; }
    const g = goalById(goalId);
    return {
      sessions, minutes: Math.round(minutes), lastBpm: lastBpm(goalId), daysSince: daysSince(goalId),
      bestBpm: tempoSeries(goalId).reduce((m, p) => Math.max(m, p.bpm), 0) || null,
      openSpots: g ? g.spots.filter((s) => !s.fixedAt).length : 0,
      fixedSpots: g ? g.spots.filter((s) => s.fixedAt).length : 0,
      entries: doc.entries.map((e, i) => [e, i]).filter(([e]) => e.goalId === goalId)
        .sort((a, b) => (b[0].at - a[0].at) || (b[1] - a[1])).map(([e]) => e),
      span: g?.finishedAt ? Math.round((g.finishedAt - g.createdAt) / 86400000) : null,
    };
  }

  // --- export / import ------------------------------------------------------
  const exportJson = () => JSON.stringify(doc, null, 2);
  function importJson(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error("that file isn't JSON"); }
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.goals) || !Array.isArray(parsed.entries)) {
      throw new Error(`not a Woodshed logbook (schemaVersion ${SCHEMA_VERSION})`);
    }
    doc = migrate(parsed); save();
  }

  const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  return {
    // document
    get doc() { return doc; }, save, on,
    // goals / spots / entries
    goals, goal: goalById, goalCard, addGoal, updateGoal, finishGoal, shelveGoal, reactivateGoal, deleteGoal, reorderGoals,
    addSpot, fixSpot, unfixSpot, deleteSpot,
    addEntry, deleteEntry, addAuto, lastEntry, lastBpm,
    // time
    today, entriesOn, minutesOn, practicedOn, addMinutes, clock, startClock, stopClock,
    // metrics
    metrics: { streak, weekStrip, month, minutesBetween, tempoSeries, goalStats, goldDays: goldDaySet },
    exportJson, importJson,
  };
}

/** The app-wide instance (localStorage-backed). Tools and the shell share it. */
export const logbook = createLogbook();
