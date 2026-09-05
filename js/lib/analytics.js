// Analytics — pure aggregation over the Logbook document for one time range
// (WSHED-63, docs/LOGBOOK_V2_DESIGN.md §3.5). DOM-free so tests can drive it;
// the page in js/tools/logbook/analytics.js only draws what comes out of here.
//
// A range is [from, to) in ms. Segments are clipped to it (the running one
// ends "now"). A focus narrows every number to one type, composer or goal.
import { dayKey, dayStart, addDays, band, BANDS, TYPES, TYPE_IDS, displayName } from "./logbook.js";

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const MIN_PRACTICED_MS = MIN / 2; // same threshold as logbook.practicedOn

export const RANGES = [
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "1y", label: "1y", days: 365 },
  { key: "all", label: "all" },
  { key: "custom", label: "custom" },
];
export const SESSION_BUCKETS = [
  { key: "s15", label: "< 15m", max: 15 },
  { key: "s30", label: "15–30m", max: 30 },
  { key: "s60", label: "30–60m", max: 60 },
  { key: "s90", label: "1–1½h", max: 90 },
  { key: "s90p", label: "1½h +", max: Infinity },
];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const NO_COMPOSER = "";

/** A range spec { key, from?, to? } (from/to are day keys for custom) → { from, to, fromKey, toKey, days }. */
export function resolveRange(spec, doc, now = Date.now()) {
  const todayKey = dayKey(now);
  const tomorrow = dayStart(addDays(todayKey, 1));
  let fromKey, toKey;
  if (spec?.key === "custom" && isKey(spec.from) && isKey(spec.to)) {
    [fromKey, toKey] = spec.from <= spec.to ? [spec.from, spec.to] : [spec.to, spec.from];
  } else if (spec?.key === "all") {
    const first = doc.segments.reduce((m, s) => Math.min(m, s.startedAt), now);
    fromKey = dayKey(first); toKey = todayKey;
  } else {
    const r = RANGES.find((x) => x.key === spec?.key && x.days) ?? RANGES[1];
    fromKey = addDays(todayKey, -(r.days - 1)); toKey = todayKey;
  }
  const from = dayStart(fromKey), to = Math.min(dayStart(addDays(toKey, 1)), spec?.key === "custom" ? Infinity : tomorrow);
  return { from, to, fromKey, toKey, days: Math.max(1, Math.round((to - from) / DAY)) };
}
const isKey = (k) => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k);

/** Composer bucket for a goal: pieces group by composer ("" = none); other types don't have one. */
export const composerOf = (g) => (g?.type === "piece" ? (g.composer ?? NO_COMPOSER) : null);

/** Does a goal fall inside the focus? focus = { kind: "type"|"composer"|"goal", value } | null. */
export function inFocus(g, focus) {
  if (!focus) return true;
  if (!g) return false;
  if (focus.kind === "type") return g.type === focus.value;
  if (focus.kind === "composer") return composerOf(g) === focus.value;
  if (focus.kind === "goal") return g.id === focus.value;
  return true;
}
/** One sentence naming a focus, for the chip. */
export function focusLabel(focus, doc) {
  if (!focus) return "";
  if (focus.kind === "type") return TYPES[focus.value]?.label ?? focus.value;
  if (focus.kind === "composer") return focus.value === NO_COMPOSER ? "no composer" : focus.value;
  const g = doc.goals.find((x) => x.id === focus.value);
  return g ? displayName(g) : "a goal";
}

