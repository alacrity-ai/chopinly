// Logbook data layer v2 — goal-attributed practice. Pure and DOM-free so the
// shell, the metronome and sight singing can import it, and so
// `tests/logbook.test.mjs` can drive it with an in-memory store.
// See docs/LOGBOOK_V2_DESIGN.md §2 and docs/LOGBOOK_V2_IMPLEMENTATION.md §2.
//
// One document lives under ws.logbook.data (via makeStore("logbook")):
//   { schemaVersion: 2, goals[], segments[], notes[], deleted[], pending[] }
// `pending` is the set of "kind:id" keys changed locally since the last sync
// (docs/ACCOUNTS_DESIGN.md §4.4); every entity carries updatedAt.
// A Goal is what you practice; a Segment is time spent on one goal (the
// running segment has endedAt: null — at most one); a Note is a dated line
// on a goal. Days are never stored: every number is derived from segments.

import { makeStore } from "./store.js";
import { KINDS, key as entityKey, pick, same, toEnvelope, tombEnvelope, fromEnvelope } from "./merge.js";

export const SCHEMA_VERSION = 2;
export const TYPES = {
  piece: { id: "piece", label: "piece", glyph: "●", cls: "t-piece", examples: "Pathétique Sonata, Bach Invention, Clair de lune" },
  technique: { id: "technique", label: "technique", glyph: "▲", cls: "t-technique", examples: "Scales, arpeggios, Hanon, octaves" },
  other: { id: "other", label: "other", glyph: "◆", cls: "t-other", examples: "Sight reading, improvisation, ear training" },
};
export const TYPE_IDS = Object.keys(TYPES);
/** How a goal is named everywhere: "Bach – Prelude in C" when a composer is set (WSHED-60). */
export const displayName = (g) => (g?.composer ? `${g.composer} – ${g.name}` : (g?.name ?? ""));
const cleanComposer = (c) => String(c ?? "").trim().slice(0, 80);
export const BUILTIN_SIGHTSINGING = "sightsinging";
export const BUILTIN_EARTRAINING = "eartraining";
export const BUILTIN_FREEPRACTICE = "freepractice";
/** Segments shorter than this are dropped when closed (an accidental tap). */
export const MIN_SEGMENT_MS = 10_000;
export const SORTS = ["recent", "name", "created", "time", "week", "month"];

const MIN = 60000;

/** Daily-total bands (WSHED-59). Grounded in the deliberate-practice ceiling —
 *  focused work tops out around four hours a day — and in overuse risk, which
 *  rises past four hours and sharply past six. Colour says "how much", never
 *  "more than yesterday". */
export const BANDS = [
  { key: "touched", min: 0,   label: "under 15 min",  note: "a few minutes at the keys." },
  { key: "okay",    min: 15,  label: "15 to 45 min",  note: "a real session. a little every day beats a big weekend." },
  { key: "good",    min: 45,  label: "45 min to 2 h", note: "focused work. for most of us this is the sweet spot." },
  { key: "sweet",   min: 120, label: "2 to 4 h",      note: "where serious study lives, in sessions with breaks between." },
  { key: "much",    min: 240, label: "4 to 6 h",      note: "attention fades past four hours. the extra hour teaches little." },
  { key: "over",    min: 360, label: "6 h and up",    note: "hands and focus both need rest. this is overuse territory." },
];
/** The band a daily total (minutes) falls in. */
export function band(minutes) { let b = BANDS[0]; for (const x of BANDS) if (minutes >= x.min) b = x; return b; }
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
/** Exclusive end of a day, DST-safe. */
const dayEnd = (key) => dayStart(addDays(key, 1));

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Accent- and case-insensitive text for search. */
export const norm = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

function emptyDoc() {
  return { schemaVersion: SCHEMA_VERSION, goals: [], segments: [], notes: [], takes: [], deleted: [], pending: [] };
}

