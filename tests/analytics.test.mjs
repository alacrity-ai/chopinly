import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogbook, dayKey, addDays } from "../js/lib/logbook.js";
import { resolveRange, analyze, totalMs, unitFor, series, inFocus, focusLabel, RANGES } from "../js/lib/analytics.js";

function memStore() { const m = new Map(); return { get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), set: (k, v) => m.set(k, JSON.stringify(v)) }; }
const M = 60000, H = 3600000, D = 86400000;
const NOON = new Date(2026, 8, 4, 12).getTime(); // Fri 4 Sep 2026
function fresh(start = NOON) {
  let t = start;
  const lb = createLogbook({ store: memStore(), now: () => t });
  return { lb, set: (ms) => { t = ms; }, now: () => t };
}
const at = (y, mo, d, h, mi = 0) => new Date(y, mo, d, h, mi).getTime();

test("resolveRange: presets end today, all starts at the first segment, custom swaps reversed keys", () => {
  const { lb, now } = fresh();
  const today = dayKey(now());
  const r7 = resolveRange({ key: "7d" }, lb.doc, now());
  assert.equal(r7.days, 7); assert.equal(r7.toKey, today); assert.equal(r7.fromKey, addDays(today, -6));
  lb.addTime({ goalId: lb.addGoal({ name: "x" }).id, minutes: 10, endedAt: at(2026, 5, 20, 9) });
  const all = resolveRange({ key: "all" }, lb.doc, now());
  assert.equal(all.fromKey, "2026-06-20"); assert.equal(all.toKey, today);
  const c = resolveRange({ key: "custom", from: "2026-08-10", to: "2026-08-01" }, lb.doc, now());
  assert.equal(c.fromKey, "2026-08-01"); assert.equal(c.toKey, "2026-08-10"); assert.equal(c.days, 10);
  assert.equal(resolveRange({ key: "nope" }, lb.doc, now()).days, 30, "unknown → 30d");
  assert.equal(RANGES.length, 6);
});

test("unitFor: days up to 31, weeks to 26 weeks, then months", () => {
  assert.equal(unitFor(7), "day"); assert.equal(unitFor(31), "day"); assert.equal(unitFor(32), "week"); assert.equal(unitFor(182), "week"); assert.equal(unitFor(183), "month");
});

test("analyze: a segment across midnight splits by day and hour; totals, sessions, streak, buckets", () => {
  const { lb, now } = fresh();
  const p = lb.addGoal({ name: "Prelude", type: "piece", composer: "Bach" });
  const y = new Date(now()); y.setDate(y.getDate() - 1);
  // 23:40 yesterday → 00:20 today (40 min), then 10:00–10:30 today
  lb.addTime({ goalId: p.id, minutes: 40, endedAt: at(y.getFullYear(), y.getMonth(), y.getDate() + 1, 0, 20) });
  lb.addTime({ goalId: p.id, minutes: 30, endedAt: at(2026, 8, 4, 10, 30) });
  const r = resolveRange({ key: "7d" }, lb.doc, now());
  const a = analyze(lb.doc, { ...r, now: now() });
  assert.equal(a.totalMinutes, 70);
  const today = dayKey(now()), yest = addDays(today, -1);
  assert.equal(Math.round(a.daily.get(yest) / M), 20);
  assert.equal(Math.round(a.daily.get(today) / M), 50);
  assert.equal(a.hours[23].minutes, 20); assert.equal(a.hours[0].minutes, 20); assert.equal(a.hours[10].minutes, 30);
  assert.equal(a.daysPracticed, 2); assert.equal(a.longestStreak, 2);
  assert.equal(a.sessions, 2); assert.equal(a.avgSessionMin, 35); assert.equal(a.medianSessionMin, 40);
  assert.equal(a.sessionBuckets.find((b) => b.key === "s60").count, 2);
  assert.equal(a.series.unit, "day"); assert.equal(a.series.points.length, 7);
  assert.deepEqual(a.series.points.slice(-2).map((x) => x.minutes), [20, 50]);
  assert.equal(a.series.points[6].band, "good"); assert.equal(a.series.points[5].band, "okay");
  assert.equal(a.weekdays.reduce((s, d) => s + d.minutes, 0), 70);
  assert.equal(a.bands.find((b) => b.key === "okay").count, 1);
  assert.equal(a.bands.find((b) => b.key === "good").count, 1);
  assert.equal(a.byComposer[0].label, "Bach"); assert.equal(a.byComposer[0].share, 1);
  assert.equal(a.byGoal[0].label, "Bach – Prelude"); assert.equal(a.byGoal[0].days, 2);
  assert.equal(a.byType[0].key, "piece"); assert.equal(a.byType[0].share, 1);
  assert.equal(a.delta, null, "nothing in the week before");
  assert.equal(a.range.daysElapsed, 7);
});