/** Clip the focused segments to [from, to). Returns [{ s0, s1, ms, seg, goal }]. */
function clipped(doc, from, to, now, focus) {
  const goals = new Map(doc.goals.map((g) => [g.id, g]));
  const out = [];
  for (const seg of doc.segments) {
    const goal = goals.get(seg.goalId);
    if (!goal || !inFocus(goal, focus)) continue;
    const s0 = Math.max(seg.startedAt, from), s1 = Math.min(seg.endedAt ?? now, to);
    if (s1 - s0 <= 0) continue;
    out.push({ s0, s1, ms: s1 - s0, seg, goal });
  }
  return out;
}
/** Split a clipped interval across local-day boundaries: fn(dayKey, ms). */
function eachDay(s0, s1, fn) {
  let k = dayKey(s0);
  for (let i = 0; i < 4000; i++) {
    const a = Math.max(s0, dayStart(k)), b = Math.min(s1, dayStart(addDays(k, 1)));
    if (b > a) fn(k, b - a);
    if (b >= s1) break;
    k = addDays(k, 1);
  }
}
/** Split a clipped interval across local-hour boundaries: fn(hour0to23, ms). */
function eachHour(s0, s1, fn) {
  let t = s0;
  for (let i = 0; i < 100000 && t < s1; i++) {
    const d = new Date(t); d.setMinutes(0, 0, 0);
    const next = d.getTime() + HOUR;
    const b = Math.min(s1, next);
    fn(d.getHours(), b - t);
    t = b;
  }
}
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const toMin = (ms) => Math.round(ms / MIN);

/** Total practiced ms inside [from, to) under a focus — the cheap version used for the prior period. */
export function totalMs(doc, { from, to, now = Date.now(), focus = null }) {
  return sum(clipped(doc, from, to, now, focus).map((c) => c.ms));
}

/** Time series unit for a range of N days. */
export const unitFor = (days) => (days <= 31 ? "day" : days <= 26 * 7 ? "week" : "month");

/** Bucket daily totals into days / weeks (Monday-first) / months across the range. */
export function series(daily, { fromKey, toKey, days, now = Date.now() }) {
  const unit = unitFor(days);
  const todayKey = dayKey(now);
  const spanYears = fromKey.slice(0, 4) !== toKey.slice(0, 4);
  const buckets = new Map();
  const keyOf = (k) => {
    if (unit === "day") return k;
    if (unit === "week") { const d = new Date(dayStart(k)); return addDays(k, -((d.getDay() + 6) % 7)); }
    return k.slice(0, 7);
  };
  const labelOf = (bk) => {
    if (unit === "month") { const [y, m] = bk.split("-").map(Number); const d = new Date(y, m - 1, 1); return d.toLocaleDateString(undefined, spanYears ? { month: "short", year: "2-digit" } : { month: "short" }); }
    const d = new Date(dayStart(bk));
    return unit === "day" ? String(d.getDate()) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) {
    const bk = keyOf(k);
    if (!buckets.has(bk)) buckets.set(bk, { key: bk, label: labelOf(bk), ms: 0, days: 0, future: false });
    const b = buckets.get(bk);
    b.ms += daily.get(k) ?? 0;
    if (k <= todayKey) b.days++; else b.future = true;
  }
  const points = [...buckets.values()].map((b) => ({ ...b, minutes: toMin(b.ms), band: unit === "day" && b.ms >= MIN_PRACTICED_MS ? band(toMin(b.ms)).key : null }));
  return { unit, points };
}

/**
 * Everything the analytics page shows, for one range and focus.
 * @param {object} doc the logbook document
 * @param {{ from:number, to:number, fromKey:string, toKey:string, days:number, now?:number, focus?:object|null }} opts
 */