// --- migration ---------------------------------------------------------------
function migrate(doc) {
  if (!doc || typeof doc !== "object") return emptyDoc();
  if (doc.schemaVersion === SCHEMA_VERSION) return { ...emptyDoc(), ...doc };
  if (doc.schemaVersion === 1) return migrateV1(doc);
  return emptyDoc();
}

/** v1 → v2, per docs/LOGBOOK_V2_DESIGN.md §2.2. Lossless where it can be. */
function migrateV1(v1) {
  const out = emptyDoc();
  const goals = Array.isArray(v1.goals) ? v1.goals : [];
  const entries = Array.isArray(v1.entries) ? v1.entries : [];
  const days = v1.days && typeof v1.days === "object" ? v1.days : {};
  const note = (goalId, body, createdAt) => ({ id: uuid(), goalId, body, createdAt });
  const fmtD = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  for (const g of goals) {
    const builtin = g.kind === "builtin";
    out.goals.push({
      id: g.id, name: String(g.title ?? "").trim() || "untitled", type: builtin ? "other" : "piece",
      status: g.status ?? "active", kind: g.kind ?? "user",
      createdAt: g.createdAt ?? 0, updatedAt: g.updatedAt ?? g.createdAt ?? 0, finishedAt: g.finishedAt ?? null,
    });
    if (g.target) out.notes.push(note(g.id, `target: ${g.target}`, g.createdAt ?? 0));
    if (g.spots?.length) {
      const spots = g.spots.map((s) => (s.fixedAt ? `${s.text} (fixed ${fmtD(s.fixedAt)})` : s.text)).join(" · ");
      out.notes.push(note(g.id, `spots: ${spots}`, (g.createdAt ?? 0) + 1));
    }
    if (g.next) out.notes.push(note(g.id, `next time: ${g.next}`, g.updatedAt ?? g.createdAt ?? 0));
  }
  for (const e of entries) {
    const g = goals.find((x) => x.id === e.goalId);
    if (!g) continue;
    const parts = [];
    if (e.auto?.label) parts.push(e.auto.label);
    if (e.bpm != null) parts.push(`♩ ${e.bpm}`);
    const spots = (e.spotIds ?? []).map((id) => g.spots?.find((s) => s.id === id)?.text).filter(Boolean);
    if (spots.length) parts.push(spots.join(", "));
    if (e.note) parts.push(e.note);
    if (parts.length) out.notes.push(note(e.goalId, parts.join(" · "), e.at ?? 0));
  }
  const dayKeys = Object.keys(days).filter((k) => (days[k]?.minutes ?? 0) > 0).sort();
  if (dayKeys.length || v1.clock?.startedAt) {
    const first = dayKeys.length ? dayStart(dayKeys[0]) : v1.clock.startedAt;
    out.goals.push({
      id: BUILTIN_FREEPRACTICE, name: "Free practice", type: "other", status: "active", kind: "builtin",
      createdAt: first, updatedAt: first, finishedAt: null,
    });
    for (const k of dayKeys) {
      const startedAt = dayStart(k) + 12 * 3600000;
      out.segments.push({
        id: uuid(), goalId: BUILTIN_FREEPRACTICE, startedAt, endedAt: startedAt + days[k].minutes * MIN,
        bpm: null, auto: { source: "migration", label: "v1 daily minutes" },
      });
    }
    if (v1.clock?.startedAt) {
      out.segments.push({ id: uuid(), goalId: BUILTIN_FREEPRACTICE, startedAt: v1.clock.startedAt, endedAt: null, bpm: null, auto: null });
    }
  }
  out.deleted = Array.isArray(v1.deleted) ? v1.deleted : [];
  return out;
}

/**
 * Build a logbook bound to a store. Defaults to localStorage via makeStore;
 * tests pass an in-memory store and a fake clock.
 */
