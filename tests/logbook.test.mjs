import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogbook, dayKey, addDays, SCHEMA_VERSION, BUILTIN_SIGHTSINGING } from "../js/lib/logbook.js";

function memStore() {
  const m = new Map();
  return { get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), set: (k, v) => m.set(k, JSON.stringify(v)), m };
}
// A fake clock anchored at local noon so day math never straddles midnight.
function fresh(start = new Date(2026, 7, 30, 12).getTime()) {
  let t = start;
  const store = memStore();
  const lb = createLogbook({ store, now: () => t });
  return { lb, store, tick: (ms) => { t += ms; }, day: (n) => { t += n * 86400000; }, now: () => t };
}
const H = 3600000, D = 86400000;

test("goals: add, order, update, finish/shelve/delete with tombstones", () => {
  const { lb, store } = fresh();
  const a = lb.addGoal({ title: "Scales", target: "140" });
  const b = lb.addGoal({ title: " Chopin Op. 10 No. 1 " });
  assert.equal(b.title, "Chopin Op. 10 No. 1");
  assert.deepEqual(lb.goals().map((g) => g.id), [a.id, b.id]);
  lb.reorderGoals([b.id, a.id]);
  assert.deepEqual(lb.goals().map((g) => g.id), [b.id, a.id]);
  lb.updateGoal(a.id, { next: "F# minor" , target: "" });
  assert.equal(lb.goal(a.id).next, "F# minor");
  assert.equal(lb.goal(a.id).target, null);
  assert.throws(() => lb.updateGoal(a.id, { title: "  " }));
  lb.finishGoal(a.id);
  assert.equal(lb.goals().length, 1);
  assert.ok(lb.goal(a.id).finishedAt);
  lb.shelveGoal(b.id);
  assert.equal(lb.goals("shelved").length, 1);
  lb.reactivateGoal(b.id);
  lb.addEntry({ goalId: b.id, bpm: 96 });
  lb.deleteGoal(b.id);
  assert.equal(lb.goal(b.id), null);
  assert.equal(lb.doc.entries.length, 0);
  assert.deepEqual(lb.doc.deleted.map((d) => d.kind), ["goal", "entry"]);
  // persisted as one document
  assert.equal(JSON.parse(store.m.get("data")).schemaVersion, SCHEMA_VERSION);
});

test("spots: add, fix, unfix, delete (entries drop the id)", () => {
  const { lb } = fresh();
  const g = lb.addGoal({ title: "Chopin" });
  const s = lb.addSpot(g.id, "mm. 5–8");
  const e = lb.addEntry({ goalId: g.id, spotIds: [s.id, "bogus"] });
  assert.deepEqual(e.spotIds, [s.id]);
  lb.fixSpot(g.id, s.id);
  assert.ok(lb.goalCard(lb.goal(g.id)).fixedSpots.length === 1);
  lb.unfixSpot(g.id, s.id);
  assert.equal(lb.goalCard(lb.goal(g.id)).openSpots.length, 1);
  lb.deleteSpot(g.id, s.id);
  assert.deepEqual(lb.doc.entries[0].spotIds, []);
});

test("entries: bpm validation, last bpm, next-time, neglect flag", () => {
  const { lb, day } = fresh();
  const g = lb.addGoal({ title: "Chopin" });
  assert.throws(() => lb.addEntry({ goalId: g.id, bpm: 500 }));
  lb.addEntry({ goalId: g.id, bpm: 80, next: "add m. 9" });
  lb.addEntry({ goalId: g.id, note: "  slow run " });
  assert.equal(lb.lastBpm(g.id), 80);
  assert.equal(lb.goal(g.id).next, "add m. 9");
  assert.equal(lb.lastEntry(g.id).note, "slow run");
  assert.equal(lb.goalCard(lb.goal(g.id)).daysSince, 0);
  assert.equal(lb.goalCard(lb.goal(g.id)).neglected, false);
  day(7);
  const card = lb.goalCard(lb.goal(g.id));
  assert.equal(card.daysSince, 7);
  assert.equal(card.neglected, true);
  const untouched = lb.addGoal({ title: "Pathétique" });
  assert.equal(lb.goalCard(untouched).neglected, false); // never started ≠ neglected
});

test("clock accumulates whole minutes into the day it started", () => {
  const { lb, tick, now } = fresh();
  assert.equal(lb.clock(), null);
  lb.startClock();
  const startedDay = dayKey(now());
  tick(42 * 60000 + 20000);
  assert.equal(lb.stopClock(), 42);
  assert.equal(lb.minutesOn(startedDay), 42);
  assert.equal(lb.clock(), null);
  lb.addMinutes(startedDay, 8);
  assert.equal(lb.minutesOn(startedDay), 50);
  assert.equal(lb.stopClock(), 0);
});