export function analyze(doc, opts) {
  const { from, to, fromKey, toKey, days, now = Date.now(), focus = null } = opts;
  const parts = clipped(doc, from, to, now, focus);
  const total = sum(parts.map((p) => p.ms));

  // per day + per hour + per weekday
  const daily = new Map();
  const hours = Array(24).fill(0);
  for (const p of parts) {
    eachDay(p.s0, p.s1, (k, ms) => daily.set(k, (daily.get(k) ?? 0) + ms));
    eachHour(p.s0, p.s1, (h, ms) => { hours[h] += ms; });
  }
  const weekdays = Array(7).fill(0);
  for (const [k, ms] of daily) weekdays[(new Date(dayStart(k)).getDay() + 6) % 7] += ms;
  const practicedKeys = [...daily].filter(([, ms]) => ms >= MIN_PRACTICED_MS).map(([k]) => k).sort();
  const daysPracticed = practicedKeys.length;
  const daysElapsed = Math.min(days, Math.max(1, Math.round((Math.min(to, dayStart(addDays(dayKey(now), 1))) - from) / DAY)));

  // streak inside the range
  let longest = 0, run = 0, prev = null;
  for (const k of practicedKeys) { run = prev && addDays(prev, 1) === k ? run + 1 : 1; longest = Math.max(longest, run); prev = k; }

  // sessions = clipped segments
  const sessions = parts.length;
  const sessionBuckets = SESSION_BUCKETS.map((b) => ({ ...b, count: 0, ms: 0 }));
  for (const p of parts) { const m = p.ms / MIN; const b = sessionBuckets.find((x) => m < x.max) ?? sessionBuckets[sessionBuckets.length - 1]; b.count++; b.ms += p.ms; }
  const sorted = parts.map((p) => p.ms).sort((a, b) => a - b);
  const medianSessionMs = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

  // groupings
  const byType = TYPE_IDS.map((t) => ({ key: t, label: TYPES[t].label, cls: TYPES[t].cls, ms: sum(parts.filter((p) => p.goal.type === t).map((p) => p.ms)) }))
    .map((r) => ({ ...r, minutes: toMin(r.ms), share: total ? r.ms / total : 0 })).filter((r) => r.ms > 0).sort((a, b) => b.ms - a.ms);
  const comp = new Map();
  for (const p of parts) { const c = composerOf(p.goal); if (c === null) continue; comp.set(c, (comp.get(c) ?? 0) + p.ms); }
  const pieceMs = sum([...comp.values()]);
  const byComposer = [...comp].map(([key, ms]) => ({ key, label: key === NO_COMPOSER ? "no composer" : key, ms, minutes: toMin(ms), share: pieceMs ? ms / pieceMs : 0 })).sort((a, b) => b.ms - a.ms);
  const gm = new Map();
  for (const p of parts) { const r = gm.get(p.goal.id) ?? { goal: p.goal, ms: 0, sessions: 0, days: new Set() }; r.ms += p.ms; r.sessions++; r.days.add(dayKey(p.s0)); gm.set(p.goal.id, r); }
  const byGoal = [...gm.values()].map((r) => ({ key: r.goal.id, goal: r.goal, label: displayName(r.goal), cls: TYPES[r.goal.type]?.cls ?? "", ms: r.ms, minutes: toMin(r.ms), share: total ? r.ms / total : 0, sessions: r.sessions, days: r.days.size }))
    .sort((a, b) => b.ms - a.ms);

  // day bands
  const bands = BANDS.map((b) => ({ ...b, count: 0 }));
  for (const k of practicedKeys) bands.find((b) => b.key === band(toMin(daily.get(k))).key).count++;

  // the same-length period before this one
  const prevMs = totalMs(doc, { from: from - (to - from), to: from, now, focus });
  const delta = prevMs > 0 ? (total - prevMs) / prevMs : null;

  return {
    range: { from, to, fromKey, toKey, days, daysElapsed },
    totalMs: total, totalMinutes: toMin(total), prevMs, prevMinutes: toMin(prevMs), delta,
    daysPracticed, avgPerPracticedDayMin: daysPracticed ? Math.round(toMin(total) / daysPracticed) : 0,
    longestStreak: longest,
    sessions, avgSessionMin: sessions ? Math.round(toMin(total) / sessions) : 0, medianSessionMin: toMin(medianSessionMs),
    series: series(daily, { fromKey, toKey, days, now }),
    hours: hours.map((ms, h) => ({ hour: h, ms, minutes: toMin(ms) })),
    weekdays: weekdays.map((ms, i) => ({ day: WEEKDAYS[i], ms, minutes: toMin(ms) })),
    byType, byComposer, byGoal, sessionBuckets, bands,
    daily,
  };
}