export function createLogbook({ store = makeStore("logbook"), now = () => Date.now() } = {}) {
  const raw = store.get("data", null);
  let doc = migrate(raw);
  const listeners = new Set();
  const save = () => { store.set("data", doc); for (const fn of listeners) fn(doc); };
  if (raw && raw.schemaVersion !== SCHEMA_VERSION) store.set("data", doc); // persist the upgrade once
  const markPending = (kind, id) => { const k = `${kind}:${id}`; if (!doc.pending.includes(k)) doc.pending.push(k); };
  const touch = (kind, obj) => { obj.updatedAt = now(); markPending(kind, obj.id); return obj; };
  const stamp = (g) => touch("goal", g);
  const goalById = (id) => doc.goals.find((g) => g.id === id) ?? null;
  const mustGoal = (id) => { const g = goalById(id); if (!g) throw new Error(`no goal ${id}`); return g; };
  const tomb = (id, kind) => { const at = now(); doc.deleted.push({ id, kind, at, updatedAt: at }); markPending(kind, id); };

  // --- time helpers ----------------------------------------------------------
  const today = () => dayKey(now());
  /** ms of a segment inside [from, to). The running segment ends now. */
  const clip = (s, from, to) => Math.max(0, Math.min(s.endedAt ?? now(), to) - Math.max(s.startedAt, from));
  const msIn = (from, to, pred = () => true) => {
    let sum = 0;
    for (const s of doc.segments) if (pred(s)) sum += clip(s, from, to);
    return sum;
  };
  const toMin = (ms) => Math.round(ms / MIN);
  const goalMs = (goalId, from = -Infinity, to = Infinity) => msIn(from, to, (s) => s.goalId === goalId);
  function lastPracticedAt(goalId) {
    let best = null;
    for (const s of doc.segments) {
      if (s.goalId !== goalId) continue;
      const t = s.endedAt ?? now();
      if (best === null || t > best) best = t;
    }
    return best;
  }
  const weekFrom = () => dayStart(addDays(today(), -6));
  const monthFrom = () => { const d = new Date(now()); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

  // --- goals -----------------------------------------------------------------
  const COMPARE = {
    recent: (a, b) => {
      const la = lastPracticedAt(a.id), lb = lastPracticedAt(b.id);
      if (la === null && lb === null) return b.createdAt - a.createdAt;
      if (la === null) return 1;
      if (lb === null) return -1;
      return lb - la || b.createdAt - a.createdAt;
    },
    name: (a, b) => displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" }),
    created: (a, b) => b.createdAt - a.createdAt,
    time: (a, b) => goalMs(b.id) - goalMs(a.id) || b.createdAt - a.createdAt,
    week: (a, b) => goalMs(b.id, weekFrom()) - goalMs(a.id, weekFrom()) || b.createdAt - a.createdAt,
    month: (a, b) => goalMs(b.id, monthFrom()) - goalMs(a.id, monthFrom()) || b.createdAt - a.createdAt,
  };
  /** Library query. `status` "active" | "finished" | "shelved" | "all". */
  function goals(opts = {}) {
    const { status = "active", type = null, q = "", sort = "recent" } = typeof opts === "string" ? { status: opts } : opts;
    const needle = norm(q);
    const cmp = COMPARE[sort] ?? COMPARE.recent;
    return doc.goals
      .filter((g) => (status === "all" || g.status === status) && (!type || g.type === type) && (!needle || norm(displayName(g)).includes(needle)))
      .sort(cmp);
  }
  function addGoal({ name, type = "piece", kind = "user", id = uuid(), composer = "" }) {
    const n = String(name ?? "").trim();
    if (!n) throw new Error("a goal needs a name");
    if (!TYPES[type]) throw new Error(`unknown type ${type}`);
    const c = cleanComposer(composer);
    const g = stamp({ id, name: n, ...(c ? { composer: c } : {}), type, status: "active", kind, createdAt: now(), finishedAt: null });
    doc.goals.push(g); save(); return g;
  }
  function renameGoal(id, name) {
    const g = mustGoal(id);
    const n = String(name ?? "").trim();
    if (!n) throw new Error("a goal needs a name");
    g.name = n; stamp(g); save(); return g;
  }
  /** Set or clear (blank) a goal's composer (WSHED-60). */
  function setComposer(id, composer) {
    const g = mustGoal(id);
    const c = cleanComposer(composer);
    if (c) g.composer = c; else delete g.composer;
    stamp(g); save(); return g;
  }
  function retypeGoal(id, type) {
    const g = mustGoal(id);
    if (!TYPES[type]) throw new Error(`unknown type ${type}`);
    g.type = type; stamp(g); save(); return g;
  }
  function setStatus(id, status, { persist = true } = {}) {
    const g = mustGoal(id);
    g.status = status;
    g.finishedAt = status === "finished" ? now() : null;
    stamp(g);
    if (persist) save();
    return g;
  }
  const finishGoal = (id) => setStatus(id, "finished");
  const shelveGoal = (id) => setStatus(id, "shelved");
  const reactivateGoal = (id) => setStatus(id, "active");
  function deleteGoal(id) {
    const g = mustGoal(id);
    if (g.kind === "builtin") throw new Error("built-in goals can't be deleted");
    doc.goals = doc.goals.filter((x) => x.id !== id);
    tomb(id, "goal");
    for (const s of doc.segments) if (s.goalId === id) tomb(s.id, "segment");
    for (const n of doc.notes) if (n.goalId === id) tomb(n.id, "note");
    for (const t of doc.takes) if (t.goalId === id) tomb(t.id, "take");
    doc.segments = doc.segments.filter((s) => s.goalId !== id);
    doc.notes = doc.notes.filter((n) => n.goalId !== id);
    doc.takes = doc.takes.filter((t) => t.goalId !== id);
    save();
  }
  function ensureBuiltin(id, name, type) {
    let g = goalById(id);
    if (!g) {
      g = stamp({ id, name, type, status: "active", kind: "builtin", createdAt: now(), finishedAt: null });
      doc.goals.push(g);
    } else if (g.status !== "active") setStatus(id, "active", { persist: false });
    return g;
  }

  // --- practice (the timer) --------------------------------------------------
  const runningSegment = () => doc.segments.find((s) => s.endedAt === null) ?? null;
  function running() {
    const s = runningSegment();
    if (!s) return null;
    return { segment: s, goal: goalById(s.goalId), elapsedMs: Math.max(0, now() - s.startedAt) };
  }
  /** Closes the running segment; drops it if it was an accidental tap. */
  function closeRunning(at = now()) {
    const s = runningSegment();
    if (!s) return null;
    s.endedAt = Math.max(at, s.startedAt);
    if (s.endedAt - s.startedAt < MIN_SEGMENT_MS && !s.auto) {
      doc.segments = doc.segments.filter((x) => x !== s);
      tomb(s.id, "segment"); // it may already have synced while open
      return null;
    }
    touch("segment", s);
    return s;
  }
  /** Start practicing a goal. If something is already running this is a switch. */
  function start(goalId) {
    const g = mustGoal(goalId);
    const cur = runningSegment();
    if (cur) {
      if (cur.goalId === goalId) return cur;
      closeRunning();
    }
    if (g.status !== "active") setStatus(goalId, "active", { persist: false });
    const s = touch("segment", { id: uuid(), goalId, startedAt: now(), endedAt: null, bpm: null, auto: null });
    doc.segments.push(s); save(); return s;
  }
  const switchTo = start;
  /** Stop → the closed segment, or null if it was too short to keep. */
  function stop() { const s = closeRunning(); save(); return s; }
  function stampTempo(bpm) {
    const s = runningSegment();
    if (!s) throw new Error("nothing is running");
    const b = Math.round(Number(bpm));
    if (!(b >= 20 && b <= 300)) throw new Error("tempo must be 20–300");
    s.bpm = b; touch("segment", s); save(); return s;
  }
  /** Time without the clock (forgot to press play): a closed segment ending at `endedAt`. */
  function addTime({ goalId, minutes, endedAt = now() }) {
    mustGoal(goalId);
    const m = Math.round(Number(minutes));
    if (!(m >= 1 && m <= 24 * 60)) throw new Error("minutes must be 1–1440");
    const s = touch("segment", { id: uuid(), goalId, startedAt: endedAt - m * MIN, endedAt, bpm: null, auto: null });
    doc.segments.push(s); save(); return s;
  }
  function deleteSegment(id) {
    const s = doc.segments.find((x) => x.id === id);
    if (!s) return;
    if (s.endedAt === null) throw new Error("stop it first");
    doc.segments = doc.segments.filter((x) => x !== s);
    tomb(id, "segment"); save();
  }

  // --- notes -----------------------------------------------------------------
  function notes(goalId) {
    return doc.notes.map((n, i) => [n, i]).filter(([n]) => n.goalId === goalId)
      .sort((a, b) => (b[0].createdAt - a[0].createdAt) || (b[1] - a[1])).map(([n]) => n);
  }
  function addNote(goalId, body) {
    mustGoal(goalId);
    const b = String(body ?? "").trim();
    if (!b) throw new Error("an empty note isn't worth keeping");
    const n = touch("note", { id: uuid(), goalId, body: b, createdAt: now() });
    doc.notes.push(n); save(); return n;
  }
  function deleteNote(id) {
    const before = doc.notes.length;
    doc.notes = doc.notes.filter((n) => n.id !== id);
    if (doc.notes.length !== before) { tomb(id, "note"); save(); }
  }

  // --- takes (WSHED-75): recordings linked to a goal; audio lives on the device ---
  const TAKE_MAX_MS = 10 * 60 * 1000, PEAKS_MAX = 64;
  const cleanPeaks = (p) => (Array.isArray(p) ? p.slice(0, PEAKS_MAX).map((v) => Math.max(0, Math.min(1, Math.round(Number(v) * 100) / 100 || 0))) : []);
  /** Newest first. Filters: goalId, day (a day key). */
  function takes({ goalId = null, day = null } = {}) {
    const from = day ? dayStart(day) : -Infinity, to = day ? dayEnd(day) : Infinity;
    return doc.takes.map((t, i) => [t, i]).filter(([t]) => (!goalId || t.goalId === goalId) && t.recordedAt >= from && t.recordedAt < to)
      .sort((a, b) => (b[0].recordedAt - a[0].recordedAt) || (b[1] - a[1])).map(([t]) => t);
  }
  const take = (id) => doc.takes.find((t) => t.id === id) ?? null;
  /** Register a recording that has already been stored on this device. */
  function addTake({ id = uuid(), goalId, recordedAt = now(), durationMs, size = 0, mime = "", peaks = [] }) {
    mustGoal(goalId);
    const d = Math.round(Number(durationMs));
    if (!(d > 0 && d <= TAKE_MAX_MS)) throw new Error("a take is between a moment and ten minutes");
    const t = touch("take", { id, goalId, recordedAt, durationMs: d, size: Math.max(0, Math.round(Number(size)) || 0), mime: String(mime ?? "").slice(0, 60), starred: false, peaks: cleanPeaks(peaks) });
    doc.takes.push(t); save(); return t;
  }
  /** "Keep this one." */
  function starTake(id, on) {
    const t = take(id);
    if (!t) throw new Error(`no take ${id}`);
    t.starred = on === undefined ? !t.starred : !!on;
    touch("take", t); save(); return t;
  }
  function deleteTake(id) {
    const before = doc.takes.length;
    doc.takes = doc.takes.filter((t) => t.id !== id);
    if (doc.takes.length !== before) { tomb(id, "take"); save(); }
  }
  /** Day keys with at least one take on a goal (any goal when null). */
  const takeDays = (goalId = null) => new Set(doc.takes.filter((t) => !goalId || t.goalId === goalId).map((t) => dayKey(t.recordedAt)));

  // --- other tools writing in -----------------------------------------------
  /**
   * A finished lesson run (sight singing, ear training). With a goal running
   * it becomes a note on that goal (you chose what you're practicing — don't
   * double count); idle, it becomes an auto segment on the lesson's built-in
   * goal (`builtin` — Sight singing by default).
   */
  function addAuto({ source, label, startedAt, endedAt = now(), builtin = { id: BUILTIN_SIGHTSINGING, name: "Sight singing" } }) {
    const r = running();
    if (r) return { kind: "note", note: addNote(r.goal.id, label) };
    if (!Number.isFinite(startedAt)) throw new Error("addAuto needs startedAt");
    const g = ensureBuiltin(builtin.id, builtin.name, "other");
    const s = touch("segment", { id: uuid(), goalId: g.id, startedAt: Math.min(startedAt, endedAt), endedAt, bpm: null, auto: { source, label } });
    doc.segments.push(s); save();
    return { kind: "segment", segment: s };
  }

  // --- read models -----------------------------------------------------------
  const msOn = (key) => msIn(dayStart(key), dayEnd(key));
  const minutesOn = (key) => toMin(msOn(key));
  /** Half a minute rounds to one — the same threshold minutesOn uses. */
  const practicedOn = (key) => msOn(key) >= MIN / 2;
  /** What was practiced on a day: one row per goal, most time first, live row first on a tie. */
  function dayReport(key) {
    const from = dayStart(key), to = dayEnd(key);
    const by = new Map();
    for (const s of doc.segments) {
      const ms = clip(s, from, to);
      if (ms <= 0) continue;
      let r = by.get(s.goalId);
      if (!r) { r = { goal: goalById(s.goalId), ms: 0, segments: [], live: false }; by.set(s.goalId, r); }
      r.ms += ms; r.segments.push(s);
      if (s.endedAt === null) r.live = true;
    }
    const rows = [...by.values()].filter((r) => r.goal)
      .map((r) => ({ ...r, minutes: toMin(r.ms) }))
      .sort((a, b) => (b.ms - a.ms) || (Number(b.live) - Number(a.live)));
    const ms = rows.reduce((m, r) => m + r.ms, 0);
    return { key, ms, minutes: toMin(ms), goals: rows };
  }

  // --- metrics ---------------------------------------------------------------
  function streak() {
    let key = today();
    if (!practicedOn(key)) key = addDays(key, -1); // a fresh morning keeps yesterday's streak
    let n = 0;
    while (practicedOn(key)) { n++; key = addDays(key, -1); if (n > 3660) break; }
    return n;
  }
  /** Every day key any segment touches, ascending. */
  function practicedKeys() {
    const keys = new Set();
    for (const s of doc.segments) {
      let k = dayKey(s.startedAt);
      const last = dayKey(s.endedAt ?? now());
      for (let i = 0; i < 400 && k <= last; i++) { keys.add(k); k = addDays(k, 1); }
    }
    return [...keys].sort();
  }
  /** Best = a day that set a new best tempo on a goal. A bigger daily total is
   *  never a "best" — that only rewards volume (WSHED-59). */
  function bestTempoDaySet() {
    const best = new Set();
    const bestBpm = new Map();
    for (const s of [...doc.segments].filter((x) => x.bpm != null).sort((a, b) => a.startedAt - b.startedAt)) {
      const prev = bestBpm.get(s.goalId);
      if (prev != null && s.bpm > prev) best.add(dayKey(s.startedAt));
      if (prev == null || s.bpm > prev) bestBpm.set(s.goalId, s.bpm);
    }
    return best;
  }
  /** { key, practiced, minutes, band, best, today } for one day. */
  function dayCell(key, best, t) {
    const practiced = practicedOn(key), minutes = minutesOn(key);
    return { key, practiced, minutes, band: practiced ? band(minutes).key : null, best: best.has(key), today: key === t };
  }
  function weekStrip() {
    const best = bestTempoDaySet();
    const t = today();
    return Array.from({ length: 7 }, (_, i) => dayCell(addDays(t, i - 6), best, t));
  }
  const minutesBetween = (fromKey, toKey) => toMin(msIn(dayStart(fromKey), dayEnd(toKey)));
  /** Calendar for a month: cells [{ key, minutes, practiced, band, best, goals }] + totals. */
  function month(year, monthIndex) {
    const best = bestTempoDaySet(), t = today();
    const first = new Date(year, monthIndex, 1);
    const daysIn = new Date(year, monthIndex + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday-first grid
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysIn; d++) {
      const key = dayKey(new Date(year, monthIndex, d).getTime());
      cells.push({ ...dayCell(key, best, t), goals: dayReport(key).goals.length });
    }
    const from = dayKey(first.getTime()), to = dayKey(new Date(year, monthIndex, daysIn).getTime());
    return { cells, totals: { days: cells.filter((c) => c?.practiced).length, minutes: minutesBetween(from, to) } };
  }
  /** This month's time per goal, most first. */
  function monthByGoal(year, monthIndex) {
    const from = new Date(year, monthIndex, 1).getTime(), to = new Date(year, monthIndex + 1, 1).getTime();
    const by = new Map();
    for (const s of doc.segments) {
      const ms = clip(s, from, to);
      if (ms > 0) by.set(s.goalId, (by.get(s.goalId) ?? 0) + ms);
    }
    return [...by].map(([id, ms]) => ({ goal: goalById(id), ms, minutes: toMin(ms) }))
      .filter((r) => r.goal).sort((a, b) => b.ms - a.ms);
  }
  function tempoSeries(goalId) {
    return doc.segments.filter((s) => s.goalId === goalId && s.bpm != null)
      .sort((a, b) => a.startedAt - b.startedAt).map((s) => ({ at: s.startedAt, bpm: s.bpm }));
  }
  /** Per-goal numbers, all derived from its segments. */
  function goalStats(goalId) {
    const segs = doc.segments.filter((s) => s.goalId === goalId).sort((a, b) => b.startedAt - a.startedAt);
    const ms = goalMs(goalId);
    const days = new Set(segs.map((s) => dayKey(s.startedAt))).size;
    const last = lastPracticedAt(goalId);
    const series = tempoSeries(goalId);
    return {
      minutes: toMin(ms), days,
      avgSessionMin: days ? Math.round(toMin(ms) / days) : 0,
      weekMin: toMin(goalMs(goalId, weekFrom())),
      monthMin: toMin(goalMs(goalId, monthFrom())),
      lastPracticedAt: last,
      daysSince: last === null ? null : Math.round((dayStart(today()) - dayStart(dayKey(last))) / 86400000),
      bestBpm: series.reduce((m, p) => Math.max(m, p.bpm), 0) || null,
      lastBpm: series.length ? series[series.length - 1].bpm : null,
      segments: segs,
    };
  }

  const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // --- sync (docs/ACCOUNTS_DESIGN.md §4) --------------------------------------
  const listOf = { goal: () => doc.goals, segment: () => doc.segments, note: () => doc.notes, take: () => doc.takes };
  const findEntity = (kind, id) => listOf[kind]().find((x) => x.id === id) ?? null;
  const findTomb = (kind, id) => doc.deleted.find((t) => t.kind === kind && t.id === id) ?? null;
  const localEnvelope = (kind, id) => {
    const e = findEntity(kind, id);
    if (e) return toEnvelope(kind, e);
    const t = findTomb(kind, id);
    return t ? tombEnvelope(t) : null;
  };
  /** Envelopes for every locally changed entity (dropping stale keys). */
  function pendingEnvelopes() {
    const out = [];
    doc.pending = doc.pending.filter((k) => {
      const [kind, ...rest] = k.split(":"); const env = listOf[kind] ? localEnvelope(kind, rest.join(":")) : null;
      if (env) out.push(env);
      return !!env;
    });
    return out;
  }
  /** Every entity and tombstone as envelopes (first sign-in upload, export). */
  function allEnvelopes() {
    const out = [];
    for (const kind of KINDS) for (const e of listOf[kind]()) out.push(toEnvelope(kind, e));
    for (const t of doc.deleted) out.push(tombEnvelope(t));
    return out;
  }
  function markAllPending() {
    doc.pending = allEnvelopes().map(entityKey);
    save();
  }
  /** Forget pending keys whose current version is the one that was sent (a change made mid-flight stays pending). */
  function clearPending(sent) {
    const done = new Set(sent.filter((e) => { const cur = localEnvelope(e.kind, e.id); return cur && same(cur, e); }).map(entityKey));
    doc.pending = doc.pending.filter((k) => !done.has(k));
    save();
  }
  /** Merge remote envelopes in. Returns how many changed the document. */
  function applyRemote(envelopes) {
    const order = { goal: 0, segment: 1, note: 2, take: 3 };
    const sorted = [...envelopes].filter((e) => listOf[e.kind]).sort((a, b) => order[a.kind] - order[b.kind]);
    let applied = 0;
    for (const env of sorted) {
      const cur = localEnvelope(env.kind, env.id);
      if (cur && same(cur, env)) continue;
      if (pick(cur, env) !== env) continue;
      const list = listOf[env.kind]();
      const idx = list.findIndex((x) => x.id === env.id);
      if (env.deleted) {
        if (idx >= 0) list.splice(idx, 1);
        const t = findTomb(env.kind, env.id);
        if (t) { t.at = env.updatedAt; t.updatedAt = env.updatedAt; } else doc.deleted.push({ id: env.id, kind: env.kind, at: env.updatedAt, updatedAt: env.updatedAt });
      } else {
        const obj = fromEnvelope(env);
        if (idx >= 0) list[idx] = obj; else list.push(obj);
        doc.deleted = doc.deleted.filter((t) => !(t.kind === env.kind && t.id === env.id));
      }
      applied++;
    }
    // At most one segment may be open: two devices that both pressed play
    // while apart — the later start stays, the earlier closes at that instant.
    const open = doc.segments.filter((s) => s.endedAt === null).sort((a, b) => a.startedAt - b.startedAt);
    if (open.length > 1) {
      const keep = open[open.length - 1];
      for (const s of open.slice(0, -1)) { s.endedAt = Math.max(s.startedAt, keep.startedAt); touch("segment", s); applied++; }
    }
    if (applied) save();
    return { applied };
  }
  const pendingCount = () => doc.pending.length;

  return {
    get doc() { return doc; }, save, on,
    // goals
    goals, goal: goalById, addGoal, renameGoal, setComposer, retypeGoal, finishGoal, shelveGoal, reactivateGoal, deleteGoal,
    // practice
    running, start, switchTo, stop, stampTempo, addTime, deleteSegment,
    // notes
    notes, addNote, deleteNote,
    // takes
    takes, take, addTake, starTake, deleteTake, takeDays,
    // other tools
    addAuto,
    // sync
    pendingEnvelopes, allEnvelopes, markAllPending, clearPending, applyRemote, pendingCount,
    // read models
    today, minutesOn, practicedOn, dayReport,
    metrics: { streak, weekStrip, month, monthByGoal, minutesBetween, tempoSeries, goalStats, bestDays: bestTempoDaySet },
  };
}

/** The app-wide instance (localStorage-backed). Tools and the shell share it. */
export const logbook = createLogbook();