test("analyze: previous-period delta, focus by type / composer / goal, no-composer bucket", () => {
  const { lb, now } = fresh();
  const bach = lb.addGoal({ name: "Prelude", type: "piece", composer: "Bach" });
  const anon = lb.addGoal({ name: "Clair de lune", type: "piece" });
  const scales = lb.addGoal({ name: "Scales", type: "technique" });
  lb.addTime({ goalId: bach.id, minutes: 60, endedAt: at(2026, 8, 3, 9) });
  lb.addTime({ goalId: anon.id, minutes: 30, endedAt: at(2026, 8, 2, 9) });
  lb.addTime({ goalId: scales.id, minutes: 30, endedAt: at(2026, 8, 1, 9) });
  lb.addTime({ goalId: scales.id, minutes: 40, endedAt: at(2026, 7, 27, 9) }); // 8 days ago → previous 7-day window
  const r = resolveRange({ key: "7d" }, lb.doc, now());
  const a = analyze(lb.doc, { ...r, now: now() });
  assert.equal(a.totalMinutes, 120); assert.equal(a.prevMinutes, 40); assert.equal(a.delta, 2, "+200%");
  assert.deepEqual(a.byComposer.map((c) => [c.label, c.minutes, Math.round(c.share * 100)]), [["Bach", 60, 67], ["no composer", 30, 33]]);
  assert.deepEqual(a.byType.map((t) => t.key), ["piece", "technique"]);
  const tech = analyze(lb.doc, { ...r, now: now(), focus: { kind: "type", value: "technique" } });
  assert.equal(tech.totalMinutes, 30); assert.equal(tech.prevMinutes, 40); assert.ok(tech.delta < 0);
  assert.equal(tech.byComposer.length, 0);
  const noc = analyze(lb.doc, { ...r, now: now(), focus: { kind: "composer", value: "" } });
  assert.equal(noc.totalMinutes, 30); assert.equal(noc.byGoal[0].goal.id, anon.id);
  const one = analyze(lb.doc, { ...r, now: now(), focus: { kind: "goal", value: bach.id } });
  assert.equal(one.totalMinutes, 60); assert.equal(one.byGoal.length, 1);
  assert.equal(focusLabel({ kind: "goal", value: bach.id }, lb.doc), "Bach – Prelude");
  assert.equal(focusLabel({ kind: "composer", value: "" }, lb.doc), "no composer");
  assert.equal(focusLabel({ kind: "type", value: "technique" }, lb.doc), "technique");
  assert.equal(inFocus(scales, { kind: "composer", value: "" }), false, "techniques have no composer bucket");
  assert.equal(totalMs(lb.doc, { from: r.from, to: r.to, now: now() }), 120 * M);
});

test("series: weekly buckets start on Monday; monthly labels; future days flagged", () => {
  const { now } = fresh();
  const daily = new Map([["2026-08-31", 30 * M], ["2026-09-01", 30 * M], ["2026-09-04", 60 * M]]);
  const w = series(daily, { fromKey: "2026-07-01", toKey: "2026-09-04", days: 66, now: now() });
  assert.equal(w.unit, "week");
  const last = w.points[w.points.length - 1];
  assert.equal(last.key, "2026-08-31"); assert.equal(last.minutes, 120);
  const m = series(daily, { fromKey: "2025-12-01", toKey: "2026-09-04", days: 278, now: now() });
  assert.equal(m.unit, "month"); assert.equal(m.points.length, 10); assert.equal(m.points[9].minutes, 90); assert.equal(m.points[8].minutes, 30);
  const d = series(daily, { fromKey: "2026-09-01", toKey: "2026-09-10", days: 10, now: now() });
  assert.equal(d.points.filter((p) => p.future).length, 6, "days after today are flagged");
});