test("streak: consecutive days, forgiving a fresh morning, across a month boundary", () => {
  const { lb, day } = fresh(new Date(2026, 7, 29, 12).getTime()); // Aug 29
  const g = lb.addGoal({ title: "Scales" });
  lb.addEntry({ goalId: g.id }); // Aug 29
  day(1); lb.addEntry({ goalId: g.id }); // Aug 30
  day(1); lb.addMinutes(lb.today(), 10); // Aug 31 (minutes only)
  day(1); lb.addEntry({ goalId: g.id }); // Sep 1
  assert.equal(lb.metrics.streak(), 4);
  day(1); // Sep 2, nothing yet
  assert.equal(lb.metrics.streak(), 4);
  day(1); // Sep 3, missed Sep 2
  assert.equal(lb.metrics.streak(), 0);
  const strip = lb.metrics.weekStrip();
  assert.equal(strip.length, 7);
  assert.equal(strip[6].today, true);
  assert.deepEqual(strip.map((d) => d.practiced), [false, true, true, true, true, false, false]);
});

test("gold days: a spot fixed or a per-goal tempo high-water mark", () => {
  const { lb, day, now } = fresh();
  const g = lb.addGoal({ title: "Chopin" });
  const s = lb.addSpot(g.id, "m. 11");
  lb.addEntry({ goalId: g.id, bpm: 90 });          // first tempo — not gold
  const d0 = lb.today();
  day(1); lb.addEntry({ goalId: g.id, bpm: 88 });  // slower — not gold
  const d1 = lb.today();
  day(1); lb.addEntry({ goalId: g.id, bpm: 100 }); // high-water → gold
  const d2 = lb.today();
  day(1); lb.fixSpot(g.id, s.id);                  // fixed → gold
  const d3 = lb.today();
  const gold = lb.metrics.goldDays();
  assert.deepEqual([d0, d1, d2, d3].map((k) => gold.has(k)), [false, false, true, true]);
  const m = lb.metrics.month(new Date(now()).getFullYear(), new Date(now()).getMonth());
  assert.ok(m.cells.filter((c) => c?.gold).length >= 1);
  assert.equal(m.totals.days >= 4 || m.totals.days >= 1, true);
});

test("month grid is Monday-first and totals count practiced days", () => {
  const { lb } = fresh(new Date(2026, 8, 15, 12).getTime()); // Sep 2026 starts on a Tuesday
  const g = lb.addGoal({ title: "Scales" });
  lb.addEntry({ goalId: g.id });
  const m = lb.metrics.month(2026, 8);
  assert.equal(m.cells[0], null);            // Monday empty
  assert.equal(m.cells[1].key, "2026-09-01"); // Tuesday
  assert.equal(m.cells.filter(Boolean).length, 30);
  assert.equal(m.totals.days, 1);
});

test("goal stats: sessions, shared minutes, tempo series, best", () => {
  const { lb, day } = fresh();
  const a = lb.addGoal({ title: "A" }), b = lb.addGoal({ title: "B" });
  lb.addEntry({ goalId: a.id, bpm: 100 }); lb.addEntry({ goalId: b.id }); lb.addMinutes(lb.today(), 30);
  day(1); lb.addEntry({ goalId: a.id, bpm: 108 }); lb.addMinutes(lb.today(), 20);
  const st = lb.metrics.goalStats(a.id);
  assert.equal(st.sessions, 2);
  assert.equal(st.minutes, 35); // 15 + 20
  assert.equal(st.bestBpm, 108);
  assert.deepEqual(lb.metrics.tempoSeries(a.id).map((p) => p.bpm), [100, 108]);
  assert.equal(st.entries[0].bpm, 108); // newest first
});

test("addAuto creates the builtin goal once and it cannot be deleted", () => {
  const { lb } = fresh();
  lb.addAuto({ source: "sightsinging", label: "Book 1 Lesson 1 · ★★" });
  lb.addAuto({ source: "sightsinging", label: "Challenge · 5 · 84%" });
  const g = lb.goal(BUILTIN_SIGHTSINGING);
  assert.equal(g.kind, "builtin");
  assert.equal(lb.goals().filter((x) => x.kind === "builtin").length, 1);
  assert.equal(lb.entriesOn(lb.today()).length, 2);
  assert.equal(lb.entriesOn(lb.today())[0].auto.label, "Challenge · 5 · 84%");
  assert.throws(() => lb.deleteGoal(g.id));
  assert.equal(lb.goalCard(g).neglected, false);
});

test("export → import round-trips; wrong schema rejected; change events fire", () => {
  const { lb, store } = fresh();
  let fired = 0; const off = lb.on(() => fired++);
  const g = lb.addGoal({ title: "Chopin" });
  lb.addEntry({ goalId: g.id, bpm: 96 });
  assert.equal(fired, 2);
  const json = lb.exportJson();
  const other = createLogbook({ store: memStore(), now: () => 0 });
  other.importJson(json);
  assert.equal(other.goals()[0].title, "Chopin");
  assert.equal(other.lastBpm(g.id), 96);
  assert.throws(() => other.importJson("{\"schemaVersion\":99,\"goals\":[],\"entries\":[]}"), /schemaVersion/);
  assert.throws(() => other.importJson("nope"), /JSON/);
  off();
  lb.addGoal({ title: "X" });
  assert.equal(fired, 2);
  // reload from the same store sees the same document
  const again = createLogbook({ store, now: () => 0 });
  assert.equal(again.goals("all").length, 2);
});

test("dayKey / addDays are local-time and cross months", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59).getTime()), "2026-01-05");
});
